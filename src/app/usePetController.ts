import { useCallback, useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  disable as autostartDisable,
  enable as autostartEnable,
  isEnabled as autostartIsEnabled,
} from "@tauri-apps/plugin-autostart";
import { createActor, type Actor, type SnapshotFrom } from "xstate";
import { DialogueEngine } from "../dialogue/dialogueEngine";
import {
  collectTimeTriggers,
  computeStreak,
  dateKey,
} from "../dialogue/triggers";
import type { DialogueDisplay, TriggerContext } from "../dialogue/types";
import type { PetVisualMotion } from "../pet/animationManifest";
import {
  petMachine,
  stateToMotion,
} from "../pet/petMachine";
import {
  appWindow,
  applyAlwaysOnTop,
  restorePosition,
  savePositionToPrefs,
  setWindowScale,
  syncWindowSizeToViewport,
} from "../platform/window";
import {
  clampScale,
  DEFAULT_SCALE,
  SCALE_STEP,
} from "../pet/zoom";
import {
  loadPreferences,
  savePreferences,
  type PetPreferences,
  type PrefStore,
} from "../storage/preferences";
import {
  emptyProgress,
  loadProgress,
  saveProgress,
  type ProgressData,
  type ProgressStore,
} from "../storage/progress";

type PetActor = Actor<typeof petMachine>;
type PetSnapshot = SnapshotFrom<typeof petMachine>;

const TICK_INTERVAL_MS = 30_000;

export interface PetController {
  /** 状态机当前动作（驱动程序化动画 / sheet 兜底） */
  motion: PetVisualMotion;
  bubble: DialogueDisplay | null;
  followUp: boolean;
  settingsOpen: boolean;
  dnd: boolean;
  alwaysOnTop: boolean;
  autostart: boolean;
  autostartSupported: boolean;
  /** 整体缩放比例（0.5 – 2.0） */
  scale: number;
  /** 初始化或渲染期致命错误（用于在透明窗口里显示出来，避免"隐形窗口"） */
  fatal: string | null;
  openSettings: () => void;
  closeSettings: () => void;
  onPetClick: () => void;
  onPetDragStart: () => void;
  onPetDragEnd: () => void;
  onAnimationFinished: () => void;
  /** 设置面板：直接指定缩放比例 */
  onScaleChange: (value: number) => void;
  /** 桌宠上 Ctrl+滚轮：按 deltaY 方向步进缩放 */
  onWheelZoom: (deltaY: number) => void;
  toggleAlwaysOnTop: (value: boolean) => void;
  toggleDnd: (value?: boolean) => void;
  toggleAutostart: (value: boolean) => void;
  clearData: () => void;
}

export function usePetController(): PetController {
  const actorRef = useRef<PetActor | null>(null);
  if (!actorRef.current) {
    actorRef.current = createActor(petMachine).start();
  }
  const actor = actorRef.current;

  const [snapshot, setSnapshot] = useState<PetSnapshot>(() =>
    actor.getSnapshot(),
  );
  const [bubble, setBubble] = useState<DialogueDisplay | null>(null);
  const [followUp, setFollowUp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dnd, setDnd] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [autostart, setAutostart] = useState(false);
  const [autostartSupported, setAutostartSupported] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const prefsStoreRef = useRef<PrefStore | null>(null);
  const progressStoreRef = useRef<ProgressStore | null>(null);
  const prefsRef = useRef<PetPreferences>({
    position: null,
    alwaysOnTop: true,
    dnd: false,
    scale: DEFAULT_SCALE,
  });
  const scaleRef = useRef(DEFAULT_SCALE);
  /** 串行化窗口缩放：滚轮/滑杆可能连续触发，避免 setSize 乱序 */
  const scaleChainRef = useRef<Promise<void>>(Promise.resolve());
  const progressRef = useRef<ProgressData | null>(null);
  const engineRef = useRef<DialogueEngine | null>(null);
  const installedAtRef = useRef<Date>(new Date());
  const prevStateRef = useRef<string>("idle");
  const bubbleTimersRef = useRef<number[]>([]);
  const dndRef = useRef(false);

  // ---------- 对白调度 ----------
  const tryShow = useCallback(
    (ctx: TriggerContext): boolean => {
      const engine = engineRef.current;
      const progress = progressRef.current;
      if (!engine || !progress || dndRef.current) return false;
      const dialogue = engine.pick(ctx, new Date(), installedAtRef.current);
      if (!dialogue) return false;
      actor.send({ type: "SHOW_DIALOGUE", dialogue });
      if (progressStoreRef.current) {
        void saveProgress(progressStoreRef.current, progress);
      }
      return true;
    },
    [actor],
  );
  const tryShowRef = useRef(tryShow);
  tryShowRef.current = tryShow;

  const toggleDnd = useCallback(
    (value?: boolean) => {
      const next = value ?? !dndRef.current;
      dndRef.current = next;
      prefsRef.current.dnd = next;
      setDnd(next);
      if (prefsStoreRef.current) {
        void savePreferences(prefsStoreRef.current, prefsRef.current);
      }
      if (next) {
        actor.send({ type: "DIALOGUE_FINISHED" });
      }
    },
    [actor],
  );
  const toggleDndRef = useRef(toggleDnd);
  toggleDndRef.current = toggleDnd;

  // ---------- 状态机订阅与点击类触发 ----------
  useEffect(() => {
    const subscription = actor.subscribe((snap) => {
      const currentState = stateToMotion(snap.value as string);
      const previous = prevStateRef.current;
      prevStateRef.current = currentState;
      setSnapshot(snap);

      if (currentState !== previous) {
        if (currentState === "clicked") {
          tryShowRef.current({ type: "click" });
        } else if (currentState === "shy") {
          const count = snap.context.clickTimes.filter(
            (t) => Date.now() - t <= 5_000,
          ).length;
          tryShowRef.current({ type: "rapidClick", count: Math.max(count, 5) });
        }
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [actor]);

  // ---------- 气泡展示与自动消失 ----------
  useEffect(() => {
    for (const timer of bubbleTimersRef.current) {
      window.clearTimeout(timer);
    }
    bubbleTimersRef.current = [];

    const dialogue = snapshot.context.currentDialogue;
    if (!dialogue) {
      setBubble(null);
      setFollowUp(false);
      return;
    }

    setBubble(dialogue);
    setFollowUp(false);

    const firstDuration =
      2_800 + Math.min(dialogue.text.length * 80, 2_600);
    if (dialogue.followUpText) {
      const firstTimer = window.setTimeout(() => setFollowUp(true), firstDuration);
      const secondDuration =
        2_800 + Math.min(dialogue.followUpText.length * 80, 2_600);
      const secondTimer = window.setTimeout(
        () => actor.send({ type: "DIALOGUE_FINISHED" }),
        firstDuration + secondDuration,
      );
      bubbleTimersRef.current = [firstTimer, secondTimer];
    } else {
      const timer = window.setTimeout(
        () => actor.send({ type: "DIALOGUE_FINISHED" }),
        firstDuration,
      );
      bubbleTimersRef.current = [timer];
    }

    return () => {
      for (const timer of bubbleTimersRef.current) {
        window.clearTimeout(timer);
      }
      bubbleTimersRef.current = [];
    };
  }, [snapshot.context.currentDialogue, actor]);

  // ---------- 初始化：存储 / 窗口 / 托盘 / 启动触发 / 定时器 ----------
  useEffect(() => {
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    let positionSaveTimer: number | undefined;
    let tickTimer: number | undefined;

    async function init(): Promise<void> {
      try {
        const [prefsLoaded, progressLoaded] = await Promise.all([
          loadPreferences(),
          loadProgress(),
        ]);
        if (disposed) return;

      prefsStoreRef.current = prefsLoaded.store;
      prefsRef.current = prefsLoaded.prefs;
      dndRef.current = prefsLoaded.prefs.dnd;
      setDnd(prefsLoaded.prefs.dnd);
      setAlwaysOnTop(prefsLoaded.prefs.alwaysOnTop);
      scaleRef.current = prefsLoaded.prefs.scale;
      setScale(prefsLoaded.prefs.scale);

      const now = Date.now();
      const today = dateKey(new Date(now));
      const progress = progressLoaded.progress;
      progress.launchCount += 1;
      if (!progress.firstLaunchAt) {
        progress.firstLaunchAt = new Date(now).toISOString();
      }
      if (!progress.launchDates.includes(today)) {
        progress.launchDates.push(today);
      }
      progress.sessionStart = now;
      progressStoreRef.current = progressLoaded.store;
      progressRef.current = progress;
      installedAtRef.current = new Date(progress.firstLaunchAt);
      engineRef.current = DialogueEngine.fromBundle(progress.dialogue);
      await saveProgress(progressLoaded.store, progress);

      try {
        await applyAlwaysOnTop(prefsRef.current.alwaysOnTop);
      } catch (error) {
        console.error("apply always on top failed:", error);
      }
      await syncWindowSizeToViewport(prefsRef.current.scale);
      await restorePosition(prefsRef.current);

      try {
        setAutostart(await autostartIsEnabled());
        setAutostartSupported(true);
      } catch (error) {
        // 开发模式下未安装到系统，autostart 查询失败属于预期
        void invoke("log_frontend", {
          message: `autostart-init-error: ${String(error)}`,
        }).catch(() => undefined);
        setAutostartSupported(false);
      }

      const unTray = await listen<string>("tray-command", (event) => {
        if (event.payload === "open-settings") {
          setSettingsOpen(true);
        } else if (event.payload === "toggle-pause") {
          toggleDndRef.current();
        }
      });
      unlisteners.push(unTray);

      const unMoved = await appWindow.onMoved(() => {
        if (positionSaveTimer !== undefined) {
          window.clearTimeout(positionSaveTimer);
        }
        positionSaveTimer = window.setTimeout(() => {
          if (prefsStoreRef.current) {
            void savePositionToPrefs(prefsStoreRef.current, prefsRef.current);
          }
        }, 800);
      });
      unlisteners.push(unMoved);

      // 跨显示器 / 系统缩放变化时，按当前桌宠缩放比例重算物理窗口
      try {
        const unScale = await appWindow.onScaleChanged(() => {
          void syncWindowSizeToViewport(scaleRef.current);
        });
        unlisteners.push(unScale);
      } catch (error) {
        console.error("listen scale change failed:", error);
      }

      // 启动时的一次性 / 纪念日触发
      window.setTimeout(() => {
        if (disposed) return;
        if (progress.launchCount === 1) {
          tryShowRef.current({ type: "firstLaunch" });
        }
        const special = engineRef.current?.specialDateContext(new Date());
        if (special) {
          tryShowRef.current(special);
        }
        const streak = computeStreak(progress.launchDates, today);
        if (streak >= 7 && !progress.triggers.streakShown) {
          progress.triggers.streakShown = true;
          void saveProgress(progressLoaded.store, progress);
          tryShowRef.current({ type: "streak", streak });
        }
      }, 1_200);

      // 定期调度：时间段 / 运行时长 / 随机
      tickTimer = window.setInterval(() => {
        const current = progressRef.current;
        if (!current || !progressStoreRef.current) return;
        const tickNow = Date.now();
        const sessionMinutes =
          (tickNow - current.sessionStart) / 60_000;
        const contexts = collectTimeTriggers(
          new Date(tickNow),
          current.triggers,
          sessionMinutes,
        );
        for (const ctx of contexts) {
          tryShowRef.current(ctx);
        }
        void saveProgress(progressStoreRef.current, current);
      }, TICK_INTERVAL_MS);
      } catch (error) {
        console.error("controller init failed:", error);
        if (!disposed) {
          const message =
            error instanceof Error
              ? `${error.message}\n${error.stack ?? ""}`
              : String(error);
          setFatal(message);
          void invoke("log_frontend", {
            message: `[init] ${message}`,
          }).catch(() => undefined);
        }
      }
    }

    void init();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
      if (positionSaveTimer !== undefined) {
        window.clearTimeout(positionSaveTimer);
      }
      if (tickTimer !== undefined) {
        window.clearInterval(tickTimer);
      }
    };
  }, []);

  // ---------- 交互 ----------
  const onPetClick = useCallback(() => {
    actor.send({ type: "CLICK", at: Date.now() });
  }, [actor]);

  const onPetDragStart = useCallback(() => {
    actor.send({ type: "DRAG_START" });
  }, [actor]);

  const onPetDragEnd = useCallback(() => {
    actor.send({ type: "DRAG_END" });
    tryShowRef.current({ type: "dragEnd" });
    if (prefsStoreRef.current) {
      void savePositionToPrefs(prefsStoreRef.current, prefsRef.current);
    }
  }, [actor]);

  const onAnimationFinished = useCallback(() => {
    actor.send({ type: "ANIMATION_FINISHED" });
  }, [actor]);

  const onScaleChange = useCallback((value: number) => {
    const next = clampScale(value);
    if (next === scaleRef.current) return;

    scaleRef.current = next;
    prefsRef.current.scale = next;
    setScale(next);

    scaleChainRef.current = scaleChainRef.current.then(async () => {
      try {
        await setWindowScale(next);
      } catch (error) {
        console.error("apply window scale failed:", error);
      }
      if (prefsStoreRef.current) {
        try {
          await savePreferences(prefsStoreRef.current, prefsRef.current);
        } catch (error) {
          console.error("save scale preference failed:", error);
        }
      }
    });
  }, []);

  const onWheelZoom = useCallback(
    (deltaY: number) => {
      onScaleChange(scaleRef.current + (deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
    },
    [onScaleChange],
  );

  const toggleAlwaysOnTop = useCallback(async (value: boolean) => {
    prefsRef.current.alwaysOnTop = value;
    setAlwaysOnTop(value);
    try {
      await applyAlwaysOnTop(value);
    } catch (error) {
      console.error("toggle always on top failed:", error);
    }
    if (prefsStoreRef.current) {
      await savePreferences(prefsStoreRef.current, prefsRef.current);
    }
  }, []);

  const toggleAutostart = useCallback(async (value: boolean) => {
    try {
      if (value) {
        await autostartEnable();
      } else {
        await autostartDisable();
      }
      setAutostart(value);
    } catch (error) {
      console.error("toggle autostart failed:", error);
      void invoke("log_frontend", {
        message: `autostart-toggle-error: ${String(error)}`,
      }).catch(() => undefined);
      try {
        setAutostart(await autostartIsEnabled());
      } catch {
        setAutostart(false);
      }
    }
  }, []);

  const clearData = useCallback(() => {
    void (async () => {
      const progressStore = progressStoreRef.current;
      const prefsStore = prefsStoreRef.current;
      const keep = prefsRef.current;

      if (progressStore) {
        await progressStore.clear();
        await progressStore.save();
      }
      if (prefsStore) {
        await prefsStore.clear();
        await prefsStore.save();
      }

      const now = Date.now();
      const fresh = emptyProgress(now);
      progressRef.current = fresh;
      const entries = engineRef.current?.entries ?? [];
      engineRef.current = new DialogueEngine(entries, fresh.dialogue);
      installedAtRef.current = new Date(now);

      prefsRef.current = {
        position: keep.position,
        alwaysOnTop: keep.alwaysOnTop,
        dnd: keep.dnd,
        scale: keep.scale,
      };
      if (progressStore) await saveProgress(progressStore, fresh);
      if (prefsStore) await savePreferences(prefsStore, prefsRef.current);

      actor.send({
        type: "SHOW_DIALOGUE",
        dialogue: {
          id: "system_cleared",
          text: "数据已经清空啦。",
          emotion: "neutral",
          motion: "idle",
        },
      });
    })();
  }, [actor]);

  const motion = stateToMotion(snapshot.value as string);

  return {
    motion,
    bubble,
    followUp,
    settingsOpen,
    dnd,
    alwaysOnTop,
    autostart,
    autostartSupported,
    scale,
    fatal,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    onPetClick,
    onPetDragStart,
    onPetDragEnd,
    onAnimationFinished,
    onScaleChange,
    onWheelZoom,
    toggleAlwaysOnTop,
    toggleDnd,
    toggleAutostart,
    clearData,
  };
}

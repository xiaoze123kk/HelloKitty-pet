import { useCallback, useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { cursorPosition } from "@tauri-apps/api/window";
import {
  disable as autostartDisable,
  enable as autostartEnable,
  isEnabled as autostartIsEnabled,
} from "@tauri-apps/plugin-autostart";
import { createActor, type Actor, type SnapshotFrom } from "xstate";
import { DialogueEngine } from "../dialogue/dialogueEngine";
import { BehaviorScheduler } from "../behavior/behaviorScheduler";
import { advanceNeeds, applyInteraction, initialNeeds } from "../behavior/needs";
import type { BehaviorStep, ContextSnapshot } from "../behavior/types";
import {
  initialPointerActivity,
  pointerContext,
  updatePointerActivity,
} from "../context/userActivity";
import {
  collectTimeTriggers,
  computeStreak,
  dateKey,
} from "../dialogue/triggers";
import type { DialogueDisplay, TriggerContext } from "../dialogue/types";
import type { PetVisualMotion } from "../pet/animationManifest";
import type { PetTouchPart } from "../pet/touchZones";
import {
  CRAZY_CLICK_THRESHOLD,
  idleSubState,
  machineStateKey,
  petMachine,
  RAPID_CLICK_THRESHOLD,
  stateToMotion,
} from "../pet/petMachine";
import {
  appWindow,
  applyAlwaysOnTop,
  chaseStep,
  keepWindowOnScreen,
  restorePosition,
  savePositionToPrefs,
  setWindowScale,
  syncWindowSizeToViewport,
  walkStep,
} from "../platform/window";
import {
  clampScale,
  DEFAULT_SCALE,
  SCALE_STEP,
} from "../pet/zoom";
import {
  DEFAULT_ANIMATIONS,
  DEFAULT_REMINDERS,
  loadPreferences,
  savePreferences,
  type AnimationPreferences,
  type PetPreferences,
  type PrefStore,
  type ReminderKind,
  type ReminderPreferences,
} from "../storage/preferences";
import {
  emptyProgress,
  loadProgress,
  saveProgress,
  type ProgressData,
  type ProgressStore,
} from "../storage/progress";
import {
  recordEvent,
  relationshipContext,
  snapshotRelationship,
  unlockEligibleMemories,
  type RelationshipEventType,
} from "../relationship/relationshipEngine";

type PetActor = Actor<typeof petMachine>;
type PetSnapshot = SnapshotFrom<typeof petMachine>;

const TICK_INTERVAL_MS = 30_000;
/** 陪伴提醒检查频率：20 秒一次，错过整点最多延迟 20 秒 */
const REMINDER_TICK_MS = 20_000;

/** 逗猫棒：光标采样间隔（上一轮 IPC 结束后再排下一轮，约 25Hz） */
const TEASE_POLL_MS = 40;
/** 光标速度低于该值视为“停手”，下一段快速位移重新计数（CSS px/ms） */
const TEASE_REST_SPEED_CSS = 0.28;
/** 划动有效性的最低平均速度（CSS px/ms，约 600 px/s） */
const TEASE_MIN_SPEED_CSS = 0.6;
/** 慢速长拖不累计成划动：低于该速度就把起点滚动到最新采样 */
const TEASE_START_SPEED_CSS = 0.45;
/** 一次划动至少走过的距离（CSS px） */
const TEASE_MIN_DISTANCE_CSS = 26;
/** 连续划动窗口：两次有效划动在此间隔内才算“扑击组合” */
const TEASE_COMBO_WINDOW_MS = 2_600;
/** 一次扑击后的追逐时长 */
const CHASE_DURATION_MS = 2_000;

const WATER_LINES = [
  "该喝水啦，小口慢饮~",
  "喝点水再继续吧，乖~",
  "水杯空了？去接一杯吧",
];

const SIT_LINES = [
  "坐了好久啦，起来伸个懒腰吧",
  "起来走动走动，眼睛也休息一下~",
  "久坐啦！活动三分钟再回来",
];

const SLEEP_LINE = "到点啦，早点休息，明天见~";

const MORNING_LINES = [
  "早上好呀，今天也要元气满满~",
  "早上好！新的一天开始啦",
  "早呀，今天也要多喝水哦",
];

const HEAD_TOUCH_LINES = [
  "摸摸头好舒服~",
  "呼噜呼噜，喜欢这样",
  "再摸一下也可以哦",
];

const BODY_TOUCH_LINES = [
  "肚皮不可以乱戳啦",
  "痒痒的，别闹~",
  "这里可是敏感部位！",
];

const BOW_TOUCH_LINES = [
  "别把我的蝴蝶结弄歪啦",
  "蝴蝶结今天也很漂亮吧？",
  "这个蝴蝶结要轻一点摸哦",
];

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
  /** 趣味动画开关 */
  animationPrefs: AnimationPreferences;
  /** 陪伴提醒开关与节奏 */
  reminderPrefs: ReminderPreferences;
  /** 长按撸猫时是否显示爱心粒子 */
  hearts: boolean;
  /** 初始化或渲染期致命错误（用于在透明窗口里显示出来，避免"隐形窗口"） */
  fatal: string | null;
  openSettings: () => void;
  closeSettings: () => void;
  onPetClick: (part: PetTouchPart) => void;
  onPetDragStart: () => void;
  onPetDragEnd: () => void;
  onAnimationFinished: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  /** 设置面板：直接指定缩放比例 */
  onScaleChange: (value: number) => void;
  /** 桌宠上 Ctrl+滚轮：按 deltaY 方向步进缩放 */
  onWheelZoom: (deltaY: number) => void;
  toggleAlwaysOnTop: (value: boolean) => void;
  toggleDnd: (value?: boolean) => void;
  toggleAutostart: (value: boolean) => void;
  /** 开启 / 关闭某个趣味动画（设置面板用） */
  toggleAnimation: (key: keyof AnimationPreferences, value: boolean) => void;
  /** 更新某个陪伴提醒的开关 / 间隔 / 时间（设置面板用） */
  updateReminder: (
    kind: ReminderKind,
    patch: {
      enabled?: boolean;
      intervalMinutes?: number;
      time?: string;
    },
  ) => void;
  clearData: () => void;
  openNest: () => void;
}

export function usePetController(): PetController {
  const actorRef = useRef<PetActor | null>(null);
  if (!actorRef.current) {
    actorRef.current = createActor(petMachine).start();
  }
  const actor = actorRef.current;

  // 仅开发模式：暴露状态机给 DevTools/CDP 诊断（生产构建会被 tree-shake 掉）
  if (import.meta.env.DEV) {
    (window as unknown as { __kittypetActor?: PetActor }).__kittypetActor =
      actor;
  }

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
  const [animationPrefs, setAnimationPrefsState] =
    useState<AnimationPreferences>(DEFAULT_ANIMATIONS);
  const [reminderPrefs, setReminderPrefsState] =
    useState<ReminderPreferences>(DEFAULT_REMINDERS);
  const [hearts, setHearts] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const prefsStoreRef = useRef<PrefStore | null>(null);
  const progressStoreRef = useRef<ProgressStore | null>(null);
  const prefsRef = useRef<PetPreferences>({
    position: null,
    alwaysOnTop: true,
    dnd: false,
    scale: DEFAULT_SCALE,
    animations: DEFAULT_ANIMATIONS,
    reminders: DEFAULT_REMINDERS,
  });
  const scaleRef = useRef(DEFAULT_SCALE);
  /** 串行化窗口缩放：滚轮/滑杆可能连续触发，避免 setSize 乱序 */
  const scaleChainRef = useRef<Promise<void>>(Promise.resolve());
  const progressRef = useRef<ProgressData | null>(null);
  const engineRef = useRef<DialogueEngine | null>(null);
  const installedAtRef = useRef<Date>(new Date());
  const prevStateRef = useRef<string>("idle");
  const stateValueRef = useRef<string>("idle");
  const idleSubStateRef = useRef<string | null>(null);
  const bubbleTimersRef = useRef<number[]>([]);
  const dndRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const animationRef = useRef<AnimationPreferences>(DEFAULT_ANIMATIONS);
  const reminderRef = useRef<ReminderPreferences>(DEFAULT_REMINDERS);
  const reminderTimerRef = useRef<number | undefined>(undefined);
  const reminderCounterRef = useRef(0);
  const touchCounterRef = useRef(0);
  // 逗猫棒：全局光标采样 / 划动判定 / 短程追逐
  const teasePollRef = useRef<number | undefined>(undefined);
  const teasePrevRef = useRef<{ x: number; y: number; t: number } | null>(null);
  /** rest=光标停稳；moving=正在快速位移；fired=本次划动已计数，等停稳/回摆再武装 */
  const teasePhaseRef = useRef<"rest" | "moving" | "fired">("rest");
  const teaseEpisodeRef = useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  /** 上一采样段的位移方向，用于识别快速回摆（方向反转 = 新一段划动） */
  const teaseLastMoveRef = useRef<{ dx: number; dy: number } | null>(null);
  /** 追逐目标：始终保存最新一次全局光标位置（物理像素） */
  const teaseTargetRef = useRef<{ x: number; y: number } | null>(null);
  const lastTeaseSwipeAtRef = useRef(0);
  const swipeCountRef = useRef(0);
  const chaseDirRef = useRef<1 | -1 | null>(null);
  const chaseEndTimerRef = useRef<number | undefined>(undefined);
  const chaseWasWalkingRef = useRef(false);
  const walkTimerRef = useRef<number | undefined>(undefined);
  /** 上一步 IPC 未完成时跳过本帧，避免 setPosition 乱序导致抖动 */
  const walkStepBusyRef = useRef(false);
  const walkDirRef = useRef<1 | -1>(1);
  /** 折返后的小停顿时间戳，让转向显得更自然 */
  const walkPauseUntilRef = useRef(0);
  const behaviorTimerRef = useRef<number | undefined>(undefined);
  const pointerActivityPollRef = useRef<number | undefined>(undefined);
  const pointerActivityRef = useRef(initialPointerActivity());
  const behaviorNeedsRef = useRef(initialNeeds());
  const behaviorNeedsAtRef = useRef(Date.now());
  const behaviorSchedulerRef = useRef(new BehaviorScheduler());
  /** 偏好加载完成前不允许自动恢复散步，避免误读默认值 */
  const walkingReadyRef = useRef(false);
  const progressSaveTimerRef = useRef<number | undefined>(undefined);
  const pendingRelationshipDialogsRef = useRef<TriggerContext[]>([]);

  const behaviorContext = useCallback((now = Date.now()): ContextSnapshot => {
    const progress = progressRef.current;
    const pointer = pointerContext(pointerActivityRef.current, now);
    const date = new Date(now);
    return {
      now,
      hour: date.getHours(),
      sessionMinutes: progress ? (now - progress.sessionStart) / 60_000 : 0,
      ...pointer,
      todayInteractions: progress
        ? relationshipContext(progress, now).todayInteractions
        : 0,
      currentState: stateValueRef.current,
      idleSubState: idleSubStateRef.current,
      dnd: dndRef.current,
      settingsOpen: settingsOpenRef.current,
      dialogueOpen: actor.getSnapshot().context.currentDialogue !== null,
      idleActionsEnabled: animationRef.current.idleActions,
      sleepTransitionsEnabled: animationRef.current.sleepTransitions,
      walkingEnabled: animationRef.current.walking,
    };
  }, [actor]);
  const behaviorContextRef = useRef(behaviorContext);
  behaviorContextRef.current = behaviorContext;

  const dispatchBehaviorStep = useCallback((step: BehaviorStep | null): void => {
    if (!step) return;
    if (import.meta.env.DEV) {
      console.debug("[behavior]", step.event.type);
    }
    actor.send(step.event);
  }, [actor]);
  const dispatchBehaviorStepRef = useRef(dispatchBehaviorStep);
  dispatchBehaviorStepRef.current = dispatchBehaviorStep;

  const emitNestSnapshot = useCallback((progress = progressRef.current) => {
    if (!progress) return;
    void emitTo("nest", "relationship-snapshot", snapshotRelationship(progress)).catch(
      () => undefined,
    );
  }, []);
  const emitNestSnapshotRef = useRef(emitNestSnapshot);
  emitNestSnapshotRef.current = emitNestSnapshot;

  const scheduleProgressSave = useCallback(() => {
    if (progressSaveTimerRef.current !== undefined) {
      window.clearTimeout(progressSaveTimerRef.current);
    }
    progressSaveTimerRef.current = window.setTimeout(() => {
      progressSaveTimerRef.current = undefined;
      const progress = progressRef.current;
      const store = progressStoreRef.current;
      if (progress && store) void saveProgress(store, progress);
    }, 500);
  }, []);
  const scheduleProgressSaveRef = useRef(scheduleProgressSave);
  scheduleProgressSaveRef.current = scheduleProgressSave;

  const recordRelationshipEvent = useCallback(
    (type: RelationshipEventType): void => {
      const progress = progressRef.current;
      if (!progress) return;
      recordEvent(progress.relationship, type);
      if (type !== "session_start") {
        behaviorNeedsRef.current = applyInteraction(behaviorNeedsRef.current);
      }
      const unlocked = unlockEligibleMemories(progress.relationship);
      for (const memoryId of unlocked) {
        pendingRelationshipDialogsRef.current.push({ type: "memoryUnlocked", memoryId });
      }
      if (type === "headpat" && progress.relationship.byPart.head === 10) {
        pendingRelationshipDialogsRef.current.push({
          type: "interactionHabit",
          habit: "headpat",
          count: progress.relationship.byPart.head,
        });
      }
      emitNestSnapshotRef.current(progress);
      scheduleProgressSaveRef.current();
    },
    [],
  );
  const recordRelationshipEventRef = useRef(recordRelationshipEvent);
  recordRelationshipEventRef.current = recordRelationshipEvent;

  // ---------- 对白调度 ----------
  const tryShow = useCallback(
    (ctx: TriggerContext): boolean => {
      const engine = engineRef.current;
      const progress = progressRef.current;
      const relationshipTrigger =
        ctx.type === "returnAfterAbsence" ||
        ctx.type === "interactionHabit" ||
        ctx.type === "memoryUnlocked";
      if (
        !engine ||
        !progress ||
        dndRef.current ||
        (relationshipTrigger && actor.getSnapshot().context.currentDialogue)
      ) {
        return false;
      }
      const context = relationshipContext(progress);
      const dialogue = engine.pick(
        ctx,
        new Date(),
        installedAtRef.current,
        {
          ...context,
          absenceDays:
            ctx.type === "returnAfterAbsence"
              ? ctx.absenceDays
              : context.absenceDays,
          headpatCount:
            ctx.type === "interactionHabit" && ctx.habit === "headpat"
              ? ctx.count
              : context.headpatCount,
          streak: ctx.type === "streak" ? ctx.streak : context.streak,
        },
      );
      if (!dialogue) return false;
      behaviorSchedulerRef.current.cancel();
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

  /** 分部位摸摸的固定台词（不占用个性化对白配额） */
  const showTouchLine = useCallback(
    (id: string, lines: string[]) => {
      const text = lines[touchCounterRef.current % lines.length];
      touchCounterRef.current += 1;
      actor.send({
        type: "SHOW_DIALOGUE",
        dialogue: {
          id,
          text,
          emotion: "neutral",
          motion: "idle",
        },
      });
    },
    [actor],
  );
  const showTouchLineRef = useRef(showTouchLine);
  showTouchLineRef.current = showTouchLine;

  // ---------- 散步 / 追逐共用的移动定时器 ----------
  /**
   * 每 40ms 移动一步；上一步 IPC 未完成时跳过本帧，
   * 保证 setPosition 严格按顺序执行，避免异步乱序造成的抖动。
   */
  const ensureWalkTimer = useCallback(() => {
    if (walkTimerRef.current !== undefined) return;
    walkTimerRef.current = window.setInterval(() => {
      if (dndRef.current || settingsOpenRef.current) return;
      if (walkStepBusyRef.current) return;

      const snapshot = actor.getSnapshot();
      const stateKey = machineStateKey(snapshot.value);

      // 追逐优先：pounce 动画播放期间也继续朝光标移动，动画与位移不再互相等待
      if (chaseDirRef.current !== null) {
        const target = teaseTargetRef.current;
        if (!target) return;
        if (
          stateKey === "sleeping" ||
          stateKey === "sleepy" ||
          stateKey === "falling" ||
          stateKey === "dragging" ||
          stateKey === "petted"
        ) {
          return;
        }
        walkStepBusyRef.current = true;
        void chaseStep(target.x, target.y).finally(() => {
          walkStepBusyRef.current = false;
        });
        return;
      }

      if (stateKey !== "walking") return;
      if (Date.now() < walkPauseUntilRef.current) return;

      const stepDir = walkDirRef.current;
      walkStepBusyRef.current = true;
      void walkStep(stepDir)
        .then((next) => {
          walkDirRef.current = next;
          if (next !== stepDir) {
            // 非追逐时到达屏幕边缘：原地顿一下再折返
            walkPauseUntilRef.current = Date.now() + 300;
          }
        })
        .finally(() => {
          walkStepBusyRef.current = false;
        });
    }, 40);
  }, [actor]);

  const startWalking = useCallback(() => {
    actor.send({ type: "WALK_START" });
    walkPauseUntilRef.current = 0;
    ensureWalkTimer();
  }, [actor, ensureWalkTimer]);

  const stopWalking = useCallback(() => {
    if (walkTimerRef.current !== undefined) {
      window.clearInterval(walkTimerRef.current);
      walkTimerRef.current = undefined;
    }
    if (actor.getSnapshot().value === "walking") {
      actor.send({ type: "WALK_STOP" });
    }
  }, [actor]);

  const startWalkingRef = useRef(startWalking);
  startWalkingRef.current = startWalking;
  const stopWalkingRef = useRef(stopWalking);
  stopWalkingRef.current = stopWalking;

  /** 重置（延长）追逐结束计时器：追逐中每次新划动都重新计时 */
  const refreshChaseEnd = useCallback(() => {
    if (chaseEndTimerRef.current !== undefined) {
      window.clearTimeout(chaseEndTimerRef.current);
    }
    chaseEndTimerRef.current = window.setTimeout(() => {
      chaseEndTimerRef.current = undefined;
      chaseDirRef.current = null;
      teaseTargetRef.current = null;
      const wasWalking = chaseWasWalkingRef.current;
      chaseWasWalkingRef.current = false;
      // 本来没开散步：追完就停下来
      if (!animationRef.current.walking && !wasWalking) {
        stopWalkingRef.current();
      }
    }, CHASE_DURATION_MS);
  }, []);
  const refreshChaseEndRef = useRef(refreshChaseEnd);
  refreshChaseEndRef.current = refreshChaseEnd;

  /** 连续两次划动：扑击 + 朝光标当前位置短程追逐 */
  const startTeaseChase = useCallback(
    (direction: 1 | -1, target: { x: number; y: number }) => {
      if (chaseDirRef.current === null) {
        // 只在首次进入追逐时记录，重复触发不会覆盖“原本是否在散步”
        chaseWasWalkingRef.current =
          machineStateKey(actor.getSnapshot().value) === "walking";
      }
      chaseDirRef.current = direction;
      teaseTargetRef.current = target;
      // 先保证移动定时器存在，再切 pounce：扑击动画期间窗口也在追光标
      ensureWalkTimer();
      actor.send({ type: "POUNCE" });
      refreshChaseEnd();
    },
    [actor, ensureWalkTimer, refreshChaseEnd],
  );
  const startTeaseChaseRef = useRef(startTeaseChase);
  startTeaseChaseRef.current = startTeaseChase;

  const toggleAnimation = useCallback(
    (key: keyof AnimationPreferences, value: boolean) => {
      const next = { ...animationRef.current, [key]: value };
      animationRef.current = next;
      prefsRef.current.animations = next;
      setAnimationPrefsState(next);
      actor.send({ type: "SET_ANIMATION_PREFS", animations: next });
      if (prefsStoreRef.current) {
        void savePreferences(prefsStoreRef.current, prefsRef.current);
      }
      if (key === "walking") {
        if (value) {
          startWalking();
        } else {
          // 关闭散步时同时终止逗猫棒追逐，避免猫继续追着光标跑
          if (chaseEndTimerRef.current !== undefined) {
            window.clearTimeout(chaseEndTimerRef.current);
            chaseEndTimerRef.current = undefined;
          }
          chaseDirRef.current = null;
          teaseTargetRef.current = null;
          chaseWasWalkingRef.current = false;
          stopWalking();
        }
      } else if (key === "teasing" && !value && chaseDirRef.current !== null) {
        // 关闭逗猫棒时立刻结束正在进行的追逐
        if (chaseEndTimerRef.current !== undefined) {
          window.clearTimeout(chaseEndTimerRef.current);
          chaseEndTimerRef.current = undefined;
        }
        chaseDirRef.current = null;
        teaseTargetRef.current = null;
        const wasWalking = chaseWasWalkingRef.current;
        chaseWasWalkingRef.current = false;
        if (!next.walking && !wasWalking) {
          stopWalking();
        }
      }
    },
    [actor, startWalking, stopWalking],
  );
  const toggleAnimationRef = useRef(toggleAnimation);
  toggleAnimationRef.current = toggleAnimation;

  const updateReminder = useCallback(
    (
      kind: ReminderKind,
      patch: {
        enabled?: boolean;
        intervalMinutes?: number;
        time?: string;
      },
    ) => {
      const current = reminderRef.current;
      const next: ReminderPreferences = {
        ...current,
        [kind]: { ...current[kind], ...patch },
      };
      reminderRef.current = next;
      prefsRef.current.reminders = next;
      setReminderPrefsState(next);
      if (prefsStoreRef.current) {
        void savePreferences(prefsStoreRef.current, prefsRef.current);
      }
      // 刚开启喝水 / 久坐提醒时，从现在起算，避免开关一开就立刻提醒
      if (
        (kind === "water" || kind === "sedentary") &&
        patch.enabled === true &&
        !current[kind].enabled
      ) {
        const progress = progressRef.current;
        if (progress && progressStoreRef.current) {
          if (kind === "water") {
            progress.reminders.waterLastAt = Date.now();
          } else {
            progress.reminders.sedentaryLastAt = Date.now();
          }
          void saveProgress(progressStoreRef.current, progress);
        }
      }
    },
    [],
  );

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
        behaviorSchedulerRef.current.cancel();
        actor.send({ type: "DIALOGUE_FINISHED" });
        // 勿扰期间暂停散步
        if (actor.getSnapshot().value === "walking") {
          actor.send({ type: "WALK_STOP" });
        }
      } else if (animationRef.current.walking) {
        // 恢复散步（若已在散步则只是补发 WALK_START，幂等）
        startWalkingRef.current();
      }
      if (!next && !actor.getSnapshot().context.currentDialogue) {
        const pending = pendingRelationshipDialogsRef.current.shift();
        if (pending && !tryShowRef.current(pending)) {
          pendingRelationshipDialogsRef.current.unshift(pending);
        }
      }
    },
    [actor],
  );
  const toggleDndRef = useRef(toggleDnd);
  toggleDndRef.current = toggleDnd;

  // ---------- 状态机订阅与点击类触发 ----------
  useEffect(() => {
    const subscription = actor.subscribe((snap) => {
      const currentState = stateToMotion(snap.value);
      const previous = prevStateRef.current;
      const rawState = machineStateKey(snap.value);
      stateValueRef.current = rawState;
      idleSubStateRef.current =
        rawState === "idle" ? idleSubState(snap.value) : null;
      prevStateRef.current = currentState;
      setSnapshot(snap);

      if (currentState !== previous) {
        const pendingRelationshipDialogue = pendingRelationshipDialogsRef.current.shift();
        if (pendingRelationshipDialogue && tryShowRef.current(pendingRelationshipDialogue)) {
          // 关系记忆优先于本次的普通互动台词。
        } else if (pendingRelationshipDialogue) {
          pendingRelationshipDialogsRef.current.unshift(pendingRelationshipDialogue);
        } else if (currentState === "clicked") {
          tryShowRef.current({ type: "click" });
        } else if (currentState === "shy") {
          // 状态机里 clickTimes 只保留当前连击手势，直接取长度即可
          const count = snap.context.clickTimes.length;
          tryShowRef.current({
            type: "rapidClick",
            count: Math.max(count, RAPID_CLICK_THRESHOLD),
          });
        } else if (currentState === "angry") {
          const count = snap.context.clickTimes.length;
          tryShowRef.current({
            type: "rapidClick",
            count: Math.max(count, CRAZY_CLICK_THRESHOLD),
          });
        } else if (currentState === "headpat") {
          showTouchLineRef.current("system_headpat", HEAD_TOUCH_LINES);
        } else if (currentState === "bodypat") {
          showTouchLineRef.current("system_bodypat", BODY_TOUCH_LINES);
        } else if (currentState === "bowtouch") {
          showTouchLineRef.current("system_bowtouch", BOW_TOUCH_LINES);
        }
      }

      // 从点击 / 小动作 / 落地等状态回到 idle 时恢复散步；
      // 追逐期间即使散步开关关闭也短暂进入 walking 追光标
      if (
        walkingReadyRef.current &&
        rawState === "idle" &&
        (animationRef.current.walking || chaseDirRef.current !== null)
      ) {
        startWalkingRef.current();
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
      const nextRelationshipDialogue = pendingRelationshipDialogsRef.current.shift();
      if (nextRelationshipDialogue) {
        window.setTimeout(() => {
          if (!tryShowRef.current(nextRelationshipDialogue)) {
            pendingRelationshipDialogsRef.current.unshift(nextRelationshipDialogue);
          }
        }, 120);
      }
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
      animationRef.current = prefsLoaded.prefs.animations;
      setAnimationPrefsState(prefsLoaded.prefs.animations);
      actor.send({
        type: "SET_ANIMATION_PREFS",
        animations: prefsLoaded.prefs.animations,
      });
      reminderRef.current = prefsLoaded.prefs.reminders;
      setReminderPrefsState(prefsLoaded.prefs.reminders);
      walkingReadyRef.current = true;

      const now = Date.now();
      const today = dateKey(new Date(now));
      const progress = progressLoaded.progress;
      const relationshipBeforeSession = relationshipContext(progress, now);
      progress.launchCount += 1;
      if (!progress.firstLaunchAt) {
        progress.firstLaunchAt = new Date(now).toISOString();
      }
      if (!progress.launchDates.includes(today)) {
        progress.launchDates.push(today);
      }
      progress.sessionStart = now;
      recordEvent(progress.relationship, "session_start", now);
      const startupMemories = unlockEligibleMemories(progress.relationship, now);
      for (const memoryId of startupMemories) {
        pendingRelationshipDialogsRef.current.push({ type: "memoryUnlocked", memoryId });
      }
      progressStoreRef.current = progressLoaded.store;
      progressRef.current = progress;
      installedAtRef.current = new Date(progress.firstLaunchAt);
      engineRef.current = DialogueEngine.fromBundle(progress.dialogue);
      await saveProgress(progressLoaded.store, progress);
      emitNestSnapshotRef.current(progress);

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
          settingsOpenRef.current = true;
          setSettingsOpen(true);
        } else if (event.payload === "toggle-pause") {
          toggleDndRef.current();
        }
      });
      unlisteners.push(unTray);

      const unNestSnapshotRequest = await listen("relationship-snapshot-request", () => {
        emitNestSnapshotRef.current();
      });
      unlisteners.push(unNestSnapshotRequest);

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

      // 每天早上的第一句：早上好（5:00–11:59 启动时自动说，勿扰时不打扰）
      window.setTimeout(() => {
        if (disposed || dndRef.current) return;
        const nowDate = new Date();
        const hour = nowDate.getHours();
        if (hour < 5 || hour > 11) return;
        if (progress.reminders.morningGreetDate === dateKey(nowDate)) return;
        progress.reminders.morningGreetDate = dateKey(nowDate);
        void saveProgress(progressLoaded.store, progress);
        actor.send({
          type: "SHOW_DIALOGUE",
          dialogue: {
            id: "system_morning_greet",
            text: MORNING_LINES[reminderCounterRef.current % MORNING_LINES.length],
            emotion: "happy",
            motion: "happy",
          },
        });
      }, 1_000);

      // 启动时的一次性 / 纪念日触发（留出 6.5 秒给早安问候说完再出场）
      window.setTimeout(() => {
        if (disposed) return;
        let startupShown = false;
        if (relationshipBeforeSession.absenceDays >= 1) {
          startupShown = tryShowRef.current({
            type: "returnAfterAbsence",
            absenceDays: relationshipBeforeSession.absenceDays,
          });
        } else if (progress.launchCount === 1) {
          startupShown = tryShowRef.current({ type: "firstLaunch" });
        }
        if (!startupShown) {
          const special = engineRef.current?.specialDateContext(new Date());
          if (special) startupShown = tryShowRef.current(special);
        }
        const streak = computeStreak(progress.launchDates, today);
        if (!startupShown && streak >= 7 && !progress.triggers.streakShown) {
          progress.triggers.streakShown = true;
          void saveProgress(progressLoaded.store, progress);
          tryShowRef.current({ type: "streak", streak });
        }
      }, 6_500);

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

      // Behavior Brain：每 5 秒根据需求、活动和关系选择一个行为。
      behaviorNeedsAtRef.current = Date.now();
      behaviorTimerRef.current = window.setInterval(() => {
        const progress = progressRef.current;
        if (!progress) return;
        const now = Date.now();
        const context = behaviorContextRef.current(now);
        behaviorNeedsRef.current = advanceNeeds(
          behaviorNeedsRef.current,
          now - behaviorNeedsAtRef.current,
          context,
        );
        behaviorNeedsAtRef.current = now;
        const step = behaviorSchedulerRef.current.tick({
          needs: behaviorNeedsRef.current,
          context,
          relationship: relationshipContext(progress, now),
          stateKey: stateValueRef.current,
          idleSubState: idleSubStateRef.current,
        });
        dispatchBehaviorStepRef.current(step);
      }, 5_000);

      // 只保留光标活动的粗粒度统计，不记录坐标或轨迹。
      pointerActivityPollRef.current = window.setInterval(() => {
        void cursorPosition()
          .then((position) => {
            pointerActivityRef.current = updatePointerActivity(
              pointerActivityRef.current,
              { x: position.x, y: position.y },
              Date.now(),
            );
          })
          .catch(() => undefined);
      }, 1_000);

      // 陪伴提醒：喝水 / 久坐 / 早睡
      reminderTimerRef.current = window.setInterval(() => {
        const progress = progressRef.current;
        if (!progress || !progressStoreRef.current) return;
        // 勿扰 / 设置面板打开时不提醒；猫正在说话时不插嘴，下轮重试
        if (dndRef.current || settingsOpenRef.current) return;
        if (actor.getSnapshot().context.currentDialogue) return;

        const now = Date.now();
        const cfg = reminderRef.current;
        let changed = false;

        const say = (id: string, text: string) => {
          reminderCounterRef.current += 1;
          behaviorSchedulerRef.current.cancel();
          actor.send({
            type: "SHOW_DIALOGUE",
            dialogue: {
              id,
              text,
              emotion: "neutral",
              motion: "idle",
            },
          });
        };

        if (
          cfg.water.enabled &&
          (progress.reminders.waterLastAt === null ||
            now - progress.reminders.waterLastAt >=
              cfg.water.intervalMinutes * 60_000)
        ) {
          progress.reminders.waterLastAt = now;
          changed = true;
          say(
            "system_water",
            WATER_LINES[reminderCounterRef.current % WATER_LINES.length],
          );
        } else if (
          cfg.sedentary.enabled &&
          (progress.reminders.sedentaryLastAt === null ||
            now - progress.reminders.sedentaryLastAt >=
              cfg.sedentary.intervalMinutes * 60_000)
        ) {
          progress.reminders.sedentaryLastAt = now;
          changed = true;
          say(
            "system_sedentary",
            SIT_LINES[reminderCounterRef.current % SIT_LINES.length],
          );
        }

        const nowDate = new Date(now);
        const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
        const [sleepHour, sleepMinute] = cfg.sleep.time
          .split(":")
          .map(Number);
        const sleepMinutes = sleepHour * 60 + sleepMinute;
        if (
          cfg.sleep.enabled &&
          Number.isFinite(sleepMinutes) &&
          nowMinutes >= sleepMinutes &&
          progress.reminders.sleepLastDate !== dateKey(nowDate)
        ) {
          progress.reminders.sleepLastDate = dateKey(nowDate);
          changed = true;
          say("system_sleep", SLEEP_LINE);
        }

        if (changed) {
          void saveProgress(progressStoreRef.current, progress);
        }
      }, REMINDER_TICK_MS);

      // 逗猫棒：递归轮询全局光标（上一轮结束再排下一轮，采样间隔稳定）
      const resetTeaseGesture = (): void => {
        teasePrevRef.current = null;
        teaseLastMoveRef.current = null;
        teasePhaseRef.current = "rest";
        teaseEpisodeRef.current = null;
      };
      const pollTease = (): void => {
        void (async () => {
          try {
            if (settingsOpenRef.current) {
              resetTeaseGesture();
              return;
            }
            const stateKey = stateValueRef.current;
            // 睡着 / 拖拽 / 正被按住时不把它当逗猫棒
            if (
              stateKey === "sleeping" ||
              stateKey === "sleepy" ||
              stateKey === "falling" ||
              stateKey === "dragging" ||
              stateKey === "petted"
            ) {
              resetTeaseGesture();
              return;
            }
            if (!animationRef.current.teasing) {
              resetTeaseGesture();
              return;
            }

            const pos = await cursorPosition();
            const now = performance.now();
            const dpr = window.devicePixelRatio || 1;
            const prev = teasePrevRef.current;
            teasePrevRef.current = { x: pos.x, y: pos.y, t: now };
            // 追逐目标始终跟随最新光标：扑击后猫会朝光标所在位置靠近
            teaseTargetRef.current = { x: pos.x, y: pos.y };
            if (!prev) return;

            const dx = pos.x - prev.x;
            const dy = pos.y - prev.y;
            const dt = Math.max(1, now - prev.t);
            const speedCss = Math.hypot(dx, dy) / dpr / dt;

            // 光标慢下来 → 解除已触发状态，下一段快速位移才算新一次划动
            if (speedCss < TEASE_REST_SPEED_CSS) {
              teaseLastMoveRef.current = null;
              teasePhaseRef.current = "rest";
              teaseEpisodeRef.current = null;
              return;
            }

            // 快速回摆：方向反转直接视为新一段划动，来回甩动不必等光标停稳
            const lastMove = teaseLastMoveRef.current;
            teaseLastMoveRef.current = { dx, dy };
            if (lastMove && lastMove.dx * dx + lastMove.dy * dy < 0) {
              teasePhaseRef.current = "rest";
              teaseEpisodeRef.current = null;
            }

            if (teasePhaseRef.current === "fired") return;

            if (teasePhaseRef.current === "rest") {
              teasePhaseRef.current = "moving";
              teaseEpisodeRef.current = { x: prev.x, y: prev.y, t: prev.t };
            }
            const episode = teaseEpisodeRef.current;
            if (!episode) return;

            const episodeDistCss =
              Math.hypot(pos.x - episode.x, pos.y - episode.y) / dpr;
            const episodeSpeedCss =
              episodeDistCss / Math.max(1, now - episode.t);

            if (
              episodeDistCss < TEASE_MIN_DISTANCE_CSS ||
              episodeSpeedCss < TEASE_MIN_SPEED_CSS
            ) {
              // 慢速长拖不累计成划动：把起点滚动到上一采样点
              if (episodeSpeedCss < TEASE_START_SPEED_CSS) {
                teaseEpisodeRef.current = { x: prev.x, y: prev.y, t: prev.t };
              }
              return;
            }

            // 已形成有效划动
            teasePhaseRef.current = "fired";
            teaseEpisodeRef.current = null;
            recordRelationshipEventRef.current("tease");
            const direction: 1 | -1 = pos.x >= episode.x ? 1 : -1;

            // 追逐中：新划动只延长追逐时间，目标已在上面更新
            if (chaseDirRef.current !== null) {
              refreshChaseEndRef.current();
              return;
            }

            const nowMs = Date.now();
            if (nowMs - lastTeaseSwipeAtRef.current > TEASE_COMBO_WINDOW_MS) {
              swipeCountRef.current = 0;
            }
            swipeCountRef.current += 1;
            lastTeaseSwipeAtRef.current = nowMs;

            if (swipeCountRef.current >= 2) {
              swipeCountRef.current = 0;
              lastTeaseSwipeAtRef.current = 0;
              startTeaseChaseRef.current(direction, { x: pos.x, y: pos.y });
            } else {
              actor.send({ type: "TEASE" });
            }
          } catch {
            // cursorPosition 在极少数窗口状态下失败可忽略
          } finally {
            if (!disposed) {
              teasePollRef.current = window.setTimeout(
                pollTease,
                TEASE_POLL_MS,
              );
            }
          }
        })();
      };
      pollTease();

      // 若上次保存了“散步”开关，启动后稍等片刻再开始散步
      if (prefsLoaded.prefs.animations.walking) {
        window.setTimeout(() => {
          if (!disposed) startWalkingRef.current();
        }, 1_500);
      }
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
      if (behaviorTimerRef.current !== undefined) {
        window.clearInterval(behaviorTimerRef.current);
        behaviorTimerRef.current = undefined;
      }
      if (pointerActivityPollRef.current !== undefined) {
        window.clearInterval(pointerActivityPollRef.current);
        pointerActivityPollRef.current = undefined;
      }
      if (reminderTimerRef.current !== undefined) {
        window.clearInterval(reminderTimerRef.current);
        reminderTimerRef.current = undefined;
      }
      if (teasePollRef.current !== undefined) {
        window.clearTimeout(teasePollRef.current);
        teasePollRef.current = undefined;
      }
      if (chaseEndTimerRef.current !== undefined) {
        window.clearTimeout(chaseEndTimerRef.current);
        chaseEndTimerRef.current = undefined;
      }
      chaseDirRef.current = null;
      teaseTargetRef.current = null;
      if (walkTimerRef.current !== undefined) {
        window.clearInterval(walkTimerRef.current);
        walkTimerRef.current = undefined;
      }
      if (progressSaveTimerRef.current !== undefined) {
        window.clearTimeout(progressSaveTimerRef.current);
        progressSaveTimerRef.current = undefined;
        const progress = progressRef.current;
        const store = progressStoreRef.current;
        if (progress && store) void saveProgress(store, progress);
      }
    };
  }, []);

  // ---------- 交互 ----------
  const onPetClick = useCallback(
    (part: PetTouchPart) => {
      behaviorSchedulerRef.current.cancel();
      recordRelationshipEventRef.current(
        part === "head" ? "headpat" : part === "body" ? "body_touch" : "bow_touch",
      );
      actor.send({ type: "CLICK", at: Date.now(), part });
    },
    [actor],
  );

  const onPetDragStart = useCallback(() => {
    behaviorSchedulerRef.current.cancel();
    actor.send({ type: "DRAG_START" });
  }, [actor]);

  const onPetDragEnd = useCallback(() => {
    behaviorSchedulerRef.current.cancel();
    recordRelationshipEventRef.current("drag");
    actor.send({ type: "DRAG_END" });
    tryShowRef.current({ type: "dragEnd" });
    void (async () => {
      // 先钳制回最近显示器内，再保存位置，避免把猫拖丢在屏幕外
      try {
        await keepWindowOnScreen();
      } catch (error) {
        console.error("clamp window after drag failed:", error);
      }
      if (prefsStoreRef.current) {
        void savePositionToPrefs(prefsStoreRef.current, prefsRef.current);
      }
    })();
  }, [actor]);

  const onAnimationFinished = useCallback(() => {
    actor.send({ type: "ANIMATION_FINISHED" });
    dispatchBehaviorStepRef.current(
      behaviorSchedulerRef.current.onAnimationFinished(Date.now()),
    );
  }, [actor]);

  const onHoldStart = useCallback(() => {
    if (!animationRef.current.petting) return;
    behaviorSchedulerRef.current.cancel();
    recordRelationshipEventRef.current("petting");
    actor.send({ type: "HOLD_START" });
    setHearts(true);
  }, [actor]);

  const onHoldEnd = useCallback(() => {
    behaviorSchedulerRef.current.cancel();
    actor.send({ type: "HOLD_END" });
    setHearts(false);
  }, [actor]);

  const openSettings = useCallback(() => {
    behaviorSchedulerRef.current.cancel();
    settingsOpenRef.current = true;
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    settingsOpenRef.current = false;
    setSettingsOpen(false);
  }, []);

  const openNest = useCallback(() => {
    void invoke("open_nest")
      .then(() => emitNestSnapshotRef.current())
      .catch((error) => {
        console.error("open nest failed:", error);
      });
  }, []);

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
      // 清除后从全新的关系状态开始，旧回忆和秘密不再保留。
      progressRef.current = fresh;
      const entries = engineRef.current?.entries ?? [];
      engineRef.current = new DialogueEngine(entries, fresh.dialogue);
      installedAtRef.current = new Date(now);

      prefsRef.current = {
        position: keep.position,
        alwaysOnTop: keep.alwaysOnTop,
        dnd: keep.dnd,
        scale: keep.scale,
        animations: keep.animations,
        reminders: keep.reminders,
      };
      if (progressStore) await saveProgress(progressStore, fresh);
      if (prefsStore) await savePreferences(prefsStore, prefsRef.current);
      pendingRelationshipDialogsRef.current = [];
      emitNestSnapshotRef.current(fresh);

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

  const motion = stateToMotion(snapshot.value);

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
    animationPrefs,
    reminderPrefs,
    hearts,
    fatal,
    openSettings,
    closeSettings,
    onPetClick,
    onPetDragStart,
    onPetDragEnd,
    onAnimationFinished,
    onHoldStart,
    onHoldEnd,
    onScaleChange,
    onWheelZoom,
    toggleAlwaysOnTop,
    toggleDnd,
    toggleAutostart,
    toggleAnimation,
    updateReminder,
    clearData,
    openNest,
  };
}

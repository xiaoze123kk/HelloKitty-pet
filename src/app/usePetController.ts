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
import {
  advanceNeeds,
  applyInteraction,
  applyRest,
  initialNeeds,
  recordBehaviorAction,
  recordBehaviorMotion,
} from "../behavior/needs";
import { autonomousMotionForEvent } from "../behavior/motionHistory";
import { behaviorThoughtCooldownReady } from "../behavior/expressionDirector";
import type { BehaviorId, BehaviorStep, ContextSnapshot } from "../behavior/types";
import {
  emptyInteractionContext,
  recordInteractionContext,
  secondsSinceInteraction,
  sessionPhaseFor,
  timeBandFor,
} from "../context/behaviorContext";
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
import {
  isAccessoryUnlocked,
  normalizeAccessoryId,
  wardrobeSnapshot,
  type AccessoryId,
} from "../growth/wardrobe";
import {
  createUserMemory,
  MAX_USER_MEMORIES,
  type UserMemoryKind,
} from "../memory/userMemory";
import type { NestSnapshot } from "../nest/types";
import type { PetVisualMotion } from "../pet/animationManifest";
import type { MicroCue } from "../pet/microMotion";
import type { PetEffectEvent } from "../effects/effectManifest";
import {
  STILL_DRAG_MOTION,
  STILL_DRAG_RELEASE,
  type DragMotion,
  type DragRelease,
} from "../pet/dragDynamics";
import type {
  PetTouchInteraction,
  PetTouchTarget,
  PetTouchTargetId,
} from "../pet/touchZones";
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
  beginEdgePeek,
  chaseStep,
  finishEdgePeek,
  keepWindowOnScreen,
  restorePosition,
  savePositionToPrefs,
  setWindowScale,
  syncWindowSizeToViewport,
  walkStep,
  type EdgePeekSession,
} from "../platform/window";
import type { PeekEdge } from "../platform/edgePeek";
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
import {
  chooseHeadpatReaction,
  chooseStartupRitual,
  markRitualShown,
  relationshipStage,
  type CompanionRitual,
  type HeadpatReaction,
} from "../relationship/reactionEngine";

type PetActor = Actor<typeof petMachine>;
type PetSnapshot = SnapshotFrom<typeof petMachine>;

type UserMemoryRequest =
  | { action: "add"; kind: UserMemoryKind; text: string }
  | { action: "delete"; id: string };

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

const HEAD_TOUCH_LINES: Record<HeadpatReaction, string[]> = {
  shy: [
    "轻一点点…我还在认识你。",
    "唔，先让我熟悉一下你的手。",
    "可以摸一下，但不许笑我紧张。",
    "我没有躲开哦，只是在偷偷观察你。",
  ],
  soft: [
    "摸摸头好舒服~",
    "呼噜呼噜，喜欢这样",
    "再摸一下也可以哦",
    "手心暖暖的，我快要眯起眼睛啦。",
    "这里再揉一小会儿嘛。",
  ],
  nuzzle: [
    "你一伸手，我就知道是你。",
    "再靠近一点也没关系。",
    "这个位置最熟悉啦。",
    "今天的摸摸也收到了。",
    "我把脑袋送过来啦，接好哦。",
  ],
  reunion: [
    "好久没摸到这个熟悉的手啦。",
    "你回来以后，摸头也变得特别安心。",
    "这次要多摸一会儿，补上想念的份。",
    "原来熟悉的摸摸真的不会忘记。",
  ],
};

function ritualDialogue(ritual: CompanionRitual): DialogueDisplay {
  if (ritual.kind === "reunion") {
    return {
      id: `ritual_${ritual.key}`,
      text: `你离开了 ${ritual.value} 天，我刚才还愣了一下。欢迎回来。`,
      emotion: "happy",
      motion: "idle",
    };
  }
  if (ritual.kind === "streak") {
    return {
      id: `ritual_${ritual.key}`,
      text: `这是我们连续见面的第 ${ritual.value} 天，我有认真数。`,
      emotion: "happy",
      motion: "idle",
    };
  }
  return {
    id: `ritual_${ritual.key}`,
    text: "夜已经很深啦。我陪你安静待一会儿，然后我们都早点休息。",
    emotion: "neutral",
    motion: "idle",
  };
}

const BODY_TOUCH_LINES = [
  "肚皮不可以乱戳啦",
  "痒痒的，别闹~",
  "这里可是敏感部位！",
  "再戳我就要缩成一小团啦",
  "手指凉凉的，吓我一跳！",
  "好啦，只许轻轻摸一下哦",
];

const BOW_TOUCH_LINES = [
  "别把我的蝴蝶结弄歪啦",
  "蝴蝶结今天也很漂亮吧？",
  "这个蝴蝶结要轻一点摸哦",
  "帮我看看，它还系得整齐吗？",
  "摸完要记得替我理好哦",
  "这是今天最神气的小蝴蝶结！",
];

const LOCAL_TOUCH_LINES: Partial<Record<PetTouchTargetId, string[]>> = {
  left_ear: [
    "咦，耳朵尖被碰到了。",
    "这里会痒，轻一点点。",
    "刚才是不是有一声小小的喵？",
    "耳朵忍不住抖了一下。",
    "我有在认真听你哦。",
  ],
  right_ear: [
    "耳朵被你碰得抖了一下。",
    "悄悄话可以说近一点。",
    "唔，连耳朵都热起来了。",
    "再挠一下就要打呼噜啦。",
    "我听见你的动静啦。",
  ],
  left_cheek: [
    "这块脸颊软软的。",
    "揉得我脸都要圆啦。",
    "唔，手心暖暖的。",
    "被你捏出一个小酒窝。",
    "轻轻贴一下也可以哦。",
  ],
  right_cheek: [
    "脸颊被戳出一个小窝。",
    "再戳就要鼓成包子脸啦。",
    "好啦，给你捏一下。",
    "你的手指怎么总能找到软乎乎的地方？",
    "贴这么近，会听见我呼噜哦。",
  ],
  nose: [
    "鼻子被按到啦！",
    "唔——差一点就要打喷嚏。",
    "鼻尖凉凉的，你摸到了吗？",
    "再碰一下，我可要闻闻你啦。",
    "刚才那一下像小泡泡破掉了。",
  ],
  left_whiskers: [
    "胡须尖被碰得发痒。",
    "胡须乱了，要帮我理好吗？",
    "嘘，它们正在帮我探路呢。",
    "轻轻的，不然要打喷嚏啦。",
    "刚理好的胡须又翘起来了。",
  ],
  right_whiskers: [
    "胡须突然抖了一下。",
    "不要一直拨我的胡须嘛。",
    "碰这里会痒到耳朵尖哦。",
    "胡须可比你想的敏感多啦。",
    "再拨一下，我就要躲开喽。",
  ],
  face: [
    "你在认真看我的脸吗？",
    "好近，我都看见你啦。",
    "突然凑这么近，我会害羞的。",
    "今天的表情也被你发现啦。",
    "看够了吗？那换我看看你。",
  ],
  lower_face: BODY_TOUCH_LINES,
  bow: BOW_TOUCH_LINES,
};

const ACCESSORY_TOUCH_LINES: Record<AccessoryId, string[]> = {
  paw_badge: [
    "爪印被你按亮啦。",
    "这是第一次回应留下的小徽章。",
    "盖章！今天也见过面啦。",
    "小爪印正在悄悄发光。",
    "碰一下，就算我们击过掌啦。",
  ],
  cloud_clip: [
    "云朵轻轻晃了一下。",
    "摸起来是不是软软的？",
    "小心，它好像要飘走啦。",
    "云朵今天也乖乖待在这里。",
    "你刚才碰出了一点好天气。",
  ],
  calendar_pin: [
    "这是我们一起数过的日子。",
    "别针把连续见面的日期别好啦。",
    "今天这一格也有你的名字。",
    "见面的日子，我都有好好收着。",
    "又多了一个值得圈起来的今天。",
  ],
  moon_cap: [
    "睡帽歪了一点点。",
    "碰到睡帽，我又有点困啦。",
    "月亮正在催我打个小哈欠。",
    "帽子里藏着一个软绵绵的梦。",
    "再摸两下，我可要睡着喽。",
  ],
  ribbon_scarf: [
    "领结被你整理好啦。",
    "缎带轻轻飘了一下。",
    "这样系着是不是很神气？",
    "系在这里刚刚好，对吧？",
    "小领结很喜欢你的整理手法。",
  ],
  golden_bell: [
    "小领结被你整理得刚刚好。",
    "珍珠亮了一下，你看见了吗？",
    "一百次回应，都系在这里啦。",
    "今天也要戴得漂漂亮亮。",
    "这枚小领结只给熟悉的人碰。",
  ],
};

export interface PetController {
  /** 状态机当前动作（驱动程序化动画 / sheet 兜底） */
  motion: PetVisualMotion;
  bubble: DialogueDisplay | null;
  /** 自主行为的轻量想法提示，不改变状态机，也不占用对白配额。 */
  behaviorThought: string | null;
  behaviorMicroCue: MicroCue | undefined;
  behaviorGazeOverride: boolean | null;
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
  /** 当前穿戴的头部装扮。 */
  selectedAccessoryId: AccessoryId | null;
  /** 最近一次摸头由关系阶段决定的反应。 */
  headpatReaction: HeadpatReaction;
  /** 探头时所在的真实屏幕边缘。 */
  edgePeekSide: PeekEdge | null;
  /** 最近一次点击命中的精细部位。 */
  touchTarget: PetTouchTarget | null;
  /** 长按撸猫时是否显示爱心粒子 */
  hearts: boolean;
  /** 最近一次触摸特效的落点和重播序号。 */
  effectEvent: PetEffectEvent;
  /** 原生窗口拖动采样出的即时视觉动势。 */
  dragMotion: DragMotion;
  /** 松手时冻结的落地力度与方向。 */
  dragRelease: DragRelease;
  /** 初始化或渲染期致命错误（用于在透明窗口里显示出来，避免"隐形窗口"） */
  fatal: string | null;
  openSettings: () => void;
  closeSettings: () => void;
  onPetClick: (interaction: PetTouchInteraction) => void;
  onPetDragStart: () => void;
  onPetDragMotion: (motion: DragMotion) => void;
  onPetDragEnd: (release: DragRelease) => void;
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
  const [behaviorThought, setBehaviorThought] = useState<string | null>(null);
  const [behaviorMicroCue, setBehaviorMicroCue] = useState<MicroCue | undefined>(undefined);
  const [behaviorGazeOverride, setBehaviorGazeOverride] = useState<boolean | null>(null);
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
  const [selectedAccessoryId, setSelectedAccessoryId] =
    useState<AccessoryId | null>(null);
  const [edgePeekSide, setEdgePeekSide] = useState<PeekEdge | null>(null);
  const [hearts, setHearts] = useState(false);
  const [effectEvent, setEffectEvent] = useState<PetEffectEvent>({
    revision: 0,
    anchor: null,
    target: null,
  });
  const [dragMotion, setDragMotion] = useState<DragMotion>(STILL_DRAG_MOTION);
  const [dragRelease, setDragRelease] = useState<DragRelease>(STILL_DRAG_RELEASE);
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
    wardrobe: { selectedAccessoryId: null },
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
  const behaviorThoughtTimerRef = useRef<number | undefined>(undefined);
  const lastBehaviorThoughtAtRef = useRef(0);
  const lastBehaviorPersistAtRef = useRef(0);
  const skipFinalProgressSaveRef = useRef(false);
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
  const behaviorPlanGenerationRef = useRef(0);
  const interactionContextRef = useRef(emptyInteractionContext());
  /** 偏好加载完成前不允许自动恢复散步，避免误读默认值 */
  const walkingReadyRef = useRef(false);
  const progressSaveTimerRef = useRef<number | undefined>(undefined);
  const pendingRelationshipDialogsRef = useRef<TriggerContext[]>([]);
  const sessionAbsenceDaysRef = useRef(0);
  const reunionHeadpatPendingRef = useRef(false);
  const edgePeekSessionRef = useRef<EdgePeekSession | null>(null);
  const programmaticWindowMoveRef = useRef(false);

  const clearBehaviorExpression = useCallback(() => {
    setBehaviorMicroCue(undefined);
    setBehaviorGazeOverride(null);
    setBehaviorThought(null);
    if (behaviorThoughtTimerRef.current !== undefined) {
      window.clearTimeout(behaviorThoughtTimerRef.current);
      behaviorThoughtTimerRef.current = undefined;
    }
  }, []);
  const clearBehaviorExpressionRef = useRef(clearBehaviorExpression);
  clearBehaviorExpressionRef.current = clearBehaviorExpression;
  const cancelBehaviorPlan = useCallback(() => {
    behaviorPlanGenerationRef.current += 1;
    behaviorSchedulerRef.current.cancel();
    clearBehaviorExpressionRef.current();
  }, []);
  const cancelBehaviorPlanRef = useRef(cancelBehaviorPlan);
  cancelBehaviorPlanRef.current = cancelBehaviorPlan;

  const behaviorContext = useCallback((now = Date.now()): ContextSnapshot => {
    const progress = progressRef.current;
    const pointer = pointerContext(pointerActivityRef.current, now);
    const date = new Date(now);
    const sessionMinutes = progress ? (now - progress.sessionStart) / 60_000 : 0;
    const relationship = progress ? relationshipContext(progress, now) : null;
    const interaction = interactionContextRef.current;
    const recentRelationshipEvents =
      progress?.relationship.recentEvents.filter(
        (event) => event.type !== "session_start" && event.at >= now - 7 * 86_400_000,
      ) ?? [];
    const recentInteractionTotal = recentRelationshipEvents.length;
    const recentInteractionPattern = {
      total: recentInteractionTotal,
      headpatRatio:
        recentInteractionTotal === 0
          ? 0
          : recentRelationshipEvents.filter((event) => event.type === "headpat").length /
            recentInteractionTotal,
      teaseRatio:
        recentInteractionTotal === 0
          ? 0
          : recentRelationshipEvents.filter((event) => event.type === "tease").length /
            recentInteractionTotal,
    };
    return {
      now,
      hour: date.getHours(),
      sessionMinutes,
      ...pointer,
      todayInteractions: relationship?.todayInteractions ?? 0,
      currentState: stateValueRef.current,
      idleSubState: idleSubStateRef.current,
      dnd: dndRef.current,
      settingsOpen: settingsOpenRef.current,
      dialogueOpen: actor.getSnapshot().context.currentDialogue !== null,
      idleActionsEnabled: animationRef.current.idleActions,
      sleepTransitionsEnabled: animationRef.current.sleepTransitions,
      walkingEnabled: animationRef.current.walking,
      recentBehaviors: progress?.behavior.recentBehaviors ?? [],
      recentMotions: progress?.behavior.recentMotions ?? [],
      lastInteraction: interaction.lastInteraction,
      lastTouchTarget: interaction.lastTouchTarget,
      lastInteractionAt: interaction.lastInteractionAt,
      interactionStreak: interaction.interactionStreak,
      secondsSinceInteraction: secondsSinceInteraction(interaction, now),
      relationshipStage: relationship ? relationshipStage(relationship) : "new",
      timeBand: timeBandFor(date.getHours()),
      sessionPhase: sessionPhaseFor(sessionMinutes, sessionAbsenceDaysRef.current),
      recentInteractionPattern,
      microMotionEnabled: animationRef.current.microMotion,
      gazeFollowEnabled: animationRef.current.gazeFollow,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }, [actor]);
  const behaviorContextRef = useRef(behaviorContext);
  behaviorContextRef.current = behaviorContext;

  const dispatchBehaviorStep = useCallback(
    (step: BehaviorStep | null): void => {
      if (!step) return;
      setBehaviorMicroCue(step.microCue ?? "none");
      setBehaviorGazeOverride(step.gaze === "user");
      if (
        step.thought &&
        behaviorThoughtCooldownReady(lastBehaviorThoughtAtRef.current, Date.now())
      ) {
        lastBehaviorThoughtAtRef.current = Date.now();
        setBehaviorThought(step.thought);
        if (behaviorThoughtTimerRef.current !== undefined) {
          window.clearTimeout(behaviorThoughtTimerRef.current);
        }
        behaviorThoughtTimerRef.current = window.setTimeout(() => {
          behaviorThoughtTimerRef.current = undefined;
          setBehaviorThought(null);
        }, 2_400);
      }
      const recordMotion = (eventType: BehaviorStep["event"]["type"]): void => {
        const progress = progressRef.current;
        const motion = autonomousMotionForEvent(eventType);
        if (progress && motion) recordBehaviorMotion(progress.behavior, motion);
      };
      if (import.meta.env.DEV) {
        console.debug("[behavior]", step.event.type);
      }
      if (step.event.type === "EDGE_PEEK") {
        const planGeneration = behaviorPlanGenerationRef.current;
        programmaticWindowMoveRef.current = true;
        void beginEdgePeek()
          .then((session) => {
            if (planGeneration !== behaviorPlanGenerationRef.current) {
              programmaticWindowMoveRef.current = false;
              if (session) void finishEdgePeek(session);
              return;
            }
            if (!session) {
              programmaticWindowMoveRef.current = false;
              recordMotion("IDLE_PEEK");
              actor.send({ type: "IDLE_PEEK" });
              return;
            }
            edgePeekSessionRef.current = session;
            setEdgePeekSide(session.edge);
            recordMotion(step.event.type);
            actor.send(step.event);
          })
          .catch((error) => {
            programmaticWindowMoveRef.current = false;
            console.error("begin edge peek failed:", error);
            if (planGeneration !== behaviorPlanGenerationRef.current) return;
            recordMotion("IDLE_PEEK");
            actor.send({ type: "IDLE_PEEK" });
          });
        return;
      }
      recordMotion(step.event.type);
      actor.send(step.event);
    },
    [actor],
  );
  const dispatchBehaviorStepRef = useRef(dispatchBehaviorStep);
  dispatchBehaviorStepRef.current = dispatchBehaviorStep;

  const emitNestSnapshot = useCallback((progress = progressRef.current) => {
    if (!progress) return;
    const nestSnapshot: NestSnapshot = {
      ...snapshotRelationship(progress),
      wardrobe: wardrobeSnapshot(
        progress.relationship.unlockedMemories,
        prefsRef.current.wardrobe.selectedAccessoryId,
      ),
      userMemories: progress.userMemories,
    };
    void emitTo("nest", "relationship-snapshot", nestSnapshot).catch(
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

  const recordAutonomousBehavior = useCallback(
    (id: BehaviorId, now: number): void => {
      const progress = progressRef.current;
      if (!progress) return;
      if (id === "rest") {
        behaviorNeedsRef.current = applyRest(behaviorNeedsRef.current);
      }
      progress.behavior.needs = behaviorNeedsRef.current;
      recordBehaviorAction(progress.behavior, id, now);
      lastBehaviorPersistAtRef.current = now;
      emitNestSnapshotRef.current(progress);
      scheduleProgressSaveRef.current();
    },
    [],
  );
  const recordAutonomousBehaviorRef = useRef(recordAutonomousBehavior);
  recordAutonomousBehaviorRef.current = recordAutonomousBehavior;

  const recordRelationshipEvent = useCallback(
    (type: RelationshipEventType, touchTarget: PetTouchTargetId | null = null): void => {
      const progress = progressRef.current;
      if (!progress) return;
      const now = Date.now();
      recordEvent(progress.relationship, type, now);
      if (type !== "session_start") {
        interactionContextRef.current = recordInteractionContext(
          interactionContextRef.current,
          type,
          touchTarget,
          now,
        );
        behaviorNeedsRef.current = applyInteraction(behaviorNeedsRef.current);
        progress.behavior.needs = behaviorNeedsRef.current;
        progress.behavior.updatedAt = now;
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
      cancelBehaviorPlanRef.current();
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
        cancelBehaviorPlanRef.current();
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
        if (previous === "edgePeek" && currentState !== "edgePeek") {
          const session = edgePeekSessionRef.current;
          edgePeekSessionRef.current = null;
          if (session) {
            void finishEdgePeek(session).finally(() => {
              programmaticWindowMoveRef.current = false;
              setEdgePeekSide(null);
            });
          }
        }
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
          const reaction = snap.context.headpatReaction;
          showTouchLineRef.current(
            `system_headpat_${reaction}`,
            HEAD_TOUCH_LINES[reaction],
          );
        } else if (currentState === "bodypat") {
          showTouchLineRef.current("system_bodypat", BODY_TOUCH_LINES);
        } else if (currentState === "bowtouch") {
          showTouchLineRef.current("system_bowtouch", BOW_TOUCH_LINES);
        } else if (
          currentState === "earTouch" ||
          currentState === "cheekTouch" ||
          currentState === "noseBoop" ||
          currentState === "whiskerTouch" ||
          currentState === "faceTouch"
        ) {
          const target = snap.context.touchTarget;
          const lines = target ? LOCAL_TOUCH_LINES[target.id] : undefined;
          if (target && lines) {
            showTouchLineRef.current(`system_touch_${target.id}`, lines);
          }
        } else if (currentState === "accessoryTouch") {
          const accessoryId = snap.context.touchTarget?.accessoryId;
          if (accessoryId) {
            showTouchLineRef.current(
              `system_accessory_${accessoryId}`,
              ACCESSORY_TOUCH_LINES[accessoryId],
            );
          }
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
      behaviorNeedsRef.current = progress.behavior.needs;
      behaviorNeedsAtRef.current = now;
      lastBehaviorPersistAtRef.current = now;
      const relationshipBeforeSession = relationshipContext(progress, now);
      sessionAbsenceDaysRef.current = relationshipBeforeSession.absenceDays;
      reunionHeadpatPendingRef.current = relationshipBeforeSession.absenceDays >= 2;
      progress.launchCount += 1;
      if (!progress.firstLaunchAt) {
        progress.firstLaunchAt = new Date(now).toISOString();
      }
      if (!progress.launchDates.includes(today)) {
        progress.launchDates.push(today);
      }
      progress.sessionStart = now;
      recordEvent(progress.relationship, "session_start", now);
      const relationshipAfterSession = relationshipContext(progress, now);
      const startupRitual = chooseStartupRitual({
        now,
        absenceDays: relationshipBeforeSession.absenceDays,
        consecutiveDays: relationshipAfterSession.streak,
        daysTogether: relationshipAfterSession.daysTogether,
        shownKeys: progress.rituals.shownKeys,
      });
      const startupMemories = unlockEligibleMemories(progress.relationship, now);
      for (const memoryId of startupMemories) {
        pendingRelationshipDialogsRef.current.push({ type: "memoryUnlocked", memoryId });
      }
      const loadedAccessory = prefsLoaded.prefs.wardrobe.selectedAccessoryId;
      if (
        loadedAccessory &&
        !isAccessoryUnlocked(
          loadedAccessory,
          progress.relationship.unlockedMemories,
        )
      ) {
        prefsLoaded.prefs.wardrobe.selectedAccessoryId = null;
        await savePreferences(prefsLoaded.store, prefsLoaded.prefs);
      }
      setSelectedAccessoryId(prefsLoaded.prefs.wardrobe.selectedAccessoryId);
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

      const unWardrobeSelection = await listen<AccessoryId | null>(
        "wardrobe-selection-request",
        (event) => {
          void (async () => {
            try {
              const progress = progressRef.current;
              const normalized = normalizeAccessoryId(event.payload);
              if (event.payload !== null && normalized === null) {
                throw new Error("这件装扮不存在。");
              }
              if (
                normalized &&
                (!progress ||
                  !isAccessoryUnlocked(
                    normalized,
                    progress.relationship.unlockedMemories,
                  ))
              ) {
                throw new Error("这件装扮还没有解锁。");
              }
              prefsRef.current.wardrobe.selectedAccessoryId = normalized;
              setSelectedAccessoryId(normalized);
              if (normalized && !settingsOpenRef.current) {
                cancelBehaviorPlanRef.current();
                const welcomeEvent =
                  normalized === "moon_cap"
                    ? ({ type: "IDLE_YAWN" } as const)
                    : normalized === "golden_bell" || normalized === "ribbon_scarf"
                      ? ({ type: "IDLE_SWAY" } as const)
                      : normalized === "calendar_pin"
                        ? ({ type: "IDLE_JUMP" } as const)
                        : normalized === "paw_badge"
                          ? ({ type: "IDLE_NOD" } as const)
                          : ({ type: "IDLE_BOW" } as const);
                actor.send(welcomeEvent);
              }
              if (prefsStoreRef.current) {
                await savePreferences(prefsStoreRef.current, prefsRef.current);
              }
              emitNestSnapshotRef.current();
              await emitTo("nest", "wardrobe-selection-result", {
                ok: true,
                message: normalized ? "Kitty 已经戴好啦。" : "Kitty 暂时不戴装扮。",
              });
            } catch (error) {
              await emitTo("nest", "wardrobe-selection-result", {
                ok: false,
                message: String(error),
              }).catch(() => undefined);
            }
          })();
        },
      );
      unlisteners.push(unWardrobeSelection);

      const unUserMemoryRequest = await listen<UserMemoryRequest>(
        "user-memory-request",
        (event) => {
          const request = event.payload;
          void (async () => {
            try {
              const progress = progressRef.current;
              const store = progressStoreRef.current;
              if (!progress || !store) throw new Error("关系记录还没有准备好。");
              if (request.action === "add") {
                if (progress.userMemories.length >= MAX_USER_MEMORIES) {
                  throw new Error(`最多保存 ${MAX_USER_MEMORIES} 条，请先删除一条旧记忆。`);
                }
                progress.userMemories = [
                  createUserMemory(request.kind, request.text),
                  ...progress.userMemories,
                ];
              } else {
                const before = progress.userMemories.length;
                progress.userMemories = progress.userMemories.filter(
                  (item) => item.id !== request.id,
                );
                if (before === progress.userMemories.length) {
                  throw new Error("没有找到这条记忆。");
                }
              }
              await saveProgress(store, progress);
              emitNestSnapshotRef.current(progress);
              await emitTo("nest", "user-memory-result", {
                ok: true,
                message:
                  request.action === "add"
                    ? "好，我会记住这件事。"
                    : "这条记忆已经删除。",
              });
            } catch (error) {
              await emitTo("nest", "user-memory-result", {
                ok: false,
                message: String(error),
              }).catch(() => undefined);
            }
          })();
        },
      );
      unlisteners.push(unUserMemoryRequest);

      const unBackupRequest = await listen<"create" | "restore">(
        "data-backup-request",
        (event) => {
          void (async () => {
            try {
              const progress = progressRef.current;
              if (progress && progressStoreRef.current) {
                progress.behavior.needs = behaviorNeedsRef.current;
                progress.behavior.updatedAt = Date.now();
                await saveProgress(progressStoreRef.current, progress);
              }
              if (prefsStoreRef.current) {
                await savePreferences(prefsStoreRef.current, prefsRef.current);
              }
              if (event.payload === "create") {
                const path = await invoke<string>("create_backup");
                await emitTo("nest", "data-backup-result", {
                  ok: true,
                  message: `备份已保存：${path}`,
                });
              } else {
                await emitTo("nest", "data-backup-result", {
                  ok: true,
                  message: "正在恢复最近备份并重新启动 Kitty…",
                });
                skipFinalProgressSaveRef.current = true;
                await invoke<void>("restore_latest_backup");
              }
            } catch (error) {
              await emitTo("nest", "data-backup-result", {
                ok: false,
                message: `操作失败：${String(error)}`,
              }).catch(() => undefined);
            }
          })();
        },
      );
      unlisteners.push(unBackupRequest);

      const unMoved = await appWindow.onMoved(() => {
        if (programmaticWindowMoveRef.current) return;
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
        if (startupRitual && !dndRef.current) {
          markRitualShown(progress.rituals, startupRitual);
          void saveProgress(progressLoaded.store, progress);
          cancelBehaviorPlanRef.current();
          actor.send({ type: "PLAY_RITUAL", ritual: startupRitual.kind });
          actor.send({
            type: "SHOW_DIALOGUE",
            dialogue: ritualDialogue(startupRitual),
          });
          startupShown = true;
        } else if (relationshipBeforeSession.absenceDays >= 1) {
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
        progress.behavior.needs = behaviorNeedsRef.current;
        progress.behavior.updatedAt = now;
        const step = behaviorSchedulerRef.current.tick({
          needs: behaviorNeedsRef.current,
          context,
          relationship: relationshipContext(progress, now),
          stateKey: stateValueRef.current,
          idleSubState: idleSubStateRef.current,
        });
        const startedBehavior = behaviorSchedulerRef.current.consumeStartedBehavior();
        if (startedBehavior) {
          recordAutonomousBehaviorRef.current(startedBehavior, now);
        } else if (now - lastBehaviorPersistAtRef.current >= 60_000) {
          lastBehaviorPersistAtRef.current = now;
          scheduleProgressSaveRef.current();
          emitNestSnapshotRef.current(progress);
        }
        dispatchBehaviorStepRef.current(step);
        if (step && !behaviorSchedulerRef.current.isActive()) {
          clearBehaviorExpressionRef.current();
        }
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
          cancelBehaviorPlanRef.current();
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
      }
      if (behaviorThoughtTimerRef.current !== undefined) {
        window.clearTimeout(behaviorThoughtTimerRef.current);
        behaviorThoughtTimerRef.current = undefined;
      }
      const progress = progressRef.current;
      const store = progressStoreRef.current;
      if (progress && store && !skipFinalProgressSaveRef.current) {
        progress.behavior.needs = behaviorNeedsRef.current;
        progress.behavior.updatedAt = Date.now();
        void saveProgress(store, progress);
      }
      const edgeSession = edgePeekSessionRef.current;
      edgePeekSessionRef.current = null;
      if (edgeSession) void finishEdgePeek(edgeSession);
    };
  }, []);

  // ---------- 交互 ----------
  const onPetClick = useCallback(
    ({ target, point }: PetTouchInteraction) => {
      cancelBehaviorPlanRef.current();
      setEffectEvent((current) => ({
        revision: current.revision + 1,
        anchor: point,
        target,
      }));
      const progress = progressRef.current;
      let headpatReaction: HeadpatReaction | undefined;
      if (target.id === "forehead" && progress) {
        const context = relationshipContext(progress);
        headpatReaction = chooseHeadpatReaction({
          ...context,
          absenceDays: reunionHeadpatPendingRef.current
            ? sessionAbsenceDaysRef.current
            : context.absenceDays,
        });
        reunionHeadpatPendingRef.current = false;
      }
      recordRelationshipEventRef.current(
        target.id === "accessory"
          ? "accessory_touch"
          : target.id === "bow"
            ? "bow_touch"
            : target.id === "lower_face"
              ? "body_touch"
              : "headpat",
        target.id,
      );
      actor.send({
        type: "CLICK",
        at: Date.now(),
        target,
        point,
        headpatReaction,
      });
    },
    [actor],
  );

  const onPetDragStart = useCallback(() => {
    cancelBehaviorPlanRef.current();
    setDragMotion(STILL_DRAG_MOTION);
    actor.send({ type: "DRAG_START" });
  }, [actor]);

  const onPetDragMotion = useCallback((motion: DragMotion) => {
    setDragMotion(motion);
  }, []);

  const onPetDragEnd = useCallback((release: DragRelease) => {
    cancelBehaviorPlanRef.current();
    setDragMotion(STILL_DRAG_MOTION);
    setDragRelease(release);
    setEffectEvent((current) => ({
      revision: current.revision + 1,
      anchor: { x: 120, y: 216 },
      target: null,
      strength: release.dustStrength,
    }));
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
    const advanceBehavior = () => {
      const next = behaviorSchedulerRef.current.onAnimationFinished(Date.now());
      dispatchBehaviorStepRef.current(next);
      if (!behaviorSchedulerRef.current.isActive()) {
        clearBehaviorExpressionRef.current();
      }
    };
    const edgeSession = edgePeekSessionRef.current;
    if (edgeSession) {
      edgePeekSessionRef.current = null;
      void finishEdgePeek(edgeSession).finally(() => {
        programmaticWindowMoveRef.current = false;
        setEdgePeekSide(null);
        actor.send({ type: "ANIMATION_FINISHED" });
        advanceBehavior();
      });
      return;
    }
    actor.send({ type: "ANIMATION_FINISHED" });
    advanceBehavior();
  }, [actor]);

  const onHoldStart = useCallback(() => {
    if (!animationRef.current.petting) return;
    cancelBehaviorPlanRef.current();
    recordRelationshipEventRef.current("petting");
    actor.send({ type: "HOLD_START" });
    setHearts(true);
  }, [actor]);

  const onHoldEnd = useCallback(() => {
    cancelBehaviorPlanRef.current();
    actor.send({ type: "HOLD_END" });
    setHearts(false);
  }, [actor]);

  const openSettings = useCallback(() => {
    cancelBehaviorPlanRef.current();
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
      behaviorNeedsRef.current = fresh.behavior.needs;
      behaviorNeedsAtRef.current = now;
      behaviorSchedulerRef.current.reset();
      interactionContextRef.current = emptyInteractionContext();
      clearBehaviorExpressionRef.current();
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
        wardrobe: { selectedAccessoryId: null },
      };
      setSelectedAccessoryId(null);
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
    behaviorThought,
    behaviorMicroCue,
    behaviorGazeOverride,
    followUp,
    settingsOpen,
    dnd,
    alwaysOnTop,
    autostart,
    autostartSupported,
    scale,
    animationPrefs,
    reminderPrefs,
    selectedAccessoryId,
    headpatReaction: snapshot.context.headpatReaction,
    edgePeekSide,
    touchTarget: snapshot.context.touchTarget,
    hearts,
    effectEvent,
    dragMotion,
    dragRelease,
    fatal,
    openSettings,
    closeSettings,
    onPetClick,
    onPetDragStart,
    onPetDragMotion,
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

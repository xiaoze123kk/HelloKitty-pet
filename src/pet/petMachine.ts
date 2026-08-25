import { assign, setup } from "xstate";
import type { DialogueDisplay } from "../dialogue/types";
import type {
  CompanionRitualKind,
  HeadpatReaction,
} from "../relationship/reactionEngine";
import type { PetVisualMotion } from "./animationManifest";
import type { PetTouchTarget } from "./touchZones";

export interface AnimationFlags {
  idleActions: boolean;
  sleepTransitions: boolean;
  dragEffects: boolean;
  petting: boolean;
  gazeFollow: boolean;
  teasing: boolean;
  walking: boolean;
}

export interface PetContext {
  /** 当前连击手势内的点击时间戳（ms）；间隔超 650ms 自动清零 */
  clickTimes: number[];
  currentDialogue: DialogueDisplay | null;
  /** 趣味动画开关（设置面板 → SET_ANIMATION_PREFS 同步进来） */
  animations: AnimationFlags;
  /** 最近一次单击摸头采用的关系反应。 */
  headpatReaction: HeadpatReaction;
  /** 当前正在播放的稀有陪伴仪式。 */
  activeRitual: CompanionRitualKind | null;
  /** 最近一次单击命中的精细部位，供有方向的局部动画与台词使用。 */
  touchTarget: PetTouchTarget | null;
}

export type PetEvent =
  | {
      type: "CLICK";
      at: number;
      target?: PetTouchTarget;
      headpatReaction?: HeadpatReaction;
    }
  | { type: "DRAG_START" }
  | { type: "DRAG_END" }
  | { type: "ANIMATION_FINISHED" }
  | { type: "SHOW_DIALOGUE"; dialogue: DialogueDisplay }
  | { type: "DIALOGUE_FINISHED" }
  | { type: "WAKE" }
  | { type: "IDLE_STRETCH" }
  | { type: "IDLE_YAWN" }
  | { type: "IDLE_WASH" }
  | { type: "IDLE_LOOK" }
  | { type: "IDLE_SNEEZE" }
  | { type: "IDLE_SHAKE" }
  | { type: "IDLE_SPIN" }
  | { type: "IDLE_JUMP" }
  | { type: "IDLE_NOD" }
  | { type: "IDLE_SWAY" }
  | { type: "IDLE_BOW" }
  | { type: "IDLE_STARTLE" }
  | { type: "IDLE_DIZZY" }
  | { type: "IDLE_PEEK" }
  | { type: "BEGIN_SLEEP" }
  | { type: "HOLD_START" }
  | { type: "HOLD_END" }
  | { type: "WALK_START" }
  | { type: "WALK_STOP" }
  | { type: "TEASE" }
  | { type: "POUNCE" }
  | { type: "EDGE_PEEK" }
  | { type: "PLAY_RITUAL"; ritual: CompanionRitualKind }
  | { type: "SET_ANIMATION_PREFS"; animations: AnimationFlags };

const SLEEPY_TIMEOUT_MS = 8_000;

/**
 * 双击识别窗口，同时用作连击手势的连续性判定：
 * 相邻两次点击间隔超过该值，视为新手势开始，旧连击计数清零。
 * 这样“点一下 → 双击 / 连击”各自独立，互不吞掉后续手势。
 */
export const DOUBLE_CLICK_WINDOW_MS = 650;
/** 4 连击触发害羞反应 */
export const RAPID_CLICK_THRESHOLD = 4;
/** 9 连击触发疯狂连击反应 */
export const CRAZY_CLICK_THRESHOLD = 9;

/** 非循环动画兜底超时：动画回调丢失时也能回到 idle */
const ACTION_FALLBACK_MS = 4_000;
const TRANSITION_FALLBACK_MS = 3_500;

/**
 * 当前点击是否仍属于同一连击手势。
 * 若与上一次点击间隔超过 DOUBLE_CLICK_WINDOW_MS，则只算本次点击自己。
 */
function clicksInCurrentBurst(context: PetContext, at: number): number {
  const last = context.clickTimes[context.clickTimes.length - 1];
  const continuesBurst =
    last !== undefined && at - last <= DOUBLE_CLICK_WINDOW_MS;
  return (continuesBurst ? context.clickTimes.length : 0) + 1;
}

export const petMachine = setup({
  types: {
    context: {} as PetContext,
    events: {} as PetEvent,
  },
  actions: {
    recordClick: assign({
      clickTimes: ({ context, event }) => {
        if (event.type !== "CLICK") return context.clickTimes;
        const last = context.clickTimes[context.clickTimes.length - 1];
        const burst =
          last !== undefined && event.at - last <= DOUBLE_CLICK_WINDOW_MS
            ? context.clickTimes
            : [];
        return [...burst, event.at];
      },
    }),
    setDialogue: assign({
      currentDialogue: ({ event }) =>
        event.type === "SHOW_DIALOGUE" ? event.dialogue : null,
    }),
    clearDialogue: assign({ currentDialogue: () => null }),
    setAnimationPrefs: assign(({ event }) =>
      event.type === "SET_ANIMATION_PREFS"
        ? { animations: event.animations }
        : {},
    ),
    setHeadpatReaction: assign({
      headpatReaction: ({ context, event }) =>
        event.type === "CLICK" && event.headpatReaction
          ? event.headpatReaction
          : context.headpatReaction,
    }),
    setActiveRitual: assign({
      activeRitual: ({ event }) =>
        event.type === "PLAY_RITUAL" ? event.ritual : null,
    }),
    clearActiveRitual: assign({ activeRitual: () => null }),
    setTouchTarget: assign({
      touchTarget: ({ context, event }) =>
        event.type === "CLICK" && event.target
          ? event.target
          : context.touchTarget,
    }),
  },
  guards: {
    isCrazyClick: ({ context, event }) =>
      event.type === "CLICK" &&
      clicksInCurrentBurst(context, event.at) >= CRAZY_CLICK_THRESHOLD,
    isRapidClick: ({ context, event }) =>
      event.type === "CLICK" &&
      clicksInCurrentBurst(context, event.at) >= RAPID_CLICK_THRESHOLD,
    isDoubleClick: ({ context, event }) =>
      event.type === "CLICK" &&
      context.clickTimes.length > 0 &&
      event.at - context.clickTimes[context.clickTimes.length - 1] <=
        DOUBLE_CLICK_WINDOW_MS,
    isForeheadTouch: ({ event }) =>
      event.type === "CLICK" && event.target?.id === "forehead",
    isNoseTouch: ({ event }) =>
      event.type === "CLICK" && event.target?.id === "nose",
    isAccessoryTouch: ({ event }) =>
      event.type === "CLICK" && event.target?.id === "accessory",
    isLowerFaceTouch: ({ event }) =>
      event.type === "CLICK" && event.target?.id === "lower_face",
    isBowTouch: ({ event }) =>
      event.type === "CLICK" && event.target?.id === "bow",
    isFaceTouch: ({ event }) =>
      event.type === "CLICK" && event.target?.id === "face",
    isEarTouch: ({ event }) =>
      event.type === "CLICK" &&
      (event.target?.id === "left_ear" || event.target?.id === "right_ear"),
    isCheekTouch: ({ event }) =>
      event.type === "CLICK" &&
      (event.target?.id === "left_cheek" || event.target?.id === "right_cheek"),
    isWhiskerTouch: ({ event }) =>
      event.type === "CLICK" &&
      (event.target?.id === "left_whiskers" ||
        event.target?.id === "right_whiskers"),
    dialogueMovesHappy: ({ event }) =>
      event.type === "SHOW_DIALOGUE" &&
      (event.dialogue.motion === "happy" || event.dialogue.motion === "wave"),
    dialogueMovesShy: ({ event }) =>
      event.type === "SHOW_DIALOGUE" && event.dialogue.motion === "shy",
    dialogueMovesSleep: ({ event }) =>
      event.type === "SHOW_DIALOGUE" && event.dialogue.motion === "sleep",
    idleActionsOn: ({ context }) => context.animations.idleActions,
    sleepTransitionsOn: ({ context }) => context.animations.sleepTransitions,
    dragEffectsOn: ({ context }) => context.animations.dragEffects,
    pettingOn: ({ context }) => context.animations.petting,
    teasingOn: ({ context }) => context.animations.teasing,
    isReunionRitual: ({ event }) =>
      event.type === "PLAY_RITUAL" && event.ritual === "reunion",
    isStreakRitual: ({ event }) =>
      event.type === "PLAY_RITUAL" && event.ritual === "streak",
    isLateNightRitual: ({ event }) =>
      event.type === "PLAY_RITUAL" && event.ritual === "late_night",
  },
}).createMachine({
  id: "pet",
  initial: "idle",
  context: {
    clickTimes: [],
    currentDialogue: null,
    animations: {
      idleActions: true,
      sleepTransitions: true,
      dragEffects: true,
      petting: true,
      gazeFollow: true,
      teasing: true,
      // 与 DEFAULT_ANIMATIONS 保持一致：散步默认关闭
      walking: false,
    },
    headpatReaction: "soft",
    activeRitual: null,
    touchTarget: null,
  },
  on: {
    CLICK: [
      {
        guard: "isCrazyClick",
        target: "#pet.angry",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isRapidClick",
        target: "#pet.shy",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isDoubleClick",
        target: "#pet.happy",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isForeheadTouch",
        target: "#pet.headpat",
        actions: ["recordClick", "setTouchTarget", "setHeadpatReaction"],
      },
      {
        guard: "isEarTouch",
        target: "#pet.earTouch",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isCheekTouch",
        target: "#pet.cheekTouch",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isNoseTouch",
        target: "#pet.noseTouch",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isWhiskerTouch",
        target: "#pet.whiskerTouch",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isAccessoryTouch",
        target: "#pet.accessoryTouch",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isLowerFaceTouch",
        target: "#pet.bodypat",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isBowTouch",
        target: "#pet.bowtouch",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        guard: "isFaceTouch",
        target: "#pet.faceTouch",
        actions: ["recordClick", "setTouchTarget"],
      },
      {
        target: "#pet.clicked",
        actions: ["recordClick", "setTouchTarget"],
      },
    ],
    SHOW_DIALOGUE: [
      {
        guard: "dialogueMovesHappy",
        target: "#pet.happy",
        actions: "setDialogue",
      },
      {
        guard: "dialogueMovesShy",
        target: "#pet.shy",
        actions: "setDialogue",
      },
      {
        guard: "dialogueMovesSleep",
        target: "#pet.sleeping",
        actions: "setDialogue",
      },
      {
        // idle / neutral 动作：留在当前状态，只更新气泡
        actions: "setDialogue",
      },
    ],
    DIALOGUE_FINISHED: {
      actions: "clearDialogue",
    },
    WAKE: {
      target: "#pet.idle",
    },
    SET_ANIMATION_PREFS: {
      actions: "setAnimationPrefs",
    },
    DRAG_START: [
      {
        guard: "dragEffectsOn",
        target: "#pet.dragging",
      },
    ],
    DRAG_END: [
      {
        guard: "dragEffectsOn",
        target: "#pet.landing",
      },
    ],
    HOLD_START: [
      {
        guard: "pettingOn",
        target: "#pet.petted",
      },
    ],
    HOLD_END: {
      target: "#pet.idle",
    },
    WALK_START: {
      target: "#pet.walking",
    },
    WALK_STOP: {
      target: "#pet.idle",
    },
    BEGIN_SLEEP: {
      target: "#pet.sleepy",
      guard: "sleepTransitionsOn",
    },
    TEASE: [
      {
        guard: "teasingOn",
        target: "#pet.tease",
      },
    ],
    POUNCE: [
      {
        guard: "teasingOn",
        target: "#pet.pounce",
      },
    ],
    EDGE_PEEK: {
      target: "#pet.edgePeek",
    },
    PLAY_RITUAL: [
      {
        guard: "isReunionRitual",
        target: "#pet.ritualReunion",
        actions: "setActiveRitual",
      },
      {
        guard: "isStreakRitual",
        target: "#pet.ritualStreak",
        actions: "setActiveRitual",
      },
      {
        guard: "isLateNightRitual",
        target: "#pet.ritualLateNight",
        actions: "setActiveRitual",
      },
    ],
  },
  states: {
    idle: {
      initial: "still",
      on: {
        IDLE_STRETCH: [
          {
            guard: "idleActionsOn",
            target: ".stretch",
          },
        ],
        IDLE_YAWN: [
          {
            guard: "idleActionsOn",
            target: ".yawn",
          },
        ],
        IDLE_WASH: [
          {
            guard: "idleActionsOn",
            target: ".wash",
          },
        ],
        IDLE_LOOK: [
          {
            guard: "idleActionsOn",
            target: ".look",
          },
        ],
        IDLE_SNEEZE: [
          {
            guard: "idleActionsOn",
            target: ".sneeze",
          },
        ],
        IDLE_SHAKE: [
          {
            guard: "idleActionsOn",
            target: ".shake",
          },
        ],
        IDLE_SPIN: [
          {
            guard: "idleActionsOn",
            target: ".spin",
          },
        ],
        IDLE_JUMP: [
          {
            guard: "idleActionsOn",
            target: ".jump",
          },
        ],
        IDLE_NOD: [
          {
            guard: "idleActionsOn",
            target: ".nod",
          },
        ],
        IDLE_SWAY: [
          {
            guard: "idleActionsOn",
            target: ".sway",
          },
        ],
        IDLE_BOW: [
          {
            guard: "idleActionsOn",
            target: ".bow",
          },
        ],
        IDLE_STARTLE: [
          {
            guard: "idleActionsOn",
            target: ".startle",
          },
        ],
        IDLE_DIZZY: [
          {
            guard: "idleActionsOn",
            target: ".dizzy",
          },
        ],
        IDLE_PEEK: [
          {
            guard: "idleActionsOn",
            target: ".peek",
          },
        ],
      },
      states: {
        still: {},
        // 小动作是 idle 的子状态：切换时不会退出 idle，
        // 因此 45 秒困倦倒计时不会被小动作重置
        stretch: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        yawn: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        wash: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        look: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        sneeze: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        shake: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        spin: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        jump: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        nod: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        sway: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        bow: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        startle: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        dizzy: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
        peek: {
          after: {
            [ACTION_FALLBACK_MS]: { target: "#pet.idle.still" },
          },
          on: {
            ANIMATION_FINISHED: { target: "#pet.idle.still" },
          },
        },
      },
    },
    sleepy: {
      after: {
        [SLEEPY_TIMEOUT_MS]: [
          { target: "falling", guard: "sleepTransitionsOn" },
          { target: "sleeping" },
        ],
      },
    },
    sleeping: {
      on: {
        CLICK: [
          {
            target: "waking",
            guard: "sleepTransitionsOn",
            actions: "recordClick",
          },
          {
            target: "#pet.clicked",
            actions: "recordClick",
          },
        ],
      },
    },
    clicked: {
      after: {
        4_000: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    // ---------- 分部位摸摸 ----------
    headpat: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    bodypat: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    bowtouch: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    earTouch: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    cheekTouch: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    noseTouch: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    whiskerTouch: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    faceTouch: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    accessoryTouch: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    // ---------- 逗猫棒 ----------
    tease: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    pounce: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    happy: {
      after: {
        5_000: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    shy: {
      after: {
        3_000: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    // 疯狂连击（9 次）：生气发抖，使用 assets/angry.png.png 立绘
    angry: {
      after: {
        3_000: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    // ---------- 入睡 / 起床过渡 ----------
    falling: {
      after: {
        [TRANSITION_FALLBACK_MS]: { target: "sleeping" },
      },
      on: {
        ANIMATION_FINISHED: { target: "sleeping" },
      },
    },
    waking: {
      after: {
        [TRANSITION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    // ---------- 拖拽悬挂 / 落地 / 撸猫 / 散步 ----------
    dragging: {},
    landing: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    petted: {},
    walking: {},
    edgePeek: {
      after: {
        [ACTION_FALLBACK_MS]: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    ritualReunion: {
      exit: "clearActiveRitual",
      after: {
        5_000: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    ritualStreak: {
      exit: "clearActiveRitual",
      after: {
        5_000: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
    ritualLateNight: {
      exit: "clearActiveRitual",
      after: {
        5_000: { target: "idle" },
      },
      on: {
        ANIMATION_FINISHED: { target: "idle" },
      },
    },
  },
});

/** 取顶层状态名；层级状态（如 { idle: "stretch" }）返回顶层 key */
export function machineStateKey(stateValue: unknown): string {
  if (typeof stateValue === "string") return stateValue;
  if (stateValue && typeof stateValue === "object") {
    const keys = Object.keys(stateValue as Record<string, unknown>);
    if (keys.length > 0) return keys[0];
  }
  return "idle";
}

/** idle 的子状态名；非层级或非 idle 时返回 null */
export function idleSubState(stateValue: unknown): string | null {
  if (stateValue && typeof stateValue === "object") {
    const idle = (stateValue as Record<string, unknown>).idle;
    if (typeof idle === "string") return idle;
  }
  return null;
}

export function stateToMotion(stateValue: unknown): PetVisualMotion {
  if (stateValue && typeof stateValue === "object") {
    const child = idleSubState(stateValue);
    if (child) {
      switch (child) {
        case "stretch":
          return "stretch";
        case "yawn":
          return "yawn";
        case "wash":
          return "wash";
        case "look":
          return "look";
        case "sneeze":
          return "sneeze";
        case "shake":
          return "shake";
        case "spin":
          return "spin";
        case "jump":
          return "jump";
        case "nod":
          return "nod";
        case "sway":
          return "sway";
        case "bow":
          return "bow";
        case "startle":
          return "startle";
        case "dizzy":
          return "dizzy";
        case "peek":
          return "peek";
        default:
          return "idle";
      }
    }
    return "idle";
  }
  if (typeof stateValue !== "string") return "idle";
  switch (stateValue) {
    case "sleepy":
      return "sleepy";
    case "sleeping":
      return "sleep";
    case "clicked":
      return "clicked";
    case "headpat":
      return "headpat";
    case "bodypat":
      return "bodypat";
    case "bowtouch":
      return "bowtouch";
    case "earTouch":
      return "earTouch";
    case "cheekTouch":
      return "cheekTouch";
    case "noseTouch":
      return "noseBoop";
    case "whiskerTouch":
      return "whiskerTouch";
    case "faceTouch":
      return "faceTouch";
    case "accessoryTouch":
      return "accessoryTouch";
    case "tease":
      return "tease";
    case "pounce":
      return "pounce";
    case "happy":
      return "happy";
    case "shy":
      return "shy";
    case "angry":
      return "angry";
    case "dragging":
      return "dragging";
    case "stretch":
      return "stretch";
    case "yawn":
      return "yawn";
    case "wash":
      return "wash";
    case "look":
      return "look";
    case "falling":
      return "fallAsleep";
    case "waking":
      return "wake";
    case "landing":
      return "landing";
    case "petted":
      return "petted";
    case "walking":
      return "walk";
    case "edgePeek":
      return "edgePeek";
    case "ritualReunion":
      return "reunion";
    case "ritualStreak":
      return "celebrate";
    case "ritualLateNight":
      return "moonGreeting";
    default:
      return "idle";
  }
}

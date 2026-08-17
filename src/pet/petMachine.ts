import { assign, setup } from "xstate";
import type { DialogueDisplay } from "../dialogue/types";

export interface PetContext {
  /** 最近 5 秒内的点击时间戳（ms） */
  clickTimes: number[];
  currentDialogue: DialogueDisplay | null;
}

export type PetEvent =
  | { type: "CLICK"; at: number }
  | { type: "DRAG_START" }
  | { type: "DRAG_END" }
  | { type: "ANIMATION_FINISHED" }
  | { type: "SHOW_DIALOGUE"; dialogue: DialogueDisplay }
  | { type: "DIALOGUE_FINISHED" }
  | { type: "WAKE" };

const IDLE_TIMEOUT_MS = 45_000;
const SLEEPY_TIMEOUT_MS = 8_000;
const RAPID_WINDOW_MS = 5_000;
const DOUBLE_CLICK_WINDOW_MS = 450;
const RAPID_THRESHOLD = 5;
const CRAZY_THRESHOLD = 12;

export const petMachine = setup({
  types: {
    context: {} as PetContext,
    events: {} as PetEvent,
  },
  actions: {
    recordClick: assign({
      clickTimes: ({ context, event }) => {
        if (event.type !== "CLICK") return context.clickTimes;
        return [
          ...context.clickTimes.filter(
            (t) => event.at - t <= RAPID_WINDOW_MS,
          ),
          event.at,
        ];
      },
    }),
    setDialogue: assign({
      currentDialogue: ({ event }) =>
        event.type === "SHOW_DIALOGUE" ? event.dialogue : null,
    }),
    clearDialogue: assign({ currentDialogue: () => null }),
  },
  guards: {
    isCrazyClick: ({ context, event }) =>
      event.type === "CLICK" &&
      context.clickTimes.filter((t) => event.at - t <= RAPID_WINDOW_MS)
        .length +
        1 >=
        CRAZY_THRESHOLD,
    isRapidClick: ({ context, event }) =>
      event.type === "CLICK" &&
      context.clickTimes.filter((t) => event.at - t <= RAPID_WINDOW_MS)
        .length +
        1 >=
        RAPID_THRESHOLD,
    isDoubleClick: ({ context, event }) =>
      event.type === "CLICK" &&
      context.clickTimes.length > 0 &&
      event.at - context.clickTimes[context.clickTimes.length - 1] <=
        DOUBLE_CLICK_WINDOW_MS,
    dialogueMovesHappy: ({ event }) =>
      event.type === "SHOW_DIALOGUE" &&
      (event.dialogue.motion === "happy" || event.dialogue.motion === "wave"),
    dialogueMovesShy: ({ event }) =>
      event.type === "SHOW_DIALOGUE" && event.dialogue.motion === "shy",
    dialogueMovesSleep: ({ event }) =>
      event.type === "SHOW_DIALOGUE" && event.dialogue.motion === "sleep",
  },
}).createMachine({
  id: "pet",
  initial: "idle",
  context: {
    clickTimes: [],
    currentDialogue: null,
  },
  on: {
    CLICK: [
      {
        guard: "isCrazyClick",
        target: "shy",
        actions: "recordClick",
      },
      {
        guard: "isRapidClick",
        target: "shy",
        actions: "recordClick",
      },
      {
        guard: "isDoubleClick",
        target: "happy",
        actions: "recordClick",
      },
      {
        target: "clicked",
        actions: "recordClick",
      },
    ],
    SHOW_DIALOGUE: [
      {
        guard: "dialogueMovesHappy",
        target: "happy",
        actions: "setDialogue",
      },
      {
        guard: "dialogueMovesShy",
        target: "shy",
        actions: "setDialogue",
      },
      {
        guard: "dialogueMovesSleep",
        target: "sleeping",
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
      target: "idle",
    },
  },
  states: {
    idle: {
      after: {
        [IDLE_TIMEOUT_MS]: { target: "sleepy" },
      },
    },
    sleepy: {
      after: {
        [SLEEPY_TIMEOUT_MS]: { target: "sleeping" },
      },
    },
    sleeping: {},
    clicked: {
      after: {
        4_000: { target: "idle" },
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
    dragging: {},
  },
});

export function stateToMotion(
  stateValue: string | Record<string, unknown>,
): "idle" | "sleepy" | "sleep" | "clicked" | "happy" | "shy" | "dragging" {
  if (typeof stateValue !== "string") return "idle";
  switch (stateValue) {
    case "sleepy":
      return "sleepy";
    case "sleeping":
      return "sleep";
    case "clicked":
      return "clicked";
    case "happy":
      return "happy";
    case "shy":
      return "shy";
    case "dragging":
      return "dragging";
    default:
      return "idle";
  }
}

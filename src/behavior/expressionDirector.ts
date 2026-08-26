import { autonomousMotionForEvent } from "./motionHistory";
import type {
  AutonomousMotionId,
  BehaviorDecisionInput,
  BehaviorId,
  BehaviorPlan,
  DirectedBehaviorPlan,
  ExpressionCandidate,
  ExpressionDirective,
} from "./types";
import type { MicroCue } from "../pet/microMotion";

export const BEHAVIOR_THOUGHT_COOLDOWN_MS = 180_000;

export function behaviorThoughtCooldownReady(
  lastShownAt: number,
  now: number,
): boolean {
  return now - lastShownAt >= BEHAVIOR_THOUGHT_COOLDOWN_MS;
}

const BEHAVIOR_THOUGHTS: Partial<Record<BehaviorId, string>> = {
  sleep: "有点困啦…",
  rest: "安静歇一会儿。",
  seek_attention: "偷偷看看你。",
  self_play: "自己玩一会儿。",
  explore: "去旁边看看。",
};

const THOUGHT_CHANCE: Record<BehaviorId, number> = {
  sleep: 0.1,
  seek_attention: 0.15,
  rest: 0.05,
  observe: 0.05,
  groom: 0.05,
  self_play: 0.05,
  explore: 0.05,
  react_user: 0.05,
};

const AFFINITY: Partial<Record<AutonomousMotionId, readonly AutonomousMotionId[]>> = {
  peek: ["look"],
  edgePeek: ["look"],
  walk: ["look"],
  nod: ["yawn", "sway"],
  jump: ["sway"],
  spin: ["peek", "jump"],
  dizzy: ["spin"],
  sleep: ["yawn", "nod"],
};

function unit(value: number): number {
  return Math.min(0.999_999, Math.max(0, Number.isFinite(value) ? value : 0));
}

function weighted<T extends { weight: number }>(
  values: readonly T[],
  random: () => number,
): T {
  const total = values.reduce((sum, value) => sum + Math.max(0, value.weight), 0);
  let cursor = unit(random()) * total;
  for (const value of values) {
    cursor -= Math.max(0, value.weight);
    if (cursor < 0) return value;
  }
  return values.at(-1) as T;
}

function adjustedCandidate(
  candidate: ExpressionCandidate,
  history: readonly AutonomousMotionId[],
): ExpressionCandidate {
  const motion = autonomousMotionForEvent(candidate.event.type);
  if (!motion) return candidate;
  let weight = candidate.weight;
  if (history.at(-1) === motion) weight *= 0.25;
  if (history.slice(-4).filter((item) => item === motion).length >= 2) weight *= 0.5;
  if (!history.slice(-6).includes(motion)) weight *= 1.1;
  const previous = history.at(-1);
  if (previous && AFFINITY[motion]?.includes(previous)) weight *= 1.2;
  return { ...candidate, weight };
}

function microCueFor(
  directed: DirectedBehaviorPlan,
  input: BehaviorDecisionInput,
  firstVisualBeat: boolean,
  random: () => number,
): MicroCue | null {
  if (
    !firstVisualBeat ||
    !input.context.microMotionEnabled ||
    input.context.reducedMotion
  ) {
    return null;
  }
  const pools: Partial<Record<DirectedBehaviorPlan["intent"]["mood"], readonly MicroCue[]>> = {
    curious: ["ear-left", "ear-right", "soft-lean"],
    playful: ["nose-wiggle", "ear-left", "ear-right"],
    calm: ["soft-lean"],
    sleepy: ["soft-lean"],
  };
  const pool = pools[directed.intent.mood] ?? [];
  return pool[Math.floor(unit(random()) * pool.length)] ?? null;
}

function gazeFor(
  directed: DirectedBehaviorPlan,
  input: BehaviorDecisionInput,
): ExpressionDirective["gaze"] {
  return directed.intent.target === "user" &&
    input.context.gazeFollowEnabled &&
    !input.context.settingsOpen &&
    !input.context.reducedMotion
    ? "user"
    : "neutral";
}

function thoughtFor(
  directed: DirectedBehaviorPlan,
  input: BehaviorDecisionInput,
  random: () => number,
): string | null {
  if (
    input.context.dnd ||
    input.context.settingsOpen ||
    input.context.dialogueOpen ||
    unit(random()) >= THOUGHT_CHANCE[directed.id]
  ) {
    return null;
  }
  return BEHAVIOR_THOUGHTS[directed.id] ?? null;
}

export function resolveExpressionPlan(
  directed: DirectedBehaviorPlan,
  input: BehaviorDecisionInput,
): BehaviorPlan {
  const random = input.random ?? Math.random;
  const history = input.context.recentMotions.map((entry) => entry.id);
  let firstVisualBeat = true;
  const gaze = gazeFor(directed, input);
  const planThought = thoughtFor(directed, input, random);
  const steps: ExpressionDirective[] = [];
  for (const currentBeat of directed.beats) {
    const selected = weighted(
      currentBeat.candidates.map((candidate) => adjustedCandidate(candidate, history)),
      random,
    );
    const motion = autonomousMotionForEvent(selected.event.type);
    if (
      steps.length === 0 &&
      directed.beats.length > 1 &&
      motion !== null &&
      history.at(-1) === motion
    ) {
      continue;
    }
    const microCue = microCueFor(directed, input, firstVisualBeat && motion !== null, random);
    if (motion) {
      history.push(motion);
      firstVisualBeat = false;
    }
    steps.push({
      event: selected.event,
      waitForAnimation: selected.waitForAnimation,
      durationMs: selected.durationMs,
      microCue,
      gaze,
      thought: steps.length === 0 ? planThought : null,
    });
  }
  return {
    id: directed.id,
    intent: directed.intent,
    steps,
    cooldownMs: directed.cooldownMs,
  };
}

import { chooseBehaviorDecision } from "./behaviorEngine";
import { autonomousMotionForEvent } from "./motionHistory";
import type {
  AutonomousMotionId,
  BehaviorDecision,
  BehaviorDecisionInput,
  BehaviorId,
  BehaviorIntent,
  BehaviorPlan,
  DirectedBehaviorPlan,
  ExpressionBeat,
  ExpressionCandidate,
} from "./types";

interface WeightedSequence {
  weight: number;
  beats: readonly ExpressionBeat[];
}

const event = (
  type: ExpressionCandidate["event"]["type"],
  weight = 1,
  options: Pick<ExpressionCandidate, "waitForAnimation" | "durationMs"> = {},
): ExpressionCandidate => ({
  event: { type } as ExpressionCandidate["event"],
  weight,
  waitForAnimation: options.waitForAnimation,
  durationMs: options.durationMs,
});

const beat = (...candidates: ExpressionCandidate[]): ExpressionBeat => ({ candidates });
const sequence = (weight: number, ...beats: ExpressionBeat[]): WeightedSequence => ({
  weight,
  beats,
});

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

function intentFor(decision: BehaviorDecision): BehaviorIntent {
  const mapping: Record<BehaviorId, Pick<BehaviorIntent, "mood" | "target">> = {
    sleep: { mood: "sleepy", target: "self" },
    rest: { mood: "calm", target: "self" },
    observe: { mood: "curious", target: "user" },
    seek_attention: { mood: "curious", target: "user" },
    groom: { mood: "calm", target: "self" },
    self_play: { mood: "playful", target: "self" },
    explore: { mood: "curious", target: "edge" },
    react_user: { mood: "curious", target: "user" },
  };
  return {
    behavior: decision.id,
    ...mapping[decision.id],
    intensity: Math.min(1, Math.max(0, decision.score)),
  };
}

function sequencesFor(
  id: BehaviorId,
  input: BehaviorDecisionInput,
): { cooldownMs: number; variants: readonly WeightedSequence[] } {
  const edgeEligible =
    (input.context.relationshipStage === "familiar" ||
      input.context.relationshipStage === "bonded") &&
    input.context.pointerIdleSeconds >= 75;
  switch (id) {
    case "sleep":
      return {
        cooldownMs: 120_000,
        variants: [
          sequence(0.6, beat(event("IDLE_YAWN")), beat(event("BEGIN_SLEEP", 1, { waitForAnimation: false }))),
          sequence(0.25, beat(event("IDLE_NOD")), beat(event("IDLE_YAWN")), beat(event("BEGIN_SLEEP", 1, { waitForAnimation: false }))),
          sequence(0.15, beat(event("IDLE_LOOK")), beat(event("IDLE_YAWN")), beat(event("IDLE_NOD")), beat(event("BEGIN_SLEEP", 1, { waitForAnimation: false }))),
        ],
      };
    case "rest":
      return {
        cooldownMs: 75_000,
        variants: [
          sequence(0.7, beat(event("IDLE_NOD"))),
          sequence(0.3, beat(event("IDLE_SWAY")), beat(event("IDLE_NOD"))),
        ],
      };
    case "observe":
      return {
        cooldownMs: 45_000,
        variants: [
          sequence(0.55, beat(event("IDLE_LOOK"))),
          sequence(0.45, beat(event("IDLE_LOOK")), beat(event("IDLE_PEEK"))),
        ],
      };
    case "seek_attention":
      return {
        cooldownMs: 90_000,
        variants: [
          sequence(
            1,
            beat(event("IDLE_LOOK")),
            beat(
              event("IDLE_PEEK", edgeEligible ? 0.45 : 1),
              ...(edgeEligible ? [event("EDGE_PEEK", 0.55)] : []),
            ),
          ),
        ],
      };
    case "groom":
      return {
        cooldownMs: 70_000,
        variants: [
          sequence(0.55, beat(event("IDLE_WASH"))),
          sequence(0.45, beat(event("IDLE_LOOK")), beat(event("IDLE_WASH"))),
        ],
      };
    case "self_play":
      return {
        cooldownMs: 80_000,
        variants: [
          sequence(0.45, beat(event("IDLE_SWAY")), beat(event("IDLE_JUMP"))),
          sequence(0.4, beat(event("IDLE_JUMP")), beat(event("IDLE_SPIN"))),
          sequence(0.15, beat(event("IDLE_PEEK")), beat(event("IDLE_SPIN")), beat(event("IDLE_DIZZY"))),
        ],
      };
    case "explore":
      return {
        cooldownMs: 150_000,
        variants: input.context.walkingEnabled
          ? [
              sequence(
                0.7,
                beat(event("IDLE_LOOK")),
                beat(event("WALK_START", 1, { durationMs: 8_000 })),
                beat(event("WALK_STOP", 1, { waitForAnimation: false })),
              ),
              sequence(
                0.3,
                beat(event("IDLE_LOOK")),
                beat(event(edgeEligible ? "EDGE_PEEK" : "IDLE_PEEK")),
              ),
            ]
          : [
              sequence(
                1,
                beat(event("IDLE_LOOK")),
                beat(event("IDLE_PEEK", 0.55), event("IDLE_JUMP", 0.45)),
              ),
            ],
      };
    case "react_user":
      return {
        cooldownMs: 30_000,
        variants:
          input.context.pointerActivity >= 0.75
            ? [sequence(1, beat(event("IDLE_STARTLE")), beat(event("IDLE_LOOK")))]
            : [sequence(1, beat(event("IDLE_LOOK")))],
      };
  }
}

export function directBehavior(
  decision: BehaviorDecision,
  input: BehaviorDecisionInput,
): DirectedBehaviorPlan {
  const random = input.random ?? Math.random;
  const catalog = sequencesFor(decision.id, input);
  const selected = weighted(catalog.variants, random);
  return {
    id: decision.id,
    intent: intentFor(decision),
    beats: selected.beats,
    cooldownMs: catalog.cooldownMs,
  };
}

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

export function resolveDirectedPlan(
  directed: DirectedBehaviorPlan,
  input: BehaviorDecisionInput,
): BehaviorPlan {
  const random = input.random ?? Math.random;
  const history = input.context.recentMotions.map((entry) => entry.id);
  const steps = directed.beats.map((currentBeat) => {
    const selected = weighted(
      currentBeat.candidates.map((candidate) => adjustedCandidate(candidate, history)),
      random,
    );
    const motion = autonomousMotionForEvent(selected.event.type);
    if (motion) history.push(motion);
    return {
      event: selected.event,
      waitForAnimation: selected.waitForAnimation,
      durationMs: selected.durationMs,
    };
  });
  return {
    id: directed.id,
    intent: directed.intent,
    steps,
    cooldownMs: directed.cooldownMs,
  };
}

export function chooseBehaviorPlan(input: BehaviorDecisionInput): BehaviorPlan | null {
  const decision = chooseBehaviorDecision(input);
  if (!decision) return null;
  return resolveDirectedPlan(directBehavior(decision, input), input);
}

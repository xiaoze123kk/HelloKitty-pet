import type {
  BehaviorDecisionInput,
  BehaviorEvent,
  BehaviorId,
  BehaviorPlan,
} from "./types";

const PERSONALITY = {
  sociability: 0.72,
  curiosity: 0.65,
  sleepiness: 0.58,
  playfulness: 0.76,
  patience: 0.62,
} as const;

const IDLE_ACTIONS: readonly BehaviorEvent[] = [
  { type: "IDLE_SPIN" },
  { type: "IDLE_JUMP" },
  { type: "IDLE_SWAY" },
];

const plan = (
  id: BehaviorId,
  event: BehaviorEvent,
  cooldownMs: number,
): BehaviorPlan => ({
  id,
  cooldownMs,
  steps: [{ event, waitForAnimation: true }],
});

function buildPlan(id: BehaviorId, random: () => number): BehaviorPlan {
  switch (id) {
    case "sleep":
      return {
        id,
        cooldownMs: 120_000,
        steps: [
          { event: { type: "IDLE_YAWN" }, waitForAnimation: true },
          { event: { type: "BEGIN_SLEEP" }, waitForAnimation: false },
        ],
      };
    case "rest":
      return plan(id, { type: "IDLE_NOD" }, 75_000);
    case "observe":
      return plan(id, { type: "IDLE_LOOK" }, 45_000);
    case "seek_attention":
      return {
        id,
        cooldownMs: 90_000,
        steps: [
          { event: { type: "IDLE_LOOK" }, waitForAnimation: true },
          { event: { type: "IDLE_PEEK" }, waitForAnimation: true },
        ],
      };
    case "groom":
      return plan(id, { type: "IDLE_WASH" }, 70_000);
    case "self_play":
      return plan(
        id,
        IDLE_ACTIONS[Math.floor(random() * IDLE_ACTIONS.length)] ?? { type: "IDLE_SWAY" },
        80_000,
      );
    case "explore":
      return {
        id,
        cooldownMs: 150_000,
        steps: [
          { event: { type: "IDLE_LOOK" }, waitForAnimation: true },
          { event: { type: "IDLE_JUMP" }, waitForAnimation: true },
        ],
      };
    case "react_user":
      return plan(id, { type: "IDLE_LOOK" }, 30_000);
  }
}

export function scoreBehaviors(input: BehaviorDecisionInput): Record<BehaviorId, number> {
  const { needs, context, relationship } = input;
  const lateNight = context.hour >= 23 || context.hour < 6 ? 1 : 0;
  const userBusy = context.pointerActivity > 0.35 ? 1 : 0;
  const comfort = Math.min(
    1,
    relationship.daysTogether / 30 + relationship.totalInteractions / 160,
  );
  const headpatAffinity = relationship.headpatRatio;
  const interactionLoad = Math.min(1, context.todayInteractions / 16);
  const availability = context.idleActionsEnabled ? 1 : 0;

  return {
    sleep:
      availability *
      (context.sleepTransitionsEnabled ? 1 : 0) *
      (needs.sleepiness * (0.75 + PERSONALITY.sleepiness * 0.2) +
        (1 - needs.energy) * 0.35 +
        lateNight * 0.28),
    rest:
      availability *
      (needs.sleepiness * 0.4 + (1 - needs.energy) * 0.28 + (1 - interactionLoad) * 0.08),
    observe:
      availability *
      (needs.curiosity * PERSONALITY.curiosity * 0.55 +
        headpatAffinity * 0.2 +
        userBusy * 0.08),
    seek_attention:
      availability *
      (needs.socialNeed * PERSONALITY.sociability * 0.8 +
        needs.boredom * 0.28 +
        headpatAffinity * 0.2 +
        comfort * 0.08 +
        Math.min(1, relationship.absenceDays) * 0.18 -
        userBusy * 0.7 -
        interactionLoad * 0.22),
    groom: availability * (needs.boredom * 0.25 + needs.energy * 0.2 + 0.18),
    self_play:
      availability *
      (needs.boredom * PERSONALITY.playfulness * 0.65 +
        needs.curiosity * 0.35 -
        needs.socialNeed * 0.18),
    explore:
      availability *
      (needs.curiosity * 0.5 + needs.boredom * 0.35 - userBusy * 0.3),
    react_user: -1,
  };
}

export function chooseBehavior(input: BehaviorDecisionInput): BehaviorPlan | null {
  const random = input.random ?? Math.random;
  const scores = scoreBehaviors(input);
  let winner: BehaviorId | null = null;
  let winnerScore = 0.28;
  for (const [id, rawScore] of Object.entries(scores) as [BehaviorId, number][]) {
    if ((input.cooldowns[id] ?? 0) > input.context.now) continue;
    const score = rawScore + (random() - 0.5) * 0.06;
    if (score > winnerScore) {
      winner = id;
      winnerScore = score;
    }
  }
  return winner ? buildPlan(winner, random) : null;
}

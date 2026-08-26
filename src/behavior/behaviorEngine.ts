import type {
  BehaviorDecisionInput,
  BehaviorDecision,
  BehaviorId,
  BehaviorScoreBreakdown,
} from "./types";
import { BASE_PERSONALITY, deriveEffectivePersonality } from "./personality";

interface ScoreComponents {
  base: number;
  context: number;
  relationship: number;
  personality: number;
}

function scoreComponents(
  input: BehaviorDecisionInput,
): Record<BehaviorId, ScoreComponents> {
  const { needs, context, relationship } = input;
  const lateNight = context.hour >= 23 || context.hour < 6 ? 1 : 0;
  const userBusy = context.pointerActivity > 0.35 ? 1 : 0;
  const comfort = Math.min(
    1,
    relationship.daysTogether / 30 + relationship.totalInteractions / 160,
  );
  const headpatAffinity = relationship.headpatRatio;
  const interactionLoad = Math.min(1, context.todayInteractions / 16);
  const personality = deriveEffectivePersonality(input);
  return {
    sleep: {
      base: needs.sleepiness * 0.75 + (1 - needs.energy) * 0.35,
      context: lateNight * 0.28,
      relationship: 0,
      personality: needs.sleepiness * personality.sleepiness * 0.2,
    },
    rest: {
      base: needs.sleepiness * 0.4 + (1 - needs.energy) * 0.28,
      context: (1 - interactionLoad) * 0.08,
      relationship: 0,
      personality: (personality.patience - BASE_PERSONALITY.patience) * 0.3,
    },
    observe: {
      base: needs.curiosity * 0.1,
      context: userBusy * 0.08,
      relationship: headpatAffinity * 0.2,
      personality: needs.curiosity * personality.curiosity * 0.35,
    },
    seek_attention: {
      base: needs.boredom * 0.28,
      context: -userBusy * 0.7 - interactionLoad * 0.22,
      relationship:
        headpatAffinity * 0.2 +
        comfort * 0.08 +
        Math.min(1, relationship.absenceDays) * 0.18,
      personality: needs.socialNeed * personality.sociability * 0.8,
    },
    groom: {
      base: needs.boredom * 0.25 + needs.energy * 0.2 + 0.18,
      context: 0,
      relationship: 0,
      personality: (personality.patience - BASE_PERSONALITY.patience) * 0.25,
    },
    self_play: {
      base: needs.curiosity * 0.35 - needs.socialNeed * 0.18,
      context: 0,
      relationship: 0,
      personality: needs.boredom * personality.playfulness * 0.65,
    },
    explore: {
      base: needs.curiosity * 0.5 + needs.boredom * 0.35,
      context: -userBusy * 0.3,
      relationship: 0,
      personality: 0,
    },
    react_user: {
      base: needs.curiosity * 0.18,
      context: context.pointerActivity * 0.72 - interactionLoad * 0.12,
      relationship: 0,
      personality: 0,
    },
  };
}

function repetitionMultiplier(id: BehaviorId, recent: readonly BehaviorId[]): number {
  if (recent.at(-1) === id) return 0.3;
  const count = recent.slice(-4).filter((candidate) => candidate === id).length;
  if (count >= 2) return 0.55;
  if (count === 1) return 0.78;
  return 1;
}

export function scoreBehaviors(
  input: BehaviorDecisionInput,
): Record<BehaviorId, BehaviorScoreBreakdown> {
  const random = input.random ?? Math.random;
  const components = scoreComponents(input);
  const recent = input.context.recentBehaviors.map((entry) => entry.id);
  const recentSix = recent.slice(-6);
  const enabled = input.context.idleActionsEnabled;
  const result = {} as Record<BehaviorId, BehaviorScoreBreakdown>;

  for (const [id, component] of Object.entries(components) as [
    BehaviorId,
    ScoreComponents,
  ][]) {
    const eligible = enabled && (id !== "sleep" || input.context.sleepTransitionsEnabled);
    const raw = eligible
      ? component.base + component.context + component.relationship + component.personality
      : 0;
    const multiplier = repetitionMultiplier(id, recent);
    const repetition = raw * (multiplier - 1);
    const novelty = eligible && !recentSix.includes(id) ? 0.08 : 0;
    const noise = eligible ? (random() - 0.5) * 0.06 : 0;
    result[id] = {
      ...component,
      novelty,
      repetition,
      noise,
      final: Math.max(0, raw + repetition + novelty + noise),
    };
  }
  return result;
}

export function chooseBehaviorDecision(
  input: BehaviorDecisionInput,
): BehaviorDecision | null {
  const scores = scoreBehaviors(input);
  let winner: BehaviorDecision | null = null;
  for (const [id, breakdown] of Object.entries(scores) as [
    BehaviorId,
    BehaviorScoreBreakdown,
  ][]) {
    if ((input.cooldowns[id] ?? 0) > input.context.now) continue;
    if (breakdown.final <= 0.28 || (winner && breakdown.final <= winner.score)) continue;
    winner = { id, score: breakdown.final, breakdown };
  }
  return winner;
}

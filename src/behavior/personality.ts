import type { BehaviorDecisionInput, PersonalityProfile } from "./types";

export const BASE_PERSONALITY: PersonalityProfile = {
  sociability: 0.72,
  curiosity: 0.65,
  sleepiness: 0.58,
  playfulness: 0.76,
  patience: 0.62,
};

const MAX_OFFSET = 0.15;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function deriveEffectivePersonality(
  input: Pick<BehaviorDecisionInput, "needs" | "context">,
): PersonalityProfile {
  const offsets: PersonalityProfile = {
    sociability: 0,
    curiosity: 0,
    sleepiness: 0,
    playfulness: 0,
    patience: 0,
  };

  switch (input.context.relationshipStage) {
    case "new":
      offsets.sociability -= 0.06;
      offsets.patience += 0.04;
      break;
    case "warming":
      offsets.sociability += 0.03;
      offsets.patience += 0.02;
      break;
    case "familiar":
      offsets.sociability += 0.08;
      offsets.patience += 0.03;
      break;
    case "bonded":
      offsets.sociability += 0.12;
      offsets.patience += 0.05;
      break;
  }

  const pattern = input.context.recentInteractionPattern;
  offsets.sociability += pattern.headpatRatio * 0.1;
  offsets.patience += pattern.headpatRatio * 0.04;
  offsets.playfulness += pattern.teaseRatio * 0.12;
  offsets.curiosity += pattern.teaseRatio * 0.05;

  if (pattern.total < 3) {
    offsets.patience += 0.1;
    offsets.sociability -= 0.08;
    offsets.playfulness -= 0.08;
  }
  if (input.context.interactionStreak >= 3) {
    offsets.patience += 0.08;
    offsets.playfulness -= 0.08;
  }
  if (input.needs.sleepiness >= 0.65) {
    const sleepyFactor = clamp((input.needs.sleepiness - 0.65) / 0.35);
    offsets.playfulness -= sleepyFactor * 0.15;
    offsets.curiosity -= sleepyFactor * 0.08;
    offsets.sleepiness += sleepyFactor * 0.08;
  }

  const result = {} as PersonalityProfile;
  for (const key of Object.keys(BASE_PERSONALITY) as (keyof PersonalityProfile)[]) {
    result[key] = clamp(
      BASE_PERSONALITY[key] + clamp(offsets[key], -MAX_OFFSET, MAX_OFFSET),
    );
  }
  return result;
}

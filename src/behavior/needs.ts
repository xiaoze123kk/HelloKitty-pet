import type { ContextSnapshot, PetNeeds } from "./types";

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function initialNeeds(): PetNeeds {
  return {
    energy: 0.78,
    sleepiness: 0.18,
    socialNeed: 0.22,
    boredom: 0.2,
    curiosity: 0.55,
  };
}

/** Advance the invisible, session-scoped needs model using elapsed wall time. */
export function advanceNeeds(
  previous: PetNeeds,
  elapsedMs: number,
  context: Pick<ContextSnapshot, "hour" | "pointerIdleSeconds" | "pointerActivity" | "currentState">,
): PetNeeds {
  const minutes = Math.max(0, Math.min(elapsedMs / 60_000, 5));
  if (minutes === 0) return previous;
  const sleeping = context.currentState === "sleeping" || context.currentState === "falling";
  const lateNight = context.hour >= 23 || context.hour < 6;
  const unattended = context.pointerIdleSeconds >= 45;

  if (sleeping) {
    return {
      energy: clamp(previous.energy + minutes * 0.08),
      sleepiness: clamp(previous.sleepiness - minutes * 0.1),
      socialNeed: clamp(previous.socialNeed + minutes * 0.002),
      boredom: clamp(previous.boredom + minutes * 0.003),
      curiosity: clamp(previous.curiosity * 0.995),
    };
  }

  return {
    energy: clamp(previous.energy - minutes * (lateNight ? 0.012 : 0.006)),
    sleepiness: clamp(
      previous.sleepiness + minutes * (lateNight ? 0.035 : 0.008),
    ),
    socialNeed: clamp(
      previous.socialNeed + minutes * (unattended ? 0.018 : 0.006),
    ),
    boredom: clamp(
      previous.boredom +
        minutes * (unattended ? 0.022 : 0.009) -
        context.pointerActivity * minutes * 0.006,
    ),
    curiosity: clamp(
      previous.curiosity + minutes * (context.pointerActivity > 0.15 ? 0.008 : -0.002),
    ),
  };
}

export function applyInteraction(previous: PetNeeds): PetNeeds {
  return {
    ...previous,
    socialNeed: clamp(previous.socialNeed - 0.22),
    boredom: clamp(previous.boredom - 0.16),
    curiosity: clamp(previous.curiosity + 0.04),
  };
}

export function applyRest(previous: PetNeeds): PetNeeds {
  return {
    ...previous,
    energy: clamp(previous.energy + 0.025),
    sleepiness: clamp(previous.sleepiness - 0.02),
  };
}


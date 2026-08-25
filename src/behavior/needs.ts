import type {
  BehaviorId,
  BehaviorStateData,
  ContextSnapshot,
  PetNeeds,
} from "./types";

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

const MAX_HISTORY = 120;

function finiteNeed(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value)
    : fallback;
}

function localDateKey(now: number): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function emptyBehaviorState(now: number): BehaviorStateData {
  return {
    version: 1,
    needs: initialNeeds(),
    updatedAt: now,
    recentActions: [],
  };
}

/**
 * 离线期间只做温和演化：休息会恢复精力，久别会增加一点社交期待，
 * 但所有值都有舒适上限，不制造“没打开应用就亏欠它”的压力。
 */
export function advanceOfflineNeeds(
  previous: PetNeeds,
  elapsedMs: number,
  now: number,
): PetNeeds {
  const hours = Math.max(0, Math.min(elapsedMs / 3_600_000, 48));
  if (hours === 0) return previous;
  const hour = new Date(now).getHours();
  const nightTarget = hour >= 23 || hour < 6 ? 0.58 : 0.18;
  const settle = (value: number, target: number, speed: number): number =>
    clamp(value + (target - value) * Math.min(1, hours * speed));
  return {
    energy: Math.min(0.9, settle(previous.energy, 0.82, 0.12)),
    sleepiness: settle(previous.sleepiness, nightTarget, 0.09),
    socialNeed: Math.min(0.85, previous.socialNeed + hours * 0.018),
    boredom: Math.min(0.72, previous.boredom + hours * 0.012),
    curiosity: settle(previous.curiosity, 0.58, 0.05),
  };
}

export function normalizeBehaviorState(
  raw: unknown,
  now: number,
): BehaviorStateData {
  const fallback = emptyBehaviorState(now);
  const value = (raw ?? {}) as Partial<BehaviorStateData>;
  const rawNeeds = (value.needs ?? {}) as Partial<PetNeeds>;
  const updatedAt =
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
      ? Math.min(value.updatedAt, now)
      : now;
  const needs: PetNeeds = {
    energy: finiteNeed(rawNeeds.energy, fallback.needs.energy),
    sleepiness: finiteNeed(rawNeeds.sleepiness, fallback.needs.sleepiness),
    socialNeed: finiteNeed(rawNeeds.socialNeed, fallback.needs.socialNeed),
    boredom: finiteNeed(rawNeeds.boredom, fallback.needs.boredom),
    curiosity: finiteNeed(rawNeeds.curiosity, fallback.needs.curiosity),
  };
  const validIds: BehaviorId[] = [
    "sleep",
    "rest",
    "observe",
    "seek_attention",
    "groom",
    "self_play",
    "explore",
    "react_user",
  ];
  const recentActions = Array.isArray(value.recentActions)
    ? value.recentActions
        .filter((entry): entry is BehaviorStateData["recentActions"][number] => {
          const candidate = entry as Partial<BehaviorStateData["recentActions"][number]>;
          return (
            typeof candidate?.id === "string" &&
            validIds.includes(candidate.id as BehaviorId) &&
            typeof candidate.at === "number" &&
            Number.isFinite(candidate.at) &&
            typeof candidate.date === "string"
          );
        })
        .slice(-MAX_HISTORY)
    : [];
  return {
    version: 1,
    needs: advanceOfflineNeeds(needs, now - updatedAt, now),
    updatedAt: now,
    recentActions,
  };
}

export function recordBehaviorAction(
  state: BehaviorStateData,
  id: BehaviorId,
  now = Date.now(),
): void {
  state.updatedAt = now;
  state.recentActions = [
    ...state.recentActions,
    { id, at: now, date: localDateKey(now) },
  ].slice(-MAX_HISTORY);
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

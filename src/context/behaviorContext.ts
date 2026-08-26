import type { PetTouchTargetId } from "../pet/touchZones";
import type { RelationshipEventType } from "../relationship/relationshipEngine";
import type { SessionPhase, TimeBand } from "../behavior/types";

export interface InteractionContextState {
  lastInteraction: RelationshipEventType | null;
  lastTouchTarget: PetTouchTargetId | null;
  lastInteractionAt: number | null;
  interactionStreak: number;
}

const INTERACTION_STREAK_WINDOW_MS = 30_000;

export function emptyInteractionContext(): InteractionContextState {
  return {
    lastInteraction: null,
    lastTouchTarget: null,
    lastInteractionAt: null,
    interactionStreak: 0,
  };
}

export function recordInteractionContext(
  previous: InteractionContextState,
  interaction: RelationshipEventType,
  touchTarget: PetTouchTargetId | null,
  now: number,
): InteractionContextState {
  const continues =
    previous.lastInteractionAt !== null &&
    now >= previous.lastInteractionAt &&
    now - previous.lastInteractionAt <= INTERACTION_STREAK_WINDOW_MS;
  return {
    lastInteraction: interaction,
    lastTouchTarget: touchTarget,
    lastInteractionAt: now,
    interactionStreak: continues ? previous.interactionStreak + 1 : 1,
  };
}

export function secondsSinceInteraction(
  state: InteractionContextState,
  now: number,
): number {
  return state.lastInteractionAt === null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, (now - state.lastInteractionAt) / 1_000);
}

export function timeBandFor(hour: number): TimeBand {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  if (hour >= 18 && hour < 23) return "evening";
  return "lateNight";
}

export function sessionPhaseFor(
  sessionMinutes: number,
  absenceDays: number,
): SessionPhase {
  if (absenceDays >= 1 && sessionMinutes < 10) return "returning";
  if (sessionMinutes < 5) return "justOpened";
  if (sessionMinutes < 60) return "settled";
  return "longSession";
}

import type { PetEvent } from "../pet/petMachine";
import type { RelationshipContext } from "../relationship/relationshipEngine";

export type BehaviorId =
  | "sleep"
  | "rest"
  | "observe"
  | "seek_attention"
  | "groom"
  | "self_play"
  | "explore"
  | "react_user";

export interface PetNeeds {
  /** 0 = exhausted, 1 = rested. */
  energy: number;
  sleepiness: number;
  socialNeed: number;
  boredom: number;
  curiosity: number;
}

export interface BehaviorHistoryEntry {
  id: BehaviorId;
  at: number;
  date: string;
}

/**
 * 可持久化的生命状态。内部需求不会作为惩罚型数值展示给用户，
 * 只用于让 Kitty 在跨会话后仍保持连续的作息和性格。
 */
export interface BehaviorStateData {
  version: 1;
  needs: PetNeeds;
  updatedAt: number;
  recentActions: BehaviorHistoryEntry[];
}

export interface ContextSnapshot {
  now: number;
  hour: number;
  sessionMinutes: number;
  pointerIdleSeconds: number;
  pointerActivity: number;
  todayInteractions: number;
  currentState: string;
  idleSubState: string | null;
  dnd: boolean;
  settingsOpen: boolean;
  dialogueOpen: boolean;
  idleActionsEnabled: boolean;
  sleepTransitionsEnabled: boolean;
  walkingEnabled: boolean;
}

export type BehaviorEventType =
  | "IDLE_STRETCH"
  | "IDLE_YAWN"
  | "IDLE_WASH"
  | "IDLE_LOOK"
  | "IDLE_SNEEZE"
  | "IDLE_SHAKE"
  | "IDLE_SPIN"
  | "IDLE_JUMP"
  | "IDLE_NOD"
  | "IDLE_SWAY"
  | "IDLE_BOW"
  | "IDLE_STARTLE"
  | "IDLE_DIZZY"
  | "IDLE_PEEK"
  | "EDGE_PEEK"
  | "BEGIN_SLEEP"
  | "WALK_START"
  | "WALK_STOP";

export type BehaviorEvent = Extract<PetEvent, { type: BehaviorEventType }>;

export interface BehaviorStep {
  event: BehaviorEvent;
  /** Wait for the existing animation completion callback before advancing. */
  waitForAnimation?: boolean;
  /** For non-animation events such as a short walk, advance after this duration. */
  durationMs?: number;
}

export interface BehaviorPlan {
  id: BehaviorId;
  steps: BehaviorStep[];
  cooldownMs: number;
}

export interface BehaviorDecisionInput {
  needs: PetNeeds;
  context: ContextSnapshot;
  relationship: RelationshipContext;
  cooldowns: Readonly<Partial<Record<BehaviorId, number>>>;
  random?: () => number;
}

export interface BehaviorSchedulerInput extends Omit<BehaviorDecisionInput, "cooldowns"> {
  stateKey: string;
  idleSubState: string | null;
}

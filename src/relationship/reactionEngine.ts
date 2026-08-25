import type { RelationshipContext } from "./relationshipEngine";

export type RelationshipStage = "new" | "warming" | "familiar" | "bonded";
export type HeadpatReaction = "shy" | "soft" | "nuzzle" | "reunion";
export type CompanionRitualKind = "reunion" | "streak" | "late_night";

export interface CompanionRitual {
  kind: CompanionRitualKind;
  key: string;
  value: number;
}

export interface RitualStateData {
  version: 1;
  shownKeys: string[];
}

const MAX_RITUAL_KEYS = 120;

export function relationshipStage(
  relationship: RelationshipContext,
): RelationshipStage {
  if (
    relationship.daysTogether >= 30 ||
    relationship.totalInteractions >= 100
  ) {
    return "bonded";
  }
  if (
    relationship.daysTogether >= 14 ||
    relationship.totalInteractions >= 40 ||
    relationship.headpatCount >= 20
  ) {
    return "familiar";
  }
  if (
    relationship.daysTogether >= 3 ||
    relationship.totalInteractions >= 8
  ) {
    return "warming";
  }
  return "new";
}

/**
 * 同一次摸头会根据关系阶段产生不同反应。久别优先级最高，且由调用方
 * 传入启动前计算出的 absenceDays，避免 session_start 把 lastSeenAt 更新后丢失。
 */
export function chooseHeadpatReaction(
  relationship: RelationshipContext,
): HeadpatReaction {
  if (relationship.absenceDays >= 2) return "reunion";
  switch (relationshipStage(relationship)) {
    case "new":
      return "shy";
    case "familiar":
    case "bonded":
      return "nuzzle";
    default:
      return "soft";
  }
}

export function emptyRitualState(): RitualStateData {
  return { version: 1, shownKeys: [] };
}

export function normalizeRitualState(value: unknown): RitualStateData {
  const raw = (value ?? {}) as Partial<RitualStateData>;
  const shownKeys = Array.isArray(raw.shownKeys)
    ? raw.shownKeys.filter(
        (key): key is string => typeof key === "string" && key.length <= 80,
      )
    : [];
  return {
    version: 1,
    shownKeys: [...new Set(shownKeys)].slice(-MAX_RITUAL_KEYS),
  };
}

export function markRitualShown(
  state: RitualStateData,
  ritual: CompanionRitual,
): void {
  if (state.shownKeys.includes(ritual.key)) return;
  state.shownKeys = [...state.shownKeys, ritual.key].slice(-MAX_RITUAL_KEYS);
}

export interface StartupRitualInput {
  now: number;
  absenceDays: number;
  consecutiveDays: number;
  daysTogether: number;
  shownKeys: readonly string[];
}

/**
 * 每次启动最多编排一个稀有仪式，避免久别、连续见面和深夜问候同时抢占桌面。
 * 优先级：久别重逢 > 连续见面里程碑 > 深夜陪伴。
 */
export function chooseStartupRitual(
  input: StartupRitualInput,
): CompanionRitual | null {
  const date = new Date(input.now);
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const candidates: CompanionRitual[] = [];

  if (input.absenceDays >= 2) {
    candidates.push({
      kind: "reunion",
      key: `reunion:${dateKey}`,
      value: input.absenceDays,
    });
  }

  const streakMilestone = [30, 14, 7, 3].find(
    (milestone) => input.consecutiveDays === milestone,
  );
  if (streakMilestone) {
    candidates.push({
      kind: "streak",
      key: `streak:${streakMilestone}:${dateKey}`,
      value: streakMilestone,
    });
  }

  const hour = date.getHours();
  if (input.daysTogether >= 2 && (hour >= 23 || hour < 2)) {
    candidates.push({
      kind: "late_night",
      key: `late-night:${dateKey}`,
      value: hour,
    });
  }

  return (
    candidates.find((candidate) => !input.shownKeys.includes(candidate.key)) ??
    null
  );
}

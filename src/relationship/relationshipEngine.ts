import type { ProgressData } from "../storage/progress";

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type RelationshipEventType =
  | "session_start"
  | "headpat"
  | "body_touch"
  | "bow_touch"
  | "petting"
  | "drag"
  | "tease";

export interface RelationshipEvent {
  id: string;
  type: RelationshipEventType;
  at: number;
  date: string;
}

export interface RelationshipData {
  version: 1;
  firstSeenAt: number;
  lastSeenAt: number;
  sessionCount: number;
  activeDays: string[];
  totalInteractions: number;
  byPart: { head: number; body: number; bow: number };
  consecutiveDays: number;
  unlockedMemories: string[];
  recentEvents: RelationshipEvent[];
}

export interface RelationshipSnapshot {
  daysTogether: number;
  consecutiveDays: number;
  todayInteractions: number;
  secretCount: number;
  events: RelationshipEvent[];
  diaryDate: string;
  diary: string[];
}

export interface RelationshipContext {
  headpatCount: number;
  headpatRatio: number;
  totalInteractions: number;
  todayInteractions: number;
  absenceDays: number;
  streak: number;
  daysTogether: number;
}

const MAX_EVENTS = 100;
const MAX_MEMORIES = 32;

export function emptyRelationship(now: number): RelationshipData {
  return {
    version: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    sessionCount: 0,
    activeDays: [],
    totalInteractions: 0,
    byPart: { head: 0, body: 0, bow: 0 },
    consecutiveDays: 0,
    unlockedMemories: [],
    recentEvents: [],
  };
}

function validEvent(value: unknown): value is RelationshipEvent {
  const event = value as Partial<RelationshipEvent>;
  return (
    typeof event?.id === "string" &&
    typeof event.type === "string" &&
    typeof event.at === "number" &&
    typeof event.date === "string"
  );
}

export function normalizeRelationship(raw: unknown, now: number): RelationshipData {
  const fallback = emptyRelationship(now);
  const value = (raw ?? {}) as Partial<RelationshipData>;
  const byPart = (value.byPart ?? {}) as Partial<RelationshipData["byPart"]>;
  const events = Array.isArray(value.recentEvents)
    ? value.recentEvents.filter(validEvent).slice(-MAX_EVENTS)
    : [];
  const days = Array.isArray(value.activeDays)
    ? value.activeDays.filter((day): day is string => typeof day === "string")
    : [];
  const firstSeenAt = typeof value.firstSeenAt === "number" ? value.firstSeenAt : fallback.firstSeenAt;
  return {
    version: 1,
    firstSeenAt,
    lastSeenAt: typeof value.lastSeenAt === "number" ? value.lastSeenAt : firstSeenAt,
    sessionCount: typeof value.sessionCount === "number" ? Math.max(0, value.sessionCount) : 0,
    activeDays: [...new Set(days)].sort(),
    totalInteractions: typeof value.totalInteractions === "number" ? Math.max(0, value.totalInteractions) : 0,
    byPart: {
      head: typeof byPart.head === "number" ? Math.max(0, byPart.head) : 0,
      body: typeof byPart.body === "number" ? Math.max(0, byPart.body) : 0,
      bow: typeof byPart.bow === "number" ? Math.max(0, byPart.bow) : 0,
    },
    consecutiveDays: typeof value.consecutiveDays === "number" ? Math.max(0, value.consecutiveDays) : computeConsecutiveDays(days),
    unlockedMemories: Array.isArray(value.unlockedMemories)
      ? value.unlockedMemories.filter((id): id is string => typeof id === "string").slice(-MAX_MEMORIES)
      : [],
    recentEvents: events,
  };
}

export function computeConsecutiveDays(activeDays: string[], today = dateKey(new Date())): number {
  const set = new Set(activeDays);
  let cursor = new Date(`${today}T00:00:00`);
  if (!set.has(today)) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (set.has(dateKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function daysTogether(firstSeenAt: number, now = Date.now()): number {
  const first = new Date(firstSeenAt);
  const current = new Date(now);
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
  const end = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000)) + 1;
}

function eventFor(type: RelationshipEventType, now: number): RelationshipEvent {
  return { id: `${type}-${now}-${Math.random().toString(36).slice(2, 8)}`, type, at: now, date: dateKey(new Date(now)) };
}

export function recordEvent(
  relationship: RelationshipData,
  type: RelationshipEventType,
  now = Date.now(),
): RelationshipEvent {
  const event = eventFor(type, now);
  relationship.lastSeenAt = now;
  relationship.recentEvents = [...relationship.recentEvents, event].slice(-MAX_EVENTS);
  if (type === "session_start") {
    relationship.sessionCount += 1;
    if (!relationship.activeDays.includes(event.date)) relationship.activeDays.push(event.date);
    relationship.activeDays.sort();
    relationship.consecutiveDays = computeConsecutiveDays(relationship.activeDays, event.date);
  } else {
    relationship.totalInteractions += 1;
  }
  if (type === "headpat") relationship.byPart.head += 1;
  if (type === "body_touch") relationship.byPart.body += 1;
  if (type === "bow_touch") relationship.byPart.bow += 1;
  return event;
}

export function recordInteraction(relationship: RelationshipData, type: RelationshipEventType, now = Date.now()): RelationshipEvent {
  return recordEvent(relationship, type, now);
}

export function unlockMemory(relationship: RelationshipData, id: string): boolean {
  if (relationship.unlockedMemories.includes(id)) return false;
  relationship.unlockedMemories = [...relationship.unlockedMemories, id].slice(-MAX_MEMORIES);
  return true;
}

export function unlockEligibleMemories(
  relationship: RelationshipData,
  now = Date.now(),
): string[] {
  const candidates: string[] = [];
  if (relationship.totalInteractions >= 1) candidates.push("first_interaction");
  if (relationship.byPart.head >= 10) candidates.push("headpat_10");
  if (relationship.consecutiveDays >= 3) candidates.push("streak_3");
  if (relationship.consecutiveDays >= 7) candidates.push("streak_7");
  const hour = new Date(now).getHours();
  if (relationship.sessionCount > 0 && (hour >= 23 || hour < 2)) {
    candidates.push("late_night_companion");
  }
  return candidates.filter((id) => unlockMemory(relationship, id));
}

export function snapshotRelationship(progress: ProgressData, now = Date.now()): RelationshipSnapshot {
  const today = dateKey(new Date(now));
  const todayEvents = progress.relationship.recentEvents.filter((event) => event.date === today);
  const headpats = todayEvents.filter((event) => event.type === "headpat").length;
  const teases = todayEvents.filter((event) => event.type === "tease").length;
  const sessions = todayEvents.filter((event) => event.type === "session_start").length;
  const diary: string[] = ["今天见到了你。"];
  if (headpats >= 5) diary.push(`你今天摸了我 ${headpats} 次头。`);
  else if (headpats > 0) diary.push(`你今天摸了我 ${headpats} 次头。`);
  if (teases > 0) diary.push(`你还拿鼠标逗了我${teases === 1 ? "一次" : `${teases} 次`}。`);
  if (sessions > 0 && new Date(now).getHours() >= 23) diary.push("今晚我们待得有点晚。");
  if (todayEvents.length === 0) diary.splice(0, diary.length, "今天还没有留下新的回忆。");
  return {
    daysTogether: daysTogether(progress.relationship.firstSeenAt, now),
    consecutiveDays: progress.relationship.consecutiveDays,
    todayInteractions: progress.relationship.recentEvents.filter((event) => event.date === today && event.type !== "session_start").length,
    secretCount: progress.relationship.unlockedMemories.length,
    events: progress.relationship.recentEvents.slice(-20).reverse(),
    diaryDate: today,
    diary,
  };
}

export function relationshipContext(progress: ProgressData, now = Date.now()): RelationshipContext {
  const current = new Date(now);
  const last = new Date(progress.relationship.lastSeenAt);
  const start = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
  const end = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  return {
    headpatCount: progress.relationship.byPart.head,
    headpatRatio:
      progress.relationship.totalInteractions > 0
        ? progress.relationship.byPart.head / progress.relationship.totalInteractions
        : 0,
    totalInteractions: progress.relationship.totalInteractions,
    todayInteractions: progress.relationship.recentEvents.filter(
      (event) => event.date === dateKey(current) && event.type !== "session_start",
    ).length,
    absenceDays: Math.max(0, Math.floor((end - start) / 86_400_000)),
    streak: progress.relationship.consecutiveDays,
    daysTogether: daysTogether(progress.relationship.firstSeenAt, now),
  };
}

import type { BehaviorId, PetNeeds } from "../behavior/types";
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

type InteractionEventType = Exclude<RelationshipEventType, "session_start">;

export interface RelationshipEvent {
  id: string;
  type: RelationshipEventType;
  at: number;
  date: string;
}

export interface RelationshipData {
  version: 2;
  firstSeenAt: number;
  lastSeenAt: number;
  sessionCount: number;
  activeDays: string[];
  totalInteractions: number;
  byPart: { head: number; body: number; bow: number };
  byType: Record<InteractionEventType, number>;
  consecutiveDays: number;
  unlockedMemories: string[];
  memoryUnlockedAt: Record<string, number>;
  recentEvents: RelationshipEvent[];
}

export interface KeepsakeSnapshot {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlockedAt: number;
}

export interface MemoryCardSnapshot {
  id: string;
  title: string;
  description: string;
  hint: string;
  unlocked: boolean;
  unlockedAt: number | null;
  keepsake: Omit<KeepsakeSnapshot, "unlockedAt">;
}

export interface WeeklySummary {
  startDate: string;
  endDate: string;
  headline: string;
  lines: string[];
}

export interface PetMoodSnapshot {
  label: string;
  detail: string;
  tone: "rose" | "gold" | "blue" | "mint";
}

export interface RelationshipSnapshot {
  daysTogether: number;
  consecutiveDays: number;
  todayInteractions: number;
  secretCount: number;
  favoriteInteraction: string;
  mood: PetMoodSnapshot;
  events: RelationshipEvent[];
  diaryDate: string;
  diary: string[];
  weekly: WeeklySummary;
  memories: MemoryCardSnapshot[];
  keepsakes: KeepsakeSnapshot[];
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

interface MemoryDefinition {
  id: string;
  title: string;
  description: string;
  hint: string;
  keepsake: Omit<KeepsakeSnapshot, "unlockedAt">;
}

export const MEMORY_CATALOG: readonly MemoryDefinition[] = [
  {
    id: "first_interaction",
    title: "第一次回应",
    description: "第一次伸手的时候，Kitty 认真记住了你。",
    hint: "和 Kitty 互动一次",
    keepsake: { id: "paw_note", name: "爪印便笺", icon: "🐾", description: "写着“第一次见面”的小便笺。" },
  },
  {
    id: "headpat_10",
    title: "最熟悉的位置",
    description: "摸头已经成了你们之间最自然的招呼。",
    hint: "摸头 10 次",
    keepsake: { id: "soft_cushion", name: "软软靠垫", icon: "☁️", description: "Kitty 一靠上去就会眯起眼睛。" },
  },
  {
    id: "streak_3",
    title: "连续的三天",
    description: "短短三天，也足够让一个习惯悄悄发芽。",
    hint: "连续陪伴 3 天",
    keepsake: { id: "tiny_calendar", name: "三日台历", icon: "🗓️", description: "三个日期旁都画着小小的猫爪。" },
  },
  {
    id: "streak_7",
    title: "完整的一周",
    description: "一整周的见面，被 Kitty 收进了小窝。",
    hint: "连续陪伴 7 天",
    keepsake: { id: "week_photo", name: "一周合影", icon: "🖼️", description: "相框里保存着这一周的陪伴。" },
  },
  {
    id: "late_night_companion",
    title: "深夜还亮着的灯",
    description: "很晚的时候，你们也曾安静地待在一起。",
    hint: "在深夜陪 Kitty 一次",
    keepsake: { id: "moon_lamp", name: "月亮小灯", icon: "🌙", description: "夜深时会发出柔和的光。" },
  },
  {
    id: "tease_10",
    title: "抓不到的光点",
    description: "十次追逐之后，Kitty 仍然觉得下一次一定能抓到。",
    hint: "完成 10 次逗猫互动",
    keepsake: { id: "ribbon_toy", name: "缎带玩具", icon: "🎀", description: "一晃就会吸引 Kitty 的目光。" },
  },
  {
    id: "petting_10",
    title: "呼噜时刻",
    description: "安静撸猫的时间，已经成为小窝里最柔软的回忆。",
    hint: "长按撸猫 10 次",
    keepsake: { id: "warm_blanket", name: "暖绒毯", icon: "🧶", description: "留着一点让人安心的温度。" },
  },
  {
    id: "interactions_50",
    title: "第五十次招呼",
    description: "从偶然伸手，到已经记不清第几次自然回应。",
    hint: "累计互动 50 次",
    keepsake: { id: "memory_jar", name: "回忆玻璃罐", icon: "🫙", description: "里面装着五十颗亮晶晶的小星星。" },
  },
  {
    id: "interactions_100",
    title: "一百次回应",
    description: "一百次小小的回应，拼成了稳定而熟悉的陪伴。",
    hint: "累计互动 100 次",
    keepsake: { id: "golden_bell", name: "金色铃铛", icon: "🔔", description: "只在特别熟悉的人靠近时轻响。" },
  },
  {
    id: "days_30",
    title: "第一个月",
    description: "从第一天到第三十天，Kitty 已经把这里当成了家。",
    hint: "相识 30 天",
    keepsake: { id: "little_house", name: "小窝门牌", icon: "🏠", description: "门牌上认真写着“我们的小窝”。" },
  },
] as const;

const MAX_EVENTS = 100;
const MAX_MEMORIES = 32;
const INTERACTION_TYPES: readonly InteractionEventType[] = [
  "headpat",
  "body_touch",
  "bow_touch",
  "petting",
  "drag",
  "tease",
];

function emptyByType(): Record<InteractionEventType, number> {
  return {
    headpat: 0,
    body_touch: 0,
    bow_touch: 0,
    petting: 0,
    drag: 0,
    tease: 0,
  };
}

export function emptyRelationship(now: number): RelationshipData {
  return {
    version: 2,
    firstSeenAt: now,
    lastSeenAt: now,
    sessionCount: 0,
    activeDays: [],
    totalInteractions: 0,
    byPart: { head: 0, body: 0, bow: 0 },
    byType: emptyByType(),
    consecutiveDays: 0,
    unlockedMemories: [],
    memoryUnlockedAt: {},
    recentEvents: [],
  };
}

function validEvent(value: unknown): value is RelationshipEvent {
  const event = value as Partial<RelationshipEvent>;
  return (
    typeof event?.id === "string" &&
    [...INTERACTION_TYPES, "session_start"].includes(event.type as RelationshipEventType) &&
    typeof event.at === "number" &&
    Number.isFinite(event.at) &&
    typeof event.date === "string"
  );
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
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
  const derivedByType = emptyByType();
  for (const event of events) {
    if (event.type !== "session_start") derivedByType[event.type] += 1;
  }
  const rawByType = (value.byType ?? {}) as Partial<Record<InteractionEventType, number>>;
  const normalizedByPart = {
    head: nonNegative(byPart.head),
    body: nonNegative(byPart.body),
    bow: nonNegative(byPart.bow),
  };
  const byType: Record<InteractionEventType, number> = {
    headpat: Math.max(nonNegative(rawByType.headpat), normalizedByPart.head),
    body_touch: Math.max(nonNegative(rawByType.body_touch), normalizedByPart.body),
    bow_touch: Math.max(nonNegative(rawByType.bow_touch), normalizedByPart.bow),
    petting: Math.max(nonNegative(rawByType.petting), derivedByType.petting),
    drag: Math.max(nonNegative(rawByType.drag), derivedByType.drag),
    tease: Math.max(nonNegative(rawByType.tease), derivedByType.tease),
  };
  const firstSeenAt =
    typeof value.firstSeenAt === "number" && Number.isFinite(value.firstSeenAt)
      ? value.firstSeenAt
      : fallback.firstSeenAt;
  const unlockedMemories = Array.isArray(value.unlockedMemories)
    ? value.unlockedMemories.filter((id): id is string => typeof id === "string").slice(-MAX_MEMORIES)
    : [];
  const rawUnlockedAt = (value.memoryUnlockedAt ?? {}) as Record<string, unknown>;
  const memoryUnlockedAt: Record<string, number> = {};
  for (const id of unlockedMemories) {
    const timestamp = rawUnlockedAt[id];
    memoryUnlockedAt[id] =
      typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : firstSeenAt;
  }
  return {
    version: 2,
    firstSeenAt,
    lastSeenAt:
      typeof value.lastSeenAt === "number" && Number.isFinite(value.lastSeenAt)
        ? value.lastSeenAt
        : firstSeenAt,
    sessionCount: nonNegative(value.sessionCount),
    activeDays: [...new Set(days)].sort(),
    totalInteractions: nonNegative(value.totalInteractions),
    byPart: normalizedByPart,
    byType,
    consecutiveDays:
      typeof value.consecutiveDays === "number"
        ? Math.max(0, value.consecutiveDays)
        : computeConsecutiveDays(days),
    unlockedMemories,
    memoryUnlockedAt,
    recentEvents: events,
  };
}

export function computeConsecutiveDays(activeDays: string[], today = dateKey(new Date())): number {
  const set = new Set(activeDays);
  const cursor = new Date(`${today}T00:00:00`);
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
  return {
    id: `${type}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    at: now,
    date: dateKey(new Date(now)),
  };
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
    relationship.byType[type] += 1;
  }
  if (type === "headpat") relationship.byPart.head += 1;
  if (type === "body_touch") relationship.byPart.body += 1;
  if (type === "bow_touch") relationship.byPart.bow += 1;
  return event;
}

export function recordInteraction(
  relationship: RelationshipData,
  type: RelationshipEventType,
  now = Date.now(),
): RelationshipEvent {
  return recordEvent(relationship, type, now);
}

export function unlockMemory(relationship: RelationshipData, id: string, now = Date.now()): boolean {
  if (relationship.unlockedMemories.includes(id)) return false;
  relationship.unlockedMemories = [...relationship.unlockedMemories, id].slice(-MAX_MEMORIES);
  relationship.memoryUnlockedAt[id] = now;
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
  if (relationship.byType.tease >= 10) candidates.push("tease_10");
  if (relationship.byType.petting >= 10) candidates.push("petting_10");
  if (relationship.totalInteractions >= 50) candidates.push("interactions_50");
  if (relationship.totalInteractions >= 100) candidates.push("interactions_100");
  if (daysTogether(relationship.firstSeenAt, now) >= 30) candidates.push("days_30");
  const hour = new Date(now).getHours();
  if (relationship.sessionCount > 0 && (hour >= 23 || hour < 2)) {
    candidates.push("late_night_companion");
  }
  return candidates.filter((id) => unlockMemory(relationship, id, now));
}

const EVENT_LABELS: Record<InteractionEventType, string> = {
  headpat: "摸头",
  body_touch: "戳身体",
  bow_touch: "碰蝴蝶结",
  petting: "安静撸猫",
  drag: "换个位置",
  tease: "逗猫玩",
};

const BEHAVIOR_LABELS: Record<BehaviorId, string> = {
  sleep: "睡了一会儿",
  rest: "安静休息",
  observe: "观察桌面",
  seek_attention: "偷偷找你",
  groom: "认真洗脸",
  self_play: "自己玩耍",
  explore: "四处探索",
  react_user: "跟着动静张望",
};

function favoriteInteraction(relationship: RelationshipData): string {
  let favorite: InteractionEventType = "headpat";
  for (const type of INTERACTION_TYPES) {
    if (relationship.byType[type] > relationship.byType[favorite]) favorite = type;
  }
  return relationship.byType[favorite] > 0 ? EVENT_LABELS[favorite] : "还在慢慢熟悉";
}

function moodFromNeeds(needs: PetNeeds): PetMoodSnapshot {
  if (needs.sleepiness >= 0.68 || needs.energy <= 0.28) {
    return { label: "有点困", detail: "今天更想安静地靠一会儿", tone: "blue" };
  }
  if (needs.socialNeed >= 0.62) {
    return { label: "有点想你", detail: "可能会偷偷看你几次", tone: "rose" };
  }
  if (needs.boredom >= 0.58) {
    return { label: "想玩一会儿", detail: "好奇心正在冒头", tone: "gold" };
  }
  if (needs.energy >= 0.72) {
    return { label: "精神很好", detail: "适合探索和自己玩耍", tone: "mint" };
  }
  return { label: "安静自在", detail: "正舒服地陪在你旁边", tone: "rose" };
}

function buildWeeklySummary(progress: ProgressData, now: number): WeeklySummary {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const recentEvents = progress.relationship.recentEvents.filter((event) => event.at >= start.getTime());
  const interactions = recentEvents.filter((event) => event.type !== "session_start");
  const sessions = recentEvents.filter((event) => event.type === "session_start").length;
  const actions = progress.behavior.recentActions.filter((entry) => entry.at >= start.getTime());
  const lines: string[] = [];
  if (sessions > 0) lines.push(`这七天见面 ${sessions} 次，留下 ${interactions.length} 次互动。`);
  else lines.push("这七天才刚刚开始写新的故事。");
  if (interactions.length > 0) {
    const counts = emptyByType();
    for (const event of interactions) counts[event.type as InteractionEventType] += 1;
    let favorite: InteractionEventType = "headpat";
    for (const type of INTERACTION_TYPES) if (counts[type] > counts[favorite]) favorite = type;
    lines.push(`最常发生的是“${EVENT_LABELS[favorite]}”，一共有 ${counts[favorite]} 次。`);
  }
  if (actions.length > 0) {
    const counts = new Map<BehaviorId, number>();
    for (const action of actions) counts.set(action.id, (counts.get(action.id) ?? 0) + 1);
    const favorite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (favorite) lines.push(`Kitty 最常${BEHAVIOR_LABELS[favorite[0]]}，一共有 ${favorite[1]} 次。`);
  }
  const headline =
    interactions.length >= 12
      ? "热热闹闹的一周"
      : actions.length >= 5
        ? "各自自在，也彼此陪伴"
        : "慢慢积攒的小日常";
  return {
    startDate: dateKey(start),
    endDate: dateKey(new Date(now)),
    headline,
    lines,
  };
}

export function snapshotRelationship(progress: ProgressData, now = Date.now()): RelationshipSnapshot {
  const today = dateKey(new Date(now));
  const todayEvents = progress.relationship.recentEvents.filter((event) => event.date === today);
  const headpats = todayEvents.filter((event) => event.type === "headpat").length;
  const teases = todayEvents.filter((event) => event.type === "tease").length;
  const pettings = todayEvents.filter((event) => event.type === "petting").length;
  const sessions = todayEvents.filter((event) => event.type === "session_start").length;
  const todayActions = progress.behavior.recentActions.filter((entry) => entry.date === today);
  const diary: string[] = ["今天见到了你。"];
  if (headpats > 0) diary.push(`你今天摸了我 ${headpats} 次头。`);
  if (teases > 0) diary.push(`你还拿鼠标逗了我${teases === 1 ? "一次" : `${teases} 次`}。`);
  if (pettings > 0) diary.push(`我们安静地待在一起 ${pettings} 次。`);
  if (todayActions.length > 0) {
    const latest = todayActions.at(-1);
    if (latest) diary.push(`我今天也会自己${BEHAVIOR_LABELS[latest.id]}。`);
  }
  if (sessions > 0 && new Date(now).getHours() >= 23) diary.push("今晚我们待得有点晚。");
  if (todayEvents.length === 0 && todayActions.length === 0) {
    diary.splice(0, diary.length, "今天还没有留下新的回忆。");
  }
  const memories = MEMORY_CATALOG.map((memory): MemoryCardSnapshot => ({
    ...memory,
    unlocked: progress.relationship.unlockedMemories.includes(memory.id),
    unlockedAt: progress.relationship.memoryUnlockedAt[memory.id] ?? null,
  }));
  const keepsakes = memories
    .filter((memory) => memory.unlocked && memory.unlockedAt !== null)
    .map((memory) => ({ ...memory.keepsake, unlockedAt: memory.unlockedAt as number }))
    .sort((a, b) => b.unlockedAt - a.unlockedAt);
  return {
    daysTogether: daysTogether(progress.relationship.firstSeenAt, now),
    consecutiveDays: progress.relationship.consecutiveDays,
    todayInteractions: todayEvents.filter((event) => event.type !== "session_start").length,
    secretCount: memories.filter((memory) => memory.unlocked).length,
    favoriteInteraction: favoriteInteraction(progress.relationship),
    mood: moodFromNeeds(progress.behavior.needs),
    events: progress.relationship.recentEvents.slice(-20).reverse(),
    diaryDate: today,
    diary,
    weekly: buildWeeklySummary(progress, now),
    memories,
    keepsakes,
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

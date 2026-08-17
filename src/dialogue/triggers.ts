import type { TriggerContext } from "./types";

export interface TriggerEngineState {
  /** rangeKey → 最近一次尝试触发的日期（YYYY-MM-DD） */
  firedRanges: Record<string, string>;
  lastRandomAt: number | null;
  nextRandomAt: number | null;
  lastSessionReminderAt: number | null;
  streakShown: boolean;
}

export function emptyTriggerState(): TriggerEngineState {
  return {
    firedRanges: {},
    lastRandomAt: null,
    nextRandomAt: null,
    lastSessionReminderAt: null,
    streakShown: false,
  };
}

const RANGES = [
  { key: "morning", fromHour: 7, fromMinute: 0, toHour: 10, toMinute: 0 },
  { key: "noon", fromHour: 12, fromMinute: 0, toHour: 14, toMinute: 0 },
] as const;

export function activeRange(
  now: Date,
): "morning" | "noon" | "night" | null {
  const h = now.getHours();
  const m = now.getMinutes();
  for (const range of RANGES) {
    const from = range.fromHour * 60 + range.fromMinute;
    const to = range.toHour * 60 + range.toMinute;
    const current = h * 60 + m;
    if (current >= from && current < to) return range.key;
  }
  // 深夜 23:30–02:00（跨天）
  const current = h * 60 + m;
  if (current >= 23 * 60 + 30 || current < 2 * 60) return "night";
  return null;
}

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function randomMinutesBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * 定期调度：每天一次的时间段、运行时长提醒、随机事件。
 * 直接原地更新 state，调用方负责持久化。
 */
export function collectTimeTriggers(
  now: Date,
  state: TriggerEngineState,
  sessionMinutes: number,
): TriggerContext[] {
  const out: TriggerContext[] = [];
  const today = dateKey(now);
  const hour = now.getHours();

  const range = activeRange(now);
  if (range && state.firedRanges[range] !== today) {
    state.firedRanges[range] = today;
    out.push({ type: "timeRange", rangeKey: range, hour });
  }

  if (
    sessionMinutes >= 90 &&
    (state.lastSessionReminderAt === null ||
      now.getTime() - state.lastSessionReminderAt >= 120 * 60_000)
  ) {
    state.lastSessionReminderAt = now.getTime();
    out.push({ type: "sessionDuration", minutes: Math.floor(sessionMinutes) });
  }

  if (state.nextRandomAt === null) {
    // 首次启动后 45–90 分钟内不主动出现，避免"刚装好就刷屏"
    state.nextRandomAt =
      now.getTime() + randomMinutesBetween(45, 90) * 60_000;
  }
  if (now.getTime() >= state.nextRandomAt) {
    state.lastRandomAt = now.getTime();
    state.nextRandomAt =
      now.getTime() + randomMinutesBetween(45, 90) * 60_000;
    out.push({ type: "random" });
  }

  return out;
}

export function computeStreak(
  launchDates: string[],
  _today: string,
): number {
  const set = new Set(launchDates);
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // 调用方可能还没把"今天"写入列表：从今天或昨天开始往回数
  if (!set.has(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (;;) {
    if (!set.has(dateKey(cursor))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

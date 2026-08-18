import dialogueJson from "../../personalization/dialogue.json";
import type {
  DialogueDisplay,
  DialogueEntry,
  Emotion,
  Motion,
  TriggerContext,
} from "./types";
import { PROFILE, renderTemplate, specialDateForToday } from "./profile";

export interface DialogueState {
  lastShown: Record<string, number>;
  daily: Record<string, { date: string; count: number }>;
  onceShown: string[];
}

export function emptyDialogueState(): DialogueState {
  return { lastShown: {}, daily: {}, onceShown: [] };
}

const EMOTIONS: Emotion[] = ["neutral", "happy", "shy", "sleepy", "concerned"];
const MOTIONS: Motion[] = ["idle", "wave", "shy", "sleep", "happy"];

function sanitizeEntries(raw: unknown): DialogueEntry[] {
  const list = (raw as { entries?: unknown })?.entries;
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is DialogueEntry => {
    const e = item as Partial<DialogueEntry>;
    return (
      typeof e?.id === "string" &&
      typeof e?.text === "string" &&
      typeof e?.priority === "number" &&
      typeof e?.trigger?.type === "string" &&
      (e.emotion === undefined || EMOTIONS.includes(e.emotion)) &&
      (e.motion === undefined || MOTIONS.includes(e.motion))
    );
  });
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 对白选择引擎：触发条件 → 冷却 / 每日上限 / 一次性 → 优先级分层 → 加权随机。
 * pick() 会原地更新 state，调用方负责持久化。
 */
export class DialogueEngine {
  readonly entries: DialogueEntry[];

  constructor(
    entries: DialogueEntry[],
    private state: DialogueState,
  ) {
    this.entries = entries;
  }

  static fromBundle(state: DialogueState): DialogueEngine {
    return new DialogueEngine(sanitizeEntries(dialogueJson), state);
  }

  reset(): void {
    this.state = emptyDialogueState();
  }

  /** 今天命中的纪念日上下文 */
  specialDateContext(now: Date): TriggerContext | null {
    const hit = specialDateForToday(now);
    return hit
      ? { type: "specialDate", specialDateId: hit.id, label: hit.label }
      : null;
  }

  pick(ctx: TriggerContext, now: Date, installedAt: Date): DialogueDisplay | null {
    const today = dateKey(now);
    const daysInstalled = Math.floor(
      Math.max(0, now.getTime() - installedAt.getTime()) / 86_400_000,
    );

    const eligible = this.entries.filter((entry) => {
      if (!matchesTrigger(entry, ctx)) return false;
      if (entry.unlockDay !== undefined && daysInstalled < entry.unlockDay) {
        return false;
      }
      const cooldownMs = (entry.cooldownMinutes ?? 0) * 60_000;
      const last = this.state.lastShown[entry.id] ?? 0;
      if (cooldownMs > 0 && now.getTime() - last < cooldownMs) return false;

      const daily = this.state.daily[entry.id];
      if (
        daily &&
        daily.date === today &&
        entry.dailyLimit !== undefined &&
        daily.count >= entry.dailyLimit
      ) {
        return false;
      }
      if (entry.onlyOnce && this.state.onceShown.includes(entry.id)) {
        return false;
      }
      return true;
    });

    if (eligible.length === 0) return null;

    const topPriority = Math.max(...eligible.map((e) => e.priority));
    const pool = eligible.filter((e) => e.priority === topPriority);
    const totalWeight = pool.reduce((sum, e) => sum + (e.weight ?? 1), 0);
    let roll = Math.random() * totalWeight;
    let chosen = pool[0];
    for (const entry of pool) {
      roll -= entry.weight ?? 1;
      if (roll <= 0) {
        chosen = entry;
        break;
      }
    }

    this.record(chosen, today, now.getTime());

    const specialDateLabel =
      ctx.type === "specialDate" ? ctx.label : undefined;

    return {
      id: chosen.id,
      text: renderTemplate(chosen.text, { now, installedAt, specialDateLabel }),
      followUpText: chosen.followUpText
        ? renderTemplate(chosen.followUpText, {
            now,
            installedAt,
            specialDateLabel,
          })
        : undefined,
      emotion: chosen.emotion,
      motion: chosen.motion,
    };
  }

  private record(entry: DialogueEntry, today: string, now: number): void {
    this.state.lastShown[entry.id] = now;
    const daily = this.state.daily[entry.id];
    if (daily && daily.date === today) {
      daily.count += 1;
    } else {
      this.state.daily[entry.id] = { date: today, count: 1 };
    }
    if (entry.onlyOnce && !this.state.onceShown.includes(entry.id)) {
      this.state.onceShown.push(entry.id);
    }
  }
}

function matchesTrigger(entry: DialogueEntry, ctx: TriggerContext): boolean {
  const t = entry.trigger;
  if (t.type !== ctx.type) return false;
  switch (ctx.type) {
    case "timeRange":
      return t.rangeKey === ctx.rangeKey;
    case "rapidClick":
      // 与 petMachine 的 RAPID_CLICK_THRESHOLD 保持一致
      return ctx.count >= (t.minClicks ?? 4);
    case "sessionDuration":
      return ctx.minutes >= (t.minutes ?? Number.POSITIVE_INFINITY);
    case "specialDate":
      return t.specialDateId === ctx.specialDateId;
    case "streak":
      return ctx.streak >= (t.minStreak ?? 7);
    default:
      return true;
  }
}

export { PROFILE };

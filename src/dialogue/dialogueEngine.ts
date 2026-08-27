import dialogueJson from "../../personalization/dialogue.json";
import type {
  DialogueDisplay,
  DialogueEntry,
  Emotion,
  Motion,
  TriggerContext,
} from "./types";
import {
  PROFILE,
  renderTemplate,
  specialDateForToday,
} from "./profile";
import type { ProfileData } from "./types";
import type { RelationshipContext } from "../relationship/relationshipEngine";

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

/**
 * 关系对白是产品功能的默认内容，不依赖用户已有的 personalization/dialogue.json。
 * 同 id 的私人对白可覆盖这些默认文案，避免升级时改写任何私有文件。
 */
const RELATIONSHIP_ENTRIES: DialogueEntry[] = [
  {
    id: "return_after_absence",
    text: "你回来啦。已经有 {{absenceDays}} 天没见到你了。",
    emotion: "happy",
    motion: "happy",
    priority: 120,
    trigger: { type: "returnAfterAbsence", minAbsenceDays: 1 },
    dailyLimit: 1,
  },
  {
    id: "memory_first_interaction",
    text: "我记住啦：这是我们第一次互动。",
    emotion: "happy",
    motion: "happy",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "first_interaction" },
    onlyOnce: true,
  },
  {
    id: "memory_headpat_10",
    text: "你已经摸了我 {{headpatCount}} 次头。我就知道你喜欢这里。",
    emotion: "shy",
    motion: "shy",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "headpat_10" },
    onlyOnce: true,
  },
  {
    id: "memory_streak_3",
    text: "已经连续 {{streak}} 天见面啦，我把这件事偷偷收好了。",
    emotion: "happy",
    motion: "happy",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "streak_3" },
    onlyOnce: true,
  },
  {
    id: "memory_streak_7",
    text: "第 {{streak}} 天也见到你了。这个小秘密要好好收藏。",
    emotion: "happy",
    motion: "happy",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "streak_7" },
    onlyOnce: true,
  },
  {
    id: "memory_late_night",
    text: "这么晚还在一起，明天也要好好休息。",
    emotion: "sleepy",
    motion: "sleep",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "late_night_companion" },
    onlyOnce: true,
  },
  {
    id: "memory_tease_10",
    text: "十次啦。下一次我一定会抓住那个光点。",
    emotion: "happy",
    motion: "happy",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "tease_10" },
    onlyOnce: true,
  },
  {
    id: "memory_petting_10",
    text: "这是第十次安静靠在一起，我把呼噜声也收进小窝了。",
    emotion: "shy",
    motion: "shy",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "petting_10" },
    onlyOnce: true,
  },
  {
    id: "memory_interactions_50",
    text: "第五十次回应！原来小日常真的会慢慢变成回忆。",
    emotion: "happy",
    motion: "happy",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "interactions_50" },
    onlyOnce: true,
  },
  {
    id: "memory_interactions_100",
    text: "第一百次回应，我已经很熟悉你靠近的样子啦。",
    emotion: "happy",
    motion: "happy",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "interactions_100" },
    onlyOnce: true,
  },
  {
    id: "memory_days_30",
    text: "第三十天。门牌已经写好啦：这里是我们的小窝。",
    emotion: "happy",
    motion: "happy",
    priority: 115,
    trigger: { type: "memoryUnlocked", memoryId: "days_30" },
    onlyOnce: true,
  },
  {
    id: "habit_headpat",
    text: "第 {{headpatCount}} 次摸头认证：这里果然是你的固定位置。",
    emotion: "shy",
    motion: "shy",
    priority: 110,
    trigger: { type: "interactionHabit", habit: "headpat", minCount: 10 },
    onlyOnce: true,
  },
];

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
    private profile: ProfileData = PROFILE,
  ) {
    this.entries = entries;
  }

  static fromBundle(
    state: DialogueState,
    profile: ProfileData = PROFILE,
  ): DialogueEngine {
    const entries = sanitizeEntries(dialogueJson);
    const configuredIds = new Set(entries.map((entry) => entry.id));
    return new DialogueEngine(
      [...entries, ...RELATIONSHIP_ENTRIES.filter((entry) => !configuredIds.has(entry.id))],
      state,
      profile,
    );
  }

  setProfile(profile: ProfileData): void {
    this.profile = profile;
  }

  reset(): void {
    this.state = emptyDialogueState();
  }

  /** 今天命中的纪念日上下文 */
  specialDateContext(now: Date): TriggerContext | null {
    const hit = specialDateForToday(now, this.profile);
    return hit
      ? { type: "specialDate", specialDateId: hit.id, label: hit.label }
      : null;
  }

  pick(
    ctx: TriggerContext,
    now: Date,
    installedAt: Date,
    relationship?: RelationshipContext,
  ): DialogueDisplay | null {
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
      text: renderTemplate(chosen.text, {
        now,
        installedAt,
        specialDateLabel,
        ...relationship,
      }, this.profile),
      followUpText: chosen.followUpText
        ? renderTemplate(chosen.followUpText, {
            now,
            installedAt,
            specialDateLabel,
            ...relationship,
          }, this.profile)
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
    case "returnAfterAbsence":
      return ctx.absenceDays >= (t.minAbsenceDays ?? 1);
    case "interactionHabit":
      return (
        t.habit === ctx.habit &&
        ctx.count >= (t.minCount ?? Number.POSITIVE_INFINITY)
      );
    case "memoryUnlocked":
      return t.memoryId === ctx.memoryId;
    default:
      return true;
  }
}

export { PROFILE };

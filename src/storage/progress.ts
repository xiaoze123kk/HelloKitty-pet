import { load } from "@tauri-apps/plugin-store";
import {
  emptyDialogueState,
  type DialogueState,
} from "../dialogue/dialogueEngine";
import {
  emptyTriggerState,
  type TriggerEngineState,
} from "../dialogue/triggers";
import {
  emptyRelationship,
  computeConsecutiveDays,
  normalizeRelationship,
  type RelationshipData,
} from "../relationship/relationshipEngine";
import {
  emptyBehaviorState,
  normalizeBehaviorState,
} from "../behavior/needs";
import type { BehaviorStateData } from "../behavior/types";

export type ProgressStore = Awaited<ReturnType<typeof load>>;

export interface ReminderState {
  /** 上次喝水提醒时间戳；null 表示还没提醒过 */
  waterLastAt: number | null;
  /** 上次久坐提醒时间戳；null 表示还没提醒过 */
  sedentaryLastAt: number | null;
  /** 上次早睡提醒日期（YYYY-MM-DD） */
  sleepLastDate: string | null;
  /** 上次“早上好”问候日期（YYYY-MM-DD） */
  morningGreetDate: string | null;
}

export function emptyReminderState(): ReminderState {
  return {
    waterLastAt: null,
    sedentaryLastAt: null,
    sleepLastDate: null,
    morningGreetDate: null,
  };
}

export interface ProgressData {
  /** 持久化结构版本；缺失视为 v0.3 及更早数据。 */
  version: 2;
  launchCount: number;
  firstLaunchAt: string | null;
  launchDates: string[];
  sessionStart: number;
  dialogue: DialogueState;
  triggers: TriggerEngineState;
  reminders: ReminderState;
  relationship: RelationshipData;
  behavior: BehaviorStateData;
}

export function emptyProgress(now: number): ProgressData {
  return {
    version: 2,
    launchCount: 1,
    firstLaunchAt: new Date(now).toISOString(),
    launchDates: [new Date(now).toISOString().slice(0, 10)],
    sessionStart: now,
    dialogue: emptyDialogueState(),
    triggers: emptyTriggerState(),
    reminders: emptyReminderState(),
    relationship: emptyRelationship(now),
    behavior: emptyBehaviorState(now),
  };
}

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function loadProgress(): Promise<{
  store: ProgressStore;
  progress: ProgressData;
}> {
  const store = await load("progress.json", { autoSave: false });
  const raw = await store.get<Partial<ProgressData>>("pet");
  const now = Date.now();
  const rawReminders = raw?.reminders;
  const firstLaunchAt =
    typeof raw?.firstLaunchAt === "string"
      ? raw.firstLaunchAt
      : new Date(now).toISOString();
  const migratedFirstSeenAt = Date.parse(firstLaunchAt);
  const legacyLaunchDates = Array.isArray(raw?.launchDates)
    ? raw.launchDates.filter((day): day is string => typeof day === "string")
    : [];
  const relationship = normalizeRelationship(
    raw?.relationship,
    Number.isFinite(migratedFirstSeenAt) ? migratedFirstSeenAt : now,
  );
  if (!raw?.relationship) {
    relationship.activeDays = [...new Set(legacyLaunchDates)].sort();
    relationship.sessionCount = typeof raw?.launchCount === "number" ? Math.max(0, raw.launchCount) : 0;
    relationship.consecutiveDays = computeConsecutiveDays(relationship.activeDays);
    const lastLegacyDay = relationship.activeDays.at(-1);
    if (lastLegacyDay) {
      const parsedLastSeen = Date.parse(`${lastLegacyDay}T12:00:00`);
      if (Number.isFinite(parsedLastSeen)) relationship.lastSeenAt = parsedLastSeen;
    }
  }
  const progress: ProgressData = {
    version: 2,
    launchCount: typeof raw?.launchCount === "number" ? raw.launchCount : 0,
    firstLaunchAt,
    launchDates: Array.isArray(raw?.launchDates) ? raw.launchDates : [],
    sessionStart: typeof raw?.sessionStart === "number" ? raw.sessionStart : now,
    dialogue:
      raw?.dialogue &&
      typeof raw.dialogue === "object" &&
      "lastShown" in raw.dialogue
        ? (raw.dialogue as DialogueState)
        : emptyDialogueState(),
    triggers:
      raw?.triggers && typeof raw.triggers === "object"
        ? (raw.triggers as TriggerEngineState)
        : emptyTriggerState(),
    reminders: {
      waterLastAt:
        typeof rawReminders?.waterLastAt === "number"
          ? rawReminders.waterLastAt
          : null,
      sedentaryLastAt:
        typeof rawReminders?.sedentaryLastAt === "number"
          ? rawReminders.sedentaryLastAt
          : null,
      sleepLastDate:
        typeof rawReminders?.sleepLastDate === "string"
          ? rawReminders.sleepLastDate
          : null,
      morningGreetDate:
        typeof rawReminders?.morningGreetDate === "string"
          ? rawReminders.morningGreetDate
          : null,
    },
    relationship,
    behavior: normalizeBehaviorState(raw?.behavior, now),
  };
  return { store, progress };
}

export async function saveProgress(
  store: ProgressStore,
  progress: ProgressData,
): Promise<void> {
  await store.set("pet", progress);
  await store.save();
}

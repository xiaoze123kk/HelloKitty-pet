import { load } from "@tauri-apps/plugin-store";
import {
  emptyDialogueState,
  type DialogueState,
} from "../dialogue/dialogueEngine";
import {
  emptyTriggerState,
  type TriggerEngineState,
} from "../dialogue/triggers";

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
  launchCount: number;
  firstLaunchAt: string | null;
  launchDates: string[];
  sessionStart: number;
  dialogue: DialogueState;
  triggers: TriggerEngineState;
  reminders: ReminderState;
}

export function emptyProgress(now: number): ProgressData {
  return {
    launchCount: 1,
    firstLaunchAt: new Date(now).toISOString(),
    launchDates: [new Date(now).toISOString().slice(0, 10)],
    sessionStart: now,
    dialogue: emptyDialogueState(),
    triggers: emptyTriggerState(),
    reminders: emptyReminderState(),
  };
}

export async function loadProgress(): Promise<{
  store: ProgressStore;
  progress: ProgressData;
}> {
  const store = await load("progress.json", { autoSave: false });
  const raw = await store.get<Partial<ProgressData>>("pet");
  const now = Date.now();
  const rawReminders = raw?.reminders;
  const progress: ProgressData = {
    launchCount: typeof raw?.launchCount === "number" ? raw.launchCount : 0,
    firstLaunchAt:
      typeof raw?.firstLaunchAt === "string"
        ? raw.firstLaunchAt
        : new Date(now).toISOString(),
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

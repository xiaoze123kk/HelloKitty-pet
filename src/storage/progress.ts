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

export interface ProgressData {
  launchCount: number;
  firstLaunchAt: string | null;
  launchDates: string[];
  sessionStart: number;
  dialogue: DialogueState;
  triggers: TriggerEngineState;
}

export function emptyProgress(now: number): ProgressData {
  return {
    launchCount: 1,
    firstLaunchAt: new Date(now).toISOString(),
    launchDates: [new Date(now).toISOString().slice(0, 10)],
    sessionStart: now,
    dialogue: emptyDialogueState(),
    triggers: emptyTriggerState(),
  };
}

export async function loadProgress(): Promise<{
  store: ProgressStore;
  progress: ProgressData;
}> {
  const store = await load("progress.json", { autoSave: false });
  const raw = await store.get<Partial<ProgressData>>("pet");
  const now = Date.now();
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

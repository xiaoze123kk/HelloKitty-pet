import { load } from "@tauri-apps/plugin-store";
import { clampScale, DEFAULT_SCALE } from "../pet/zoom";

export type PrefStore = Awaited<ReturnType<typeof load>>;

export interface PetPreferences {
  /** 物理像素坐标；null 表示使用默认位置 */
  position: { x: number; y: number } | null;
  alwaysOnTop: boolean;
  dnd: boolean;
  /** 桌宠整体缩放比例（0.5 – 2.0） */
  scale: number;
}

export const DEFAULT_PREFERENCES: PetPreferences = {
  position: null,
  alwaysOnTop: true,
  dnd: false,
  scale: DEFAULT_SCALE,
};

export async function loadPreferences(): Promise<{
  store: PrefStore;
  prefs: PetPreferences;
}> {
  const store = await load("preferences.json", { autoSave: false });
  const raw = await store.get<Partial<PetPreferences>>("pet");
  const prefs: PetPreferences = {
    position:
      raw?.position &&
      typeof raw.position.x === "number" &&
      typeof raw.position.y === "number"
        ? { x: raw.position.x, y: raw.position.y }
        : null,
    alwaysOnTop: raw?.alwaysOnTop ?? DEFAULT_PREFERENCES.alwaysOnTop,
    dnd: raw?.dnd ?? DEFAULT_PREFERENCES.dnd,
    scale: clampScale(raw?.scale ?? DEFAULT_PREFERENCES.scale),
  };
  return { store, prefs };
}

export async function savePreferences(
  store: PrefStore,
  prefs: PetPreferences,
): Promise<void> {
  await store.set("pet", prefs);
  await store.save();
}

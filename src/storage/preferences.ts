import { load } from "@tauri-apps/plugin-store";
import {
  normalizeAccessoryId,
  type AccessoryId,
} from "../growth/wardrobe";
import { clampScale, DEFAULT_SCALE } from "../pet/zoom";

export type PrefStore = Awaited<ReturnType<typeof load>>;

/** 趣味动画开关：每个特性可独立启停，持久化到本机。 */
export interface AnimationPreferences {
  /** 空闲随机小动作（伸懒腰 / 打哈欠 / 洗脸 / 张望） */
  idleActions: boolean;
  /** 入睡下沉与起床伸懒腰过渡 */
  sleepTransitions: boolean;
  /** 拖拽悬挂姿态 + 落地弹跳 */
  dragEffects: boolean;
  /** 长按撸猫 + 爱心粒子 */
  petting: boolean;
  /** 身体朝鼠标方向轻微转头 */
  gazeFollow: boolean;
  /** 逗猫棒：快速划动鼠标时抬头看 / 连续划动追扑光标 */
  teasing: boolean;
  /** 桌面水平散步 */
  walking: boolean;
}

export const DEFAULT_ANIMATIONS: AnimationPreferences = {
  idleActions: true,
  sleepTransitions: true,
  dragEffects: true,
  petting: true,
  gazeFollow: true,
  teasing: true,
  /** 散步默认关闭，由用户在设置里主动开启 */
  walking: false,
};

export interface WaterReminder {
  enabled: boolean;
  /** 分钟；可选档位：30 / 45 / 60 / 90 / 120 */
  intervalMinutes: number;
}

export interface SedentaryReminder {
  enabled: boolean;
  /** 分钟；可选档位：45 / 60 / 90 / 120 / 150 */
  intervalMinutes: number;
}

export interface SleepReminder {
  enabled: boolean;
  /** "HH:mm"，每 30 分钟一档（22:00 – 23:30） */
  time: string;
}

export interface ReminderPreferences {
  water: WaterReminder;
  sedentary: SedentaryReminder;
  sleep: SleepReminder;
}

export interface WardrobePreferences {
  selectedAccessoryId: AccessoryId | null;
}

export const DEFAULT_REMINDERS: ReminderPreferences = {
  water: { enabled: true, intervalMinutes: 60 },
  sedentary: { enabled: true, intervalMinutes: 90 },
  sleep: { enabled: true, time: "23:00" },
};

export type ReminderKind = keyof ReminderPreferences;

const WATER_MINUTES = [30, 45, 60, 90, 120];
const SEDENTARY_MINUTES = [45, 60, 90, 120, 150];

export interface PetPreferences {
  /** 物理像素坐标；null 表示使用默认位置 */
  position: { x: number; y: number } | null;
  alwaysOnTop: boolean;
  dnd: boolean;
  /** 桌宠整体缩放比例（0.5 – 2.0） */
  scale: number;
  /** 趣味动画开关 */
  animations: AnimationPreferences;
  /** 陪伴提醒开关与节奏 */
  reminders: ReminderPreferences;
  /** 当前穿戴；解锁资格由关系记录决定。 */
  wardrobe: WardrobePreferences;
}

export const DEFAULT_PREFERENCES: PetPreferences = {
  position: null,
  alwaysOnTop: true,
  dnd: false,
  scale: DEFAULT_SCALE,
  animations: DEFAULT_ANIMATIONS,
  reminders: DEFAULT_REMINDERS,
  wardrobe: { selectedAccessoryId: null },
};

function normalizeAnimations(
  raw: Partial<AnimationPreferences> | undefined,
): AnimationPreferences {
  const source = raw ?? {};
  return {
    idleActions: source.idleActions ?? DEFAULT_ANIMATIONS.idleActions,
    sleepTransitions:
      source.sleepTransitions ?? DEFAULT_ANIMATIONS.sleepTransitions,
    dragEffects: source.dragEffects ?? DEFAULT_ANIMATIONS.dragEffects,
    petting: source.petting ?? DEFAULT_ANIMATIONS.petting,
    gazeFollow: source.gazeFollow ?? DEFAULT_ANIMATIONS.gazeFollow,
    teasing: source.teasing ?? DEFAULT_ANIMATIONS.teasing,
    walking: source.walking ?? DEFAULT_ANIMATIONS.walking,
  };
}

function normalizeReminders(
  raw: Partial<ReminderPreferences> | undefined,
): ReminderPreferences {
  const source = raw ?? {};
  const water = source.water;
  const sedentary = source.sedentary;
  const sleep = source.sleep;
  return {
    water: {
      enabled: water?.enabled ?? DEFAULT_REMINDERS.water.enabled,
      intervalMinutes: WATER_MINUTES.includes(water?.intervalMinutes ?? -1)
        ? (water?.intervalMinutes as number)
        : DEFAULT_REMINDERS.water.intervalMinutes,
    },
    sedentary: {
      enabled: sedentary?.enabled ?? DEFAULT_REMINDERS.sedentary.enabled,
      intervalMinutes: SEDENTARY_MINUTES.includes(
        sedentary?.intervalMinutes ?? -1,
      )
        ? (sedentary?.intervalMinutes as number)
        : DEFAULT_REMINDERS.sedentary.intervalMinutes,
    },
    sleep: {
      enabled: sleep?.enabled ?? DEFAULT_REMINDERS.sleep.enabled,
      time:
        typeof sleep?.time === "string" && /^\d{2}:\d{2}$/.test(sleep.time)
          ? sleep.time
          : DEFAULT_REMINDERS.sleep.time,
    },
  };
}

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
    animations: normalizeAnimations(raw?.animations),
    reminders: normalizeReminders(raw?.reminders),
    wardrobe: {
      selectedAccessoryId: normalizeAccessoryId(
        raw?.wardrobe?.selectedAccessoryId,
      ),
    },
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

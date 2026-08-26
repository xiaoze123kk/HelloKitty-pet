export const WARDROBE_ATLAS_URL = "/assets/accessories/wardrobe-atlas.png?v=1";

export type AccessoryId =
  | "paw_badge"
  | "cloud_clip"
  | "calendar_pin"
  | "moon_cap"
  | "ribbon_scarf"
  | "golden_bell";

export interface AtlasCell {
  column: 0 | 1;
  row: 0 | 1 | 2;
}

export interface AccessoryPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AccessoryHitArea = AccessoryPlacement;

export type AccessoryAnchor = "temple" | "crown" | "chin";

export interface AccessoryDefinition {
  id: AccessoryId;
  name: string;
  description: string;
  unlockMemoryId: string;
  unlockHint: string;
  cell: AtlasCell;
  /** 大头版本的视觉锚点，避免沿用全身角色的胸口或肩颈坐标。 */
  anchor: AccessoryAnchor;
  placement: AccessoryPlacement;
  /** 透明图集单元内真正可点击的可见区域。 */
  hitArea: AccessoryHitArea;
  /** 围巾等应被头部遮挡，其余配饰绘制在脸部前方。 */
  layer: "behind" | "front";
}

export interface WardrobeItemSnapshot extends AccessoryDefinition {
  unlocked: boolean;
}

export interface WardrobeSnapshot {
  selectedId: AccessoryId | null;
  items: WardrobeItemSnapshot[];
}

export const WARDROBE_CATALOG: readonly AccessoryDefinition[] = [
  {
    id: "paw_badge",
    name: "蔷薇爪印",
    description: "第一次回应留下的小徽章。",
    unlockMemoryId: "first_interaction",
    unlockHint: "发现“第一次回应”后获得",
    cell: { column: 0, row: 0 },
    anchor: "temple",
    placement: { x: 29, y: 87, width: 48, height: 48 },
    hitArea: { x: 31, y: 89, width: 44, height: 44 },
    layer: "front",
  },
  {
    id: "cloud_clip",
    name: "云朵发夹",
    description: "摸头时最柔软的那朵云。",
    unlockMemoryId: "headpat_10",
    unlockHint: "发现“最熟悉的位置”后获得",
    cell: { column: 1, row: 0 },
    anchor: "temple",
    placement: { x: 3, y: 18, width: 110, height: 82 },
    hitArea: { x: 8, y: 22, width: 96, height: 72 },
    layer: "front",
  },
  {
    id: "calendar_pin",
    name: "三日别针",
    description: "连续见面的日期被认真圈起来。",
    unlockMemoryId: "streak_3",
    unlockHint: "发现“连续的三天”后获得",
    cell: { column: 0, row: 1 },
    anchor: "temple",
    placement: { x: 10, y: 45, width: 66, height: 66 },
    hitArea: { x: 14, y: 49, width: 58, height: 58 },
    layer: "front",
  },
  {
    id: "moon_cap",
    name: "月亮睡帽",
    description: "夜深时也能好好休息。",
    unlockMemoryId: "late_night_companion",
    unlockHint: "发现“深夜还亮着的灯”后获得",
    cell: { column: 1, row: 1 },
    anchor: "crown",
    placement: { x: -4, y: -8, width: 144, height: 108 },
    hitArea: { x: 0, y: 0, width: 136, height: 98 },
    layer: "front",
  },
  {
    id: "ribbon_scarf",
    name: "粉色领结",
    description: "抓不到的光点变成了轻软缎带。",
    unlockMemoryId: "tease_10",
    unlockHint: "发现“抓不到的光点”后获得",
    cell: { column: 0, row: 2 },
    anchor: "chin",
    placement: { x: 62, y: 190, width: 116, height: 74 },
    hitArea: { x: 70, y: 212, width: 100, height: 28 },
    layer: "behind",
  },
  {
    id: "golden_bell",
    name: "金色铃铛",
    description: "只在熟悉的人靠近时轻轻响。",
    unlockMemoryId: "interactions_100",
    unlockHint: "发现“一百次回应”后获得",
    cell: { column: 1, row: 2 },
    anchor: "chin",
    placement: { x: 58, y: 188, width: 124, height: 74 },
    hitArea: { x: 62, y: 188, width: 116, height: 52 },
    layer: "front",
  },
] as const;

const ACCESSORY_IDS = new Set<AccessoryId>(
  WARDROBE_CATALOG.map((item) => item.id),
);

export function normalizeAccessoryId(value: unknown): AccessoryId | null {
  return typeof value === "string" && ACCESSORY_IDS.has(value as AccessoryId)
    ? (value as AccessoryId)
    : null;
}

export function isAccessoryUnlocked(
  id: AccessoryId,
  unlockedMemories: readonly string[],
): boolean {
  const item = WARDROBE_CATALOG.find((candidate) => candidate.id === id);
  return Boolean(item && unlockedMemories.includes(item.unlockMemoryId));
}

export function wardrobeSnapshot(
  unlockedMemories: readonly string[],
  selectedId: AccessoryId | null,
): WardrobeSnapshot {
  const safeSelected =
    selectedId && isAccessoryUnlocked(selectedId, unlockedMemories)
      ? selectedId
      : null;
  return {
    selectedId: safeSelected,
    items: WARDROBE_CATALOG.map((item) => ({
      ...item,
      unlocked: unlockedMemories.includes(item.unlockMemoryId),
    })),
  };
}

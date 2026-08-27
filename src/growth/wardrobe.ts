export const WARDROBE_ATLAS_URL = "/assets/accessories/wardrobe-atlas.png?v=1";

export type AccessoryId =
  | "soft_cap"
  | "padded_headphones"
  | "christmas_hat"
  | "halloween_pumpkin"
  | "seasonal_wreath"
  | "paw_badge"
  | "cloud_clip"
  | "moon_cap"
  | "ribbon_scarf";

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
export type AccessoryPoseBinding = "spring" | "rigid";

export interface AccessoryDefinition {
  id: AccessoryId;
  name: string;
  description: string;
  unlockMemoryId: string;
  unlockHint: string;
  cell: AtlasCell | null;
  /** 独立透明素材；为空时继续从衣柜图集读取。 */
  imageUrl?: string;
  /** 大头版本的视觉锚点，避免沿用全身角色的胸口或肩颈坐标。 */
  anchor: AccessoryAnchor;
  /** 耳机等夹持式配饰必须逐帧贴合头部；其余配饰默认保留轻微弹性。 */
  poseBinding?: AccessoryPoseBinding;
  placement: AccessoryPlacement;
  /** 透明图集单元内真正可点击的可见区域。 */
  hitArea: AccessoryHitArea;
  /** 耳机等由多个分离部件组成，可追加独立命中区而不吞掉脸部点击。 */
  extraHitAreas?: readonly AccessoryHitArea[];
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
    id: "soft_cap",
    name: "莓果软帽",
    description: "把今天的心情压成柔软的一小顶帽子。",
    unlockMemoryId: "days_30",
    unlockHint: "发现“第一个月”后获得",
    cell: null,
    imageUrl: "/assets/accessories/soft-cap.png?v=1",
    anchor: "crown",
    placement: { x: 34, y: -8, width: 138, height: 112 },
    hitArea: { x: 42, y: 9, width: 120, height: 88 },
    layer: "front",
  },
  {
    id: "padded_headphones",
    name: "云朵耳机",
    description: "把吵闹挡在外面，只留下你的声音。",
    unlockMemoryId: "petting_10",
    unlockHint: "发现“呼噜时刻”后获得",
    cell: null,
    imageUrl: "/assets/accessories/padded-headphones-v2.png?v=1",
    anchor: "temple",
    poseBinding: "rigid",
    placement: { x: 0, y: 0, width: 240, height: 240 },
    hitArea: { x: 0, y: 86, width: 32, height: 86 },
    extraHitAreas: [
      { x: 208, y: 86, width: 32, height: 86 },
      { x: 70, y: 35, width: 66, height: 18 },
    ],
    layer: "front",
  },
  {
    id: "christmas_hat",
    name: "圣诞帽",
    description: "把冬天的祝福戴到耳朵旁边。",
    unlockMemoryId: "streak_7",
    unlockHint: "发现“完整的一周”后获得",
    cell: null,
    imageUrl: "/assets/accessories/christmas-hat.png?v=1",
    anchor: "crown",
    placement: { x: 34, y: -8, width: 145, height: 118 },
    hitArea: { x: 43, y: 9, width: 127, height: 94 },
    layer: "front",
  },
  {
    id: "halloween_pumpkin",
    name: "万圣节南瓜",
    description: "一颗不会吓人的小南瓜，陪你捣蛋一下。",
    unlockMemoryId: "interactions_100",
    unlockHint: "发现“一百次回应”后获得",
    cell: null,
    imageUrl: "/assets/accessories/halloween-pumpkin.png?v=1",
    anchor: "temple",
    placement: { x: 0, y: 28, width: 102, height: 108 },
    hitArea: { x: 8, y: 57, width: 86, height: 70 },
    layer: "front",
  },
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
    id: "moon_cap",
    name: "月亮睡帽",
    description: "夜深时也能好好休息。",
    unlockMemoryId: "late_night_companion",
    unlockHint: "发现“深夜还亮着的灯”后获得",
    cell: null,
    imageUrl: "/assets/accessories/moon-sleep-cap.png?v=1",
    anchor: "crown",
    placement: { x: 44, y: 8, width: 128, height: 104 },
    hitArea: { x: 53, y: 19, width: 110, height: 82 },
    layer: "front",
  },
  {
    id: "seasonal_wreath",
    name: "四季花环",
    description: "春花、夏叶、秋果和冬日都收在这一圈里。",
    unlockMemoryId: "streak_3",
    unlockHint: "发现“连续的三天”后获得",
    cell: null,
    imageUrl: "/assets/accessories/seasonal-wreath.png?v=1",
    anchor: "crown",
    placement: { x: 33, y: 13, width: 155, height: 123 },
    hitArea: { x: 42, y: 24, width: 137, height: 103 },
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

import type { AccessoryId } from "../growth/wardrobe";

/** 240px 大头帧内可点击部位。左右分区用于驱动有方向的局部反馈。 */
export type PetTouchTargetId =
  | "left_ear"
  | "right_ear"
  | "forehead"
  | "left_cheek"
  | "right_cheek"
  | "nose"
  | "left_whiskers"
  | "right_whiskers"
  | "bow"
  | "lower_face"
  | "face"
  | "accessory";

export interface PetTouchTarget {
  id: PetTouchTargetId;
  accessoryId?: AccessoryId;
}

/** 240×240 桌宠逻辑帧内的标准化坐标。 */
export interface PetFramePoint {
  x: number;
  y: number;
}

/** 一次完整触摸：语义命中目标与真实落点保持在同一契约中。 */
export interface PetTouchInteraction {
  target: PetTouchTarget;
  point: PetFramePoint;
}

export interface AccessoryHitRegion {
  id: AccessoryId;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 旧关系统计只区分头、蝴蝶结和下方；细分部位在写入时归并到这里。 */
export type PetTouchPart = "bow" | "head" | "body";

const FRAME_SIZE = 240;

export function clampPetFramePoint(
  point: PetFramePoint,
  frameSize: number = FRAME_SIZE,
): PetFramePoint {
  const clamp = (value: number) =>
    Math.min(frameSize, Math.max(0, Number.isFinite(value) ? value : 0));
  return { x: clamp(point.x), y: clamp(point.y) };
}

/**
 * 按宠物帧坐标分类点击部位。
 * 坐标来自 240×240 的拖拽区域，区域本身随桌宠整体缩放，
 * 调用前需把 client 坐标归一化回 240px。
 *
 * 配饰命中优先于脸部。其余区域按实际 1200px 抠图缩放后的五官位置校准，
 * 不再把上半张脸大面积误判为蝴蝶结。
 */
export function classifyTouchTarget(
  frameX: number,
  frameY: number,
  accessory?: AccessoryHitRegion | null,
  frameSize: number = FRAME_SIZE,
): PetTouchTarget {
  const x = (frameX / frameSize) * FRAME_SIZE;
  const y = (frameY / frameSize) * FRAME_SIZE;

  if (
    accessory &&
    x >= accessory.x &&
    x <= accessory.x + accessory.width &&
    y >= accessory.y &&
    y <= accessory.y + accessory.height
  ) {
    return { id: "accessory", accessoryId: accessory.id };
  }

  if (x >= 116 && x <= 232 && y >= 14 && y <= 118) return { id: "bow" };
  if (Math.hypot(x - 120, y - 169) <= 17) return { id: "nose" };
  if (x <= 52 && y >= 132 && y <= 206) return { id: "left_whiskers" };
  if (x >= 188 && y >= 132 && y <= 206) return { id: "right_whiskers" };
  if (x >= 45 && x <= 103 && y >= 165 && y <= 207) return { id: "left_cheek" };
  if (x >= 137 && x <= 195 && y >= 165 && y <= 207) return { id: "right_cheek" };
  if (x <= 112 && y <= 102) return { id: "left_ear" };
  if (x >= 148 && y <= 102) return { id: "right_ear" };
  if (x >= 55 && x <= 183 && y >= 98 && y <= 137) return { id: "forehead" };
  if (y >= 207) return { id: "lower_face" };
  return { id: "face" };
}

/** 供旧调用方和迁移测试使用的粗粒度映射。 */
export function touchTargetToLegacyPart(target: PetTouchTarget): PetTouchPart {
  if (target.id === "bow") return "bow";
  if (target.id === "lower_face") return "body";
  return "head";
}

export function classifyTouchPart(
  frameX: number,
  frameY: number,
  frameSize: number = FRAME_SIZE,
): PetTouchPart {
  return touchTargetToLegacyPart(
    classifyTouchTarget(frameX, frameY, null, frameSize),
  );
}

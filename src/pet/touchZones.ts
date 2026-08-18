/** 240px 帧内可点击部位 */
export type PetTouchPart = "bow" | "head" | "body";

const FRAME_SIZE = 240;

/**
 * 按宠物帧坐标分类点击部位。
 * 坐标来自 240×240 的拖拽区域，区域本身随桌宠整体缩放，
 * 调用前需把 client 坐标归一化回 240px。
 *
 * 依据当前立绘的视觉布局：
 * - 蝴蝶结：上半部中央大片粉色区域（y 28–108，x 48–192）
 * - 头 / 脸：中部（含眼睛、耳朵）
 * - 身体 / 脚：底部
 */
export function classifyTouchPart(
  frameX: number,
  frameY: number,
  frameSize: number = FRAME_SIZE,
): PetTouchPart {
  const x = (frameX / frameSize) * FRAME_SIZE;
  const y = (frameY / frameSize) * FRAME_SIZE;

  if (y < 110) {
    // 顶部两侧是耳朵，仍算摸头；中央大片粉色是蝴蝶结
    if (x >= 36 && x <= 204) return "bow";
    return "head";
  }
  if (y >= 188) return "body";
  return "head";
}

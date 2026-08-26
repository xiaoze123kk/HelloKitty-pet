import type { AccessoryAnchor } from "../growth/wardrobe";
import type { PetVisualMotion } from "./animationManifest";

export interface AttachmentPose {
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  angle: number;
}

export const NEUTRAL_ATTACHMENT_POSE: AttachmentPose = {
  dx: 0,
  dy: 0,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
};

const SLEEP_BASE_POSE: AttachmentPose = {
  dx: 0,
  dy: 0,
  scaleX: 1,
  scaleY: 1,
  // sleep/fallAsleep/wake 共用一张已经在素材内顺时针倾斜的头部底图。
  angle: 8.5,
};

/**
 * 校正状态底图自身的构图差异。
 *
 * motion-spec 的关键帧只描述“底图之上的动作”，PetRig 已通过弹簧层同步；
 * 这里单独描述底图本身相对中性大头坐标系的变化，避免把素材内倾斜误当成
 * 衣柜 placement 的永久偏移。
 */
export function attachmentPoseFor(
  motion: PetVisualMotion,
  anchor: AccessoryAnchor,
): AttachmentPose {
  if (motion === "sleep" || motion === "fallAsleep" || motion === "wake") {
    return SLEEP_BASE_POSE;
  }

  if (motion === "dragging") {
    return {
      dx: 0,
      // 拖拽底图是全身构图；下巴饰品需要比头顶饰品再向上贴紧颈线。
      dy: anchor === "chin" ? -9 : -3,
      scaleX: 0.62,
      scaleY: 0.62,
      angle: 0,
    };
  }

  return NEUTRAL_ATTACHMENT_POSE;
}

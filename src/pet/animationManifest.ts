import type { Motion } from "../dialogue/types";
import { getMotionSpec } from "./proceduralMotion";

export interface MotionConfig {
  src: string;
  frames: number;
  fps: number;
  loop: boolean;
}

export const PET_FRAME_WIDTH = 240;
export const PET_FRAME_HEIGHT = 240;

/** 兜底 sprite sheet 配置：fps/loop/帧数直接来自 motion-spec.json */
function sheetConfig(
  src: string,
  motion: Parameters<typeof getMotionSpec>[0],
): MotionConfig {
  const spec = getMotionSpec(motion);
  return {
    src,
    frames: spec.keyframes.length,
    fps: spec.fps,
    loop: spec.loop,
  };
}

export const motions: Record<Motion, MotionConfig> = {
  idle: sheetConfig("/assets/pet/idle.png", "idle"),
  wave: sheetConfig("/assets/pet/happy.png", "happy"),
  shy: sheetConfig("/assets/pet/shy.png", "shy"),
  sleep: sheetConfig("/assets/pet/sleep.png", "sleep"),
  happy: sheetConfig("/assets/pet/happy.png", "happy"),
};

/** 额外支持 sleepy 状态（使用独立素材），不属于对白 motion */
export const sleepyMotion: MotionConfig = sheetConfig(
  "/assets/pet/sleepy.png",
  "sleepy",
);

export type PetVisualMotion = Motion | "sleepy" | "clicked" | "dragging";

export const petMotions: Record<PetVisualMotion, MotionConfig> = {
  idle: motions.idle,
  wave: motions.wave,
  shy: motions.shy,
  sleep: motions.sleep,
  happy: motions.happy,
  sleepy: sleepyMotion,
  clicked: sheetConfig("/assets/pet/clicked.png", "clicked"),
  dragging: motions.idle,
};

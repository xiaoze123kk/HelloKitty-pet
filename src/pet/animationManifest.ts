import type { Motion } from "../dialogue/types";

export interface MotionConfig {
  src: string;
  frames: number;
  fps: number;
  loop: boolean;
}

export const PET_FRAME_WIDTH = 240;
export const PET_FRAME_HEIGHT = 240;

export const motions: Record<Motion, MotionConfig> = {
  idle: {
    src: "/assets/pet/idle.png",
    frames: 6,
    fps: 6,
    loop: true,
  },
  wave: {
    src: "/assets/pet/happy.png",
    frames: 6,
    fps: 9,
    loop: false,
  },
  shy: {
    src: "/assets/pet/shy.png",
    frames: 6,
    fps: 8,
    loop: false,
  },
  sleep: {
    src: "/assets/pet/sleep.png",
    frames: 4,
    fps: 3,
    loop: true,
  },
  happy: {
    src: "/assets/pet/happy.png",
    frames: 6,
    fps: 9,
    loop: false,
  },
};

/** 额外支持 sleepy 状态（使用独立素材），不属于对白 motion */
export const sleepyMotion: MotionConfig = {
  src: "/assets/pet/sleepy.png",
  frames: 4,
  fps: 3,
  loop: true,
};

export type PetVisualMotion = Motion | "sleepy" | "clicked" | "dragging";

export const petMotions: Record<PetVisualMotion, MotionConfig> = {
  idle: motions.idle,
  wave: motions.wave,
  shy: motions.shy,
  sleep: motions.sleep,
  happy: motions.happy,
  sleepy: sleepyMotion,
  clicked: {
    src: "/assets/pet/clicked.png",
    frames: 4,
    fps: 10,
    loop: false,
  },
  dragging: motions.idle,
};

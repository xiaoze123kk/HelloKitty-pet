import type { Motion } from "../dialogue/types";
import { ASSET_CACHE_BUST } from "./assetVersion";
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
    // 加版本参数：素材重新生成后，避免 WebView 继续使用旧的
    // 睁眼 sleep.png 等回退帧（Tauri 资产协议按 path 解析，忽略 query）。
    src: `${src}?${ASSET_CACHE_BUST}`,
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

export type PetVisualMotion =
  | Motion
  | "sleepy"
  | "clicked"
  | "dragging"
  | "stretch"
  | "yawn"
  | "wash"
  | "look"
  | "sneeze"
  | "shake"
  | "spin"
  | "angry"
  | "fallAsleep"
  | "wake"
  | "landing"
  | "petted"
  | "walk"
  | "headpat"
  | "bodypat"
  | "bowtouch"
  | "tease"
  | "pounce";

export const petMotions: Record<PetVisualMotion, MotionConfig> = {
  idle: motions.idle,
  wave: motions.wave,
  shy: motions.shy,
  sleep: motions.sleep,
  happy: motions.happy,
  sleepy: sleepyMotion,
  clicked: sheetConfig("/assets/pet/clicked.png", "clicked"),
  dragging: sheetConfig("/assets/pet/dragging.png", "dragging"),
  stretch: sheetConfig("/assets/pet/stretch.png", "stretch"),
  yawn: sheetConfig("/assets/pet/yawn.png", "yawn"),
  wash: sheetConfig("/assets/pet/wash.png", "wash"),
  look: sheetConfig("/assets/pet/look.png", "look"),
  sneeze: sheetConfig("/assets/pet/sneeze.png", "sneeze"),
  shake: sheetConfig("/assets/pet/shake.png", "shake"),
  spin: sheetConfig("/assets/pet/spin.png", "spin"),
  angry: sheetConfig("/assets/pet/angry.png", "angry"),
  fallAsleep: sheetConfig("/assets/pet/fallAsleep.png", "fallAsleep"),
  wake: sheetConfig("/assets/pet/wake.png", "wake"),
  landing: sheetConfig("/assets/pet/landing.png", "landing"),
  petted: sheetConfig("/assets/pet/petted.png", "petted"),
  walk: sheetConfig("/assets/pet/walk.png", "walk"),
  headpat: sheetConfig("/assets/pet/headpat.png", "headpat"),
  bodypat: sheetConfig("/assets/pet/bodypat.png", "bodypat"),
  bowtouch: sheetConfig("/assets/pet/bowtouch.png", "bowtouch"),
  tease: sheetConfig("/assets/pet/tease.png", "tease"),
  pounce: sheetConfig("/assets/pet/pounce.png", "pounce"),
};

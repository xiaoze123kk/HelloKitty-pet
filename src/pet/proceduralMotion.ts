import type { PetVisualMotion } from "./animationManifest";
import motionSpecJson from "../assets/pet/motion-spec.json";
import { ASSET_CACHE_BUST } from "./assetVersion";

export type ExpressionKey =
  | "open"
  | "closed"
  | "half"
  | "happy"
  | "shy"
  | "surprised";
export type EaseName = "linear" | "sineInOut";

export interface MotionKeyframe {
  /** 相对 240 逻辑帧的缩放（默认 1） */
  scale?: number;
  /** Y 轴独立缩放，用于挤压/拉伸（默认与 scale 相同） */
  scaleY?: number;
  /** 绕帧中心旋转角度（度） */
  angle?: number;
  /** 垂直位移（逻辑像素） */
  dy?: number;
  /** 亮度滤镜（睡眠变暗） */
  brightness?: number;
}

export interface ProceduralMotionSpec {
  fps: number;
  loop: boolean;
  /** 该状态下是否启用随机眨眼 */
  blink: boolean;
  /** 表情基帧 */
  base: ExpressionKey;
  /** 关键帧之间插值缓动 */
  ease: EaseName;
  keyframes: MotionKeyframe[];
}

export interface BlinkSchedule {
  minIntervalMs: number;
  maxIntervalMs: number;
  holdMs: number;
}

export interface MotionSpecBundle {
  frame: number;
  highScale: number;
  blink: BlinkSchedule;
  motions: Record<string, ProceduralMotionSpec>;
}

const BUNDLE = motionSpecJson as unknown as MotionSpecBundle;

/** 程序化渲染的逻辑帧尺寸（与素材 240px 帧一致） */
export const CANVAS_BASE_SIZE = BUNDLE.frame || 240;
export const BLINK_SCHEDULE = BUNDLE.blink;

export const EXPRESSION_URLS: Record<ExpressionKey, string> = {
  open: `/assets/pet/cutout-frame@5x.png?${ASSET_CACHE_BUST}`,
  closed: `/assets/pet/cutout-frame-blink@5x.png?${ASSET_CACHE_BUST}`,
  half: `/assets/pet/cutout-frame-half@5x.png?${ASSET_CACHE_BUST}`,
  happy: `/assets/pet/cutout-frame-happy@5x.png?${ASSET_CACHE_BUST}`,
  shy: `/assets/pet/cutout-frame-shy@5x.png?${ASSET_CACHE_BUST}`,
  surprised: `/assets/pet/cutout-frame-surprised@5x.png?${ASSET_CACHE_BUST}`,
};

/** 手工替换位：public/assets/pet/state-bases/{state}.png 优先于自动生成的表情帧 */
export function stateBaseOverrideUrl(specKey: string): string {
  return `/assets/pet/state-bases/${specKey}.png?${ASSET_CACHE_BUST}`;
}

export function stateBlinkOverrideUrl(specKey: string): string {
  return `/assets/pet/state-bases/${specKey}-blink.png`;
}

/** 状态机动作名 → motion-spec 动作名 */
const SPEC_KEYS: Record<PetVisualMotion, string> = {
  idle: "idle",
  wave: "happy",
  shy: "shy",
  sleep: "sleep",
  happy: "happy",
  sleepy: "sleepy",
  clicked: "clicked",
  dragging: "dragging",
  stretch: "stretch",
  yawn: "yawn",
  wash: "wash",
  look: "look",
  sneeze: "sneeze",
  shake: "shake",
  spin: "spin",
  angry: "angry",
  annoyed: "annoyed",
  fallAsleep: "fallAsleep",
  wake: "wake",
  landing: "landing",
  petted: "petted",
  walk: "walk",
  headpat: "headpat",
  bodypat: "bodypat",
  bowtouch: "bowtouch",
  tease: "tease",
  pounce: "pounce",
  jump: "jump",
  nod: "nod",
  sway: "sway",
  bow: "bow",
  startle: "startle",
  dizzy: "dizzy",
  peek: "peek",
  edgePeek: "edgePeek",
  reunion: "reunion",
  celebrate: "celebrate",
  moonGreeting: "moonGreeting",
  earTouch: "earTouch",
  cheekTouch: "cheekTouch",
  noseBoop: "noseBoop",
  whiskerTouch: "whiskerTouch",
  faceTouch: "faceTouch",
  accessoryTouch: "accessoryTouch",
  curiousWink: "curiousWink",
  nightCompanion: "nightCompanion",
  pettedEnjoy: "pettedEnjoy",
};

export function getSpecKey(motion: PetVisualMotion): string {
  return SPEC_KEYS[motion] ?? "idle";
}

export function getSpecKeys(): string[] {
  return Object.keys(BUNDLE.motions);
}

// ---------- 调试面板实时覆盖 ----------
export const MOTION_SPEC_OVERRIDE_EVENT = "kittypet:motion-spec-override";
const overrides = new Map<string, ProceduralMotionSpec>();

export function getMotionSpec(motion: PetVisualMotion): ProceduralMotionSpec {
  return getMotionSpecByKey(getSpecKey(motion));
}

export function getMotionSpecByKey(specKey: string): ProceduralMotionSpec {
  return (
    overrides.get(specKey) ?? BUNDLE.motions[specKey] ?? BUNDLE.motions.idle
  );
}

export function setMotionSpecOverride(
  specKey: string,
  spec: ProceduralMotionSpec | null,
): void {
  if (spec === null) {
    overrides.delete(specKey);
  } else {
    overrides.set(specKey, spec);
  }
  window.dispatchEvent(new Event(MOTION_SPEC_OVERRIDE_EVENT));
}

export function buildMotionSpecJson(): string {
  const motions = Object.fromEntries(
    Object.entries(BUNDLE.motions).map(([key, spec]) => [
      key,
      overrides.get(key) ?? spec,
    ]),
  );
  return JSON.stringify({ ...BUNDLE, motions }, null, 2);
}

// ---------- 关键帧插值 ----------
export function easeValue(name: EaseName, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  if (name === "sineInOut") {
    return 0.5 - Math.cos(Math.PI * x) / 2;
  }
  return x;
}

export function interpolateKeyframes(
  from: MotionKeyframe,
  to: MotionKeyframe,
  t: number,
): MotionKeyframe {
  const mix = (a?: number, b?: number): number | undefined =>
    a === undefined ? b : b === undefined ? a : a + (b - a) * t;

  return {
    scale: mix(from.scale, to.scale),
    scaleY: mix(from.scaleY, to.scaleY),
    angle: mix(from.angle, to.angle),
    dy: mix(from.dy, to.dy),
    brightness: mix(from.brightness, to.brightness),
  };
}

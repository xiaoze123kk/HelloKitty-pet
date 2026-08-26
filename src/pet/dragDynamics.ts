export interface DragWindowSample {
  x: number;
  y: number;
  at: number;
}

export interface DragMotion {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  speed: number;
  intensity: number;
  directionX: number;
  directionY: number;
  lagX: number;
  lagY: number;
  leanDeg: number;
}

export interface DragRelease extends DragMotion {
  impact: number;
  squashX: number;
  squashY: number;
  shadowScale: number;
  dustStrength: number;
}

export const STILL_DRAG_MOTION: DragMotion = {
  dx: 0,
  dy: 0,
  vx: 0,
  vy: 0,
  speed: 0,
  intensity: 0,
  directionX: 0,
  directionY: 0,
  lagX: 0,
  lagY: 0,
  leanDeg: 0,
};

export const STILL_DRAG_RELEASE: DragRelease = {
  ...STILL_DRAG_MOTION,
  impact: 0.18,
  squashX: 1.008,
  squashY: 0.994,
  shadowScale: 1.12,
  dustStrength: 0.18,
};

const MAX_TRACKED_SPEED = 1.6;
const MOTION_SMOOTHING = 0.42;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/**
 * 将 Tauri 的物理窗口坐标采样归一化为 CSS px/ms，并做轻度低通滤波。
 * 结果只驱动 Kitty 的视觉姿态，不让窗口松手后继续移动。
 */
export function sampleDragMotion(
  previous: DragWindowSample,
  current: DragWindowSample,
  prior: DragMotion = STILL_DRAG_MOTION,
  devicePixelRatio: number = 1,
): DragMotion {
  const dt = current.at - previous.at;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 250) return prior;

  const dpr = clamp(devicePixelRatio, 0.5, 8);
  const dx = (current.x - previous.x) / dpr;
  const dy = (current.y - previous.y) / dpr;
  const rawVx = dx / dt;
  const rawVy = dy / dt;
  const vx = prior.vx + (rawVx - prior.vx) * MOTION_SMOOTHING;
  const vy = prior.vy + (rawVy - prior.vy) * MOTION_SMOOTHING;
  const speed = Math.hypot(vx, vy);
  const intensity = clamp((speed - 0.025) / (MAX_TRACKED_SPEED - 0.025), 0, 1);
  const moving = speed > 0.01;
  const directionX = moving ? vx / speed : 0;
  const directionY = moving ? vy / speed : 0;
  const response = 0.65 + intensity * 3.85;

  return {
    dx,
    dy,
    vx,
    vy,
    speed,
    intensity,
    directionX,
    directionY,
    lagX: clamp(-directionX * response, -4.5, 4.5),
    lagY: clamp(-directionY * (0.4 + intensity * 1.6), -2, 2),
    leanDeg: clamp(-directionX * (0.8 + intensity * 5.2), -6, 6),
  };
}

export function releaseFromDragMotion(
  motion: DragMotion = STILL_DRAG_MOTION,
): DragRelease {
  const impact = clamp(0.18 + motion.intensity * 0.82, 0.18, 1);
  return {
    ...motion,
    impact,
    squashX: 1 + impact * 0.048,
    squashY: 1 - impact * 0.038,
    shadowScale: 1.08 + impact * 0.26,
    dustStrength: impact,
  };
}

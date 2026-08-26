import type { MotionKeyframe } from "./proceduralMotion";

export const MOTION_TRANSITION_MS = 100;
/**
 * `source-over` 会让两张半透明 PNG 的重叠轮廓短暂变暗。
 * `lighter` 对预乘 alpha 通道做加法，配合总和为 1 的交叉淡化权重，
 * 得到真正的线性混合，不产生点击后的黑色重影。
 */
export const MOTION_TRANSITION_BLEND_MODE: GlobalCompositeOperation = "lighter";

export interface MotionTransitionFrame {
  pose: MotionKeyframe;
  previousAlpha: number;
  nextAlpha: number;
  progress: number;
  done: boolean;
}

export interface MotionCompletionGate {
  runId: number;
  finished: boolean;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const sineInOut = (value: number) =>
  0.5 - Math.cos(Math.PI * clamp01(value)) / 2;

function mix(a: number | undefined, b: number | undefined, progress: number) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + (b - a) * progress;
}

function mixAngle(
  previous: number | undefined,
  next: number | undefined,
  progress: number,
) {
  if (previous === undefined) return next;
  if (next === undefined) return previous;
  if (progress <= 0) return previous;
  if (progress >= 1) return next;

  // Equivalent turns such as 360deg -> 0deg must not interpolate backwards
  // through 180deg during the motion-to-idle handoff.
  const shortestDelta = ((next - previous + 540) % 360) - 180;
  return previous + shortestDelta * progress;
}

function mixPose(
  previous: MotionKeyframe,
  next: MotionKeyframe,
  progress: number,
): MotionKeyframe {
  return {
    scale: mix(previous.scale, next.scale, progress),
    scaleY: mix(previous.scaleY, next.scaleY, progress),
    angle: mixAngle(previous.angle, next.angle, progress),
    dy: mix(previous.dy, next.dy, progress),
    brightness: mix(previous.brightness, next.brightness, progress),
  };
}

export function motionTransitionFrame(
  previous: MotionKeyframe,
  next: MotionKeyframe,
  elapsedMs: number,
  reducedMotion: boolean = false,
): MotionTransitionFrame {
  const linearProgress = reducedMotion
    ? 1
    : clamp01(
        (Number.isFinite(elapsedMs) ? elapsedMs : MOTION_TRANSITION_MS) /
          MOTION_TRANSITION_MS,
      );
  const progress = sineInOut(linearProgress);
  return {
    pose: mixPose(previous, next, progress),
    previousAlpha: 1 - progress,
    nextAlpha: progress,
    progress,
    done: linearProgress >= 1,
  };
}

export function beginMotionRun(
  previous: MotionCompletionGate,
): MotionCompletionGate {
  return { runId: previous.runId + 1, finished: false };
}

export function completeMotionRun(
  current: MotionCompletionGate,
  runId: number,
): { gate: MotionCompletionGate; shouldNotify: boolean } {
  if (current.runId !== runId || current.finished) {
    return { gate: current, shouldNotify: false };
  }
  return {
    gate: { runId, finished: true },
    shouldNotify: true,
  };
}

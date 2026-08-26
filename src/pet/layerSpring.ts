import type { MotionKeyframe } from "./proceduralMotion";

export interface LayerPose {
  scaleX: number;
  scaleY: number;
  angle: number;
  dy: number;
}

interface SpringChannel {
  value: number;
  velocity: number;
}

export interface LayerSpringState {
  scaleX: SpringChannel;
  scaleY: SpringChannel;
  angle: SpringChannel;
  dy: SpringChannel;
}

export interface LayerSpringConfig {
  stiffness: number;
  damping: number;
  maxAngleDelta: number;
  maxDyDelta: number;
  maxScaleDelta: number;
}

export const ACCESSORY_SPRING_CONFIG: LayerSpringConfig = {
  stiffness: 180,
  damping: 22,
  maxAngleDelta: 5,
  maxDyDelta: 4,
  maxScaleDelta: 0.03,
};

export const BOW_SHEEN_SPRING_CONFIG: LayerSpringConfig = {
  stiffness: 260,
  damping: 26,
  maxAngleDelta: 2.5,
  maxDyDelta: 2,
  maxScaleDelta: 0.018,
};

export const MAX_SPRING_FRAME_MS = 32;
export const BACKGROUND_SNAP_MS = 250;

export function layerPoseFromKeyframe(keyframe: MotionKeyframe): LayerPose {
  const scale = keyframe.scale ?? 1;
  return {
    scaleX: scale,
    scaleY: keyframe.scaleY ?? scale,
    angle: keyframe.angle ?? 0,
    dy: keyframe.dy ?? 0,
  };
}

const channel = (value: number): SpringChannel => ({ value, velocity: 0 });

export function createLayerSpringState(pose: LayerPose): LayerSpringState {
  return {
    scaleX: channel(pose.scaleX),
    scaleY: channel(pose.scaleY),
    angle: channel(pose.angle),
    dy: channel(pose.dy),
  };
}

export function poseFromLayerSpring(state: LayerSpringState): LayerPose {
  return {
    scaleX: state.scaleX.value,
    scaleY: state.scaleY.value,
    angle: state.angle.value,
    dy: state.dy.value,
  };
}

function advanceChannel(
  current: SpringChannel,
  target: number,
  dtSeconds: number,
  config: LayerSpringConfig,
  maxDelta: number,
): SpringChannel {
  let velocity =
    current.velocity +
    ((target - current.value) * config.stiffness -
      current.velocity * config.damping) *
      dtSeconds;
  let value = current.value + velocity * dtSeconds;
  const min = target - maxDelta;
  const max = target + maxDelta;
  if (value < min) {
    value = min;
    if (velocity < 0) velocity = 0;
  } else if (value > max) {
    value = max;
    if (velocity > 0) velocity = 0;
  }
  return { value, velocity };
}

export function stepLayerSpring(
  current: LayerSpringState,
  target: LayerPose,
  elapsedMs: number,
  config: LayerSpringConfig,
  reducedMotion: boolean = false,
): LayerSpringState {
  if (reducedMotion || elapsedMs > BACKGROUND_SNAP_MS) {
    return createLayerSpringState(target);
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return current;

  const dtSeconds = Math.min(elapsedMs, MAX_SPRING_FRAME_MS) / 1_000;
  return {
    scaleX: advanceChannel(
      current.scaleX,
      target.scaleX,
      dtSeconds,
      config,
      config.maxScaleDelta,
    ),
    scaleY: advanceChannel(
      current.scaleY,
      target.scaleY,
      dtSeconds,
      config,
      config.maxScaleDelta,
    ),
    angle: advanceChannel(
      current.angle,
      target.angle,
      dtSeconds,
      config,
      config.maxAngleDelta,
    ),
    dy: advanceChannel(
      current.dy,
      target.dy,
      dtSeconds,
      config,
      config.maxDyDelta,
    ),
  };
}

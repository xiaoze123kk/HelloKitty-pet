export interface PointerSample {
  x: number;
  y: number;
}

export interface PointerActivityState {
  lastMovedAt: number;
  lastSampleAt: number;
  lastX: number | null;
  lastY: number | null;
  activity: number;
}

export function initialPointerActivity(now = Date.now()): PointerActivityState {
  return {
    lastMovedAt: now,
    lastSampleAt: now,
    lastX: null,
    lastY: null,
    activity: 0,
  };
}

export function updatePointerActivity(
  previous: PointerActivityState,
  sample: PointerSample,
  now = Date.now(),
): PointerActivityState {
  const elapsed = Math.max(1, now - previous.lastSampleAt);
  const distance =
    previous.lastX === null || previous.lastY === null
      ? 0
      : Math.hypot(sample.x - previous.lastX, sample.y - previous.lastY);
  const moved = distance >= 2;
  const speed = distance / elapsed;
  return {
    lastMovedAt: moved ? now : previous.lastMovedAt,
    lastSampleAt: now,
    lastX: sample.x,
    lastY: sample.y,
    activity: Math.max(0, Math.min(1, moved ? speed * 5 : previous.activity * 0.82)),
  };
}

export function pointerContext(
  state: PointerActivityState,
  now = Date.now(),
): { pointerIdleSeconds: number; pointerActivity: number } {
  return {
    pointerIdleSeconds: Math.max(0, (now - state.lastMovedAt) / 1_000),
    pointerActivity: state.activity,
  };
}


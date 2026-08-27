import type { PetVisualMotion } from "./animationManifest";

export type MicroMood = "none" | "calm" | "bright" | "sleepy" | "curious";
export type MicroCue =
  | "none"
  | "ear-left"
  | "ear-right"
  | "nose-wiggle"
  | "soft-lean";

export interface MicroMotionProfile {
  id: MicroMood;
  active: boolean;
  allowCues: boolean;
  breathMs: number;
  breathScaleX: number;
  breathScaleY: number;
  breathLift: number;
  minCueDelayMs: number;
  maxCueDelayMs: number;
}

export interface ScheduledMicroCue {
  cue: Exclude<MicroCue, "none">;
  delayMs: number;
  durationMs: number;
}

export const MICRO_MOTION_OFF: MicroMotionProfile = {
  id: "none",
  active: false,
  allowCues: false,
  breathMs: 0,
  breathScaleX: 1,
  breathScaleY: 1,
  breathLift: 0,
  minCueDelayMs: 0,
  maxCueDelayMs: 0,
};

const MICRO_PROFILES: Record<Exclude<MicroMood, "none">, MicroMotionProfile> = {
  calm: {
    id: "calm",
    active: true,
    allowCues: true,
    breathMs: 4_800,
    breathScaleX: 0.998,
    breathScaleY: 1.007,
    breathLift: -0.7,
    minCueDelayMs: 3_600,
    maxCueDelayMs: 6_800,
  },
  bright: {
    id: "bright",
    active: true,
    allowCues: false,
    breathMs: 3_500,
    breathScaleX: 0.997,
    breathScaleY: 1.01,
    breathLift: -1,
    minCueDelayMs: 3_000,
    maxCueDelayMs: 5_200,
  },
  sleepy: {
    id: "sleepy",
    active: true,
    allowCues: true,
    breathMs: 6_600,
    breathScaleX: 0.999,
    breathScaleY: 1.004,
    breathLift: -0.35,
    minCueDelayMs: 5_200,
    maxCueDelayMs: 9_000,
  },
  curious: {
    id: "curious",
    active: true,
    allowCues: false,
    breathMs: 4_100,
    breathScaleX: 0.998,
    breathScaleY: 1.008,
    breathLift: -0.8,
    minCueDelayMs: 3_400,
    maxCueDelayMs: 6_000,
  },
};

const CUES: Record<Exclude<MicroMood, "none">, Array<Exclude<MicroCue, "none">>> = {
  calm: ["ear-left", "ear-right", "nose-wiggle", "soft-lean"],
  bright: ["nose-wiggle", "ear-left", "ear-right", "soft-lean"],
  sleepy: ["ear-left", "ear-right", "soft-lean", "ear-left"],
  curious: ["ear-left", "ear-right", "soft-lean", "nose-wiggle"],
};

const CUE_DURATION_MS: Record<Exclude<MicroCue, "none">, number> = {
  "ear-left": 620,
  "ear-right": 620,
  "nose-wiggle": 540,
  "soft-lean": 920,
};

const unitRandom = (value: number) =>
  Math.min(0.999_999, Math.max(0, Number.isFinite(value) ? value : 0));

export function microProfileForMotion(
  motion: PetVisualMotion,
): MicroMotionProfile {
  if (motion === "idle") return MICRO_PROFILES.calm;
  if (
    motion === "sleep" ||
    motion === "sleepy" ||
    motion === "nightCompanion"
  ) {
    return MICRO_PROFILES.sleepy;
  }
  if (
    motion === "happy" ||
    motion === "petted" ||
    motion === "pettedEnjoy" ||
    motion === "reunion" ||
    motion === "celebrate"
  ) {
    return MICRO_PROFILES.bright;
  }
  if (
    motion === "look" ||
    motion === "peek" ||
    motion === "edgePeek" ||
    motion === "curiousWink"
  ) {
    return MICRO_PROFILES.curious;
  }
  return MICRO_MOTION_OFF;
}

export function scheduleMicroCue(
  profile: MicroMotionProfile,
  cueRandom: number = Math.random(),
  delayRandom: number = Math.random(),
): ScheduledMicroCue | null {
  if (!profile.active || !profile.allowCues || profile.id === "none") return null;
  const cuePool = CUES[profile.id];
  const cue = cuePool[Math.floor(unitRandom(cueRandom) * cuePool.length)];
  const delayMs = Math.round(
    profile.minCueDelayMs +
      (profile.maxCueDelayMs - profile.minCueDelayMs) * unitRandom(delayRandom),
  );
  return { cue, delayMs, durationMs: CUE_DURATION_MS[cue] };
}

import type { AutonomousMotionId, BehaviorEventType } from "./types";

const MOTION_BY_EVENT: Partial<Record<BehaviorEventType, AutonomousMotionId>> = {
  IDLE_STRETCH: "stretch",
  IDLE_YAWN: "yawn",
  IDLE_WASH: "wash",
  IDLE_LOOK: "look",
  IDLE_SNEEZE: "sneeze",
  IDLE_SHAKE: "shake",
  IDLE_SPIN: "spin",
  IDLE_JUMP: "jump",
  IDLE_NOD: "nod",
  IDLE_SWAY: "sway",
  IDLE_BOW: "bow",
  IDLE_STARTLE: "startle",
  IDLE_DIZZY: "dizzy",
  IDLE_PEEK: "peek",
  EDGE_PEEK: "edgePeek",
  BEGIN_SLEEP: "sleep",
  WALK_START: "walk",
};

export function autonomousMotionForEvent(
  event: BehaviorEventType,
): AutonomousMotionId | null {
  return MOTION_BY_EVENT[event] ?? null;
}

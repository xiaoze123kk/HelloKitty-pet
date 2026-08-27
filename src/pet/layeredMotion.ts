import type { AccessoryId } from "../growth/wardrobe";
import type { PetVisualMotion } from "./animationManifest";

export type AccessoryReaction =
  | "none"
  | "doze"
  | "sparkle"
  | "bounce"
  | "flutter"
  | "glow";

export function accessoryReactionFor(
  accessoryId: AccessoryId | null,
  motion: PetVisualMotion,
): AccessoryReaction {
  if (!accessoryId) return "none";
  return motion === "accessoryTouch" ? "glow" : "none";
}

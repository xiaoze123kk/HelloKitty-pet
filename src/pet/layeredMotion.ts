import type { AccessoryId } from "../growth/wardrobe";
import type { PetVisualMotion } from "./animationManifest";

export type AccessoryReaction =
  | "none"
  | "doze"
  | "sparkle"
  | "bounce"
  | "flutter"
  | "glow";

const SLEEP_MOTIONS = new Set<PetVisualMotion>([
  "sleepy",
  "sleep",
  "fallAsleep",
  "yawn",
  "moonGreeting",
]);

export function accessoryReactionFor(
  accessoryId: AccessoryId | null,
  motion: PetVisualMotion,
): AccessoryReaction {
  if (!accessoryId) return "none";
  if (motion === "accessoryTouch") {
    switch (accessoryId) {
      case "moon_cap":
        return "doze";
      case "golden_bell":
        return "glow";
      case "cloud_clip":
        return "sparkle";
      case "calendar_pin":
        return "bounce";
      case "ribbon_scarf":
        return "flutter";
      case "paw_badge":
        return "glow";
    }
  }
  if (accessoryId === "moon_cap" && SLEEP_MOTIONS.has(motion)) return "doze";
  if (
    accessoryId === "golden_bell" &&
    ["walk", "landing", "headpat", "happy", "reunion", "sway"].includes(motion)
  ) {
    return "glow";
  }
  if (
    accessoryId === "cloud_clip" &&
    ["headpat", "happy", "reunion", "celebrate", "bow"].includes(motion)
  ) {
    return "sparkle";
  }
  if (
    accessoryId === "calendar_pin" &&
    ["celebrate", "jump"].includes(motion)
  ) {
    return "bounce";
  }
  if (
    accessoryId === "ribbon_scarf" &&
    ["tease", "pounce", "walk", "spin", "sway"].includes(motion)
  ) {
    return "flutter";
  }
  if (
    accessoryId === "paw_badge" &&
    ["headpat", "petted", "reunion", "nod"].includes(motion)
  ) {
    return "glow";
  }
  return "none";
}

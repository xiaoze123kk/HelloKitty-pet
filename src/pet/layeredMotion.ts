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
  "nightCompanion",
]);

export function accessoryReactionFor(
  accessoryId: AccessoryId | null,
  motion: PetVisualMotion,
): AccessoryReaction {
  if (!accessoryId) return "none";
  if (motion === "accessoryTouch") {
    switch (accessoryId) {
      case "soft_cap":
        return "bounce";
      case "padded_headphones":
        return "glow";
      case "christmas_hat":
        return "bounce";
      case "halloween_pumpkin":
        return "sparkle";
      case "moon_cap":
        return "doze";
      case "cloud_clip":
        return "sparkle";
      case "seasonal_wreath":
        return "sparkle";
      case "ribbon_scarf":
        return "flutter";
      case "paw_badge":
        return "glow";
    }
  }
  if (
    ["soft_cap", "christmas_hat"].includes(accessoryId) &&
    ["celebrate", "jump", "sway"].includes(motion)
  ) {
    return "bounce";
  }
  if (
    accessoryId === "halloween_pumpkin" &&
    ["happy", "reunion", "celebrate"].includes(motion)
  ) {
    return "sparkle";
  }
  if (
    accessoryId === "seasonal_wreath" &&
    ["happy", "reunion", "celebrate", "headpat"].includes(motion)
  ) {
    return "sparkle";
  }
  if (accessoryId === "moon_cap" && SLEEP_MOTIONS.has(motion)) return "doze";
  if (
    accessoryId === "cloud_clip" &&
    ["headpat", "happy", "reunion", "celebrate", "bow"].includes(motion)
  ) {
    return "sparkle";
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

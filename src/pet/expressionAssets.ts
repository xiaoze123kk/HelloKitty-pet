import type { PetVisualMotion } from "./animationManifest";

export type ExpressionAsset =
  | "surprised"
  | "curious"
  | "blush"
  | "sleepy_soft";

export const EXPRESSION_ASSET_URLS: Record<ExpressionAsset, string> = {
  surprised: "/assets/pet/expressions/surprised.png",
  curious: "/assets/pet/expressions/curious.png",
  blush: "/assets/pet/expressions/blush.png",
  sleepy_soft: "/assets/pet/expressions/sleepy_soft.png",
};

const MOTION_EXPRESSIONS: Partial<Record<PetVisualMotion, ExpressionAsset>> = {
  startle: "surprised",
  noseBoop: "surprised",
  look: "curious",
  peek: "curious",
  edgePeek: "curious",
  headpat: "blush",
  cheekTouch: "blush",
  petted: "blush",
  sleepy: "sleepy_soft",
  moonGreeting: "sleepy_soft",
};

/**
 * Keep expression selection deterministic and separate from motion selection.
 * The returned image replaces only the rendered face/base while the existing
 * motion keyframes, effects, accessories, and state-machine timing stay intact.
 */
export function expressionAssetForMotion(
  motion: PetVisualMotion,
): ExpressionAsset | null {
  return MOTION_EXPRESSIONS[motion] ?? null;
}

export function expressionAssetUrlForMotion(
  motion: PetVisualMotion,
): string | null {
  const expression = expressionAssetForMotion(motion);
  return expression ? EXPRESSION_ASSET_URLS[expression] : null;
}

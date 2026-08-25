import { normalizeAccessoryId } from "../growth/wardrobe";
import type { PeekEdge } from "../platform/edgePeek";
import { petMotions, type PetVisualMotion } from "../pet/animationManifest";
import { PetRig } from "../pet/PetRig";
import type { HeadpatReaction } from "../relationship/reactionEngine";
import type { PetTouchTargetId } from "../pet/touchZones";

const HEADPAT_REACTIONS = new Set<HeadpatReaction>([
  "shy",
  "soft",
  "nuzzle",
  "reunion",
]);
const PEEK_EDGES = new Set<PeekEdge>(["left", "right", "top", "bottom"]);
const TOUCH_TARGETS = new Set<PetTouchTargetId>([
  "left_ear",
  "right_ear",
  "forehead",
  "left_cheek",
  "right_cheek",
  "nose",
  "left_whiskers",
  "right_whiskers",
  "bow",
  "lower_face",
  "face",
  "accessory",
]);

/** 仅开发环境使用的无 Tauri 依赖视觉校准页。 */
export function PetPreview() {
  const params = new URLSearchParams(window.location.search);
  const requestedMotion = params.get("motion") as PetVisualMotion | null;
  const motion =
    requestedMotion && requestedMotion in petMotions ? requestedMotion : "idle";
  const requestedReaction = params.get("reaction") as HeadpatReaction | null;
  const headpatReaction =
    requestedReaction && HEADPAT_REACTIONS.has(requestedReaction)
      ? requestedReaction
      : "soft";
  const requestedEdge = params.get("edge") as PeekEdge | null;
  const edgePeekSide =
    requestedEdge && PEEK_EDGES.has(requestedEdge) ? requestedEdge : null;
  const accessoryId = normalizeAccessoryId(params.get("accessory"));
  const requestedTarget = params.get("target") as PetTouchTargetId | null;
  const touchTarget =
    requestedTarget && TOUCH_TARGETS.has(requestedTarget)
      ? {
          id: requestedTarget,
          ...(requestedTarget === "accessory" && accessoryId
            ? { accessoryId }
            : {}),
        }
      : null;

  return (
    <div className="pet-root pet-preview-root">
      <div className="pet-drag-area">
        <PetRig
          motion={motion}
          zoom={1}
          accessoryId={accessoryId}
          headpatReaction={headpatReaction}
          edgePeekSide={edgePeekSide}
          touchTarget={touchTarget}
          gazeFollow={false}
        />
      </div>
    </div>
  );
}

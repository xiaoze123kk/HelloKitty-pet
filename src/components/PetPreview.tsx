import { useEffect, useState } from "react";
import { normalizeAccessoryId } from "../growth/wardrobe";
import { EffectLayer } from "../effects/EffectLayer";
import type { PeekEdge } from "../platform/edgePeek";
import { petMotions, type PetVisualMotion } from "../pet/animationManifest";
import { accessoryReactionFor } from "../pet/layeredMotion";
import { PetRig } from "../pet/PetRig";
import {
  STILL_DRAG_MOTION,
  STILL_DRAG_RELEASE,
} from "../pet/dragDynamics";
import type { MicroCue } from "../pet/microMotion";
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
const MICRO_CUES = new Set<MicroCue>([
  "none",
  "ear-left",
  "ear-right",
  "nose-wiggle",
  "soft-lean",
]);

/** 仅开发环境使用的无 Tauri 依赖视觉校准页。 */
export function PetPreview() {
  const params = new URLSearchParams(window.location.search);
  const sequence = (params.get("sequence") ?? "")
    .split(",")
    .filter((candidate): candidate is PetVisualMotion => candidate in petMotions);
  const sequenceKey = sequence.join(",");
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const requestedInterval = Number(params.get("interval"));
  const sequenceInterval = Number.isFinite(requestedInterval)
    ? Math.min(2_000, Math.max(80, requestedInterval))
    : 260;
  const requestedMotion = params.get("motion") as PetVisualMotion | null;
  const motion =
    sequence.length > 0
      ? sequence[sequenceIndex % sequence.length]
      : requestedMotion && requestedMotion in petMotions
        ? requestedMotion
        : "idle";
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
  const requestedMicroCue = params.get("microCue") as MicroCue | null;
  const microCueOverride =
    requestedMicroCue && MICRO_CUES.has(requestedMicroCue)
      ? requestedMicroCue
      : undefined;

  useEffect(() => {
    setSequenceIndex(0);
    if (sequence.length <= 1) return;
    const timer = window.setInterval(() => {
      setSequenceIndex((current) => (current + 1) % sequence.length);
    }, sequenceInterval);
    return () => window.clearInterval(timer);
    // sequenceKey is a stable representation of the preview-only motion list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceInterval, sequenceKey]);

  return (
    <div className="pet-root pet-preview-root" data-preview-motion={motion}>
      <EffectLayer
        motion={motion}
        effectEvent={{ revision: 1, anchor: null, target: touchTarget }}
        heartsActive={params.has("hearts")}
        accessoryReaction={accessoryReactionFor(accessoryId, motion)}
      />
      <div className="pet-drag-area">
        <PetRig
          motion={motion}
          zoom={1}
          accessoryId={accessoryId}
          headpatReaction={headpatReaction}
          edgePeekSide={edgePeekSide}
          touchTarget={touchTarget}
          dragMotion={STILL_DRAG_MOTION}
          dragRelease={STILL_DRAG_RELEASE}
          microMotion={params.get("micro") !== "off"}
          microCueOverride={microCueOverride}
          gazeFollow={false}
        />
      </div>
    </div>
  );
}

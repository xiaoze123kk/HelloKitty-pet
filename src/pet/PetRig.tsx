import { useCallback, useEffect, useRef } from "react";
import {
  WARDROBE_ATLAS_URL,
  WARDROBE_CATALOG,
  type AccessoryDefinition,
  type AccessoryId,
} from "../growth/wardrobe";
import type { HeadpatReaction } from "../relationship/reactionEngine";
import type { PetTouchTarget } from "./touchZones";
import type { PeekEdge } from "../platform/edgePeek";
import type { PetVisualMotion } from "./animationManifest";
import { accessoryReactionFor } from "./layeredMotion";
import type { MotionKeyframe } from "./proceduralMotion";
import { ProceduralAnimation } from "./ProceduralAnimation";

interface PetRigProps {
  motion: PetVisualMotion;
  zoom: number;
  accessoryId: AccessoryId | null;
  headpatReaction: HeadpatReaction;
  edgePeekSide: PeekEdge | null;
  touchTarget: PetTouchTarget | null;
  onFinished?: () => void;
  gazeFollow?: boolean;
}

function AccessoryLayer({ item }: { item: AccessoryDefinition }) {
  return (
    <span
      className="pet-accessory-pose pet-rig-follow-pose"
      data-layer={item.layer}
    >
      <span
        className="pet-accessory-overlay"
        style={{
          left: item.placement.x,
          top: item.placement.y,
          width: item.placement.width,
          height: item.placement.height,
          backgroundImage: `url("${WARDROBE_ATLAS_URL}")`,
          backgroundSize: "200% 300%",
          backgroundPosition: `${item.cell.column * 100}% ${item.cell.row * 50}%`,
        }}
      />
    </span>
  );
}

export function PetRig({
  motion,
  zoom,
  accessoryId,
  headpatReaction,
  edgePeekSide,
  touchTarget,
  onFinished,
  gazeFollow = false,
}: PetRigProps) {
  const rigRef = useRef<HTMLDivElement | null>(null);
  const gazeRef = useRef<HTMLDivElement | null>(null);
  const accessory = accessoryId
    ? WARDROBE_CATALOG.find((item) => item.id === accessoryId) ?? null
    : null;
  const accessoryReaction = accessoryReactionFor(accessoryId, motion);

  const mirrorPose = useCallback((pose: MotionKeyframe) => {
    const rig = rigRef.current;
    if (!rig) return;
    const scale = pose.scale ?? 1;
    rig.style.setProperty("--pose-scale-x", String(scale));
    rig.style.setProperty("--pose-scale-y", String(pose.scaleY ?? scale));
    rig.style.setProperty("--pose-angle", `${pose.angle ?? 0}deg`);
    const dy = pose.dy ?? 0;
    rig.style.setProperty("--pose-dy", `${dy}px`);
    rig.style.setProperty("--pose-brightness", String(pose.brightness ?? 1));
    const lift = Math.min(48, Math.max(0, -dy));
    const liftRatio = lift / 48;
    rig.style.setProperty(
      "--shadow-scale-x",
      String(1 - liftRatio * 0.38),
    );
    rig.style.setProperty(
      "--shadow-opacity",
      String(0.18 - liftRatio * 0.11),
    );
    rig.style.setProperty("--shadow-blur", `${4 + liftRatio * 4}px`);
  }, []);

  useEffect(() => {
    const gaze = gazeRef.current;
    if (!gaze) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!gazeFollow || reduced.matches) {
      gaze.style.transform = "";
      return;
    }

    const apply = (event: PointerEvent) => {
      const nx = event.clientX / Math.max(1, window.innerWidth) - 0.5;
      const ny = event.clientY / Math.max(1, window.innerHeight) - 0.5;
      gaze.style.setProperty("--look-x", `${(nx * 3.5).toFixed(1)}px`);
      gaze.style.setProperty("--look-y", `${(ny * 2).toFixed(1)}px`);
      gaze.style.transform = `rotate(${(nx * 5).toFixed(2)}deg) translate(${(nx * 4).toFixed(1)}px, ${(ny * 2).toFixed(1)}px)`;
    };
    const reset = () => {
      gaze.style.transform = "";
      gaze.style.setProperty("--look-x", "0px");
      gaze.style.setProperty("--look-y", "0px");
    };
    window.addEventListener("pointermove", apply);
    window.addEventListener("pointerout", reset);
    return () => {
      window.removeEventListener("pointermove", apply);
      window.removeEventListener("pointerout", reset);
      reset();
    };
  }, [gazeFollow]);

  return (
    <div
      ref={rigRef}
      className="pet-rig"
      data-motion={motion}
      data-headpat-reaction={headpatReaction}
      data-peek-edge={edgePeekSide ?? "none"}
      data-accessory-reaction={accessoryReaction}
      data-touch-target={touchTarget?.id ?? "none"}
    >
      <span className="pet-ground-shadow" aria-hidden="true" />
      <div ref={gazeRef} className="pet-rig-gaze">
        <div className="pet-rig-emotion">
          {accessory?.layer === "behind" && <AccessoryLayer item={accessory} />}

          <ProceduralAnimation
            motion={motion}
            zoom={zoom}
            onFinished={onFinished}
            onPose={mirrorPose}
          />

          <div className="pet-face-dynamics pet-rig-follow-pose" aria-hidden="true">
            <span className="pet-eye-glint pet-eye-glint-left" />
            <span className="pet-eye-glint pet-eye-glint-right" />
            <span className="pet-bow-sheen" />
            <span className="pet-whiskers pet-whiskers-left">
              <i />
              <i />
              <i />
            </span>
            <span className="pet-whiskers pet-whiskers-right">
              <i />
              <i />
              <i />
            </span>
          </div>

          {accessory && accessory.layer !== "behind" && (
            <AccessoryLayer item={accessory} />
          )}
          {motion === "noseBoop" && (
            <span className="pet-touch-nose-ring" aria-hidden="true" />
          )}
          {motion === "cheekTouch" && (
            <span
              className={`pet-touch-cheek pet-touch-${touchTarget?.id ?? "face"}`}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>
  );
}

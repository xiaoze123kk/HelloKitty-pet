import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
import {
  ACCESSORY_SPRING_CONFIG,
  BOW_SHEEN_SPRING_CONFIG,
  createLayerSpringState,
  layerPoseFromKeyframe,
  poseFromLayerSpring,
  stepLayerSpring,
  type LayerPose,
  type LayerSpringState,
} from "./layerSpring";
import { accessoryReactionFor } from "./layeredMotion";
import type { MotionKeyframe } from "./proceduralMotion";
import { ProceduralAnimation } from "./ProceduralAnimation";
import type { DragMotion, DragRelease } from "./dragDynamics";
import {
  microProfileForMotion,
  MICRO_MOTION_OFF,
  scheduleMicroCue,
  type MicroCue,
} from "./microMotion";
import { attachmentPoseFor } from "./attachmentPose";
import { expressionAssetForMotion } from "./expressionAssets";

interface PetRigProps {
  motion: PetVisualMotion;
  zoom: number;
  accessoryId: AccessoryId | null;
  headpatReaction: HeadpatReaction;
  edgePeekSide: PeekEdge | null;
  touchTarget: PetTouchTarget | null;
  dragMotion: DragMotion;
  dragRelease: DragRelease;
  microMotion: boolean;
  microCueOverride?: MicroCue;
  onFinished?: () => void;
  gazeFollow?: boolean;
}

function attachmentStyle(
  motion: PetVisualMotion,
  item: Pick<AccessoryDefinition, "anchor">,
): CSSProperties {
  const pose = attachmentPoseFor(motion, item.anchor);
  return {
    "--attachment-dx": `${pose.dx}px`,
    "--attachment-dy": `${pose.dy}px`,
    "--attachment-scale-x": String(pose.scaleX),
    "--attachment-scale-y": String(pose.scaleY),
    "--attachment-angle": `${pose.angle}deg`,
  } as CSSProperties;
}

function AccessoryLayer({
  item,
  motion,
}: {
  item: AccessoryDefinition;
  motion: PetVisualMotion;
}) {
  const backgroundStyle = item.imageUrl
    ? {
        backgroundImage: `url("${item.imageUrl}")`,
        backgroundSize: "100% 100%",
        backgroundPosition: "center",
      }
    : {
        backgroundImage: `url("${WARDROBE_ATLAS_URL}")`,
        backgroundSize: "200% 300%",
        backgroundPosition: `${(item.cell?.column ?? 0) * 100}% ${(item.cell?.row ?? 0) * 50}%`,
      };
  return (
    <span
      className="pet-accessory-pose pet-layer-accessory-pose"
      data-layer={item.layer}
      data-anchor={item.anchor}
      data-pose-binding={item.poseBinding ?? "spring"}
    >
      <span className="pet-attachment-base" style={attachmentStyle(motion, item)}>
        <span
          className="pet-accessory-overlay"
          style={{
            left: item.placement.x,
            top: item.placement.y,
            width: item.placement.width,
            height: item.placement.height,
            ...backgroundStyle,
          }}
        />
      </span>
    </span>
  );
}

const NEUTRAL_LAYER_POSE: LayerPose = {
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  dy: 0,
};

function applyLayerPose(
  rig: HTMLDivElement,
  layer: "accessory" | "bow",
  pose: LayerPose,
) {
  rig.style.setProperty(`--${layer}-pose-scale-x`, String(pose.scaleX));
  rig.style.setProperty(`--${layer}-pose-scale-y`, String(pose.scaleY));
  rig.style.setProperty(`--${layer}-pose-angle`, `${pose.angle}deg`);
  rig.style.setProperty(`--${layer}-pose-dy`, `${pose.dy}px`);
}

export function PetRig({
  motion,
  zoom,
  accessoryId,
  headpatReaction,
  edgePeekSide,
  touchTarget,
  dragMotion,
  dragRelease,
  microMotion,
  microCueOverride,
  onFinished,
  gazeFollow = false,
}: PetRigProps) {
  const rigRef = useRef<HTMLDivElement | null>(null);
  const gazeRef = useRef<HTMLDivElement | null>(null);
  const [microCue, setMicroCue] = useState<MicroCue>("none");
  const layerTargetRef = useRef<LayerPose>(NEUTRAL_LAYER_POSE);
  const accessorySpringRef = useRef<LayerSpringState>(
    createLayerSpringState(NEUTRAL_LAYER_POSE),
  );
  const bowSpringRef = useRef<LayerSpringState>(
    createLayerSpringState(NEUTRAL_LAYER_POSE),
  );
  const receivedPoseRef = useRef(false);
  const accessory = accessoryId
    ? WARDROBE_CATALOG.find((item) => item.id === accessoryId) ?? null
    : null;
  const accessoryReaction = accessoryReactionFor(accessoryId, motion);
  const expression = expressionAssetForMotion(motion);
  const microProfile = microMotion
    ? microProfileForMotion(motion)
    : MICRO_MOTION_OFF;
  const activeMicroCue = microCueOverride ?? microCue;
  const rigStyle = {
    "--drag-lag-x": `${dragMotion.lagX.toFixed(2)}px`,
    "--drag-lag-y": `${dragMotion.lagY.toFixed(2)}px`,
    "--drag-lean": `${dragMotion.leanDeg.toFixed(2)}deg`,
    "--release-lag-x": `${dragRelease.lagX.toFixed(2)}px`,
    "--release-lag-y": `${dragRelease.lagY.toFixed(2)}px`,
    "--release-lean": `${dragRelease.leanDeg.toFixed(2)}deg`,
    "--release-squash-x": dragRelease.squashX.toFixed(3),
    "--release-squash-y": dragRelease.squashY.toFixed(3),
    "--landing-shadow-scale": dragRelease.shadowScale.toFixed(3),
    "--micro-breath-ms": `${microProfile.breathMs}ms`,
    "--micro-breath-scale-x": microProfile.breathScaleX.toFixed(3),
    "--micro-breath-scale-y": microProfile.breathScaleY.toFixed(3),
    "--micro-breath-lift": `${microProfile.breathLift.toFixed(2)}px`,
  } as CSSProperties;

  useEffect(() => {
    setMicroCue("none");
    if (microCueOverride !== undefined || !microMotion || !microProfile.allowCues) {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timers = new Set<number>();
    let disposed = false;

    const clearTimers = () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    };
    const schedule = () => {
      if (disposed || reduced.matches) return;
      const next = scheduleMicroCue(microProfile);
      if (!next) return;
      const cueTimer = window.setTimeout(() => {
        timers.delete(cueTimer);
        if (disposed || reduced.matches) return;
        setMicroCue(next.cue);
        const clearTimer = window.setTimeout(() => {
          timers.delete(clearTimer);
          setMicroCue("none");
          schedule();
        }, next.durationMs);
        timers.add(clearTimer);
      }, next.delayMs);
      timers.add(cueTimer);
    };
    const onReducedMotionChange = () => {
      clearTimers();
      setMicroCue("none");
      if (!reduced.matches) schedule();
    };

    reduced.addEventListener("change", onReducedMotionChange);
    schedule();
    return () => {
      disposed = true;
      reduced.removeEventListener("change", onReducedMotionChange);
      clearTimers();
    };
  }, [microCueOverride, microMotion, microProfile]);

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
    const layerTarget = layerPoseFromKeyframe(pose);
    layerTargetRef.current = layerTarget;
    if (!receivedPoseRef.current) {
      receivedPoseRef.current = true;
      accessorySpringRef.current = createLayerSpringState(layerTarget);
      bowSpringRef.current = createLayerSpringState(layerTarget);
      applyLayerPose(rig, "accessory", layerTarget);
      applyLayerPose(rig, "bow", layerTarget);
    }
  }, []);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reduced.matches;
    let animationFrame = 0;
    let lastFrame: number | null = null;

    const snapLayers = () => {
      const target = layerTargetRef.current;
      accessorySpringRef.current = createLayerSpringState(target);
      bowSpringRef.current = createLayerSpringState(target);
      applyLayerPose(rig, "accessory", target);
      applyLayerPose(rig, "bow", target);
    };
    const onReducedMotionChange = () => {
      reducedMotion = reduced.matches;
      if (reducedMotion) snapLayers();
    };
    const tick = (now: number) => {
      const elapsed = lastFrame === null ? 0 : now - lastFrame;
      lastFrame = now;
      const target = layerTargetRef.current;
      accessorySpringRef.current = stepLayerSpring(
        accessorySpringRef.current,
        target,
        elapsed,
        ACCESSORY_SPRING_CONFIG,
        reducedMotion,
      );
      bowSpringRef.current = stepLayerSpring(
        bowSpringRef.current,
        target,
        elapsed,
        BOW_SHEEN_SPRING_CONFIG,
        reducedMotion,
      );
      applyLayerPose(
        rig,
        "accessory",
        poseFromLayerSpring(accessorySpringRef.current),
      );
      applyLayerPose(rig, "bow", poseFromLayerSpring(bowSpringRef.current));
      animationFrame = requestAnimationFrame(tick);
    };

    reduced.addEventListener("change", onReducedMotionChange);
    animationFrame = requestAnimationFrame(tick);
    return () => {
      reduced.removeEventListener("change", onReducedMotionChange);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const target = layerTargetRef.current;
    accessorySpringRef.current = createLayerSpringState(target);
    applyLayerPose(rig, "accessory", target);
  }, [accessoryId]);

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
      data-accessory-id={accessoryId ?? "none"}
      data-expression={expression ?? "none"}
      data-touch-target={touchTarget?.id ?? "none"}
      data-micro-active={microProfile.active ? "true" : "false"}
      data-micro-mood={microProfile.id}
      data-micro-cue={activeMicroCue}
      style={rigStyle}
    >
      <span className="pet-ground-shadow" aria-hidden="true" />
      <div ref={gazeRef} className="pet-rig-gaze">
        <div className="pet-rig-drag-response">
          <div className="pet-rig-vital">
            <div className="pet-rig-micro-response">
              <div className="pet-rig-expression-accent">
                <div className="pet-rig-emotion">
                  {accessory?.layer === "behind" && (
                    <AccessoryLayer item={accessory} motion={motion} />
                  )}

                  <ProceduralAnimation
                    motion={motion}
                    zoom={zoom}
                    onFinished={onFinished}
                    onPose={mirrorPose}
                  />

                  <div className="pet-bow-sheen-pose pet-layer-bow-pose" aria-hidden="true">
                    <span className="pet-bow-sheen" />
                  </div>

                  <div className="pet-face-dynamics pet-rig-follow-pose" aria-hidden="true">
                    <span className="pet-eye-glint pet-eye-glint-left" />
                    <span className="pet-eye-glint pet-eye-glint-right" />
                    <span className="pet-micro-ear pet-micro-ear-left" />
                    <span className="pet-micro-ear pet-micro-ear-right" />
                    <span className="pet-micro-nose" />
                  </div>

                  {accessory && accessory.layer !== "behind" && (
                    <AccessoryLayer item={accessory} motion={motion} />
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
          </div>
        </div>
      </div>
    </div>
  );
}

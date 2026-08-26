import { useEffect, useState, type CSSProperties } from "react";
import type { PetVisualMotion } from "../pet/animationManifest";
import type { AccessoryReaction } from "../pet/layeredMotion";
import {
  resolveEffectItems,
  type DoodleEffectItem,
  type PetEffectEvent,
} from "./effectManifest";
import { DoodleGlyph } from "./DoodleGlyph";

interface EffectLayerProps {
  motion: PetVisualMotion;
  effectEvent: PetEffectEvent;
  heartsActive: boolean;
  accessoryReaction: AccessoryReaction;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function itemStyle(item: DoodleEffectItem): CSSProperties {
  return {
    left: item.x,
    top: item.y,
    width: item.size,
    height: item.size,
    rotate: `${item.rotate}deg`,
    "--doodle-delay": `${item.delayMs}ms`,
    "--doodle-duration": `${item.durationMs}ms`,
  } as CSSProperties;
}

export function EffectLayer({
  motion,
  effectEvent,
  heartsActive,
  accessoryReaction,
}: EffectLayerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const resolved = resolveEffectItems(motion, effectEvent);
  const accessorySparkle: DoodleEffectItem[] =
    accessoryReaction === "sparkle" && motion !== "accessoryTouch"
      ? [
          {
            glyph: "spark",
            tone: "gold",
            x: effectEvent.anchor?.x ?? 62,
            y: effectEvent.anchor?.y ?? 54,
            size: 18,
            rotate: -10,
            delayMs: 40,
            durationMs: 620,
            movement: "pop",
          },
        ]
      : [];
  const items = [...resolved, ...accessorySparkle].slice(0, 12);
  const visibleItems = reducedMotion ? items.slice(0, 1) : items;
  const effectKey = `${motion}-${effectEvent.revision}`;

  if (visibleItems.length === 0 && (!heartsActive || reducedMotion)) return null;

  return (
    <div className="doodle-fx-layer" aria-hidden="true" data-effect-key={effectKey}>
      {visibleItems.map((effect, index) => (
        <DoodleGlyph
          key={`${effectKey}-${effect.glyph}-${index}`}
          glyph={effect.glyph}
          className={`doodle-fx doodle-tone-${effect.tone} doodle-move-${effect.movement}${reducedMotion ? " doodle-fx-static" : ""}`}
          style={itemStyle(effect)}
        />
      ))}

      {heartsActive && !reducedMotion && (
        <div className="doodle-hearts">
          <DoodleGlyph glyph="heart" className="doodle-heart doodle-heart-1" />
          <DoodleGlyph glyph="heart" className="doodle-heart doodle-heart-2" />
          <DoodleGlyph glyph="heart" className="doodle-heart doodle-heart-3" />
        </div>
      )}
    </div>
  );
}

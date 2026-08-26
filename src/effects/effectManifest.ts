import type { PetVisualMotion } from "../pet/animationManifest";
import type { PetFramePoint, PetTouchTarget } from "../pet/touchZones";

export type DoodleGlyphId =
  | "spark"
  | "heart"
  | "drop"
  | "anger"
  | "dust"
  | "impact"
  | "question"
  | "note"
  | "moon";

export type DoodleTone =
  | "pink"
  | "gold"
  | "lavender"
  | "sky"
  | "ink"
  | "cream";

export type DoodleMovement = "pop" | "float" | "drift" | "orbit" | "burst";

export interface PetEffectEvent {
  revision: number;
  anchor: PetFramePoint | null;
  target: PetTouchTarget | null;
}

export interface DoodleEffectItem {
  glyph: DoodleGlyphId;
  tone: DoodleTone;
  x: number;
  y: number;
  size: number;
  rotate: number;
  delayMs: number;
  durationMs: number;
  movement: DoodleMovement;
}

interface EffectItemTemplate extends Omit<DoodleEffectItem, "x" | "y"> {
  dx: number;
  dy: number;
}

export interface EffectPreset {
  anchor: PetFramePoint;
  eventAnchored?: boolean;
  items: EffectItemTemplate[];
}

export const MAX_EFFECT_INSTANCES = 12;
export const MAX_EFFECT_LIFETIME_MS = 900;

const item = (
  glyph: DoodleGlyphId,
  tone: DoodleTone,
  dx: number,
  dy: number,
  size: number,
  rotate: number,
  delayMs: number,
  durationMs: number,
  movement: DoodleMovement,
): EffectItemTemplate => ({
  glyph,
  tone,
  dx,
  dy,
  size,
  rotate,
  delayMs,
  durationMs,
  movement,
});

const sparkPair: EffectItemTemplate[] = [
  item("spark", "gold", -18, -18, 22, -12, 0, 520, "pop"),
  item("spark", "pink", 20, -8, 15, 18, 80, 500, "float"),
];

export const EFFECT_MANIFEST: Partial<Record<PetVisualMotion, EffectPreset>> = {
  clicked: {
    anchor: { x: 120, y: 145 },
    eventAnchored: true,
    items: sparkPair,
  },
  wave: {
    anchor: { x: 120, y: 80 },
    items: [
      ...sparkPair,
      item("note", "lavender", 58, 16, 20, 8, 120, 680, "float"),
    ],
  },
  happy: {
    anchor: { x: 120, y: 78 },
    items: [
      ...sparkPair,
      item("note", "lavender", -56, 26, 18, -10, 80, 720, "float"),
      item("note", "pink", 60, 36, 15, 12, 170, 650, "float"),
    ],
  },
  shy: {
    anchor: { x: 176, y: 104 },
    items: [item("drop", "sky", 0, 0, 18, 8, 0, 720, "drift")],
  },
  sneeze: {
    anchor: { x: 120, y: 170 },
    items: [
      item("drop", "sky", -22, 4, 17, -25, 0, 620, "burst"),
      item("drop", "sky", 20, 2, 14, 24, 65, 620, "burst"),
      item("drop", "cream", 0, -16, 11, 2, 120, 560, "burst"),
    ],
  },
  angry: {
    anchor: { x: 120, y: 118 },
    eventAnchored: true,
    items: [
      item("anger", "pink", -24, -24, 27, -8, 0, 640, "pop"),
      item("anger", "ink", 26, -12, 18, 12, 90, 580, "pop"),
    ],
  },
  spin: {
    anchor: { x: 120, y: 84 },
    items: [
      item("spark", "lavender", -50, 0, 18, 0, 0, 820, "orbit"),
      item("spark", "gold", 0, -20, 14, 18, 90, 760, "orbit"),
      item("spark", "pink", 50, 4, 17, -14, 160, 700, "orbit"),
    ],
  },
  dizzy: {
    anchor: { x: 120, y: 76 },
    items: [
      item("spark", "lavender", -38, 0, 16, -8, 0, 850, "orbit"),
      item("spark", "gold", 0, -18, 13, 12, 80, 780, "orbit"),
      item("spark", "pink", 38, 3, 15, 18, 140, 730, "orbit"),
    ],
  },
  landing: {
    anchor: { x: 120, y: 216 },
    items: [
      item("dust", "cream", -48, 0, 34, -6, 0, 700, "burst"),
      item("dust", "cream", 48, 0, 34, 7, 45, 680, "burst"),
    ],
  },
  pounce: {
    anchor: { x: 120, y: 154 },
    items: [
      item("impact", "pink", 0, 0, 42, -4, 0, 650, "burst"),
      item("spark", "gold", -42, -22, 17, -14, 70, 600, "burst"),
      item("spark", "gold", 42, -18, 15, 18, 120, 560, "burst"),
    ],
  },
  tease: {
    anchor: { x: 176, y: 82 },
    items: [item("question", "lavender", 0, 0, 27, 8, 0, 800, "float")],
  },
  yawn: {
    anchor: { x: 150, y: 156 },
    items: [item("dust", "lavender", 0, 0, 25, 6, 0, 820, "drift")],
  },
  wake: {
    anchor: { x: 120, y: 80 },
    items: sparkPair,
  },
  headpat: {
    anchor: { x: 120, y: 108 },
    eventAnchored: true,
    items: [
      item("heart", "pink", -18, -22, 25, -10, 0, 760, "float"),
      item("heart", "gold", 18, -30, 17, 12, 110, 680, "float"),
    ],
  },
  bodypat: {
    anchor: { x: 120, y: 214 },
    eventAnchored: true,
    items: [item("heart", "pink", 0, -18, 22, 5, 0, 720, "float")],
  },
  petted: {
    anchor: { x: 120, y: 110 },
    items: [item("heart", "pink", 0, -20, 23, -6, 0, 760, "float")],
  },
  bowtouch: {
    anchor: { x: 178, y: 58 },
    eventAnchored: true,
    items: sparkPair,
  },
  jump: {
    anchor: { x: 120, y: 214 },
    items: [
      item("dust", "cream", -44, 0, 30, -5, 0, 680, "burst"),
      item("dust", "cream", 44, 0, 30, 6, 35, 660, "burst"),
      item("spark", "gold", 0, -92, 17, 12, 120, 630, "float"),
    ],
  },
  sway: {
    anchor: { x: 120, y: 100 },
    items: [
      item("note", "lavender", -58, 0, 20, -12, 0, 760, "float"),
      item("note", "pink", 58, 18, 17, 14, 120, 680, "float"),
    ],
  },
  startle: {
    anchor: { x: 170, y: 74 },
    items: [item("impact", "pink", 0, 0, 29, 7, 0, 620, "pop")],
  },
  reunion: {
    anchor: { x: 120, y: 94 },
    items: [
      item("heart", "pink", -36, 8, 24, -10, 0, 820, "float"),
      item("heart", "gold", 34, -4, 19, 12, 90, 740, "float"),
      item("spark", "gold", 0, -38, 17, 5, 160, 680, "pop"),
    ],
  },
  celebrate: {
    anchor: { x: 120, y: 92 },
    items: [
      item("spark", "gold", -48, -10, 22, -12, 0, 760, "burst"),
      item("spark", "pink", 48, -18, 20, 18, 70, 720, "burst"),
      item("heart", "pink", 0, -38, 18, 4, 140, 680, "float"),
    ],
  },
  moonGreeting: {
    anchor: { x: 120, y: 88 },
    items: [
      item("moon", "lavender", 45, -18, 34, 8, 0, 850, "drift"),
      item("spark", "gold", 8, -30, 13, -8, 120, 680, "pop"),
    ],
  },
  earTouch: {
    anchor: { x: 70, y: 72 },
    eventAnchored: true,
    items: [item("note", "lavender", 0, -20, 22, -9, 0, 720, "float")],
  },
  cheekTouch: {
    anchor: { x: 82, y: 178 },
    eventAnchored: true,
    items: [item("heart", "pink", 0, -18, 18, -5, 0, 650, "pop")],
  },
  noseBoop: {
    anchor: { x: 120, y: 169 },
    eventAnchored: true,
    items: [item("impact", "gold", 0, 0, 22, 4, 0, 560, "pop")],
  },
  faceTouch: {
    anchor: { x: 120, y: 150 },
    eventAnchored: true,
    items: sparkPair,
  },
  accessoryTouch: {
    anchor: { x: 120, y: 80 },
    eventAnchored: true,
    items: sparkPair,
  },
};

const clampEffectCoordinate = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function resolveEffectItems(
  motion: PetVisualMotion,
  event: PetEffectEvent,
): DoodleEffectItem[] {
  const preset = EFFECT_MANIFEST[motion];
  if (!preset) return [];
  const anchor = preset.eventAnchored && event.anchor ? event.anchor : preset.anchor;

  return preset.items.slice(0, MAX_EFFECT_INSTANCES).map(({ dx, dy, ...template }) => ({
    ...template,
    x: clampEffectCoordinate(anchor.x + dx, 14, 226),
    y: clampEffectCoordinate(anchor.y + dy, 14, 224),
  }));
}

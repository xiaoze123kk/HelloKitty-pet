import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

async function loadTs(relativePath) {
  let source = await fs.readFile(path.join(scriptDir, relativePath), "utf8");
  source = source.replace(/^import type .*;\r?\n/gm, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

const manifest = await loadTs("../src/effects/effectManifest.ts");

const expectedMotions = [
  "clicked",
  "happy",
  "shy",
  "sneeze",
  "angry",
  "spin",
  "landing",
  "pounce",
  "tease",
  "yawn",
  "wake",
  "headpat",
  "bowtouch",
  "jump",
  "sway",
  "startle",
  "dizzy",
  "reunion",
  "celebrate",
  "moonGreeting",
  "earTouch",
  "cheekTouch",
  "noseBoop",
  "faceTouch",
  "accessoryTouch",
];

for (const motion of expectedMotions) {
  assert.ok(manifest.EFFECT_MANIFEST[motion], `${motion} must have a doodle preset`);
}

for (const [motion, preset] of Object.entries(manifest.EFFECT_MANIFEST)) {
  assert.ok(
    preset.items.length <= manifest.MAX_EFFECT_INSTANCES,
    `${motion} exceeds the effect instance cap`,
  );
  for (const effect of preset.items) {
    assert.ok(
      effect.delayMs + effect.durationMs <= manifest.MAX_EFFECT_LIFETIME_MS,
      `${motion}/${effect.glyph} exceeds the 900ms lifetime`,
    );
  }
}

const event = {
  revision: 7,
  anchor: { x: -50, y: 999 },
  target: { id: "face" },
};
const resolved = manifest.resolveEffectItems("clicked", event);
assert.ok(resolved.length > 0);
assert.ok(resolved.every((effect) => effect.x >= 14 && effect.x <= 226));
assert.ok(resolved.every((effect) => effect.y >= 14 && effect.y <= 224));
assert.deepEqual(
  manifest.resolveEffectItems("idle", event),
  [],
  "idle must not leave decorative effect nodes behind",
);
const softLanding = manifest.resolveEffectItems("landing", {
  ...event,
  strength: 0.2,
});
const hardLanding = manifest.resolveEffectItems("landing", {
  ...event,
  strength: 1,
});
assert.ok(hardLanding.length > softLanding.length);
assert.ok(hardLanding[0].size > softLanding[0].size);

const decorativeSources = [
  "../src/effects/DoodleGlyph.tsx",
  "../src/effects/EffectLayer.tsx",
  "../src/pet/PetRig.tsx",
];
const forbiddenGlyphs = /[✨💧💦💢💨💥❓💤💕❗✦✧✴♪♫☾❤]/u;
for (const relativePath of decorativeSources) {
  const source = await fs.readFile(path.join(scriptDir, relativePath), "utf8");
  assert.ok(
    !forbiddenGlyphs.test(source),
    `${relativePath} must not contain platform-rendered decorative glyphs`,
  );
}

console.log("vfx manifest checks passed");

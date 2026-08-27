import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

let source = await fs.readFile(
  new URL("../src/pet/microMotion.ts", import.meta.url),
  "utf8",
);
source = source.replace(/^import type .*;\r?\n/gm, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const micro = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const calm = micro.microProfileForMotion("idle");
const bright = micro.microProfileForMotion("happy");
const sleepy = micro.microProfileForMotion("sleep");
assert.equal(calm.id, "calm");
assert.equal(calm.allowCues, true);
assert.ok(bright.breathScaleY > calm.breathScaleY);
assert.ok(sleepy.breathMs > calm.breathMs);
assert.equal(micro.microProfileForMotion("dragging").active, false);
assert.equal(micro.microProfileForMotion("whiskerTouch").active, false);

const firstCue = micro.scheduleMicroCue(calm, 0, 0);
const lastCue = micro.scheduleMicroCue(calm, 0.999, 0.999);
assert.equal(firstCue.cue, "ear-left");
assert.equal(firstCue.delayMs, calm.minCueDelayMs);
assert.equal(lastCue.cue, "soft-lean");
assert.ok(lastCue.delayMs <= calm.maxCueDelayMs);
assert.equal(micro.scheduleMicroCue(bright, 0, 0), null);

const preferences = await fs.readFile(
  new URL("../src/storage/preferences.ts", import.meta.url),
  "utf8",
);
assert.match(preferences, /microMotion:\s*true/);
assert.match(preferences, /source\.microMotion \?\?/);

const rig = await fs.readFile(new URL("../src/pet/PetRig.tsx", import.meta.url), "utf8");
assert.match(rig, /pet-rig-vital/);
assert.match(rig, /pet-micro-ear-left/);
assert.match(rig, /pet-micro-nose/);

const css = await fs.readFile(new URL("../src/global.css", import.meta.url), "utf8");
assert.match(rig, /data-micro-mood/);
assert.match(css, /data-micro-active/);
assert.match(css, /micro-breathe/);
assert.match(css, /micro-ear-accent/);
assert.match(css, /micro-nose-wiggle/);
assert.doesNotMatch(
  rig,
  /pet-whiskers/,
  "the base animation artwork already contains whiskers; do not add a duplicate overlay",
);
assert.doesNotMatch(
  css,
  /pet-whiskers/,
  "the base animation artwork already contains whiskers; do not animate a duplicate overlay",
);

console.log("micro motion checks passed");

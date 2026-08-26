import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../src/pet/dragDynamics.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const dynamics = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const start = { x: 100, y: 100, at: 1_000 };
const right = dynamics.sampleDragMotion(
  start,
  { x: 148, y: 100, at: 1_016 },
  dynamics.STILL_DRAG_MOTION,
  2,
);
assert.ok(right.vx > 0);
assert.equal(right.directionX, 1);
assert.ok(right.leanDeg < 0, "Kitty should visually lag behind a right drag");
assert.ok(right.lagX < 0);
assert.ok(right.intensity > 0 && right.intensity <= 1);

const down = dynamics.sampleDragMotion(
  { x: 100, y: 100, at: 2_000 },
  { x: 100, y: 132, at: 2_016 },
  dynamics.STILL_DRAG_MOTION,
  1,
);
assert.ok(down.vy > 0);
assert.ok(down.lagY < 0);

const stale = dynamics.sampleDragMotion(
  start,
  { x: 999, y: 999, at: 1_400 },
  right,
  1,
);
assert.deepEqual(stale, right, "background gaps must not create velocity spikes");

const softRelease = dynamics.releaseFromDragMotion(dynamics.STILL_DRAG_MOTION);
const fastRelease = dynamics.releaseFromDragMotion(right);
assert.ok(fastRelease.impact > softRelease.impact);
assert.ok(fastRelease.squashX > softRelease.squashX);
assert.ok(fastRelease.squashY < softRelease.squashY);
assert.ok(fastRelease.shadowScale > softRelease.shadowScale);

for (const sourcePath of [
  "../src/pet/InteractionArea.tsx",
  "../src/app/usePetController.ts",
  "../src/pet/PetRig.tsx",
]) {
  const integration = await fs.readFile(new URL(sourcePath, import.meta.url), "utf8");
  assert.match(integration, /DragMotion|DragRelease/);
}

console.log("drag dynamics checks passed");

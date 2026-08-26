import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../src/pet/layerSpring.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(
  source.replace(/^import type .*;\r?\n/gm, ""),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const spring = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const neutral = { scaleX: 1, scaleY: 1, angle: 0, dy: 0 };
const target = { scaleX: 1.08, scaleY: 0.92, angle: 11, dy: -12 };

let state = spring.createLayerSpringState(neutral);
state = spring.stepLayerSpring(
  state,
  target,
  16.67,
  spring.ACCESSORY_SPRING_CONFIG,
);
let pose = spring.poseFromLayerSpring(state);
assert.ok(
  Math.abs(pose.angle - target.angle) <=
    spring.ACCESSORY_SPRING_CONFIG.maxAngleDelta,
);
assert.ok(
  Math.abs(pose.dy - target.dy) <= spring.ACCESSORY_SPRING_CONFIG.maxDyDelta,
);
assert.ok(
  Math.abs(pose.scaleX - target.scaleX) <=
    spring.ACCESSORY_SPRING_CONFIG.maxScaleDelta + Number.EPSILON,
);

for (let index = 0; index < 240; index += 1) {
  state = spring.stepLayerSpring(
    state,
    target,
    16.67,
    spring.ACCESSORY_SPRING_CONFIG,
  );
}
pose = spring.poseFromLayerSpring(state);
assert.ok(Math.abs(pose.angle - target.angle) < 0.001);
assert.ok(Math.abs(pose.dy - target.dy) < 0.001);
assert.ok(Math.abs(pose.scaleX - target.scaleX) < 0.001);
assert.ok(Math.abs(pose.scaleY - target.scaleY) < 0.001);

const resumed = spring.stepLayerSpring(
  spring.createLayerSpringState(neutral),
  target,
  300,
  spring.ACCESSORY_SPRING_CONFIG,
);
assert.deepEqual(spring.poseFromLayerSpring(resumed), target);

const reduced = spring.stepLayerSpring(
  spring.createLayerSpringState(neutral),
  target,
  16,
  spring.BOW_SHEEN_SPRING_CONFIG,
  true,
);
assert.deepEqual(spring.poseFromLayerSpring(reduced), target);

const cappedFrame = spring.stepLayerSpring(
  spring.createLayerSpringState(neutral),
  { ...neutral, angle: 2 },
  100,
  spring.ACCESSORY_SPRING_CONFIG,
);
const expectedFrame = spring.stepLayerSpring(
  spring.createLayerSpringState(neutral),
  { ...neutral, angle: 2 },
  spring.MAX_SPRING_FRAME_MS,
  spring.ACCESSORY_SPRING_CONFIG,
);
assert.deepEqual(cappedFrame, expectedFrame);

console.log("layer spring checks passed");

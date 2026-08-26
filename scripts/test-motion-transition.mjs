import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../src/pet/motionTransition.ts", import.meta.url),
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
const transition = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const previous = { scale: 1, scaleY: 1, angle: -8, dy: -12, brightness: 0.8 };
const next = { scale: 1.1, scaleY: 0.92, angle: 6, dy: 4, brightness: 1 };

const start = transition.motionTransitionFrame(previous, next, 0);
assert.deepEqual(start.pose, previous);
assert.equal(start.previousAlpha, 1);
assert.equal(start.nextAlpha, 0);
assert.equal(start.done, false);

const middle = transition.motionTransitionFrame(previous, next, 50);
assert.ok(Math.abs(middle.progress - 0.5) < 1e-9);
assert.ok(Math.abs(middle.pose.angle + 1) < 1e-9);
assert.ok(
  Math.abs(middle.previousAlpha + middle.nextAlpha - 1) < 1e-9,
  "crossfade weights must remain normalized to avoid dark overlap",
);
assert.equal(
  transition.MOTION_TRANSITION_BLEND_MODE,
  "lighter",
  "transition layers must use additive premultiplied-alpha blending",
);
assert.equal(middle.done, false);

const end = transition.motionTransitionFrame(previous, next, 100);
assert.deepEqual(end.pose, next);
assert.equal(end.previousAlpha, 0);
assert.equal(end.nextAlpha, 1);
assert.equal(end.done, true);

const spinHandoff = transition.motionTransitionFrame(
  { scale: 1, scaleY: 1, angle: 360, dy: 0 },
  { scale: 1, scaleY: 1, angle: 0, dy: 0 },
  50,
);
assert.ok(
  Math.abs(spinHandoff.pose.angle - 360) < 1e-9,
  "spin-to-idle must treat 360deg and 0deg as the same visual angle",
);

const reduced = transition.motionTransitionFrame(previous, next, 0, true);
assert.deepEqual(reduced.pose, next);
assert.equal(reduced.done, true);

let gate = { runId: 0, finished: true };
gate = transition.beginMotionRun(gate);
const firstCompletion = transition.completeMotionRun(gate, gate.runId);
assert.equal(firstCompletion.shouldNotify, true);
gate = firstCompletion.gate;
assert.equal(
  transition.completeMotionRun(gate, gate.runId).shouldNotify,
  false,
  "the same motion run must notify exactly once",
);
const supersededRunId = gate.runId;
gate = transition.beginMotionRun(gate);
assert.equal(
  transition.completeMotionRun(gate, supersededRunId).shouldNotify,
  false,
  "a superseded run must not finish the current motion",
);

console.log("motion transition checks passed");

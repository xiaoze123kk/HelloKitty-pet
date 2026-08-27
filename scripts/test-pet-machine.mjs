import assert from "node:assert/strict";
import { build } from "esbuild";
import { createActor } from "xstate";

const bundled = await build({
  entryPoints: ["src/pet/petMachine.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const machine = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);

const actor = createActor(machine.petMachine).start();
const click = (at) =>
  actor.send({
    type: "CLICK",
    at,
    target: { id: "nose" },
    point: { x: 120, y: 169 },
  });

click(1_000);
assert.equal(machine.machineStateKey(actor.getSnapshot().value), "noseTouch");
assert.equal(machine.stateToMotion(actor.getSnapshot().value), "noseBoop");
click(1_500);
assert.equal(machine.machineStateKey(actor.getSnapshot().value), "noseAnnoyed");
assert.equal(machine.stateToMotion(actor.getSnapshot().value), "annoyed");
click(1_900);
assert.equal(machine.machineStateKey(actor.getSnapshot().value), "noseSneeze");
assert.equal(machine.stateToMotion(actor.getSnapshot().value), "sneeze");

actor.send({ type: "HOLD_START" });
assert.equal(machine.machineStateKey(actor.getSnapshot().value), "petted");
await new Promise((resolve) => setTimeout(resolve, 1_250));
assert.equal(machine.machineStateKey(actor.getSnapshot().value), "pettedEnjoy");
actor.send({ type: "HOLD_END" });
assert.equal(machine.machineStateKey(actor.getSnapshot().value), "idle");

actor.send({ type: "POINTER_NEAR" });
assert.equal(machine.stateToMotion(actor.getSnapshot().value), "curiousWink");
actor.send({ type: "POINTER_LEAVE" });
assert.equal(machine.stateToMotion(actor.getSnapshot().value), "peek");

actor.send({ type: "BEGIN_NIGHT_COMPANION" });
assert.equal(machine.stateToMotion(actor.getSnapshot().value), "nightCompanion");
actor.send({ type: "POINTER_NEAR" });
assert.equal(machine.stateToMotion(actor.getSnapshot().value), "curiousWink");

actor.send({ type: "PLAY_RITUAL", ritual: "reunion" });
assert.equal(machine.machineStateKey(actor.getSnapshot().value), "ritualReunionSurprise");
await new Promise((resolve) => setTimeout(resolve, 950));
assert.equal(machine.stateToMotion(actor.getSnapshot().value), "happy");

actor.stop();
console.log("pet machine checks passed");

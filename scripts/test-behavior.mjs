import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

async function loadTs(path) {
  const source = await fs.readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const engine = await loadTs("../src/behavior/behaviorEngine.ts");
const needs = await loadTs("../src/behavior/needs.ts");

const relationship = {
  headpatCount: 12,
  headpatRatio: 0.8,
  totalInteractions: 24,
  todayInteractions: 1,
  absenceDays: 0,
  streak: 4,
  daysTogether: 12,
};

const context = {
  now: 100_000,
  hour: 14,
  sessionMinutes: 20,
  pointerIdleSeconds: 120,
  pointerActivity: 0,
  todayInteractions: 1,
  currentState: "idle",
  idleSubState: "still",
  dnd: false,
  settingsOpen: false,
  dialogueOpen: false,
  idleActionsEnabled: true,
  sleepTransitionsEnabled: true,
  walkingEnabled: false,
};

const sleeping = engine.chooseBehavior({
  needs: { energy: 0.05, sleepiness: 1, socialNeed: 0.1, boredom: 0.05, curiosity: 0.1 },
  context: { ...context, hour: 23 },
  relationship,
  cooldowns: {},
  random: () => 0.5,
});
assert.equal(sleeping?.id, "sleep");
assert.deepEqual(sleeping?.steps.map((step) => step.event.type), ["IDLE_YAWN", "BEGIN_SLEEP"]);

const attention = engine.chooseBehavior({
  needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 1, boredom: 0.8, curiosity: 0.5 },
  context,
  relationship,
  cooldowns: {},
  random: () => 0.5,
});
assert.equal(attention?.id, "seek_attention");
assert.deepEqual(attention?.steps.map((step) => step.event.type), ["IDLE_LOOK", "IDLE_PEEK"]);

const cooldownBlocked = engine.chooseBehavior({
  needs: { energy: 0.05, sleepiness: 1, socialNeed: 0.1, boredom: 0.05, curiosity: 0.1 },
  context: { ...context, hour: 23 },
  relationship,
  cooldowns: { sleep: context.now + 10_000 },
  random: () => 0.5,
});
assert.notEqual(cooldownBlocked?.id, "sleep");

const sleepDisabled = engine.chooseBehavior({
  needs: { energy: 0.01, sleepiness: 1, socialNeed: 0, boredom: 0, curiosity: 0 },
  context: { ...context, hour: 23, sleepTransitionsEnabled: false },
  relationship,
  cooldowns: {},
  random: () => 0.5,
});
assert.notEqual(sleepDisabled?.id, "sleep");

const recovered = needs.advanceNeeds(
  { energy: 0, sleepiness: 1, socialNeed: 0.5, boredom: 0.5, curiosity: 0.5 },
  300_000,
  { hour: 2, pointerIdleSeconds: 120, pointerActivity: 0, currentState: "sleeping" },
);
for (const value of Object.values(recovered)) assert.ok(value >= 0 && value <= 1);
assert.ok(recovered.energy > 0);
assert.ok(needs.applyInteraction(recovered).socialNeed < recovered.socialNeed);

console.log("behavior checks passed");

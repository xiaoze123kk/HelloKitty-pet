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

async function loadTsWithImports(path, replacements) {
  const source = await fs.readFile(new URL(path, import.meta.url), "utf8");
  let compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(replacements)) {
    compiled = compiled.replaceAll(`"${specifier}"`, `"${replacement}"`);
  }
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const engine = await loadTs("../src/behavior/behaviorEngine.ts");
const needs = await loadTs("../src/behavior/needs.ts");
const engineSource = await fs.readFile(new URL("../src/behavior/behaviorEngine.ts", import.meta.url), "utf8");
const engineCompiled = ts.transpileModule(engineSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const engineUrl = `data:text/javascript;base64,${Buffer.from(engineCompiled).toString("base64")}`;
const schedulerModule = await loadTsWithImports("../src/behavior/behaviorScheduler.ts", {
  "./behaviorEngine": engineUrl,
});

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

const start = new Date(2026, 7, 20, 8).getTime();
const offline = needs.normalizeBehaviorState(
  {
    needs: { energy: 0.1, sleepiness: 0.9, socialNeed: 0.2, boredom: 0.2, curiosity: 0.2 },
    updatedAt: start,
    recentActions: [{ id: "rest", at: start, date: "2026-08-20" }, { id: "bad" }],
  },
  new Date(2026, 7, 20, 20).getTime(),
);
assert.ok(offline.needs.energy > 0.1, "离线休息应恢复精力");
assert.ok(offline.needs.socialNeed > 0.2, "离线久别应温和增加社交期待");
assert.ok(offline.needs.socialNeed <= 0.85, "离线状态不得制造无上限压力");
assert.equal(offline.recentActions.length, 1, "迁移应丢弃无效行为记录");

for (let index = 0; index < 140; index += 1) {
  needs.recordBehaviorAction(offline, "observe", start + index);
}
assert.equal(offline.recentActions.length, 120, "行为日记应保持固定上限");

const explore = engine.chooseBehavior({
  needs: { energy: 0.9, sleepiness: 0, socialNeed: 0, boredom: 0.1, curiosity: 1 },
  context: { ...context, walkingEnabled: true },
  relationship: { ...relationship, headpatRatio: 0 },
  cooldowns: {},
  random: () => 0.5,
});
assert.equal(explore?.id, "explore");
assert.deepEqual(explore?.steps.map((step) => step.event.type), ["IDLE_LOOK", "WALK_START", "WALK_STOP"]);

const reacts = engine.chooseBehavior({
  needs: { energy: 0.7, sleepiness: 0, socialNeed: 0, boredom: 0, curiosity: 0.1 },
  context: { ...context, pointerActivity: 1 },
  relationship: { ...relationship, headpatRatio: 0, totalInteractions: 0 },
  cooldowns: {},
  random: () => 0.5,
});
assert.equal(reacts?.id, "react_user", "活跃光标应能触发用户动静反应");

const scheduler = new schedulerModule.BehaviorScheduler();
const firstStep = scheduler.tick({
  needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 1, boredom: 0.8, curiosity: 0.5 },
  context,
  relationship,
  stateKey: "idle",
  idleSubState: "still",
});
assert.equal(firstStep?.event.type, "IDLE_LOOK");
assert.equal(scheduler.consumeStartedBehavior(), "seek_attention");
assert.equal(scheduler.consumeStartedBehavior(), null, "开始事件只能消费一次");
assert.equal(scheduler.onAnimationFinished(context.now + 1_000)?.event.type, "IDLE_PEEK");
scheduler.cancel();
assert.equal(scheduler.onAnimationFinished(context.now + 2_000), null);

console.log("behavior checks passed");

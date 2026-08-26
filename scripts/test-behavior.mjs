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

const needs = await loadTs("../src/behavior/needs.ts");
const behaviorContext = await loadTs("../src/context/behaviorContext.ts");
const personalitySource = await fs.readFile(
  new URL("../src/behavior/personality.ts", import.meta.url),
  "utf8",
);
const personalityCompiled = ts.transpileModule(personalitySource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const personalityUrl = `data:text/javascript;base64,${Buffer.from(personalityCompiled).toString("base64")}`;
const personality = await import(personalityUrl);
const engineSource = await fs.readFile(new URL("../src/behavior/behaviorEngine.ts", import.meta.url), "utf8");
let engineCompiled = ts.transpileModule(engineSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
engineCompiled = engineCompiled.replaceAll('"./personality"', `"${personalityUrl}"`);
const engineUrl = `data:text/javascript;base64,${Buffer.from(engineCompiled).toString("base64")}`;
const engine = await import(engineUrl);
const motionHistorySource = await fs.readFile(
  new URL("../src/behavior/motionHistory.ts", import.meta.url),
  "utf8",
);
const motionHistoryCompiled = ts.transpileModule(motionHistorySource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const motionHistoryUrl = `data:text/javascript;base64,${Buffer.from(motionHistoryCompiled).toString("base64")}`;
const motionHistory = await import(motionHistoryUrl);
const expressionSource = await fs.readFile(
  new URL("../src/behavior/expressionDirector.ts", import.meta.url),
  "utf8",
);
let expressionCompiled = ts.transpileModule(expressionSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
expressionCompiled = expressionCompiled.replaceAll('"./motionHistory"', `"${motionHistoryUrl}"`);
const expressionUrl = `data:text/javascript;base64,${Buffer.from(expressionCompiled).toString("base64")}`;
const expression = await import(expressionUrl);
const directorSource = await fs.readFile(
  new URL("../src/behavior/behaviorDirector.ts", import.meta.url),
  "utf8",
);
let directorCompiled = ts.transpileModule(directorSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
directorCompiled = directorCompiled.replaceAll('"./behaviorEngine"', `"${engineUrl}"`);
directorCompiled = directorCompiled.replaceAll('"./expressionDirector"', `"${expressionUrl}"`);
const directorUrl = `data:text/javascript;base64,${Buffer.from(directorCompiled).toString("base64")}`;
const director = await import(directorUrl);
const schedulerModule = await loadTsWithImports("../src/behavior/behaviorScheduler.ts", {
  "./behaviorDirector": directorUrl,
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
  recentBehaviors: [],
  recentMotions: [],
  lastInteraction: null,
  lastTouchTarget: null,
  lastInteractionAt: null,
  interactionStreak: 0,
  secondsSinceInteraction: Number.POSITIVE_INFINITY,
  relationshipStage: "familiar",
  timeBand: "day",
  sessionPhase: "settled",
  recentInteractionPattern: { total: 0, headpatRatio: 0, teaseRatio: 0 },
  microMotionEnabled: true,
  gazeFollowEnabled: true,
  reducedMotion: false,
};

const quietInput = {
  needs: { energy: 0.8, sleepiness: 0.2, socialNeed: 0.2, boredom: 0.2, curiosity: 0.5 },
  context,
};
const quietBefore = structuredClone(quietInput);
const quietPersonality = personality.deriveEffectivePersonality(quietInput);
assert.deepEqual(quietInput, quietBefore, "人格推导不得修改输入或持久状态");
assert.ok(quietPersonality.patience > personality.BASE_PERSONALITY.patience);
assert.ok(quietPersonality.playfulness < personality.BASE_PERSONALITY.playfulness);
const playfulPersonality = personality.deriveEffectivePersonality({
  ...quietInput,
  context: {
    ...context,
    recentInteractionPattern: { total: 12, headpatRatio: 0.25, teaseRatio: 0.75 },
  },
});
assert.ok(playfulPersonality.playfulness > quietPersonality.playfulness);
const sleepyPersonality = personality.deriveEffectivePersonality({
  ...quietInput,
  needs: { ...quietInput.needs, sleepiness: 1 },
});
assert.ok(sleepyPersonality.playfulness < quietPersonality.playfulness);
for (const key of Object.keys(personality.BASE_PERSONALITY)) {
  assert.ok(
    Math.abs(sleepyPersonality[key] - personality.BASE_PERSONALITY[key]) <= 0.150_001,
    `effective ${key} offset must stay bounded`,
  );
}

const freshScores = engine.scoreBehaviors({
  needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 0.2, boredom: 0.2, curiosity: 1 },
  context,
  relationship,
  cooldowns: {},
  random: () => 0.5,
});
const repeatedScores = engine.scoreBehaviors({
  needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 0.2, boredom: 0.2, curiosity: 1 },
  context: {
    ...context,
    recentBehaviors: [{ id: "observe", at: context.now - 1_000, date: "2026-08-20" }],
  },
  relationship,
  cooldowns: {},
  random: () => 0.5,
});
assert.equal(freshScores.observe.novelty, 0.08);
assert.ok(repeatedScores.observe.repetition < 0);
assert.ok(repeatedScores.observe.final < freshScores.observe.final);
const disabledScores = engine.scoreBehaviors({
  needs: { energy: 0, sleepiness: 1, socialNeed: 1, boredom: 1, curiosity: 1 },
  context: { ...context, idleActionsEnabled: false },
  relationship,
  cooldowns: {},
  random: () => 1,
});
for (const score of Object.values(disabledScores)) {
  assert.equal(score.final, 0, "硬门禁关闭时 novelty 和 noise 不得重新启用行为");
}

const sleeping = director.chooseBehaviorPlan({
  needs: { energy: 0.05, sleepiness: 1, socialNeed: 0.1, boredom: 0.05, curiosity: 0.1 },
  context: { ...context, hour: 23 },
  relationship,
  cooldowns: {},
  random: () => 0.5,
});
assert.equal(sleeping?.id, "sleep");
assert.equal(sleeping?.intent.mood, "sleepy");
assert.deepEqual(sleeping?.steps.map((step) => step.event.type), ["IDLE_YAWN", "BEGIN_SLEEP"]);

const attention = director.chooseBehaviorPlan({
  needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 1, boredom: 0.8, curiosity: 0.5 },
  context,
  relationship,
  cooldowns: {},
  random: () => 0.5,
});
assert.equal(attention?.id, "seek_attention");
assert.deepEqual(attention?.steps.map((step) => step.event.type), ["IDLE_LOOK", "EDGE_PEEK"]);
assert.equal(attention?.steps[0]?.gaze, "user");
assert.ok(attention?.steps[0]?.microCue);

const expressiveInput = {
  needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 1, boredom: 0.8, curiosity: 0.5 },
  context,
  relationship,
  cooldowns: {},
  random: () => 0,
};
const expressiveDecision = engine.chooseBehaviorDecision(expressiveInput);
assert.equal(expressiveDecision?.id, "seek_attention");
const directedAttention = director.directBehavior(expressiveDecision, expressiveInput);
const expressiveAttention = expression.resolveExpressionPlan(directedAttention, expressiveInput);
assert.equal(expressiveAttention.steps[0]?.microCue, "ear-left");
assert.equal(expressiveAttention.steps[0]?.gaze, "user");
assert.equal(expressiveAttention.steps[0]?.thought, "偷偷看看你。");
const reducedAttention = expression.resolveExpressionPlan(directedAttention, {
  ...expressiveInput,
  context: { ...context, reducedMotion: true },
});
assert.equal(reducedAttention.steps[0]?.microCue, null);
assert.equal(reducedAttention.steps[0]?.gaze, "neutral");
const dndAttention = expression.resolveExpressionPlan(directedAttention, {
  ...expressiveInput,
  context: { ...context, dnd: true },
});
assert.equal(dndAttention.steps[0]?.thought, null);
const alternateAttention = expression.resolveExpressionPlan(directedAttention, {
  ...expressiveInput,
  random: () => 0.999,
});
assert.notEqual(
  alternateAttention.steps[1]?.event.type,
  expressiveAttention.steps[1]?.event.type,
  "同一 seek_attention intent 应能受控解析为不同现有 motion",
);
assert.equal(expression.behaviorThoughtCooldownReady(100_000, 279_999), false);
assert.equal(expression.behaviorThoughtCooldownReady(100_000, 280_000), true);

const cooldownBlocked = director.chooseBehaviorPlan({
  needs: { energy: 0.05, sleepiness: 1, socialNeed: 0.1, boredom: 0.05, curiosity: 0.1 },
  context: { ...context, hour: 23 },
  relationship,
  cooldowns: { sleep: context.now + 10_000 },
  random: () => 0.5,
});
assert.notEqual(cooldownBlocked?.id, "sleep");

const sleepDisabled = director.chooseBehaviorPlan({
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
    recentMotions: [{ id: "look", at: start, date: "2026-08-20" }, { id: "bad" }],
  },
  new Date(2026, 7, 20, 20).getTime(),
);
assert.ok(offline.needs.energy > 0.1, "离线休息应恢复精力");
assert.ok(offline.needs.socialNeed > 0.2, "离线久别应温和增加社交期待");
assert.ok(offline.needs.socialNeed <= 0.85, "离线状态不得制造无上限压力");
assert.equal(offline.version, 2, "旧行为状态应迁移到 v2");
assert.equal(offline.recentBehaviors.length, 1, "迁移应保留旧 recentActions 并丢弃无效记录");
assert.equal(offline.recentMotions.length, 1, "迁移应丢弃无效动作记录");

for (let index = 0; index < 140; index += 1) {
  needs.recordBehaviorAction(offline, "observe", start + index);
  needs.recordBehaviorMotion(offline, "look", start + index);
}
assert.equal(offline.recentBehaviors.length, 120, "行为日记应保持固定上限");
assert.equal(offline.recentMotions.length, 120, "动作日记应保持固定上限");

assert.equal(behaviorContext.timeBandFor(5), "morning");
assert.equal(behaviorContext.timeBandFor(12), "day");
assert.equal(behaviorContext.timeBandFor(18), "evening");
assert.equal(behaviorContext.timeBandFor(23), "lateNight");
assert.equal(behaviorContext.sessionPhaseFor(3, 0), "justOpened");
assert.equal(behaviorContext.sessionPhaseFor(9, 1), "returning");
assert.equal(behaviorContext.sessionPhaseFor(20, 0), "settled");
assert.equal(behaviorContext.sessionPhaseFor(60, 0), "longSession");
const interaction0 = behaviorContext.emptyInteractionContext();
const interaction1 = behaviorContext.recordInteractionContext(
  interaction0,
  "headpat",
  "left_ear",
  start,
);
const interaction2 = behaviorContext.recordInteractionContext(
  interaction1,
  "headpat",
  "right_ear",
  start + 30_000,
);
const interaction3 = behaviorContext.recordInteractionContext(
  interaction2,
  "tease",
  null,
  start + 60_001,
);
assert.equal(interaction2.interactionStreak, 2, "30 秒内互动应延续 streak");
assert.equal(interaction3.interactionStreak, 1, "超过 30 秒应重置 streak");
assert.equal(behaviorContext.secondsSinceInteraction(interaction3, start + 65_001), 5);

const explore = director.chooseBehaviorPlan({
  needs: { energy: 0.9, sleepiness: 0, socialNeed: 0, boredom: 0.1, curiosity: 1 },
  context: { ...context, walkingEnabled: true },
  relationship: { ...relationship, headpatRatio: 0 },
  cooldowns: {},
  random: () => 0.5,
});
assert.equal(explore?.id, "explore");
assert.deepEqual(explore?.steps.map((step) => step.event.type), ["IDLE_LOOK", "WALK_START", "WALK_STOP"]);

const reacts = director.chooseBehaviorPlan({
  needs: { energy: 0.7, sleepiness: 0, socialNeed: 0, boredom: 0, curiosity: 0.1 },
  context: { ...context, pointerActivity: 1 },
  relationship: { ...relationship, headpatRatio: 0, totalInteractions: 0 },
  cooldowns: {},
  random: () => 0.5,
});
assert.equal(reacts?.id, "react_user", "活跃光标应能触发用户动静反应");
assert.deepEqual(
  reacts?.steps.map((step) => step.event.type),
  ["IDLE_STARTLE", "IDLE_LOOK"],
  "突然的光标活动应形成 startle → look 序列",
);

const scheduler = new schedulerModule.BehaviorScheduler();
const firstStep = scheduler.tick({
  needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 1, boredom: 0.8, curiosity: 0.5 },
  context,
  relationship,
  stateKey: "idle",
  idleSubState: "still",
  random: () => 0.5,
});
assert.equal(firstStep?.event.type, "IDLE_LOOK");
assert.equal(scheduler.consumeStartedBehavior(), "seek_attention");
assert.equal(scheduler.consumeStartedBehavior(), null, "开始事件只能消费一次");
assert.equal(scheduler.onAnimationFinished(context.now + 1_000)?.event.type, "EDGE_PEEK");
scheduler.cancel();
assert.equal(scheduler.onAnimationFinished(context.now + 2_000), null);

const timeoutScheduler = new schedulerModule.BehaviorScheduler();
assert.equal(
  timeoutScheduler.tick({
    needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 1, boredom: 0.8, curiosity: 0.5 },
    context,
    relationship,
    stateKey: "idle",
    idleSubState: "still",
    random: () => 0.5,
  })?.event.type,
  "IDLE_LOOK",
);
assert.equal(
  timeoutScheduler.tick({
    needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 1, boredom: 0.8, curiosity: 0.5 },
    context: { ...context, now: context.now + 5_001 },
    relationship,
    stateKey: "idle",
    idleSubState: "still",
    random: () => 0.5,
  })?.event.type,
  "EDGE_PEEK",
  "等待动画超过 5 秒后应推进下一步",
);

let simulationSeed = 0x12_04_26;
const simulationRandom = () => {
  simulationSeed = (simulationSeed * 1_664_525 + 1_013_904_223) >>> 0;
  return simulationSeed / 0x1_0000_0000;
};
const simulatedBehaviors = [];
const simulatedMotions = [];
for (let index = 0; index < 80; index += 1) {
  const now = context.now + index * 200_000;
  const simulatedContext = {
    ...context,
    now,
    recentBehaviors: simulatedBehaviors.slice(-120),
    recentMotions: simulatedMotions.slice(-120),
  };
  const plan = director.chooseBehaviorPlan({
    needs: {
      energy: 0.72,
      sleepiness: 0.2,
      socialNeed: 0.45,
      boredom: 0.65,
      curiosity: 0.7,
    },
    context: simulatedContext,
    relationship,
    cooldowns: {},
    random: simulationRandom,
  });
  assert.ok(plan, "固定种子模拟应始终找到合格行为");
  assert.notEqual(
    plan.id,
    simulatedBehaviors.at(-1)?.id,
    "固定种子模拟不应连续重复同一高层行为",
  );
  simulatedBehaviors.push({ id: plan.id, at: now, date: "2026-08-26" });
  for (const step of plan.steps) {
    const motion = motionHistory.autonomousMotionForEvent(step.event.type);
    if (!motion) continue;
    assert.notEqual(
      motion,
      simulatedMotions.at(-1)?.id,
      `第 ${index + 1} 轮 ${plan.id} 不应连续派发同一自主 motion`,
    );
    simulatedMotions.push({ id: motion, at: now, date: "2026-08-26" });
  }
}
assert.ok(new Set(simulatedBehaviors.map((entry) => entry.id)).size >= 4);

console.log("behavior checks passed");

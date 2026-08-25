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

const reactions = await loadTs("../src/relationship/reactionEngine.ts");
const edgePeek = await loadTs("../src/platform/edgePeek.ts");
const layered = await loadTs("../src/pet/layeredMotion.ts");

const base = {
  headpatCount: 0,
  headpatRatio: 0,
  totalInteractions: 0,
  todayInteractions: 0,
  absenceDays: 0,
  streak: 1,
  daysTogether: 1,
};
assert.equal(reactions.chooseHeadpatReaction(base), "shy");
assert.equal(
  reactions.chooseHeadpatReaction({ ...base, totalInteractions: 12, daysTogether: 4 }),
  "soft",
);
assert.equal(
  reactions.chooseHeadpatReaction({ ...base, headpatCount: 24, totalInteractions: 45 }),
  "nuzzle",
);
assert.equal(
  reactions.chooseHeadpatReaction({ ...base, absenceDays: 3, totalInteractions: 45 }),
  "reunion",
);

const lateNight = new Date(2026, 7, 26, 23, 30).getTime();
const reunion = reactions.chooseStartupRitual({
  now: lateNight,
  absenceDays: 3,
  consecutiveDays: 3,
  daysTogether: 8,
  shownKeys: [],
});
assert.equal(reunion?.kind, "reunion", "久别仪式必须压过同日连续见面和深夜仪式");
const state = reactions.emptyRitualState();
reactions.markRitualShown(state, reunion);
reactions.markRitualShown(state, reunion);
assert.equal(state.shownKeys.length, 1, "同一个仪式只能记录一次");
const streak = reactions.chooseStartupRitual({
  now: lateNight,
  absenceDays: 0,
  consecutiveDays: 7,
  daysTogether: 8,
  shownKeys: [],
});
assert.equal(streak?.kind, "streak");
const night = reactions.chooseStartupRitual({
  now: lateNight,
  absenceDays: 0,
  consecutiveDays: 8,
  daysTogether: 8,
  shownKeys: [],
});
assert.equal(night?.kind, "late_night");

assert.deepEqual(
  edgePeek.computeEdgePeekPlacement(
    { x: 1620, y: 700, width: 300, height: 320 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    100,
    142,
  ),
  { edge: "right", x: 1778, y: 700 },
);
assert.equal(
  edgePeek.computeEdgePeekPlacement(
    { x: 800, y: 300, width: 300, height: 320 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    100,
    142,
  ),
  null,
  "远离边缘时不应为了探头横穿桌面",
);

assert.equal(layered.accessoryReactionFor("moon_cap", "sleep"), "doze");
assert.equal(layered.accessoryReactionFor("golden_bell", "headpat"), "jingle");
assert.equal(layered.accessoryReactionFor("cloud_clip", "celebrate"), "sparkle");
assert.equal(layered.accessoryReactionFor(null, "celebrate"), "none");
assert.equal(layered.accessoryReactionFor("moon_cap", "accessoryTouch"), "doze");
assert.equal(layered.accessoryReactionFor("golden_bell", "accessoryTouch"), "jingle");
assert.equal(layered.accessoryReactionFor("cloud_clip", "accessoryTouch"), "sparkle");

console.log("reaction checks passed");

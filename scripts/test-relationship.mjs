import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(new URL("../src/relationship/relationshipEngine.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const engine = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const start = new Date(2026, 7, 20, 10).getTime();
const relationship = engine.emptyRelationship(start);
engine.recordEvent(relationship, "session_start", start);
engine.recordEvent(relationship, "headpat", start + 1_000);
assert.equal(relationship.sessionCount, 1);
assert.equal(relationship.totalInteractions, 1);
assert.equal(relationship.byPart.head, 1);
assert.equal(relationship.byType.headpat, 1);

for (let i = 0; i < 120; i += 1) {
  engine.recordEvent(relationship, "tease", start + i + 2_000);
}
assert.equal(relationship.recentEvents.length, 100);
assert.equal(
  engine.computeConsecutiveDays(["2026-08-18", "2026-08-19", "2026-08-20"], "2026-08-20"),
  3,
);
assert.equal(engine.daysTogether(start, new Date(2026, 7, 21, 1).getTime()), 2);

const repaired = engine.normalizeRelationship({ byPart: { head: "bad" }, recentEvents: [{}] }, start);
assert.equal(repaired.byPart.head, 0);
assert.equal(repaired.recentEvents.length, 0);

const migrated = engine.normalizeRelationship(
  {
    version: 1,
    firstSeenAt: start,
    byPart: { head: 12, body: 2, bow: 1 },
    totalInteractions: 52,
    consecutiveDays: 3,
    unlockedMemories: ["first_interaction"],
    recentEvents: [],
  },
  start + 10_000,
);
assert.equal(migrated.version, 2);
assert.equal(migrated.byType.headpat, 12);
assert.ok(migrated.memoryUnlockedAt.first_interaction > 0);
const unlocked = engine.unlockEligibleMemories(migrated, start + 10_000);
assert.ok(unlocked.includes("headpat_10"));
assert.ok(unlocked.includes("streak_3"));
assert.ok(unlocked.includes("interactions_50"));

const progress = {
  relationship: migrated,
  behavior: {
    version: 1,
    needs: { energy: 0.8, sleepiness: 0.1, socialNeed: 0.2, boredom: 0.2, curiosity: 0.5 },
    updatedAt: start,
    recentActions: [{ id: "observe", at: start + 2_000, date: "2026-08-20" }],
  },
};
const snapshot = engine.snapshotRelationship(progress, start + 20_000);
assert.equal(snapshot.memories.length, engine.MEMORY_CATALOG.length);
assert.ok(snapshot.keepsakes.some((item) => item.id === "paw_note"));
assert.ok(snapshot.weekly.lines.some((line) => line.includes("Kitty")));
assert.equal(snapshot.mood.label, "精神很好");
console.log("relationship checks passed");

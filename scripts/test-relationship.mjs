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
console.log("relationship checks passed");


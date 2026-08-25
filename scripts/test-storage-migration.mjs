import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

async function dataUrl(path) {
  const source = await fs.readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}

const memoryUrl = await dataUrl("../src/memory/userMemory.ts");
const relationshipStubUrl = `data:text/javascript;base64,${Buffer.from("export {};").toString("base64")}`;
const reactionSource = await fs.readFile(
  new URL("../src/relationship/reactionEngine.ts", import.meta.url),
  "utf8",
);
let reactionCompiled = ts.transpileModule(reactionSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
reactionCompiled = reactionCompiled.replace(
  '"./relationshipEngine"',
  `"${relationshipStubUrl}"`,
);
const reactionUrl = `data:text/javascript;base64,${Buffer.from(reactionCompiled).toString("base64")}`;
const migrationSource = await fs.readFile(
  new URL("../src/storage/progressMigration.ts", import.meta.url),
  "utf8",
);
let migrationCompiled = ts.transpileModule(migrationSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
migrationCompiled = migrationCompiled.replace(
  '"../memory/userMemory"',
  `"${memoryUrl}"`,
);
migrationCompiled = migrationCompiled.replace(
  '"../relationship/reactionEngine"',
  `"${reactionUrl}"`,
);
const migration = await import(
  `data:text/javascript;base64,${Buffer.from(migrationCompiled).toString("base64")}`
);

assert.deepEqual(migration.migrateProgressV4Fields(undefined), {
  version: 4,
  userMemories: [],
  rituals: { version: 1, shownKeys: [] },
});

const migrated = migration.migrateProgressV4Fields({
  version: 1,
  userMemories: [
    { id: "keep", kind: "important", text: "  只保存在本机。 ", createdAt: 2 },
    { id: "drop", kind: "invented", text: "invalid", createdAt: 1 },
  ],
});
assert.equal(migrated.version, 4);
assert.deepEqual(migrated.userMemories, [
  { id: "keep", kind: "important", text: "只保存在本机。", createdAt: 2 },
]);
assert.deepEqual(migrated.rituals, { version: 1, shownKeys: [] });

const ritualMigration = migration.migrateProgressV4Fields({
  rituals: {
    shownKeys: ["reunion:2026-08-26", "reunion:2026-08-26", 3, "x".repeat(81)],
  },
});
assert.deepEqual(ritualMigration.rituals.shownKeys, ["reunion:2026-08-26"]);

console.log("storage migration checks passed");

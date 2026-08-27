import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../src/pet/featureTriggers.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const features = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const first = 10_000;
assert.equal(features.noseResponseFor([], first), "surprised");
assert.equal(features.noseResponseFor([first], first + 700), "annoyed");
assert.equal(
  features.noseResponseFor([first, first + 700], first + 1_400),
  "sneeze",
);
assert.equal(
  features.noseResponseFor([first], first + features.NOSE_CHAIN_WINDOW_MS + 1),
  "surprised",
);
assert.deepEqual(features.recordNoseTouch([first], first + 700), [first, first + 700]);

const machine = await fs.readFile(
  new URL("../src/pet/petMachine.ts", import.meta.url),
  "utf8",
);
assert.match(machine, /isNoseSneeze/);
assert.match(machine, /noseAnnoyed/);
assert.match(machine, /noseSneeze/);
assert.match(machine, /pettedEnjoy/);
assert.match(machine, /ritualReunionSurprise/);
assert.match(machine, /nightCompanion/);

const css = await fs.readFile(
  new URL("../src/global.css", import.meta.url),
  "utf8",
);
assert.match(css, /expression-annoyed-frown/);

console.log("pet feature checks passed");

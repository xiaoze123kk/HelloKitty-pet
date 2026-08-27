import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

let source = await fs.readFile(
  new URL("../src/pet/expressionAssets.ts", import.meta.url),
  "utf8",
);
source = source.replace(/^import type .*;\r?\n/gm, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const expressions = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const expected = {
  startle: "surprised",
  noseBoop: "surprised",
  look: "curious",
  peek: "curious",
  edgePeek: "curious",
  headpat: "blush",
  cheekTouch: "blush",
  petted: "blush",
  sleepy: "sleepy_soft",
  moonGreeting: "sleepy_soft",
};

for (const [motion, expression] of Object.entries(expected)) {
  assert.equal(expressions.expressionAssetForMotion(motion), expression);
  assert.equal(
    expressions.expressionAssetUrlForMotion(motion),
    `/assets/pet/expressions/${expression}.png`,
  );
}
for (const motion of ["idle", "sleep", "angry", "whiskerTouch", "celebrate"]) {
  assert.equal(expressions.expressionAssetForMotion(motion), null);
}

const publicRoot = path.resolve("public");
for (const url of Object.values(expressions.EXPRESSION_ASSET_URLS)) {
  const file = await fs.readFile(path.join(publicRoot, url.replace(/^\//, "")));
  assert.equal(file.subarray(1, 4).toString(), "PNG", `${url} must be a PNG`);
  assert.equal(file.readUInt32BE(16), 1200, `${url} width must be 1200`);
  assert.equal(file.readUInt32BE(20), 1200, `${url} height must be 1200`);
  assert.equal(file[25], 6, `${url} must use RGBA color type`);
}

const renderer = await fs.readFile(
  new URL("../src/pet/ProceduralAnimation.tsx", import.meta.url),
  "utf8",
);
assert.match(renderer, /expressionAssetUrlForMotion\(motion\)/);
assert.match(renderer, /spec\.blink && !usingExpressionOverride/);

console.log("expression asset checks passed");

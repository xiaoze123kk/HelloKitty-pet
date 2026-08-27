import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const source = await fs.readFile(
  new URL("../src/pet/touchZones.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const zones = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const wardrobeSource = await fs.readFile(
  new URL("../src/growth/wardrobe.ts", import.meta.url),
  "utf8",
);
const wardrobeCompiled = ts.transpileModule(wardrobeSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const wardrobe = await import(
  `data:text/javascript;base64,${Buffer.from(wardrobeCompiled).toString("base64")}`
);

const target = (x, y, accessory = null) =>
  zones.classifyTouchTarget(x, y, accessory).id;

assert.equal(target(40, 55), "left_ear");
assert.equal(target(205, 48), "bow", "右耳上方被实际蝴蝶结覆盖时应优先命中蝴蝶结");
assert.equal(target(92, 117), "forehead");
assert.equal(target(75, 183), "left_cheek");
assert.equal(target(166, 183), "right_cheek");
assert.equal(target(120, 169), "nose");
assert.equal(target(25, 165), "left_whiskers");
assert.equal(target(215, 165), "right_whiskers");
assert.equal(target(116, 152), "face");
assert.equal(target(118, 224), "lower_face");

const cloud = { id: "cloud_clip", x: 27, y: 28, width: 74, height: 54 };
assert.deepEqual(zones.classifyTouchTarget(55, 50, cloud), {
  id: "accessory",
  accessoryId: "cloud_clip",
});
assert.equal(
  target(102, 50, cloud),
  "left_ear",
  "配饰透明命中框外仍应落回耳朵",
);

for (const item of wardrobe.WARDROBE_CATALOG) {
  const region = {
    id: item.id,
    ...item.hitArea,
    extraAreas: item.extraHitAreas,
  };
  for (const area of [item.hitArea, ...(item.extraHitAreas ?? [])]) {
    const center = {
      x: area.x + area.width / 2,
      y: area.y + area.height / 2,
    };
    assert.deepEqual(
      zones.classifyTouchTarget(center.x, center.y, region),
      { id: "accessory", accessoryId: item.id },
      `${item.id} must have clickable visible hit regions`,
    );
  }
}

assert.equal(zones.classifyTouchPart(92, 117), "head");
assert.equal(zones.classifyTouchPart(205, 48), "bow");
assert.equal(zones.classifyTouchPart(118, 224), "body");

assert.deepEqual(zones.clampPetFramePoint({ x: -12, y: 280 }), {
  x: 0,
  y: 240,
});
assert.deepEqual(zones.clampPetFramePoint({ x: Number.NaN, y: 80 }), {
  x: 0,
  y: 80,
});

console.log("touch zone checks passed");

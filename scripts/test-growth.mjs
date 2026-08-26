import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

async function loadTs(path) {
  const source = await fs.readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

const wardrobe = await loadTs("../src/growth/wardrobe.ts");
const memory = await loadTs("../src/memory/userMemory.ts");
const attachment = await loadTs("../src/pet/attachmentPose.ts");
const globalCss = await fs.readFile(new URL("../src/global.css", import.meta.url), "utf8");
const platformWindowSource = await fs.readFile(
  new URL("../src/platform/window.ts", import.meta.url),
  "utf8",
);
const tauriConfig = JSON.parse(
  await fs.readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const rootHeight = Number(
  globalCss.match(/\.pet-root\s*\{[^}]*height:\s*(\d+)px/s)?.[1],
);
const dragAreaTop = Number(
  globalCss.match(/\.pet-drag-area\s*\{[^}]*top:\s*(\d+)px/s)?.[1],
);
const runtimeWindowHeight = Number(
  platformWindowSource.match(/WINDOW_CSS_HEIGHT\s*=\s*(\d+)/)?.[1],
);
const configuredWindowHeight = Number(tauriConfig.app.windows[0].height);

assert.ok(Number.isFinite(rootHeight) && Number.isFinite(dragAreaTop));
assert.equal(rootHeight, runtimeWindowHeight, "CSS and runtime window heights must match");
assert.equal(
  rootHeight,
  configuredWindowHeight,
  "CSS and Tauri window heights must match",
);

assert.equal(wardrobe.WARDROBE_CATALOG.length, 6);
assert.equal(
  new Set(wardrobe.WARDROBE_CATALOG.map((item) => item.id)).size,
  wardrobe.WARDROBE_CATALOG.length,
  "wardrobe ids must be unique",
);
assert.ok(
  wardrobe.WARDROBE_CATALOG.every((item) => item.unlockMemoryId),
  "every accessory must have a relationship unlock",
);
for (const item of wardrobe.WARDROBE_CATALOG) {
  assert.ok(
    item.hitArea.x >= item.placement.x &&
      item.hitArea.y >= item.placement.y &&
      item.hitArea.x + item.hitArea.width <=
        item.placement.x + item.placement.width &&
      item.hitArea.y + item.hitArea.height <=
        item.placement.y + item.placement.height,
    `${item.id} hit area must stay inside its visible placement`,
  );
  if (item.anchor === "chin") {
    assert.equal(
      item.placement.x + item.placement.width / 2,
      120,
      `${item.id} must hang from the center of the big-head canvas`,
    );
    assert.ok(
      item.placement.y >= 188,
      `${item.id} must attach directly below the chin`,
    );
    assert.ok(
      dragAreaTop + item.placement.y + item.placement.height + 10 <= rootHeight,
      `${item.id} must retain at least 10px of motion clearance below the window edge`,
    );
  } else {
    assert.ok(
      item.placement.y + item.placement.height <= 140,
      `${item.id} must remain on the head instead of drifting toward the body`,
    );
  }
}
assert.equal(
  wardrobe.wardrobeSnapshot([], "golden_bell").selectedId,
  null,
  "locked selection must be cleared",
);
assert.equal(
  wardrobe.wardrobeSnapshot(["interactions_100"], "golden_bell").selectedId,
  "golden_bell",
);

const neutralAttachment = attachment.attachmentPoseFor("idle", "chin");
assert.deepEqual(neutralAttachment, attachment.NEUTRAL_ATTACHMENT_POSE);
for (const motion of ["sleep", "fallAsleep", "wake"]) {
  const pose = attachment.attachmentPoseFor(motion, "chin");
  assert.ok(pose.angle >= 8 && pose.angle <= 10, `${motion} must follow the tilted sleep base`);
  assert.equal(pose.scaleX, 1);
  assert.equal(pose.scaleY, 1);
}
const draggedCrown = attachment.attachmentPoseFor("dragging", "crown");
const draggedChin = attachment.attachmentPoseFor("dragging", "chin");
assert.ok(draggedCrown.scaleX < 0.7, "dragging accessories must match the smaller full-body head");
assert.equal(draggedCrown.scaleX, draggedCrown.scaleY);
assert.ok(draggedChin.dy < draggedCrown.dy, "dragging chin accessories must stay on the neck line");

const created = memory.createUserMemory(
  "important",
  "  明天   带上礼物。  ",
  123,
);
assert.equal(created.text, "明天 带上礼物。");
assert.equal(created.createdAt, 123);
assert.throws(() => memory.createUserMemory("moment", "   "));

const raw = Array.from({ length: 24 }, (_, index) => ({
  id: `memory-${index}`,
  kind: index % 2 === 0 ? "moment" : "preference",
  text: `第 ${index} 条`,
  createdAt: index,
}));
raw.push({ id: "broken", kind: "unknown", text: "bad", createdAt: 99 });
const normalized = memory.normalizeUserMemories(raw);
assert.equal(normalized.length, memory.MAX_USER_MEMORIES);
assert.equal(normalized[0].createdAt, 23);
assert.ok(!normalized.some((item) => item.id === "broken"));

console.log("growth checks passed");

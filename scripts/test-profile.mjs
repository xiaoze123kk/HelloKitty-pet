import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

let source = await fs.readFile(
  new URL("../src/dialogue/profileData.ts", import.meta.url),
  "utf8",
);
source = source.replace(/^import type .*;\r?\n/gm, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const profileData = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const normalized = profileData.normalizeProfile({
  nickname: "  小ze  ",
  yourNickname: "  Kitty  ",
  specialDates: [
    { id: "first_meet", month: 8, day: 12, label: " 第一次见面 " },
    { id: "bad", month: 0, day: 99, label: "无效" },
  ],
});
assert.deepEqual(normalized, {
  nickname: "小ze",
  yourNickname: "Kitty",
  specialDates: [
    { id: "first_meet", month: 8, day: 12, label: "第一次见面" },
  ],
});

const fallback = [{ id: "birthday", month: 11, day: 1, label: "生日" }];
assert.deepEqual(
  profileData.normalizeProfile({ nickname: "" }, fallback),
  { nickname: "你", yourNickname: "我", specialDates: fallback },
);

const engineSource = await fs.readFile(
  new URL("../src/dialogue/dialogueEngine.ts", import.meta.url),
  "utf8",
);
assert.match(engineSource, /private profile: ProfileData = PROFILE/);
assert.match(engineSource, /setProfile\(profile: ProfileData\)/);
assert.match(engineSource, /specialDateForToday\(now, this\.profile\)/);
assert.match(engineSource, /renderTemplate\(chosen\.text, \{[\s\S]*?\}, this\.profile\)/);

const preferencesSource = await fs.readFile(
  new URL("../src/storage/preferences.ts", import.meta.url),
  "utf8",
);
assert.match(preferencesSource, /setupCompleted: boolean/);
assert.match(preferencesSource, /identity: normalizeIdentity\(raw\?\.identity\)/);

console.log("profile checks passed");

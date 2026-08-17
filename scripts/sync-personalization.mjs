import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 把 personalization.example/ 复制为 personalization/（只补缺，绝不覆盖用户真实内容）
// 真实 personalization/ 已加入 .gitignore，属于只留本机的私人数据。
const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const source = join(root, "personalization.example");
const target = join(root, "personalization");

if (!existsSync(target)) {
  mkdirSync(target, { recursive: true });
}

cpSync(source, target, {
  recursive: true,
  force: false,
  errorOnExist: false,
});

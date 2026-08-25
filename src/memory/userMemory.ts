export const MAX_USER_MEMORIES = 20;
export const MAX_USER_MEMORY_LENGTH = 120;

export type UserMemoryKind = "moment" | "preference" | "important";

export interface UserMemory {
  id: string;
  kind: UserMemoryKind;
  text: string;
  createdAt: number;
}
const MEMORY_KINDS = new Set<UserMemoryKind>([
  "moment",
  "preference",
  "important",
]);

export const USER_MEMORY_KIND_LABELS: Record<UserMemoryKind, string> = {
  moment: "今天的事",
  preference: "最近喜欢",
  important: "重要的事",
};

export function sanitizeUserMemoryText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_USER_MEMORY_LENGTH);
}

function isUserMemoryKind(value: unknown): value is UserMemoryKind {
  return typeof value === "string" && MEMORY_KINDS.has(value as UserMemoryKind);
}

export function normalizeUserMemories(value: unknown): UserMemory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: UserMemory[] = [];
  for (const raw of value) {
    const item = raw as Partial<UserMemory>;
    const text = sanitizeUserMemoryText(item.text);
    if (
      !text ||
      typeof item.id !== "string" ||
      seen.has(item.id) ||
      !isUserMemoryKind(item.kind) ||
      typeof item.createdAt !== "number" ||
      !Number.isFinite(item.createdAt)
    ) {
      continue;
    }
    seen.add(item.id);
    normalized.push({
      id: item.id,
      kind: item.kind,
      text,
      createdAt: item.createdAt,
    });
  }
  return normalized
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_USER_MEMORIES);
}

export function createUserMemory(
  kind: UserMemoryKind,
  text: string,
  now = Date.now(),
): UserMemory {
  const safeText = sanitizeUserMemoryText(text);
  if (!safeText) throw new Error("写下一件想让 Kitty 记住的事。");
  if (!isUserMemoryKind(kind)) throw new Error("请选择记忆类型。");
  return {
    id: `user-memory-${now}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    text: safeText,
    createdAt: now,
  };
}

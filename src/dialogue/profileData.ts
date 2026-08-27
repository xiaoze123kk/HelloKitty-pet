import type { ProfileData, SpecialDate } from "./types";

const MAX_NICKNAME_LENGTH = 24;
const MAX_DATE_LABEL_LENGTH = 32;

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim().slice(0, maxLength);
  return text || fallback;
}

export function normalizeSpecialDates(
  raw: unknown,
  fallback: readonly SpecialDate[] = [],
): SpecialDate[] {
  if (!Array.isArray(raw)) return fallback.map((item) => ({ ...item }));
  return raw
    .map((item) => item as Partial<SpecialDate>)
    .filter(
      (item): item is SpecialDate =>
        typeof item.id === "string" &&
        item.id.trim().length > 0 &&
        typeof item.month === "number" &&
        Number.isInteger(item.month) &&
        item.month >= 1 &&
        item.month <= 12 &&
        typeof item.day === "number" &&
        Number.isInteger(item.day) &&
        item.day >= 1 &&
        item.day <= 31 &&
        typeof item.label === "string" &&
        item.label.trim().length > 0,
    )
    .map((item) => ({
      id: item.id.trim().slice(0, 64),
      month: item.month,
      day: item.day,
      label: item.label.trim().slice(0, MAX_DATE_LABEL_LENGTH),
    }));
}

export function normalizeProfile(
  raw: unknown,
  fallbackDates: readonly SpecialDate[] = [],
): ProfileData {
  const profile = (raw ?? {}) as Partial<ProfileData>;
  return {
    nickname: cleanText(profile.nickname, "你", MAX_NICKNAME_LENGTH),
    yourNickname: cleanText(
      profile.yourNickname,
      "我",
      MAX_NICKNAME_LENGTH,
    ),
    specialDates: normalizeSpecialDates(profile.specialDates, fallbackDates),
  };
}

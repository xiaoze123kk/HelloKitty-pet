import profileJson from "../../personalization/profile.json";
import datesJson from "../../personalization/dates.json";
import type { ProfileData, SpecialDate } from "./types";

function normalizeProfile(raw: unknown): ProfileData {
  const profile = (raw ?? {}) as Partial<ProfileData>;
  const rawDates = (datesJson as { specialDates?: unknown }).specialDates;
  const specialDates: SpecialDate[] = Array.isArray(rawDates)
    ? rawDates
        .map((item) => item as Partial<SpecialDate>)
        .filter(
          (item): item is SpecialDate =>
            typeof item.id === "string" &&
            typeof item.month === "number" &&
            item.month >= 1 &&
            item.month <= 12 &&
            typeof item.day === "number" &&
            item.day >= 1 &&
            item.day <= 31 &&
            typeof item.label === "string",
        )
    : [];

  return {
    nickname: typeof profile.nickname === "string" ? profile.nickname : "你",
    yourNickname:
      typeof profile.yourNickname === "string" ? profile.yourNickname : "我",
    specialDates,
  };
}

export const PROFILE: ProfileData = normalizeProfile(profileJson);

export function specialDateForToday(
  now: Date,
): SpecialDate | undefined {
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return PROFILE.specialDates.find(
    (d) => d.month === month && d.day === day,
  );
}

export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY));
}

export function renderTemplate(
  text: string,
  ctx: {
    now: Date;
    installedAt: Date;
    specialDateLabel?: string;
    absenceDays?: number;
    headpatCount?: number;
    streak?: number;
  },
): string {
  return text
    .replaceAll("{{nickname}}", PROFILE.nickname)
    .replaceAll("{{yourNickname}}", PROFILE.yourNickname)
    .replaceAll(
      "{{daysTogether}}",
      String(daysBetween(ctx.installedAt, ctx.now) + 1),
    )
    .replaceAll("{{absenceDays}}", String(ctx.absenceDays ?? 0))
    .replaceAll("{{headpatCount}}", String(ctx.headpatCount ?? 0))
    .replaceAll("{{streak}}", String(ctx.streak ?? 0))
    .replaceAll("{{specialDateName}}", ctx.specialDateLabel ?? "");
}

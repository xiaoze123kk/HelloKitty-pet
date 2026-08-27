import profileJson from "../../personalization/profile.json";
import datesJson from "../../personalization/dates.json";
import type { ProfileData, SpecialDate } from "./types";
import { normalizeProfile, normalizeSpecialDates } from "./profileData";

const DEFAULT_SPECIAL_DATES = normalizeSpecialDates(
  (datesJson as { specialDates?: unknown }).specialDates,
);

export { normalizeProfile, normalizeSpecialDates } from "./profileData";

export const PROFILE: ProfileData = normalizeProfile(
  { ...profileJson, specialDates: DEFAULT_SPECIAL_DATES },
  DEFAULT_SPECIAL_DATES,
);

export function specialDateForToday(
  now: Date,
  profile: ProfileData = PROFILE,
): SpecialDate | undefined {
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return profile.specialDates.find(
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
  profile: ProfileData = PROFILE,
): string {
  return text
    .replaceAll("{{nickname}}", profile.nickname)
    .replaceAll("{{yourNickname}}", profile.yourNickname)
    .replaceAll(
      "{{daysTogether}}",
      String(daysBetween(ctx.installedAt, ctx.now) + 1),
    )
    .replaceAll("{{absenceDays}}", String(ctx.absenceDays ?? 0))
    .replaceAll("{{headpatCount}}", String(ctx.headpatCount ?? 0))
    .replaceAll("{{streak}}", String(ctx.streak ?? 0))
    .replaceAll("{{specialDateName}}", ctx.specialDateLabel ?? "");
}

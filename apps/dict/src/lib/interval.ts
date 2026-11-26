import type { TFunction } from "i18next";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A span of seconds as the label of a grade button: 10m, 5h, 3d, 2mo, 1y (the unit comes from `review.unit.*`). */
export function formatInterval(seconds: number, t: TFunction): string {
  const s = Math.max(0, seconds);
  if (s < HOUR)
    return t("review.unit.m", { n: Math.max(1, Math.round(s / MINUTE)) });
  if (s < DAY) return t("review.unit.h", { n: Math.round(s / HOUR) });
  const days = Math.round(s / DAY);
  if (days < 30) return t("review.unit.d", { n: days });
  if (days < 365) return t("review.unit.mo", { n: Math.round(days / 30) });
  return t("review.unit.y", { n: Math.round(days / 365) });
}

/** The counts of the review queue of Dict, as the portal shows them. */
export interface ReviewSummary {
  newCount: number;
  learningCount: number;
  dueCount: number;
  /** Saved words. */
  totalCount: number;
  /** RFC 3339; absent when nothing is waiting. */
  nextDueAt?: string;
  /** New words and review cards kept back by today's limits. */
  newHeld: number;
  dueHeld: number;
  /** A count reached the ceiling of the service. */
  countsCapped: boolean;
}

/** The ceiling of a count in the service; a capped count shows as `10000+`. */
export const COUNT_CAP = 10000;

/** Reads GetReviewQueue as protojson writes it (zero counts are missing, int64 are strings), without the cards. */
export function parseReviewSummary(raw: Record<string, unknown> | null | undefined): ReviewSummary {
  const r = raw ?? {};
  const n = (v: unknown): number => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  return {
    newCount: n(r.newCount),
    learningCount: n(r.learningCount),
    dueCount: n(r.dueCount),
    totalCount: n(r.totalCount),
    nextDueAt: typeof r.nextDueAt === "string" && r.nextDueAt ? r.nextDueAt : undefined,
    newHeld: n(r.newHeld),
    dueHeld: n(r.dueHeld),
    countsCapped: r.countsCapped === true,
  };
}

/** A count for display: `10000+` when the service stopped counting. */
export function formatCount(n: number, capped: boolean): string {
  return capped && n >= COUNT_CAP ? `${COUNT_CAP}+` : String(n);
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A span of seconds as a unit and a number: minutes below an hour, then hours, days, months, years. */
export function splitInterval(seconds: number): { unit: "m" | "h" | "d" | "mo" | "y"; n: number } {
  const s = Math.max(0, seconds);
  if (s < HOUR) return { unit: "m", n: Math.max(1, Math.round(s / MINUTE)) };
  if (s < DAY) return { unit: "h", n: Math.round(s / HOUR) };
  const days = Math.round(s / DAY);
  if (days < 30) return { unit: "d", n: days };
  if (days < 365) return { unit: "mo", n: Math.round(days / 30) };
  return { unit: "y", n: Math.round(days / 365) };
}

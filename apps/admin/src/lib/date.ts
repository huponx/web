/** A time of the API (Unix seconds, as a number or the string of an int64) as a Date; undefined for "never" (0). */
export function fromUnix(seconds: string | number | undefined): Date | undefined {
  const n = Number(seconds ?? 0);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : undefined;
}

export function formatDate(seconds: string | number | undefined, locale: string): string | undefined {
  return fromUnix(seconds)?.toLocaleDateString(locale, { dateStyle: "medium" });
}

export function formatDateTime(seconds: string | number | undefined, locale: string): string | undefined {
  return fromUnix(seconds)?.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

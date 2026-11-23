/** Values are plain strings, like the value of <input type="date|time|datetime-local">: no time zone, easy to put in a form or a request. */

export const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of a local date. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A local date from "YYYY-MM-DD"; null for anything else (also for a day that does not exist, like 2026-02-31). */
export function parseDate(s: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toDateStr(d) === s ? d : null;
}

export interface Clock {
  h: number;
  m: number;
}

/** Hours and minutes from "HH:mm"; null for anything else. */
export function parseTime(s: string | undefined): Clock | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? { h, m: min } : null;
}

export const toTimeStr = (t: Clock) => `${pad(t.h)}:${pad(t.m)}`;

/** "YYYY-MM-DDTHH:mm" -> the two parts (either is "" when missing or invalid). */
export function splitDateTime(s: string | undefined): { date: string; time: string } {
  const [d = "", t = ""] = (s ?? "").split("T");
  return { date: parseDate(d) ? d : "", time: parseTime(t) ? t : "" };
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function today(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function formatDate(s: string, locale?: string): string {
  const d = parseDate(s);
  return d ? d.toLocaleDateString(locale, { dateStyle: "medium" }) : "";
}

/** Nearest time on the minute grid, never past 23:59. */
export function roundTime(d: Date, step: number): Clock {
  const total = Math.min(23 * 60 + 60 - step, Math.round((d.getHours() * 60 + d.getMinutes()) / step) * step);
  return { h: Math.floor(total / 60), m: total % 60 };
}

// Date helpers on ISO yyyy-mm-dd strings, always in UTC so results never depend on the viewer's timezone.

const DAY = 86_400_000;

export function toDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * DAY));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}

/** The Sunday that ends the week containing `iso` (weeks run Monday–Sunday). */
export function weekEnding(iso: string): string {
  const d = toDate(iso);
  const dow = d.getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? 0 : 7 - dow);
}

/** ISO-8601 week number. */
export function isoWeek(iso: string): number {
  const d = toDate(iso);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
}

/** Monday of ISO week `week` in `year`, returned as the week-ending Sunday. */
export function isoWeekToWeekEnding(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (day - 1) * DAY + (week - 1) * 7 * DAY);
  return addDays(toIso(monday), 6);
}

export function monthOf(iso: string): number {
  return toDate(iso).getUTCMonth() + 1;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthName(month: number): string {
  return MONTHS[month - 1];
}

/**
 * Accepts the date shapes SAP and Zoho exports commonly produce and returns yyyy-mm-dd, or null.
 * Supported: 2026-10-18, 2026/10/18, 18/10/2026, 18-10-2026, 18.10.2026, 18-Oct-2026, 2026-W42 (→ week-ending Sunday).
 */
export function standardiseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-W(\d{1,2})$/i);
  if (m) return isoWeekToWeekEnding(+m[1], +m[2]);
  m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  m = v.match(/^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{4})$/);
  if (m) {
    const idx = MONTHS.findIndex((n) => n.slice(0, 3).toLowerCase() === m![2].toLowerCase());
    if (idx >= 0) return valid(+m[3], idx + 1, +m[1]);
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return toIso(dt);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return toDate(iso).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });
}

/**
 * Week bucketing for weekly-bar rollups. A "week" runs Monday–Friday;
 * bars are keyed on week_end = the Friday of that week (even if Friday
 * was a holiday, the key stays Friday and week_start/week_end in the DB
 * record the actual trading days rolled up).
 */

/** Friday (ISO yyyy-mm-dd) of the Mon–Fri week containing the given date. */
export function weekEndFriday(isoDate: string): string {
  const d = parseIsoDate(isoDate);
  const dow = d.getUTCDay(); // 0 = Sun … 6 = Sat
  // Distance to Friday (5). Saturday (6) belongs to the week just ended;
  // Sunday (0) belongs to the week ahead.
  const offset = dow === 6 ? -1 : 5 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return toIsoDate(d);
}

/** Monday (ISO yyyy-mm-dd) of the Mon–Fri week containing the given date. */
export function weekStartMonday(isoDate: string): string {
  const friday = parseIsoDate(weekEndFriday(isoDate));
  friday.setUTCDate(friday.getUTCDate() - 4);
  return toIsoDate(friday);
}

function parseIsoDate(isoDate: string): Date {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (isNaN(d.getTime())) throw new Error(`Invalid ISO date: ${isoDate}`);
  return d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

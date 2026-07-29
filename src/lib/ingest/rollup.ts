import { weekEndFriday } from "../utils/weeks";
import type { AdjustedDailyBar } from "../providers/yahoo";

/**
 * Roll daily bars up into Mon–Fri weekly bars keyed on week_end (Friday).
 * Raw and adjusted series aggregate independently; week_start/week_end
 * record the actual trading days included.
 */
export interface WeeklyBar {
  weekEnd: string;
  volume: number | null;
  adjOpen: number | null;
  adjHigh: number | null;
  adjLow: number | null;
  adjClose: number | null;
}

export function rollupWeekly(bars: AdjustedDailyBar[]): WeeklyBar[] {
  const byWeek = new Map<string, AdjustedDailyBar[]>();
  for (const bar of bars) {
    const key = weekEndFriday(bar.date);
    const arr = byWeek.get(key);
    if (arr) arr.push(bar);
    else byWeek.set(key, [bar]);
  }

  const weeks: WeeklyBar[] = [];
  for (const [weekEnd, days] of byWeek) {
    days.sort((a, b) => a.date.localeCompare(b.date));
    const first = days[0];
    const last = days[days.length - 1];
    const volumes = days.map((d) => d.volume).filter(notNull);
    const adjHighs = days.map((d) => adj(d.high, d)).filter(notNull);
    const adjLows = days.map((d) => adj(d.low, d)).filter(notNull);
    weeks.push({
      weekEnd,
      volume: volumes.length ? volumes.reduce((a, b) => a + b, 0) : null,
      adjOpen: adj(first.open, first),
      adjHigh: adjHighs.length ? Math.max(...adjHighs) : null,
      adjLow: adjLows.length ? Math.min(...adjLows) : null,
      adjClose: adj(last.close, last),
    });
  }
  weeks.sort((a, b) => a.weekEnd.localeCompare(b.weekEnd));
  return weeks;
}

/** Apply a bar's cumulative adjustment factor to one of its raw prices. */
export function adj(
  value: number | null,
  bar: Pick<AdjustedDailyBar, "adjFactor">,
): number | null {
  return value == null ? null : value * bar.adjFactor;
}

function notNull<T>(v: T | null): v is T {
  return v != null;
}

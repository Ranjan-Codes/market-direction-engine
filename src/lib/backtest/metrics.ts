/**
 * Backtest metric math — pure and unit-tested. Returns are simple period
 * returns (e.g. +0.03 = +3%).
 */

export interface SignalOutcome {
  /** Signed direction: +1 long/bullish, -1 short/bearish. */
  side: 1 | -1;
  /** Forward return of the underlying at the horizon (unsigned). */
  fwdReturn: number;
}

/** Directional PnL of one outcome: side × underlying return. */
export function pnl(o: SignalOutcome): number {
  return o.side * o.fwdReturn;
}

export function hitRate(outcomes: SignalOutcome[]): number | null {
  if (outcomes.length === 0) return null;
  return outcomes.filter((o) => pnl(o) > 0).length / outcomes.length;
}

export function avgReturn(outcomes: SignalOutcome[]): number | null {
  if (outcomes.length === 0) return null;
  return outcomes.reduce((a, o) => a + pnl(o), 0) / outcomes.length;
}

/** Expectancy = p(win)×avgWin + p(loss)×avgLoss (avgLoss negative). */
export function expectancy(outcomes: SignalOutcome[]): number | null {
  if (outcomes.length === 0) return null;
  const wins = outcomes.map(pnl).filter((r) => r > 0);
  const losses = outcomes.map(pnl).filter((r) => r <= 0);
  const pWin = wins.length / outcomes.length;
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  return pWin * avgWin + (1 - pWin) * avgLoss;
}

/** Profit factor = gross wins / |gross losses|. Null when no losses. */
export function profitFactor(outcomes: SignalOutcome[]): number | null {
  const rs = outcomes.map(pnl);
  const grossWin = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  if (grossLoss === 0) return grossWin > 0 ? Infinity : null;
  return grossWin / grossLoss;
}

/**
 * Max drawdown of a strategy that each period holds the average of that
 * period's signal PnLs (equal weight, one period per entry date). Input:
 * period returns in chronological order.
 */
export function maxDrawdown(periodReturns: number[]): number | null {
  if (periodReturns.length === 0) return null;
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of periodReturns) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, 1 - equity / peak);
  }
  return maxDd;
}

/** Group outcomes by entry date and average within each date (chronological). */
export function periodAverages(
  entries: Array<{ date: string; outcome: SignalOutcome }>,
): number[] {
  const byDate = new Map<string, number[]>();
  for (const e of entries) {
    (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(pnl(e.outcome));
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, rs]) => rs.reduce((a, b) => a + b, 0) / rs.length);
}

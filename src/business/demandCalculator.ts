import { RULES } from "./rulesConfig";

export interface DemandMetrics {
  /** Weeks from the first sales record to the analysis week, inclusive. */
  historyWeeks: number;
  avg4: number;
  avg12: number;
  /** (avg4 − avg12) ÷ avg12, or null when avg12 is 0. */
  demandChange: number | null;
  /** Rule 1: 4-week average > 12-week average × 1.20 */
  isHighDemand: boolean;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/**
 * `weekly` is total units per week, oldest first, ending at the analysis week.
 * `null` marks weeks before the SKU's first sales record; weeks after it with no rows count as 0.
 */
export function calculateDemand(weekly: (number | null)[]): DemandMetrics {
  const firstIdx = weekly.findIndex((v) => v !== null);
  const history = firstIdx === -1 ? [] : (weekly.slice(firstIdx) as number[]);
  const last4 = history.slice(-RULES.shortWindowWeeks);
  const last12 = history.slice(-RULES.longWindowWeeks);
  const avg4 = mean(last4);
  const avg12 = mean(last12);
  const demandChange = avg12 > 0 ? (avg4 - avg12) / avg12 : null;
  return {
    historyWeeks: history.length,
    avg4,
    avg12,
    demandChange,
    isHighDemand: avg12 > 0 && avg4 > avg12 * RULES.highDemandRatio,
  };
}

export function hasEnoughHistory(historyWeeks: number): boolean {
  return historyWeeks >= RULES.minHistoryWeeks;
}

// "Did it work?": back-test the engine's weekly forecast against what actually sold, and check each past
// decision against the sales that followed it. Deterministic; needs only the sales history already loaded.

import { effectiveDecisions } from "./decisions";
import { addDays, isoWeekToWeekEnding } from "./dates";
import { festivalInfo } from "./festivalAdjustment";
import { RULES } from "./rulesConfig";
import type { AuditEntry, PreparedDataset } from "./types";

export interface WeekAccuracy {
  week: string;
  forecast: number;
  actual: number;
  /** Σ|forecast − actual| ÷ Σactual across SKUs */
  wape: number | null;
  /** (Σforecast − Σactual) ÷ Σactual: positive = forecast too high */
  bias: number | null;
  festival: boolean;
}

export interface SkuAccuracy {
  sku: string;
  product: string;
  wape: number | null;
  bias: number | null;
}

export interface Backtest {
  weeks: WeekAccuracy[];
  skus: SkuAccuracy[];
  wape: number | null;
  bias: number | null;
  /** Bias in festival-uplift weeks vs normal weeks: shows whether the +25% matched reality. */
  festivalBias: number | null;
  normalBias: number | null;
}

/** What the engine would have forecast for week `t`: the 4-week average before it, with that week's festival uplift. */
export function forecastFor(weekly: (number | null)[], t: number, week: string, calendar: Record<string, boolean> | null): number | null {
  const prior = weekly.slice(0, t).filter((v): v is number => v !== null);
  if (prior.length < RULES.shortWindowWeeks) return null;
  const last4 = prior.slice(-RULES.shortWindowWeeks);
  return (last4.reduce((s, v) => s + v, 0) / last4.length) * festivalInfo(week, calendar).factor;
}

const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

export function backtest(dataset: PreparedDataset, weeksBack = 8): Backtest {
  const n = dataset.weeks.length;
  const from = Math.max(RULES.shortWindowWeeks, n - weeksBack);
  const perSku = new Map<string, { abs: number; diff: number; actual: number }>();
  const weeks: WeekAccuracy[] = [];
  let fest = { diff: 0, actual: 0 }, normal = { diff: 0, actual: 0 };

  for (let t = from; t < n; t++) {
    const week = dataset.weeks[t];
    const festival = festivalInfo(week, dataset.festivalCalendar).applied;
    let f = 0, a = 0, abs = 0;
    for (const s of dataset.skus) {
      const actual = s.weekly[t];
      const forecast = forecastFor(s.weekly, t, week, dataset.festivalCalendar);
      if (actual === null || forecast === null) continue;
      f += forecast;
      a += actual;
      abs += Math.abs(forecast - actual);
      const acc = perSku.get(s.master.sku) ?? { abs: 0, diff: 0, actual: 0 };
      acc.abs += Math.abs(forecast - actual);
      acc.diff += forecast - actual;
      acc.actual += actual;
      perSku.set(s.master.sku, acc);
    }
    weeks.push({ week, forecast: Math.round(f), actual: a, wape: ratio(abs, a), bias: ratio(f - a, a), festival });
    const bucket = festival ? fest : normal;
    bucket.diff += f - a;
    bucket.actual += a;
  }

  const skus = dataset.skus
    .filter((s) => perSku.has(s.master.sku))
    .map((s) => {
      const acc = perSku.get(s.master.sku)!;
      return { sku: s.master.sku, product: s.master.product, wape: ratio(acc.abs, acc.actual), bias: ratio(acc.diff, acc.actual) };
    })
    .sort((x, y) => (y.wape ?? 0) - (x.wape ?? 0));

  const totA = weeks.reduce((s, w) => s + w.actual, 0);
  const totAbs = [...perSku.values()].reduce((s, v) => s + v.abs, 0);
  const totDiff = [...perSku.values()].reduce((s, v) => s + v.diff, 0);
  return {
    weeks,
    skus,
    wape: ratio(totAbs, totA),
    bias: ratio(totDiff, totA),
    festivalBias: fest.actual ? fest.diff / fest.actual : null,
    normalBias: normal.actual ? normal.diff / normal.actual : null,
  };
}

export type Verdict = "OVERRIDE_RIGHT" | "RULES_RIGHT" | "TOO_CLOSE" | "FORECAST_CHECK";

export interface DecisionOutcome {
  runId: string;
  sku: string;
  product: string;
  decision: AuditEntry["type"];
  reason: string;
  /** The week after the decision's analysis week. */
  week: string;
  forecast: number;
  actual: number;
  /** (actual − forecast) ÷ forecast */
  surprise: number;
  verdict: Verdict;
}

const TOLERANCE = 0.05;

/**
 * For every standing decision from an earlier run whose following week is now in the sales data:
 * compare that week's actual sales with the engine's forecast. For overrides, say who was right.
 */
export function decisionOutcomes(audit: AuditEntry[], dataset: PreparedDataset): DecisionOutcome[] {
  const index = new Map(dataset.weeks.map((w, i) => [w, i]));
  const bySku = new Map(dataset.skus.map((s) => [s.master.sku, s]));
  const out: DecisionOutcome[] = [];
  for (const d of effectiveDecisions(audit)) {
    if (!d.sku || !/^\d{4}-W\d{2}$/.test(d.runId)) continue;
    const [y, w] = d.runId.split("-W").map(Number);
    const next = addDays(isoWeekToWeekEnding(y, w), 7);
    const t = index.get(next);
    const s = bySku.get(d.sku);
    if (t === undefined || !s) continue;
    const actual = s.weekly[t];
    const forecast = forecastFor(s.weekly, t, next, dataset.festivalCalendar);
    if (actual === null || forecast === null || forecast <= 0) continue;
    const surprise = (actual - forecast) / forecast;

    // Which way did Raghav lean against the system? Less stock (reject a reorder, cut the quantity) or more?
    const reorder = d.systemAction === "IMMEDIATE_REORDER" || d.systemAction === "REORDER_1_5X";
    const leanedLess = (d.type === "REJECTED" && reorder) || (d.type === "EDITED" && (d.finalQty ?? 0) < (d.systemQty ?? 0));
    const leanedMore = (d.type === "REJECTED" && d.systemAction === "PAUSE_NEXT_ORDER") || (d.type === "EDITED" && (d.finalQty ?? 0) > (d.systemQty ?? 0));
    let verdict: Verdict = "FORECAST_CHECK";
    if (leanedLess || leanedMore) {
      if (Math.abs(surprise) <= TOLERANCE) verdict = "TOO_CLOSE";
      else verdict = (leanedLess && surprise < 0) || (leanedMore && surprise > 0) ? "OVERRIDE_RIGHT" : "RULES_RIGHT";
    }
    out.push({ runId: d.runId, sku: d.sku, product: d.product ?? s.master.product, decision: d.type, reason: d.reason, week: next, forecast: Math.round(forecast), actual, surprise, verdict });
  }
  return out.sort((a, b) => b.week.localeCompare(a.week) || a.sku.localeCompare(b.sku));
}

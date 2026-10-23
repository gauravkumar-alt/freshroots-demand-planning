import { calculateDemand, hasEnoughHistory } from "./demandCalculator";
import { computeEconomics } from "./economics";
import { addDays, daysBetween, formatDate, isoWeek } from "./dates";
import { festivalInfo } from "./festivalAdjustment";
import { pct, rupees, units, weeks } from "./format";
import { purchaseOrderContext, weeksOfStock } from "./inventoryCalculator";
import { coveragePosition, inventoryWindow } from "./perishabilityRules";
import { RULES } from "./rulesConfig";
import type {
  ActionCode,
  AnalysisResult,
  DistributorShare,
  PreparedDataset,
  PreparedSku,
  Recommendation,
  RiskLevel,
  RubricNote,
  RuleHit,
} from "./types";

const TREND_WEEKS = 26;

/** Evaluate one SKU against Raghav's documented rules. Pure and deterministic. */
export function evaluateSku(
  sku: PreparedSku,
  weeksIndex: string[],
  analysisWeek: string,
  notes: RubricNote[] = [],
  calendar: Record<string, boolean> | null = null,
  asOfDate: string = analysisWeek,
  orderDate: string = asOfDate,
): Recommendation {
  const { master } = sku;
  const demand = calculateDemand(sku.weekly);
  const festival = festivalInfo(analysisWeek, calendar);
  const baselineDemand = demand.avg4;
  // Rule 4 is applied before any threshold check.
  const adjustedDemand = baselineDemand * festival.factor;
  const wos = weeksOfStock(sku.currentStock, adjustedDemand);
  const wosBaseline = weeksOfStock(sku.currentStock, baselineDemand);
  const window = inventoryWindow(master.perishability);
  const po = purchaseOrderContext(sku.purchaseOrders, analysisWeek);
  const shares = distributorShares(sku.byDistributor);

  const hits: RuleHit[] = [];
  const judgement: string[] = [];

  if (festival.applied) {
    hits.push({
      code: "FESTIVAL_UPLIFT",
      detail: `${festival.monthName} is a festival month${calendar ? " in the uploaded calendar" : ""}: baseline demand ${units(baselineDemand)} → ${units(adjustedDemand)} units/week (+25%).`,
    });
  }

  const insufficientHistory = !hasEnoughHistory(demand.historyWeeks);
  const zeroSales = !insufficientHistory && !(baselineDemand > 0);
  const noStock = sku.currentStock === null;

  if (insufficientHistory) {
    hits.push({
      code: "INSUFFICIENT_DATA",
      detail: `Only ${demand.historyWeeks} week${demand.historyWeeks === 1 ? "" : "s"} of sales history; ${RULES.minHistoryWeeks} are needed for the 12-week average.`,
    });
    judgement.push(`New or recently listed SKU: ${demand.historyWeeks} weeks of history, so the 12-week rules cannot be applied.`);
  }
  if (zeroSales) {
    hits.push({ code: "ZERO_SALES", detail: "No units sold in the last 4 weeks, so weeks of stock cannot be calculated." });
    judgement.push("No sales in the last 4 weeks. Check whether the SKU is delisted, blocked or out of distribution.");
  }
  if (noStock) {
    hits.push({ code: "INSUFFICIENT_DATA", detail: "No inventory record for this SKU in the SAP inventory export." });
    judgement.push("Missing from the SAP inventory export, so stock cover is unknown.");
  }

  const manual = insufficientHistory || zeroSales || noStock;
  let stockoutFlag = false;
  let overstockFlag = false;
  const highDemand = !manual && demand.isHighDemand;

  if (!manual && wos !== null) {
    if (highDemand) {
      hits.push({
        code: "HIGH_DEMAND",
        detail: `4-week average ${units(demand.avg4)} is ${pct(demand.demandChange)} vs the 12-week average ${units(demand.avg12)} (threshold +20%).`,
      });
    }
    const position = coveragePosition(wos, window);
    if (window.kind === "normal") {
      if (position === "below") {
        stockoutFlag = true;
        hits.push({ code: "STOCKOUT", detail: `${weeks(wos)} weeks of stock is below the ${RULES.stockoutWeeks}-week minimum.` });
      } else if (position === "above") {
        overstockFlag = true;
        hits.push({ code: "OVERSTOCK", detail: `${weeks(wos)} weeks of stock is above the ${RULES.overstockWeeks}-week maximum.` });
      }
    } else if (position === "below") {
      stockoutFlag = true;
      hits.push({ code: "PERISHABLE_BELOW", detail: `High-perishability SKU: ${weeks(wos)} weeks of stock is below the 3–4 week window.` });
    } else if (position === "above") {
      overstockFlag = true;
      hits.push({ code: "PERISHABLE_ABOVE", detail: `High-perishability SKU: ${weeks(wos)} weeks of stock is above the 3–4 week window.` });
    }
  }

  const risk: RiskLevel = manual
    ? "MANUAL_REVIEW"
    : stockoutFlag
      ? "STOCKOUT"
      : highDemand
        ? "HIGH_DEMAND"
        : overstockFlag
          ? "OVERSTOCK"
          : "NONE";

  const action = actionFor(risk);
  const suggestedQty = quantityFor(action, master.standardOrderQty, highDemand);

  // Signals that put a SKU into the 15–20% that needs Raghav's judgement.
  if (!manual) {
    if (highDemand && overstockFlag) {
      judgement.push(
        `Conflicting signals: demand is ${pct(demand.demandChange)} but stock already covers ${weeks(wos)} weeks. Rule priority says reorder; check whether current stock is enough.`,
      );
    }
    const shifted = shares.find((s) => s.share4 - s.share12 >= RULES.distributorShiftPoints);
    if (shifted) {
      judgement.push(
        `Unusual distributor behaviour: ${shifted.distributor} took ${Math.round(shifted.share4 * 100)}% of volume in the last 4 weeks vs ${Math.round(shifted.share12 * 100)}% over 12 weeks.`,
      );
    }
    if (stockoutFlag && po.nextDelivery && daysBetween(analysisWeek, po.nextDelivery) <= RULES.openPoHorizonDays) {
      const coverWithPo = ((sku.currentStock ?? 0) + po.openQty) / adjustedDemand;
      if (coverWithPo >= window.min) {
        judgement.push(
          `Open Zoho PO of ${units(po.openQty)} units due ${formatDate(po.nextDelivery, { day: "numeric", month: "short" })} would lift cover to ${weeks(coverWithPo)} weeks.`,
        );
      }
    }
  }

  // Rubric feedback from earlier rejections: never changes the numbers, only routes the SKU to Raghav.
  for (const n of notes) {
    if (n.sku === master.sku) judgement.push(`Rubric note from your rejection in ${n.fromRunId}: “${n.reason}”`);
  }

  const economics = computeEconomics({ master, currentStock: sku.currentStock, weeklyDemand: adjustedDemand, window, openPoQty: po.openQty, asOfDate, orderDate });

  const priority: Recommendation["priority"] =
    risk === "STOCKOUT" ? 1 : risk === "MANUAL_REVIEW" || risk === "HIGH_DEMAND" || judgement.length ? 2 : risk === "OVERSTOCK" ? 3 : 4;
  // Bands follow the documented priority. Within a band: runs out before an order could land first,
  // then by ₹ at stake when cost and price are known, otherwise by the old weeks-of-stock / demand ordering.
  const band = risk === "STOCKOUT" ? 4000 : risk === "MANUAL_REVIEW" ? 3000 : risk === "HIGH_DEMAND" ? 2500 : risk === "OVERSTOCK" ? 2000 : 0;
  const fallback =
    risk === "STOCKOUT" ? 100 - (wos ?? 0) * 5 : risk === "HIGH_DEMAND" ? (demand.demandChange ?? 0) * 100 : risk === "OVERSTOCK" ? Math.min(wos ?? 0, 60) : 0;
  const imminent = risk === "STOCKOUT" && (economics.stockoutGapDays ?? 0) > 0 ? 600 : 0;
  const money = economics.valueAtRisk !== null ? 100 + Math.min(economics.valueAtRisk / 1000, 499) : fallback;
  const priorityScore = band + imminent + money + (judgement.length ? 50 : 0);

  const firstIdx = sku.weekly.findIndex((v) => v !== null);
  const trend = weeksIndex
    .map((week, i) => ({ week, units: sku.weekly[i] }))
    .filter((p, i): p is { week: string; units: number } => firstIdx !== -1 && i >= firstIdx && p.units !== null)
    .slice(-TREND_WEEKS);

  const rec: Recommendation = {
    id: master.sku,
    sku: master.sku,
    product: master.product,
    category: master.category,
    perishability: master.perishability,
    standardOrderQty: master.standardOrderQty,
    leadDistributor: shares[0]?.distributor ?? null,
    distributorShares: shares,
    trend,
    historyWeeks: demand.historyWeeks,
    avg4: demand.avg4,
    avg12: demand.avg12,
    demandChange: demand.demandChange,
    baselineDemand,
    festival,
    adjustedDemand,
    currentStock: sku.currentStock,
    weeksOfStock: wos,
    weeksOfStockBaseline: wosBaseline,
    window,
    openPoQty: po.openQty,
    nextDelivery: po.nextDelivery,
    lastOrderQty: po.lastOrderQty,
    lastOrderDate: po.lastOrderDate,
    economics,
    triggered: hits,
    risk,
    action,
    suggestedQty,
    priority,
    priorityScore,
    decisionMode: judgement.length ? "JUDGEMENT" : "RULE_BASED",
    judgementReasons: judgement,
    headline: "",
    explanation: [],
  };
  rec.headline = headlineFor(rec, zeroSales);
  rec.explanation = explanationFor(rec, highDemand);
  return rec;
}

export function actionFor(risk: RiskLevel): ActionCode {
  switch (risk) {
    case "STOCKOUT":
      return "IMMEDIATE_REORDER";
    case "HIGH_DEMAND":
      return "REORDER_1_5X";
    case "OVERSTOCK":
      return "PAUSE_NEXT_ORDER";
    case "MANUAL_REVIEW":
      return "MANUAL_REVIEW";
    default:
      return "NO_ACTION";
  }
}

/** Immediate reorder = 1× standard quantity, or 1.5× when high demand also fired (Rule 1). */
export function quantityFor(action: ActionCode, standardOrderQty: number, highDemand: boolean): number | null {
  switch (action) {
    case "IMMEDIATE_REORDER":
      return Math.round(standardOrderQty * (highDemand ? RULES.highDemandOrderMultiplier : 1));
    case "REORDER_1_5X":
      return Math.round(standardOrderQty * RULES.highDemandOrderMultiplier);
    case "MANUAL_REVIEW":
      return null;
    default:
      return 0;
  }
}

function distributorShares(byDistributor: Record<string, number[]>): DistributorShare[] {
  const rows = Object.entries(byDistributor).map(([distributor, series]) => {
    const last4 = series.slice(-RULES.shortWindowWeeks);
    const last12 = series.slice(-RULES.longWindowWeeks);
    return {
      distributor,
      sum4: last4.reduce((s, v) => s + v, 0),
      sum12: last12.reduce((s, v) => s + v, 0),
    };
  });
  const total4 = rows.reduce((s, r) => s + r.sum4, 0);
  const total12 = rows.reduce((s, r) => s + r.sum12, 0);
  return rows
    .map((r) => ({
      distributor: r.distributor,
      avg4: r.sum4 / RULES.shortWindowWeeks,
      avg12: r.sum12 / RULES.longWindowWeeks,
      share4: total4 > 0 ? r.sum4 / total4 : 0,
      share12: total12 > 0 ? r.sum12 / total12 : 0,
    }))
    .sort((a, b) => b.avg4 - a.avg4 || b.avg12 - a.avg12);
}

const day = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short" });

function headlineFor(r: Recommendation, zeroSales: boolean): string {
  switch (r.risk) {
    case "MANUAL_REVIEW":
      return zeroSales ? "No recent sales — Manual review required" : "Insufficient data — Manual review required";
    case "STOCKOUT": {
      const e = r.economics;
      if (e.runOutDate && e.stockoutGapDays) {
        return `Runs out ${day(e.runOutDate)}, ${e.stockoutGapDays} day${e.stockoutGapDays === 1 ? "" : "s"} before an order placed today can arrive`;
      }
      return `${e.runOutDate ? `Runs out ${day(e.runOutDate)}: ` : ""}${weeks(r.weeksOfStock)} weeks of stock against a ${r.window.min}-week minimum${
        r.triggered.some((h) => h.code === "HIGH_DEMAND") ? `, demand ${pct(r.demandChange)}` : ""
      }`;
    }
    case "HIGH_DEMAND":
      return `Demand ${pct(r.demandChange)} on the 12-week average`;
    case "OVERSTOCK":
      return `Stock covers ${weeks(r.weeksOfStock)} weeks, above the ${r.window.max}-week maximum`;
    default:
      return `Stock and demand within the ${r.window.min}–${r.window.max} week range`;
  }
}

function explanationFor(r: Recommendation, highDemand: boolean): string[] {
  const lines: string[] = [];
  if (r.risk === "MANUAL_REVIEW") {
    lines.push("The engine will not make a confident recommendation for this SKU.");
    lines.push(...r.judgementReasons);
    return lines;
  }
  if (highDemand) {
    lines.push(
      `Recent demand is well above normal: the last 4 weeks averaged ${units(r.avg4)} units/week, ${pct(r.demandChange)} on the 12-week average of ${units(r.avg12)}.`,
    );
  } else if (r.demandChange !== null) {
    lines.push(
      `Demand is ${Math.abs(r.demandChange) < 0.05 ? "steady" : r.demandChange > 0 ? "up" : "down"}: ${units(r.avg4)} units/week over 4 weeks vs ${units(r.avg12)} over 12 weeks (${pct(r.demandChange)}).`,
    );
  }
  if (r.festival.applied) {
    lines.push(`${r.festival.monthName} is a festival month, so demand is planned at ${units(r.adjustedDemand)} units/week (+25%) before the stock checks.`);
  }
  const windowText = r.window.kind === "perishable" ? "the 3–4 week window for high-perishability SKUs" : "the normal 6–14 week range";
  lines.push(`Current stock of ${units(r.currentStock ?? 0)} units covers ${weeks(r.weeksOfStock)} weeks, against ${windowText}.`);
  switch (r.action) {
    case "IMMEDIATE_REORDER":
      lines.push(
        `Reorder now: ${units(r.suggestedQty ?? 0)} units (${highDemand ? "1.5× the standard order, because demand is also high" : "one standard order"}).`,
      );
      break;
    case "REORDER_1_5X":
      lines.push(`Reorder at 1.5× the standard order quantity: ${units(r.suggestedQty ?? 0)} units.`);
      break;
    case "PAUSE_NEXT_ORDER":
      lines.push("Pause the next order until cover falls back into range.");
      break;
    default:
      lines.push("No order change needed this week.");
  }
  const e = r.economics;
  if (e.runOutDate) {
    lines.push(
      `At ${units(r.adjustedDemand)} units/week, stock runs out ${day(e.runOutDate)}.${
        e.arrivalIfOrderedToday
          ? ` An order placed today arrives ${day(e.arrivalIfOrderedToday)} (${e.leadTimeDays}-day lead time)${e.stockoutGapDays ? `, leaving ${e.stockoutGapDays} day${e.stockoutGapDays === 1 ? "" : "s"} without stock` : ""}.`
          : ""
      }`,
    );
  }
  if (e.valueKind === "MARGIN_AT_RISK") {
    lines.push(`Reaching the ${r.window.min}-week minimum needs ${units(e.shortfallUnits)} more units; at ${rupees(e.marginPerUnit)} margin each, ${rupees(e.valueAtRisk)} of margin is at risk.`);
  } else if (e.valueKind === "CASH_TIED_UP") {
    lines.push(`${units(e.excessUnits)} units sit above the ${r.window.max}-week maximum, tying up ${rupees(e.valueAtRisk)} at cost.`);
  }
  if (r.openPoQty > 0 && r.nextDelivery) {
    lines.push(`Zoho shows ${units(r.openPoQty)} units on open orders, next delivery ${formatDate(r.nextDelivery, { day: "numeric", month: "short" })}.`);
  }
  return lines;
}

export function weekLabel(analysisWeek: string): string {
  const start = addDays(analysisWeek, -6);
  return `Week ${isoWeek(analysisWeek)} · ${formatDate(start, { day: "numeric", month: "short" })}–${formatDate(analysisWeek)}`;
}

export function runIdFor(analysisWeek: string): string {
  return `${analysisWeek.slice(0, 4)}-W${String(isoWeek(analysisWeek)).padStart(2, "0")}`;
}

/** Runs the full weekly analysis over a prepared dataset. */
export function runAnalysis(dataset: PreparedDataset, ranAt: string = new Date().toISOString(), notes: RubricNote[] = []): AnalysisResult {
  const runId = runIdFor(dataset.analysisWeek);
  const active = activeRubricNotes(notes, runId);
  // Orders are placed on the day the analysis runs (IST), so arrival dates count from then.
  const orderDate = new Date(ranAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const recommendations = dataset.skus
    .map((s) => evaluateSku(s, dataset.weeks, dataset.analysisWeek, active, dataset.festivalCalendar, dataset.asOfDate ?? dataset.analysisWeek, orderDate))
    .sort((a, b) => b.priorityScore - a.priorityScore);
  return {
    runId,
    analysisWeek: dataset.analysisWeek,
    weekLabel: weekLabel(dataset.analysisWeek),
    ranAt,
    festival: festivalInfo(dataset.analysisWeek, dataset.festivalCalendar),
    recommendations,
  };
}

/** Notes created in an earlier run that still apply to `runId`. Run ids ("2026-W42") sort as strings. */
export function activeRubricNotes(notes: RubricNote[], runId: string): RubricNote[] {
  return notes.filter((n) => !n.retired && n.fromRunId < runId && n.untilRunId >= runId);
}

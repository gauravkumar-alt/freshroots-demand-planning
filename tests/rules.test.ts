import { describe, expect, it } from "vitest";
import { decide } from "@/business/decisions";
import { calculateDemand } from "@/business/demandCalculator";
import { applyFestivalUplift, festivalInfo } from "@/business/festivalAdjustment";
import { weeksOfStock } from "@/business/inventoryCalculator";
import { coveragePosition, inventoryWindow } from "@/business/perishabilityRules";
import { evaluateSku } from "@/business/recommendationEngine";
import type { Perishability, PreparedSku } from "@/business/types";
import { addDays } from "@/business/dates";

// A non-festival analysis week (September) unless a test says otherwise.
const SEPT = "2026-09-20";
const OCT = "2026-10-18";

const weeksEnding = (end: string, n: number) => Array.from({ length: n }, (_, i) => addDays(end, (i - (n - 1)) * 7));

/** 12+ weeks: eight older weeks at `older`, then four recent weeks at `recent`. */
function series(older: number, recent: number, extraOld = 4): number[] {
  return [...new Array(extraOld + 8).fill(older), ...new Array(4).fill(recent)];
}

function sku(opts: { weekly: (number | null)[]; stock: number | null; perishability?: Perishability; soq?: number }): PreparedSku {
  return {
    master: { sku: "FR-T001", product: "Test SKU", category: "Snacks", perishability: opts.perishability ?? "Low", standardOrderQty: opts.soq ?? 1000 },
    weekly: opts.weekly,
    byDistributor: { "Test Distributor": opts.weekly.map((v) => v ?? 0) },
    currentStock: opts.stock,
    purchaseOrders: [],
  };
}

const run = (s: PreparedSku, week = SEPT) => evaluateSku(s, weeksEnding(week, s.weekly.length), week);

describe("Freshroots business rules", () => {
  it("Test 1: 4-week demand 25% above 12-week demand → HIGH DEMAND", () => {
    // 12-week average 1,000 with the last 4 weeks at 1,250 → +25%.
    // older 8 weeks × 875 + 4 × 1,250 = 12,000 → avg12 = 1,000
    const weekly = [...new Array(4).fill(875), ...new Array(8).fill(875), ...new Array(4).fill(1250)];
    const d = calculateDemand(weekly);
    expect(d.avg4).toBe(1250);
    expect(d.avg12).toBe(1000);
    expect(d.demandChange).toBeCloseTo(0.25);
    expect(d.isHighDemand).toBe(true);
    const rec = run(sku({ weekly, stock: 10 * 1250 }));
    expect(rec.triggered.map((h) => h.code)).toContain("HIGH_DEMAND");
    expect(rec.risk).toBe("HIGH_DEMAND");
    expect(rec.action).toBe("REORDER_1_5X");
    expect(rec.suggestedQty).toBe(1500);
  });

  it("Test 1b: exactly 20% above is not high demand (rule is strictly greater)", () => {
    // 8 older weeks × 900 + 4 × 1,200 → avg12 = 1,000, avg4 = 1,200: exactly 1.20×.
    const weekly = [...new Array(4).fill(900), ...new Array(8).fill(900), ...new Array(4).fill(1200)];
    expect(calculateDemand(weekly).avg12).toBe(1000);
    expect(calculateDemand(weekly).isHighDemand).toBe(false);
    expect(calculateDemand(series(1000, 1000)).isHighDemand).toBe(false);
  });

  it("Test 2: weeks of stock = 4 → STOCKOUT RISK", () => {
    expect(weeksOfStock(4000, 1000)).toBe(4);
    const rec = run(sku({ weekly: series(1000, 1000), stock: 4000 }));
    expect(rec.weeksOfStock).toBe(4);
    expect(rec.risk).toBe("STOCKOUT");
    expect(rec.action).toBe("IMMEDIATE_REORDER");
    expect(rec.suggestedQty).toBe(1000);
  });

  it("Test 3: weeks of stock = 16 → OVERSTOCK RISK", () => {
    const rec = run(sku({ weekly: series(1000, 1000), stock: 16000 }));
    expect(rec.weeksOfStock).toBe(16);
    expect(rec.risk).toBe("OVERSTOCK");
    expect(rec.action).toBe("PAUSE_NEXT_ORDER");
    expect(rec.suggestedQty).toBe(0);
  });

  it("Test 4: October → 25% festival uplift, applied before threshold checks", () => {
    expect(festivalInfo(OCT)).toMatchObject({ applied: true, factor: 1.25, monthName: "October" });
    expect(festivalInfo("2026-11-15").applied).toBe(true);
    expect(festivalInfo("2027-03-14").applied).toBe(true);
    expect(festivalInfo(SEPT).applied).toBe(false);
    expect(applyFestivalUplift(1000, OCT)).toBe(1250);

    // 7 weeks of stock is fine in September but drops to 5.6 weeks once October's uplift is applied.
    const s = sku({ weekly: series(1000, 1000), stock: 7000 });
    expect(run(s, SEPT).risk).toBe("NONE");
    const oct = run(s, OCT);
    expect(oct.adjustedDemand).toBe(1250);
    expect(oct.weeksOfStock).toBeCloseTo(5.6);
    expect(oct.weeksOfStockBaseline).toBe(7);
    expect(oct.triggered.map((h) => h.code)).toEqual(["FESTIVAL_UPLIFT", "STOCKOUT"]);
  });

  it("Test 5: high-perishability SKU with 5 weeks of stock → outside the 3–4 week window", () => {
    const window = inventoryWindow("High");
    expect(window).toEqual({ min: 3, max: 4, kind: "perishable" });
    expect(coveragePosition(5, window)).toBe("above");
    // For a normal SKU the 6–14 week range applies instead, where 5 weeks is below the minimum.
    expect(coveragePosition(5, inventoryWindow("Low"))).toBe("below");

    const rec = run(sku({ weekly: series(1000, 1000), stock: 5000, perishability: "High" }));
    expect(rec.weeksOfStock).toBe(5);
    expect(rec.triggered.map((h) => h.code)).toContain("PERISHABLE_ABOVE");
    expect(rec.risk).toBe("OVERSTOCK");

    const within = run(sku({ weekly: series(1000, 1000), stock: 3500, perishability: "High" }));
    expect(within.risk).toBe("NONE");
  });

  it("Test 6: high demand + stockout → both rules shown, primary action is immediate reorder", () => {
    // Masala Chips example from the brief: 1,250 vs 980 units/week, 4,200 units in stock.
    const weekly = [...new Array(4).fill(900), ...new Array(8).fill(845), ...new Array(4).fill(1250)];
    const rec = run(sku({ weekly, stock: 4200, soq: 1000, perishability: "Medium" }));
    expect(rec.avg4).toBe(1250);
    expect(rec.avg12).toBeCloseTo(980);
    expect(rec.demandChange).toBeCloseTo(0.2755, 3);
    expect(rec.weeksOfStock).toBeCloseTo(3.36, 2);
    const codes = rec.triggered.map((h) => h.code);
    expect(codes).toContain("HIGH_DEMAND");
    expect(codes).toContain("STOCKOUT");
    expect(rec.risk).toBe("STOCKOUT");
    expect(rec.action).toBe("IMMEDIATE_REORDER");
    // Reorder at 1.5× standard because high demand also fired.
    expect(rec.suggestedQty).toBe(1500);
  });

  it("Test 6b: priority order is stockout > high demand > overstock > no action", () => {
    // High demand + overstock → high demand wins, and it is flagged for judgement.
    const weekly = series(800, 1300);
    const rec = run(sku({ weekly, stock: 30000 }));
    expect(rec.triggered.map((h) => h.code)).toEqual(expect.arrayContaining(["HIGH_DEMAND", "OVERSTOCK"]));
    expect(rec.risk).toBe("HIGH_DEMAND");
    expect(rec.decisionMode).toBe("JUDGEMENT");
  });

  it("Test 7: insufficient historical data → MANUAL REVIEW, no confident recommendation", () => {
    const weekly: (number | null)[] = [...new Array(10).fill(null), 400, 450, 500, 520, 560, 600];
    const rec = run(sku({ weekly, stock: 3000 }));
    expect(rec.historyWeeks).toBe(6);
    expect(rec.risk).toBe("MANUAL_REVIEW");
    expect(rec.action).toBe("MANUAL_REVIEW");
    expect(rec.suggestedQty).toBeNull();
    expect(rec.headline).toBe("Insufficient data — Manual review required");
    expect(rec.decisionMode).toBe("JUDGEMENT");
    // Approve is blocked: Raghav must choose an action.
    const res = decide(rec, "2026-W38", { kind: "APPROVE" }, "Raghav Kulkarni", "2026-09-21T10:00:00+05:30");
    expect(res.ok).toBe(false);
  });

  it("Test 8: zero average weekly sales → no divide-by-zero, manual review", () => {
    expect(weeksOfStock(2000, 0)).toBeNull();
    const weekly = [...new Array(12).fill(300), 0, 0, 0, 0];
    const rec = run(sku({ weekly, stock: 2000 }));
    expect(rec.weeksOfStock).toBeNull();
    expect(Number.isFinite(rec.priorityScore)).toBe(true);
    expect(rec.risk).toBe("MANUAL_REVIEW");
    expect(rec.triggered.map((h) => h.code)).toContain("ZERO_SALES");

    const allZero = run(sku({ weekly: new Array(16).fill(0), stock: 500 }));
    expect(allZero.demandChange).toBeNull();
    expect(allZero.risk).toBe("MANUAL_REVIEW");
  });
});

describe("Human review", () => {
  const rec = run(sku({ weekly: series(1000, 1000), stock: 4000 }));
  const now = "2026-10-19T10:42:00+05:30";

  it("edit requires a reason and records the original and final values", () => {
    expect(decide(rec, "R", { kind: "EDIT", action: "IMMEDIATE_REORDER", qty: 800, reason: "", category: null }, "Raghav Kulkarni", now).ok).toBe(false);
    const res = decide(rec, "R", { kind: "EDIT", action: "IMMEDIATE_REORDER", qty: 800, reason: "Distributor confirmed temporary demand spike.", category: "Unusual distributor behaviour" }, "Raghav Kulkarni", now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.audit).toMatchObject({ type: "EDITED", systemAction: "IMMEDIATE_REORDER", systemQty: 1000, finalQty: 800, override: true, user: "Raghav Kulkarni", timestamp: now });
  });

  it("reject requires a reason and sends nothing to procurement", () => {
    expect(decide(rec, "R", { kind: "REJECT", reason: "no", category: null }, "Raghav Kulkarni", now).ok).toBe(false);
    const res = decide(rec, "R", { kind: "REJECT", reason: "Plant shutdown next week.", category: "Supply constraint" }, "Raghav Kulkarni", now);
    expect(res.ok && res.decision.finalQty).toBe(0);
  });
});

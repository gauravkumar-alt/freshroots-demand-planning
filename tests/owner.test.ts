import { describe, expect, it } from "vitest";
import { computeEconomics } from "@/business/economics";
import { rupees } from "@/business/format";
import { backtest, decisionOutcomes } from "@/business/outcomes";
import { runAnalysis } from "@/business/recommendationEngine";
import type { AuditEntry } from "@/business/types";
import { validateAndPrepare } from "@/business/validationEngine";
import { freshrootsRawFiles } from "@/data/freshrootsFiles";

const ds = validateAndPrepare(freshrootsRawFiles()).dataset!;
const a = runAnalysis(ds, "2026-10-19T07:30:00Z");
const rec = (sku: string) => a.recommendations.find((r) => r.sku === sku)!;

describe("Money and dates", () => {
  it("formats rupees the Indian way", () => {
    expect(rupees(6348)).toBe("₹6,348");
    expect(rupees(183160)).toBe("₹1.8L");
    expect(rupees(32_000_000)).toBe("₹3.2Cr");
  });

  it("dates run-out and delivery from the stock snapshot (19 Oct)", () => {
    const e = rec("SKU001").economics;
    expect(e.asOfDate).toBe("2026-10-19");
    expect(e.runOutDate).toBe("2026-11-07"); // 900 units ÷ 46.6/day = 19 days
    expect(e.arrivalIfOrderedToday).toBe("2026-10-24"); // 5-day lead time
    expect(e.stockoutGapDays).toBe(0);
    // 6 weeks × 326.25 − 900 = 1,058 units short × ₹6 margin
    expect(e).toMatchObject({ shortfallUnits: 1058, marginPerUnit: 6, valueAtRisk: 6348, valueKind: "MARGIN_AT_RISK" });
  });

  it("flags a stockout that lands before an order placed today can arrive, and ranks it first", () => {
    const e = rec("SKU004").economics; // almond milk, 14-day lead time
    expect(e.runOutDate).toBe("2026-10-31");
    expect(e.arrivalIfOrderedToday).toBe("2026-11-02");
    expect(e.stockoutGapDays).toBe(2);
    expect(rec("SKU004").headline).toMatch(/2 days before an order placed today can arrive/);
    expect(a.recommendations[0].sku).toBe("SKU004");
  });

  it("values overstock as cash tied up at cost", () => {
    expect(rec("SKU006").economics).toMatchObject({ excessUnits: 396, valueAtRisk: 83160, valueKind: "CASH_TIED_UP" });
  });

  it("shows nothing in rupees when cost or price is missing", () => {
    const e = computeEconomics({
      master: { sku: "X", product: "X", category: "X", perishability: "Low", standardOrderQty: 100 },
      currentStock: 100,
      weeklyDemand: 100,
      window: { min: 6, max: 14, kind: "normal" },
      openPoQty: 0,
      asOfDate: "2026-10-19",
    });
    expect(e.valueAtRisk).toBeNull();
    expect(e.runOutDate).toBe("2026-10-26");
    expect(e.arrivalIfOrderedToday).toBeNull();
  });
});

describe("Did it work?", () => {
  it("back-tests the weekly forecast against actual sales", () => {
    const b = backtest(ds, 8);
    expect(b.weeks).toHaveLength(8);
    expect(b.weeks.at(-1)!.week).toBe("2026-10-18");
    expect(b.wape).toBeGreaterThan(0);
    expect(b.wape).toBeLessThan(0.5);
    // October weeks carry the +25% uplift; the sample data did not rise 25%, so festival weeks over-forecast.
    expect(b.weeks.filter((w) => w.festival).length).toBe(3);
    expect(b.festivalBias!).toBeGreaterThan(b.normalBias!);
  });

  it("judges an override once the following week's sales are in", () => {
    // Pretend Raghav cut SKU001's reorder in week 40 because the spike looked temporary.
    const e: AuditEntry = {
      id: "x", timestamp: "2026-10-05T10:00:00+05:30", runId: "2026-W40", type: "EDITED", user: "Raghav Kulkarni",
      sku: "SKU001", product: "Mango Drink", systemAction: "IMMEDIATE_REORDER", systemQty: 750, finalAction: "IMMEDIATE_REORDER", finalQty: 500,
      override: true, reason: "Spike looks temporary.", exceptionCategory: null, risk: "STOCKOUT",
    };
    const [o] = decisionOutcomes([e], ds);
    expect(o.week).toBe("2026-10-11"); // week 41
    expect(o.actual).toBe(257);
    // Week-41 forecast = avg(W37–W40) × 1.25 = 225 × 1.25 ≈ 281; actual 257 is below, so cutting was right.
    expect(o.forecast).toBe(281);
    expect(o.verdict).toBe("OVERRIDE_RIGHT");
  });

  it("ignores decisions whose following week has not happened yet", () => {
    const e = { id: "y", timestamp: "2026-10-19T10:00:00+05:30", runId: "2026-W42", type: "APPROVED", user: "R", sku: "SKU001", product: "M",
      systemAction: "IMMEDIATE_REORDER", systemQty: 750, finalAction: "IMMEDIATE_REORDER", finalQty: 750, override: false, reason: "", exceptionCategory: null, risk: "STOCKOUT" } as AuditEntry;
    expect(decisionOutcomes([e], ds)).toEqual([]);
  });
});

describe("Monday digest", () => {
  it("leads with decisions waiting, urgency and money", async () => {
    const { buildDigest } = await import("@/business/digest");
    const d = buildDigest({ analysis: a, statusOf: () => "NEEDS_REVIEW", backtest: backtest(ds, 8), appUrl: "https://example.test", placeholderFinancials: true });
    expect(d.waiting).toBe(6);
    expect(d.urgent).toBe(1);
    expect(d.subject).toMatch(/^Freshroots 2026-W42: 6 decisions waiting, 1 urgent, ₹[\d,.]+L? margin at risk$/);
    expect(d.html).toContain("Almond Milk");
    expect(d.html).toContain("placeholder");
    expect(d.text).toContain("https://example.test/#inbox");
  });
  it("says all clear when everything is decided", async () => {
    const { buildDigest } = await import("@/business/digest");
    const d = buildDigest({ analysis: a, statusOf: () => "APPROVED", backtest: null, appUrl: "https://example.test", placeholderFinancials: false });
    expect(d.subject).toBe("Freshroots 2026-W42: all clear this week");
  });
});

describe("Order date", () => {
  it("counts arrival from the day the analysis runs, not the stock snapshot", () => {
    const later = runAnalysis(ds, "2026-10-23T06:00:00Z"); // Fri 23 Oct IST, snapshot is Mon 19 Oct
    const almond = later.recommendations.find((r) => r.sku === "SKU004")!.economics;
    expect(almond.runOutDate).toBe("2026-10-31"); // unchanged: from the snapshot
    expect(almond.arrivalIfOrderedToday).toBe("2026-11-06"); // 23 Oct + 14 days
    expect(almond.stockoutGapDays).toBe(6);
  });
});

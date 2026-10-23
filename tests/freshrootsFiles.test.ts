import { describe, expect, it } from "vitest";
import { runAnalysis } from "@/business/recommendationEngine";
import { validateAndPrepare } from "@/business/validationEngine";
import { freshrootsRawFiles } from "@/data/freshrootsFiles";

// Expected values calculated independently from the five CSVs (4-wk and 12-wk averages, ×1.25 October uplift).
const EXPECTED: Record<string, { risk: string; qty: number; wos: number; highDemand?: boolean }> = {
  SKU001: { risk: "STOCKOUT", qty: 750, wos: 2.76, highDemand: true },
  SKU002: { risk: "NONE", qty: 0, wos: 11.46 },
  SKU003: { risk: "STOCKOUT", qty: 300, wos: 4.35 },
  SKU004: { risk: "STOCKOUT", qty: 150, wos: 1.78 },
  SKU005: { risk: "NONE", qty: 0, wos: 8.24 },
  SKU006: { risk: "OVERSTOCK", qty: 0, wos: 21.86 },
  SKU007: { risk: "NONE", qty: 0, wos: 3.72 },
  SKU008: { risk: "NONE", qty: 0, wos: 7.38 },
  SKU009: { risk: "NONE", qty: 0, wos: 9.21 },
  SKU010: { risk: "NONE", qty: 0, wos: 8.4 },
  SKU011: { risk: "STOCKOUT", qty: 500, wos: 1.76 },
  SKU012: { risk: "NONE", qty: 0, wos: 6.4 },
  SKU013: { risk: "STOCKOUT", qty: 120, wos: 3.22 },
  SKU014: { risk: "NONE", qty: 0, wos: 6.4 },
  SKU015: { risk: "NONE", qty: 0, wos: 10.02 },
};

describe("Freshroots sample files", () => {
  const report = validateAndPrepare(freshrootsRawFiles());

  it("validate without errors and use every file", () => {
    expect(report.canRun).toBe(true);
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(report.summary).toMatchObject({ skus: 15, weeks: 16, salesRows: 240, lastWeek: "2026-10-18" });
    expect(report.dataset!.asOfDate).toBe("2026-10-19");
    // Distributor names come from the distributor master via the SKU master.
    expect(report.dataset!.distributors).toEqual(["GrainPath Logistics", "Meridian Trade Co.", "NutriFlow Distributors", "PeakSource Supply"]);
    expect(report.dataset!.festivalCalendar!["2026-10"]).toBe(true);
  });

  it("match the hand-calculated recommendations", () => {
    const a = runAnalysis(report.dataset!, "2026-10-19T07:30:00Z");
    expect(a.runId).toBe("2026-W42");
    expect(a.festival.applied).toBe(true);
    for (const r of a.recommendations) {
      const e = EXPECTED[r.sku];
      expect({ sku: r.sku, risk: r.risk, qty: r.suggestedQty }).toEqual({ sku: r.sku, risk: e.risk, qty: e.qty });
      expect(r.weeksOfStock!).toBeCloseTo(e.wos, 2);
      expect(r.triggered.some((h) => h.code === "HIGH_DEMAND")).toBe(!!e.highDemand);
    }
    expect(a.recommendations.find((r) => r.sku === "SKU004")!.triggered.map((h) => h.code)).toContain("PERISHABLE_BELOW");
    expect(a.recommendations.find((r) => r.sku === "SKU001")!.leadDistributor).toBe("NutriFlow Distributors");
  });

  it("follow the uploaded calendar, not the built-in months", () => {
    const files = freshrootsRawFiles();
    const cal = files.calendar!;
    cal.rows = cal.rows.map((r) => (r.Year_Month === "2026-10" ? { ...r, Is_Festival_Month: "FALSE" } : r));
    const a = runAnalysis(validateAndPrepare(files).dataset!, "2026-10-19T07:30:00Z");
    expect(a.festival.applied).toBe(false);
    // Without the uplift, SKU003 Brown Rice covers 5.4 weeks, still a stockout; SKU012 Herbal Tea moves to 8 weeks.
    expect(a.recommendations.find((r) => r.sku === "SKU012")!.weeksOfStock).toBeCloseTo(8, 2);
  });
});

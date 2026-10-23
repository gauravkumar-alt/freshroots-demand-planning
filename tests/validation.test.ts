import { describe, expect, it } from "vitest";
import { standardiseDate } from "@/business/dates";
import { runAnalysis } from "@/business/recommendationEngine";
import { standardiseSku, validateAndPrepare } from "@/business/validationEngine";
import { demoRawFiles, messyRawFiles } from "@/data/demoData";

describe("Data preparation", () => {
  it("standardises dates and SKU codes", () => {
    expect(standardiseDate("18/10/2026")).toBe("2026-10-18");
    expect(standardiseDate("18-Oct-2026")).toBe("2026-10-18");
    expect(standardiseDate("2026-W42")).toBe("2026-10-18");
    expect(standardiseDate("31/02/2026")).toBeNull();
    expect(standardiseSku(" fr 12 ")).toBe("FR-0012");
    expect(standardiseSku("fr_1001")).toBe("FR-1001");
  });

  it("demo data validates cleanly and produces the expected mix", () => {
    const report = validateAndPrepare(demoRawFiles());
    expect(report.canRun).toBe(true);
    expect(report.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    const a = runAnalysis(report.dataset!);
    expect(a.runId).toBe("2026-W42");
    expect(a.recommendations).toHaveLength(60);
    const judgement = a.recommendations.filter((r) => r.decisionMode === "JUDGEMENT").length / 60;
    expect(judgement).toBeGreaterThanOrEqual(0.15);
    expect(judgement).toBeLessThanOrEqual(0.2);
    const masala = a.recommendations.find((r) => r.sku === "FR-1001")!;
    expect(masala.avg4).toBe(1250);
    expect(masala.avg12).toBe(980);
  });

  it("catches missing values, duplicates, bad numbers, unknown SKUs and bad dates", () => {
    const report = validateAndPrepare(messyRawFiles());
    const codes = report.issues.map((i) => i.code);
    for (const c of ["MISSING_VALUE", "DUPLICATE", "INVALID_NUMBER", "UNKNOWN_SKU", "INVALID_VALUE", "SKU_STANDARDISED", "DATE_STANDARDISED"]) expect(codes).toContain(c);
    expect(report.canRun).toBe(true);
  });

  it("refuses to run when a required file or column is missing", () => {
    const files = demoRawFiles();
    const noUnits = { ...files, sales: { headers: ["SKU", "Distributor", "Week"], rows: [] } };
    expect(validateAndPrepare(noUnits).canRun).toBe(false);
    const { inventory: _inv, ...rest } = files;
    expect(validateAndPrepare(rest).canRun).toBe(false);
  });
});

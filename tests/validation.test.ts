import { describe, expect, it } from "vitest";
import { standardiseDate } from "@/business/dates";
import { standardiseSku, validateAndPrepare } from "@/business/validationEngine";
import { freshrootsRawFiles } from "@/data/freshrootsFiles";

/** The sample files with realistic export problems injected. */
function messyFiles() {
  const files = freshrootsRawFiles();
  const s = files.sales!.rows;
  s[3] = { ...s[3], SKU_ID: " sku001 " };
  s[10] = { ...s[10], Week: "09/09/2026" };
  s.splice(20, 0, { ...s[20] });
  s[40] = { ...s[40], Units_Sold: "" };
  s[41] = { ...s[41], Units_Sold: "twelve" };
  s.push({ SKU_ID: "SKU999", Week: "2026-W42", Units_Sold: "40" });
  files.inventory!.rows[5] = { ...files.inventory!.rows[5], Units_On_Hand: "n/a" };
  files.skuMaster!.rows[8] = { ...files.skuMaster!.rows[8], Perishability: "Hgh" };
  return files;
}

describe("Data preparation", () => {
  it("standardises dates and SKU codes", () => {
    expect(standardiseDate("18/10/2026")).toBe("2026-10-18");
    expect(standardiseDate("18-Oct-2026")).toBe("2026-10-18");
    expect(standardiseDate("2026-W42")).toBe("2026-10-18");
    expect(standardiseDate("31/02/2026")).toBeNull();
    expect(standardiseSku(" sku001 ")).toBe("SKU001");
    expect(standardiseSku("fr_1001")).toBe("FR-1001");
  });

  it("catches missing values, duplicates, bad numbers, unknown SKUs and bad values", () => {
    const report = validateAndPrepare(messyFiles());
    const codes = report.issues.map((i) => i.code);
    for (const c of ["MISSING_VALUE", "DUPLICATE", "INVALID_NUMBER", "UNKNOWN_SKU", "INVALID_VALUE", "SKU_STANDARDISED", "WEEK_ALIGNED"]) expect(codes).toContain(c);
    // SKU009's master row was rejected, so it drops out; SKU006 lost its stock row and goes to manual review.
    expect(report.canRun).toBe(true);
    expect(report.summary.skus).toBe(14);
    expect(codes).toContain("NO_STOCK_RECORD");
  });

  it("refuses to run when a required file or column is missing", () => {
    const files = freshrootsRawFiles();
    expect(validateAndPrepare({ ...files, sales: { headers: ["SKU_ID", "Week"], rows: [] } }).canRun).toBe(false);
    const { inventory: _inv, ...rest } = files;
    expect(validateAndPrepare(rest).canRun).toBe(false);
  });

  it("runs without the optional files", () => {
    const { distributors: _d, calendar: _c, ...core } = freshrootsRawFiles();
    const report = validateAndPrepare(core);
    expect(report.canRun).toBe(true);
    expect(report.dataset!.festivalCalendar).toBeNull();
    // Without the distributor master, distributors are shown by their ID.
    expect(report.dataset!.distributors).toContain("DIST001");
  });
});

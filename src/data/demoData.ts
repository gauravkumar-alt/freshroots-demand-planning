import type { RawDatasets } from "@/business/types";
import { datasetsToRawFiles, type CoreFileKind, type RawFile } from "@/business/validationEngine";
import { inventory } from "./inventory";
import { purchaseOrders } from "./purchaseOrders";
import { sales } from "./sales";
import { skuMaster } from "./skuMaster";

export { DEMO_ANALYSIS_WEEK, DEMO_EXPORT_DATE } from "./calendar";
export { demoHistory, PILOT_START_RUN, REVIEWER } from "./demoHistory";

export const demoDatasets: RawDatasets = { sales, inventory, skuMaster, purchaseOrders };

/** Demo data as CSV-shaped files, so it goes through exactly the same validation as an upload. */
export function demoRawFiles(): Record<CoreFileKind, RawFile> {
  return datasetsToRawFiles(demoDatasets);
}

/**
 * The demo files with realistic export problems injected, to show what validation catches:
 * inconsistent SKU codes and date formats, a duplicate row, empty and non-numeric values, an unknown SKU,
 * and an invalid perishability value.
 */
export function messyRawFiles(): Record<CoreFileKind, RawFile> {
  const files = demoRawFiles();
  const s = files.sales.rows;
  s[3] = { ...s[3], SKU: s[3].SKU.toLowerCase().replace("-", " ") };
  s[10] = { ...s[10], Week: s[10].Week.split("-").reverse().join("/") };
  s[11] = { ...s[11], Week: s[11].Week.split("-").reverse().join("/") };
  s.splice(20, 0, { ...s[20] });
  s[40] = { ...s[40], "Units sold": "" };
  s[41] = { ...s[41], "Units sold": "twelve" };
  s.push({ SKU: "FR-9999", Product: "Test SKU", Distributor: "Shree Ganesh Traders, Pune", Week: "2026-10-18", "Units sold": "40" });
  const inv = files.inventory.rows;
  inv[5] = { ...inv[5], "Current stock": "n/a" };
  inv.push({ SKU: "FR-9999", "Current stock": "100" });
  const m = files.skuMaster.rows;
  m[8] = { ...m[8], Perishability: "Hgh" };
  const po = files.purchaseOrders.rows;
  po[2] = { ...po[2], "Order date": "18-Oct-2026" };
  po[4] = { ...po[4], "Expected delivery date": "soon" };
  return files;
}

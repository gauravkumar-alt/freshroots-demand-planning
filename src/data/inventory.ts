import { RULES } from "@/business/rulesConfig";
import type { InventoryRow } from "@/business/types";
import { PROFILES } from "./profiles";
import { weeklyTotals } from "./sales";

/** SAP stock on hand as of the Monday export. Built so each SKU lands at its scenario's weeks of stock. */
export const inventory: InventoryRow[] = PROFILES.map((p) => {
  if (p.stock !== undefined) return { sku: p.sku, currentStock: p.stock };
  const last4 = (weeklyTotals(p).slice(-4) as number[]).reduce((s, v) => s + (v ?? 0), 0) / 4;
  return { sku: p.sku, currentStock: Math.round((p.wos * last4 * RULES.festivalUplift) / 10) * 10 };
});

import { RULES } from "./rulesConfig";
import type { InventoryWindow, Perishability } from "./types";

/** Rule 5: high-perishability SKUs use a 3–4 week window instead of the normal 6–14 weeks. */
export function inventoryWindow(perishability: Perishability): InventoryWindow {
  return perishability === "High"
    ? { min: RULES.perishableMinWeeks, max: RULES.perishableMaxWeeks, kind: "perishable" }
    : { min: RULES.stockoutWeeks, max: RULES.overstockWeeks, kind: "normal" };
}

export type CoveragePosition = "below" | "within" | "above";

export function coveragePosition(weeksOfStock: number, window: InventoryWindow): CoveragePosition {
  if (weeksOfStock < window.min) return "below";
  if (weeksOfStock > window.max) return "above";
  return "within";
}

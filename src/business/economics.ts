// What a SKU's position means in money and dates: when it runs out, when an order placed today would land,
// and the ₹ at stake. Pure calculations on numbers the engine already has.

import { addDays, daysBetween } from "./dates";
import type { Economics, InventoryWindow, SkuMasterRow } from "./types";

export interface EconomicsInput {
  master: SkuMasterRow;
  currentStock: number | null;
  /** Festival-adjusted units per week. */
  weeklyDemand: number;
  window: InventoryWindow;
  openPoQty: number;
  asOfDate: string;
  /** The day an order would be placed: today, or the snapshot date if that is later. Defaults to the snapshot date. */
  orderDate?: string;
}

export function computeEconomics(i: EconomicsInput): Economics {
  const unitCost = i.master.unitCost ?? null;
  const sellingPrice = i.master.sellingPrice ?? null;
  const marginPerUnit = unitCost !== null && sellingPrice !== null ? sellingPrice - unitCost : null;
  const leadTimeDays = i.master.leadTimeDays ?? null;
  const daily = i.weeklyDemand / 7;
  const stock = i.currentStock;

  const runOutDate = stock !== null && daily > 0 ? addDays(i.asOfDate, Math.floor(stock / daily)) : null;
  const orderDate = i.orderDate && i.orderDate > i.asOfDate ? i.orderDate : i.asOfDate;
  const arrivalIfOrderedToday = leadTimeDays !== null ? addDays(orderDate, Math.ceil(leadTimeDays)) : null;
  const stockoutGapDays = runOutDate && arrivalIfOrderedToday ? Math.max(0, daysBetween(runOutDate, arrivalIfOrderedToday)) : null;

  const shortfallUnits = stock !== null && daily > 0 ? Math.max(0, Math.round(i.window.min * i.weeklyDemand - stock - i.openPoQty)) : 0;
  const excessUnits = stock !== null && daily > 0 ? Math.max(0, Math.round(stock - i.window.max * i.weeklyDemand)) : 0;

  let valueAtRisk: number | null = null;
  let valueKind: Economics["valueKind"] = null;
  if (shortfallUnits > 0 && marginPerUnit !== null) {
    valueAtRisk = Math.round(shortfallUnits * marginPerUnit);
    valueKind = "MARGIN_AT_RISK";
  } else if (excessUnits > 0 && unitCost !== null) {
    valueAtRisk = Math.round(excessUnits * unitCost);
    valueKind = "CASH_TIED_UP";
  }

  return { unitCost, sellingPrice, marginPerUnit, leadTimeDays, asOfDate: i.asOfDate, runOutDate, arrivalIfOrderedToday, stockoutGapDays, shortfallUnits, excessUnits, valueAtRisk, valueKind };
}

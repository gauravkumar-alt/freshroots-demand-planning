import { daysBetween } from "./dates";
import type { PurchaseOrderRow } from "./types";

/** Current stock ÷ average weekly sales. Returns null instead of dividing by zero. */
export function weeksOfStock(currentStock: number | null, weeklyDemand: number): number | null {
  if (currentStock === null || !(weeklyDemand > 0)) return null;
  return currentStock / weeklyDemand;
}

export interface PurchaseOrderContext {
  openQty: number;
  nextDelivery: string | null;
  lastOrderQty: number | null;
  lastOrderDate: string | null;
}

/** Zoho context: orders not yet delivered as of the analysis week, plus the most recent order. */
export function purchaseOrderContext(orders: PurchaseOrderRow[], asOf: string): PurchaseOrderContext {
  const open = orders.filter((o) => o.expectedDelivery !== null && daysBetween(asOf, o.expectedDelivery) > 0);
  const latest = [...orders].sort((a, b) => b.orderDate.localeCompare(a.orderDate))[0];
  const nextDelivery = open.map((o) => o.expectedDelivery as string).sort()[0] ?? null;
  return {
    openQty: open.reduce((s, o) => s + o.orderQty, 0),
    nextDelivery,
    lastOrderQty: latest ? latest.orderQty : null,
    lastOrderDate: latest ? latest.orderDate : null,
  };
}

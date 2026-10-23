import { addDays } from "@/business/dates";
import type { PurchaseOrderRow } from "@/business/types";
import { DEMO_ANALYSIS_WEEK } from "./calendar";
import { DISTRIBUTORS, PROFILES } from "./profiles";
import { hashSeed, mulberry32 } from "./rng";

const d = (days: number) => addDays(DEMO_ANALYSIS_WEEK, days);

/** Zoho Inventory purchase orders: one delivered order and, for most SKUs, one recent order. */
export const purchaseOrders: PurchaseOrderRow[] = PROFILES.flatMap((p) => {
  const rnd = mulberry32(hashSeed(p.sku + ":po"));
  const dist = DISTRIBUTORS[Math.floor(rnd() * DISTRIBUTORS.length)];
  const rows: PurchaseOrderRow[] = [];
  if (p.scenario !== "NEW_LAUNCH" && p.scenario !== "ZERO_SALES") {
    rows.push({ sku: p.sku, distributor: dist, previousOrder: p.soq, orderQty: p.soq, orderDate: d(-38), expectedDelivery: d(-24) });
  }
  switch (p.scenario) {
    case "STOCKOUT_PO_COVERED":
      rows.push({ sku: p.sku, distributor: dist, previousOrder: p.soq, orderQty: p.soq * 2, orderDate: d(-3), expectedDelivery: d(6) });
      break;
    case "STOCKOUT":
    case "STOCKOUT_HIGH_DEMAND":
    case "PERISHABLE_BELOW":
      rows.push({ sku: p.sku, distributor: dist, previousOrder: p.soq, orderQty: p.soq, orderDate: d(-16), expectedDelivery: d(-4) });
      break;
    case "OVERSTOCK":
    case "OVERSTOCK_FALLING":
      rows.push({ sku: p.sku, distributor: dist, previousOrder: p.soq, orderQty: p.soq, orderDate: d(-6), expectedDelivery: d(9) });
      break;
    case "NEW_LAUNCH":
      rows.push({ sku: p.sku, distributor: dist, previousOrder: 0, orderQty: p.soq * 2, orderDate: d(-7 * (p.history ?? 4) - 5), expectedDelivery: d(-7 * (p.history ?? 4)) });
      break;
    case "ZERO_SALES":
      rows.push({ sku: p.sku, distributor: dist, previousOrder: p.soq, orderQty: p.soq, orderDate: d(-80), expectedDelivery: d(-66) });
      break;
    default:
      // Some recent orders have no delivery date yet in Zoho.
      rows.push({ sku: p.sku, distributor: dist, previousOrder: p.soq, orderQty: p.soq, orderDate: d(-9), expectedDelivery: rnd() < 0.3 ? null : d(rnd() < 0.5 ? -1 : 12) });
  }
  return rows;
});

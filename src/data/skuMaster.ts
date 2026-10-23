import type { SkuMasterRow } from "@/business/types";
import { PROFILES } from "./profiles";

/** SAP SKU master: 60 of Freshroots' 400 active SKUs. */
export const skuMaster: SkuMasterRow[] = PROFILES.map((p) => ({
  sku: p.sku,
  product: p.product,
  category: p.category,
  perishability: p.perishability,
  standardOrderQty: p.soq,
}));

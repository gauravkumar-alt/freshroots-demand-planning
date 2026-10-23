// PO on Zoho (the map's Zoho lane): turns an approved reorder into a Zoho Inventory purchase-order payload.

import type { AuditEntry, Recommendation } from "./types";
import { addDays } from "./dates";

export interface PurchaseOrderRequest {
  runId: string;
  sku: string;
  product: string;
  quantity: number;
  /** Idempotency key: one PO per SKU per weekly run. */
  reference: string;
  deliveryDate: string;
  notes: string;
}

export function purchaseOrderRequest(rec: Recommendation, entry: AuditEntry, analysisWeek: string): PurchaseOrderRequest | null {
  const isReorder = entry.finalAction === "IMMEDIATE_REORDER" || entry.finalAction === "REORDER_1_5X";
  if (!isReorder || !entry.finalQty) return null;
  const urgent = entry.finalAction === "IMMEDIATE_REORDER";
  return {
    runId: entry.runId,
    sku: rec.sku,
    product: rec.product,
    quantity: entry.finalQty,
    reference: `FR-PLAN-${entry.runId}-${rec.sku}`,
    deliveryDate: addDays(analysisWeek, urgent ? 8 : 15),
    notes: `${urgent ? "Immediate reorder" : "Reorder at 1.5× standard"} · ${entry.type === "EDITED" ? `edited by ${entry.user}: ${entry.reason}` : `approved by ${entry.user}`}`,
  };
}

export interface PurchaseOrderResult {
  ok: boolean;
  mode: "live" | "simulated";
  poNumber?: string;
  error?: string;
}

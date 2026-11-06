// Purchase orders, raised by the app itself when Raghav approves a reorder.

import { addDays } from "./dates";
import type { ActionCode, AuditEntry, Recommendation } from "./types";

/** One PO per SKU per weekly run, so its number is fixed: FR-PO-2026-W42-013. Retries can never make a second one. */
export function poNumber(runId: string, sku: string): string {
  return `FR-PO-${runId}-${sku.replace(/^SKU/i, "")}`;
}

/** The PO number for a PO_CREATED entry. Entries from before in-app POs carried another number; they map to the same fixed one. */
export function poNumberOf(entry: Pick<AuditEntry, "runId" | "sku" | "reference">): string {
  return entry.reference?.startsWith("FR-PO-") ? entry.reference : poNumber(entry.runId, entry.sku ?? "");
}

export interface PurchaseOrderRequest {
  runId: string;
  sku: string;
  product: string;
  quantity: number;
  reference: string;
}

export function purchaseOrderRequest(rec: Recommendation, entry: AuditEntry): PurchaseOrderRequest | null {
  const isReorder = entry.finalAction === "IMMEDIATE_REORDER" || entry.finalAction === "REORDER_1_5X";
  if (!isReorder || !entry.finalQty) return null;
  return { runId: entry.runId, sku: rec.sku, product: rec.product, quantity: entry.finalQty, reference: poNumber(entry.runId, rec.sku) };
}

export interface PurchaseOrderResult {
  ok: boolean;
  poNumber?: string;
  error?: string;
}

/** Raises the PO inside the app. */
export async function createPurchaseOrder(po: PurchaseOrderRequest): Promise<PurchaseOrderResult> {
  return { ok: true, poNumber: po.reference };
}

export interface PurchaseOrderDocument {
  number: string;
  runId: string;
  issuedAt: string;
  sku: string;
  product: string;
  category: string | null;
  distributor: string | null;
  action: ActionCode | null;
  quantity: number;
  unitCost: number | null;
  total: number | null;
  leadTimeDays: number | null;
  expectedDelivery: string | null;
  approvedBy: string;
  approvedAt: string;
  decision: "APPROVED" | "EDITED";
  systemQty: number | null;
  note: string;
}

/**
 * Everything a printed PO shows. Quantity, dates and approver come from the audit log, which never changes;
 * cost, distributor and lead time come from the SKU's current recommendation (the SKU master).
 */
export function purchaseOrderDocument(po: AuditEntry, decision: AuditEntry | null, rec: Recommendation | null): PurchaseOrderDocument {
  const quantity = po.finalQty ?? decision?.finalQty ?? 0;
  const unitCost = rec?.economics.unitCost ?? null;
  const lead = rec?.economics.leadTimeDays ?? null;
  const issued = po.timestamp.slice(0, 10);
  return {
    number: poNumberOf(po),
    runId: po.runId,
    issuedAt: po.timestamp,
    sku: po.sku ?? "",
    product: po.product ?? rec?.product ?? "",
    category: rec?.category ?? null,
    distributor: rec?.leadDistributor ?? null,
    action: po.finalAction ?? decision?.finalAction ?? null,
    quantity,
    unitCost,
    total: unitCost != null ? unitCost * quantity : null,
    leadTimeDays: lead,
    expectedDelivery: lead != null ? addDays(issued, lead) : null,
    approvedBy: decision?.user ?? "Raghav Kulkarni",
    approvedAt: decision?.timestamp ?? po.timestamp,
    decision: decision?.type === "EDITED" ? "EDITED" : "APPROVED",
    systemQty: decision?.systemQty ?? null,
    note: decision?.type === "EDITED" ? decision.reason : "",
  };
}

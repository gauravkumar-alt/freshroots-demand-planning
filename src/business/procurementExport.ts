// The approved-orders CSV for procurement, built from the audit log as it stands (not a browser's copy).

import { toCsv } from "./csv";
import { effectiveDecisions } from "./decisions";
import { ACTION_LABEL, PROCUREMENT_ACTIONS } from "./labels";
import { poNumberOf } from "./purchaseOrder";
import type { AnalysisResult, AuditEntry } from "./types";

const ist = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function procurementCsv(analysis: AnalysisResult, audit: AuditEntry[]): { filename: string; csv: string; count: number; skus: string[] } {
  const standing = effectiveDecisions(audit).filter((e) => e.runId === analysis.runId && (e.type === "APPROVED" || e.type === "EDITED") && e.finalAction && PROCUREMENT_ACTIONS.includes(e.finalAction));
  const bySku = new Map(analysis.recommendations.map((r) => [r.sku, r]));
  const rows = standing
    .filter((e) => bySku.has(e.sku!))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((e) => {
      const rec = bySku.get(e.sku!)!;
      const reorder = e.finalAction === "IMMEDIATE_REORDER" || e.finalAction === "REORDER_1_5X";
      const po = audit.find((x) => x.sku === e.sku && x.runId === e.runId && (x.type === "PO_CREATED" || x.type === "PO_HELD" || x.type === "PO_FAILED") && x.timestamp >= e.timestamp);
      const poText = !reorder ? "Not needed" : po?.type === "PO_CREATED" ? poNumberOf(po) : po?.type === "PO_HELD" ? "Held by kill switch" : po?.type === "PO_FAILED" ? "Failed" : "Pending";
      return [
        analysis.runId,
        rec.sku,
        rec.product,
        rec.category,
        rec.leadDistributor ?? "",
        ACTION_LABEL[e.finalAction!],
        e.finalQty ?? 0,
        rec.suggestedQty ?? "",
        e.type === "EDITED" ? "Edited" : "Approved",
        e.user,
        ist(e.timestamp),
        e.reason || "As recommended",
        poText,
      ] as (string | number)[];
    });
  const csv = toCsv(
    ["Run", "SKU", "Product", "Category", "Lead distributor", "Action", "Approved quantity", "System quantity", "Decision", "Approved by", "Approved at (IST)", "Reason", "PO number"],
    rows,
  );
  return { filename: `freshroots-approved-orders-${analysis.runId}.csv`, csv, count: rows.length, skus: rows.map((r) => String(r[1])) };
}

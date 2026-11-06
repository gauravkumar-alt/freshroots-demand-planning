// What the server accepts from the browser. The browser only says *which* SKU and *what* the user chose;
// recommendations, users, timestamps and kill-switch state always come from the server's own data.

import { REVIEWER } from "@/business/config";
import { effectiveDecisions, reopenAudit, type DecisionInput } from "@/business/decisions";
import { auditEvent } from "@/business/events";
import { killSwitchState } from "@/business/measurement";
import { poNumberOf } from "@/business/purchaseOrder";
import type { AnalysisResult, AuditEntry, Recommendation } from "@/business/types";

export type GuardResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const STALE = "This week's data changed since the page loaded. Refresh the page and try again.";

/** Swap the browser's copy of each recommendation for the server's own, for the current run only. */
export function resolveDecisionItems(
  analysis: AnalysisResult,
  runId: string,
  items: { rec?: { sku?: string }; sku?: string; input: DecisionInput }[],
): GuardResult<{ rec: Recommendation; input: DecisionInput }[]> {
  if (runId !== analysis.runId) return { ok: false, status: 409, error: STALE };
  const bySku = new Map(analysis.recommendations.map((r) => [r.sku, r]));
  const resolved: { rec: Recommendation; input: DecisionInput }[] = [];
  for (const item of items) {
    const sku = item.rec?.sku ?? item.sku;
    const rec = sku ? bySku.get(sku) : undefined;
    if (!rec) return { ok: false, status: 400, error: `Unknown SKU ${sku ?? "(none)"} for ${analysis.runId}.` };
    if (!item.input || !["APPROVE", "EDIT", "REJECT"].includes(item.input.kind)) return { ok: false, status: 400, error: "Invalid decision." };
    resolved.push({ rec, input: item.input });
  }
  return { ok: true, value: resolved };
}

const MAX_TEXT = 500;
const clean = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, MAX_TEXT) : "");

/**
 * Rebuild each event the browser may post. Only these four types are allowed, each is re-stamped with the
 * server's time and the reviewer, and the ones that change state are checked against the audit log.
 */
export function buildClientEvents(entries: Partial<AuditEntry>[], runAudit: AuditEntry[], analysis: AnalysisResult, now = new Date().toISOString()): GuardResult<AuditEntry[]> {
  const out: AuditEntry[] = [];
  for (const e of entries) {
    if (e.runId !== analysis.runId) return { ok: false, status: 409, error: STALE };
    switch (e.type) {
      case "ANALYSIS_RUN": {
        // Keep the fixed id for the week's first run, so two people opening the app at once log it once.
        const first = e.id === `${analysis.runId}-ANALYSIS_RUN-first`;
        out.push(auditEvent("ANALYSIS_RUN", analysis.runId, "System", `Weekly analysis: ${analysis.recommendations.length} SKUs.`, { timestamp: now, ...(first ? { id: e.id } : {}) }));
        break;
      }
      case "EXPORT":
        out.push(auditEvent("EXPORT", analysis.runId, REVIEWER, clean(e.reason) || "Approved orders exported as CSV.", { timestamp: now }));
        break;
      case "REOPENED": {
        const rec = analysis.recommendations.find((r) => r.sku === e.sku);
        const decision = effectiveDecisions(runAudit).find((d) => d.sku === e.sku);
        if (!rec || !decision) return { ok: false, status: 409, error: "There is no decision to reopen." };
        const po = runAudit.find((x) => x.sku === e.sku && x.type === "PO_CREATED" && x.timestamp >= decision.timestamp);
        if (po) return { ok: false, status: 409, error: `Purchase order ${poNumberOf(po)} is already raised for this decision.` };
        out.push(
          reopenAudit(rec, analysis.runId, REVIEWER, now, {
            runId: decision.runId,
            sku: rec.sku,
            status: decision.type as "APPROVED" | "EDITED" | "REJECTED",
            finalAction: decision.finalAction ?? rec.action,
            finalQty: decision.finalQty,
            reason: decision.reason,
            exceptionCategory: decision.exceptionCategory,
            user: decision.user,
            timestamp: decision.timestamp,
          }),
        );
        break;
      }
      case "KILL_SWITCH_RESUMED": {
        const ks = killSwitchState(runAudit, analysis.runId);
        if (!ks.active) return { ok: false, status: 409, error: "The kill switch is not active." };
        const why = clean(e.reason).replace(/^PO creation resumed:\s*/i, "");
        if (why.length < 5) return { ok: false, status: 400, error: "Give a reason for resuming PO creation." };
        out.push(auditEvent("KILL_SWITCH_RESUMED", analysis.runId, REVIEWER, `PO creation resumed: ${why}`, { timestamp: now, reference: String(ks.check.rejected) }));
        break;
      }
      default:
        return { ok: false, status: 400, error: `Events of type ${e.type ?? "(none)"} can't be posted directly.` };
    }
  }
  return { ok: true, value: out };
}

import "server-only";
// The map's server-side path: decision → "Breaches threshold?" → PO on Zoho, or held with an email alert.

import { REVIEWER } from "@/business/config";
import { decide, effectiveDecisions, type DecisionInput } from "@/business/decisions";
import { auditEvent } from "@/business/events";
import { killSwitchState } from "@/business/measurement";
import type { AuditEntry, Recommendation } from "@/business/types";
import { purchaseOrderRequest, type PurchaseOrderRequest, type PurchaseOrderResult } from "@/business/zohoPurchaseOrder";
import type { EmailResult } from "./email";
import type { Repo } from "./repo";

export interface WorkflowDeps {
  createPurchaseOrder: (po: PurchaseOrderRequest) => Promise<PurchaseOrderResult>;
  sendKillSwitchEmail: (input: { check: ReturnType<typeof killSwitchState>["check"]; weekLabel: string; heldPos: number; recentRejections: { sku: string; product: string; reason: string }[] }) => Promise<EmailResult>;
}

export interface RunContext {
  runId: string;
  analysisWeek: string;
  weekLabel: string;
}

export interface DecisionItem {
  rec: Recommendation;
  input: DecisionInput;
}

/** Gives each event in a batch a strictly later timestamp, so the audit log always reads in the order things happened. */
function inOrder(batch: AuditEntry[], after: string | null): AuditEntry[] {
  let last = after ? Date.parse(after) : 0;
  return batch.map((e) => {
    const t = Math.max(Date.parse(e.timestamp), last + 1);
    last = t;
    return { ...e, timestamp: new Date(t).toISOString() };
  });
}

const isReorder = (e: AuditEntry) => e.finalAction === "IMMEDIATE_REORDER" || e.finalAction === "REORDER_1_5X";
const sorted = (list: AuditEntry[]) => [...list].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

async function raisePo(rec: Recommendation, decision: AuditEntry, ctx: RunContext, halted: boolean, deps: WorkflowDeps): Promise<AuditEntry | null> {
  const req = purchaseOrderRequest(rec, decision, ctx.analysisWeek);
  if (!req) return null;
  const base = { sku: rec.sku, product: rec.product, finalAction: decision.finalAction, finalQty: decision.finalQty };
  if (halted) return auditEvent("PO_HELD", ctx.runId, "System", "Kill switch active: purchase order held, not sent to Zoho.", base);
  const res = await deps.createPurchaseOrder(req);
  return res.ok
    ? auditEvent("PO_CREATED", ctx.runId, "System", `${res.mode === "live" ? "Zoho" : "Simulated Zoho"} PO ${res.poNumber} for ${req.quantity.toLocaleString("en-IN")} units.`, { ...base, reference: res.poNumber })
    : auditEvent("PO_FAILED", ctx.runId, "System", res.error ?? "Zoho rejected the purchase order.", base);
}

/** Records decisions one by one. After each: check the kill switch, then raise (or hold) the Zoho PO. */
export async function recordDecisions(repo: Repo, ctx: RunContext, items: DecisionItem[], deps: WorkflowDeps) {
  const created: AuditEntry[] = [];
  const results: { sku: string; ok: boolean; error?: string }[] = [];
  let runAudit = await repo.auditForRun(ctx.runId);

  for (const { rec, input } of items) {
    const existing = effectiveDecisions(runAudit).find((e) => e.sku === rec.sku);
    if (existing) {
      results.push({ sku: rec.sku, ok: false, error: `${rec.product} was already ${existing.type.toLowerCase()} by ${existing.user}.` });
      continue;
    }
    const res = decide(rec, ctx.runId, input, REVIEWER, new Date().toISOString());
    if (!res.ok) {
      results.push({ sku: rec.sku, ok: false, error: res.error });
      continue;
    }
    const batch: AuditEntry[] = [res.audit];
    runAudit = sorted([res.audit, ...runAudit]);

    const ks = killSwitchState(runAudit, ctx.runId);
    let halted = ks.active;
    if (ks.shouldFire) {
      halted = true;
      const fire = auditEvent(
        "KILL_SWITCH",
        ctx.runId,
        "System",
        `Kill switch fired: ${ks.check.rejected} of ${ks.check.decided} decisions rejected (${((ks.check.rate ?? 0) * 100).toFixed(1)}% > 50%). Zoho PO creation halted.`,
        { reference: String(ks.check.rejected) },
      );
      const standing = effectiveDecisions(runAudit);
      const email = await deps.sendKillSwitchEmail({
        check: ks.check,
        weekLabel: ctx.weekLabel,
        heldPos: standing.filter((e) => e.type !== "REJECTED" && isReorder(e)).length,
        recentRejections: standing.filter((e) => e.type === "REJECTED").map((e) => ({ sku: e.sku!, product: e.product ?? "", reason: e.reason })),
      });
      const msg = email.ok
        ? email.mode === "live"
          ? `Kill-switch email sent to ${email.to}: “${email.subject}”.`
          : `Kill-switch email prepared${email.to ? ` for ${email.to}` : ""} but not sent: ${email.error}`
        : `Kill-switch email failed${email.to ? ` to ${email.to}` : ""}: ${email.error}`;
      const mail = auditEvent("EMAIL_SENT", ctx.runId, "System", msg, { reference: email.mode === "live" ? (email.id ?? "sent") : "preview" });
      batch.push(fire, mail);
      runAudit = sorted([fire, mail, ...runAudit]);
    }

    if (res.audit.type !== "REJECTED") {
      const po = await raisePo(rec, res.audit, ctx, halted, deps);
      if (po) {
        batch.push(po);
        runAudit = sorted([po, ...runAudit]);
      }
    }
    const ordered = inOrder(batch, created.length ? created[created.length - 1].timestamp : null);
    await repo.append(ordered);
    created.push(...ordered);
    results.push({ sku: rec.sku, ok: true });
  }
  return { results, entries: created };
}

/** Raises the PO for an approved reorder that was held or failed earlier. */
export async function retryPurchaseOrder(repo: Repo, ctx: RunContext, rec: Recommendation, deps: WorkflowDeps) {
  const runAudit = await repo.auditForRun(ctx.runId);
  if (killSwitchState(runAudit, ctx.runId).active) return { ok: false as const, error: "The kill switch is active. Resume PO creation first." };
  const decision = effectiveDecisions(runAudit).find((e) => e.sku === rec.sku);
  if (!decision || decision.type === "REJECTED") return { ok: false as const, error: "No approved decision for this SKU." };
  const created = runAudit.find((e) => e.sku === rec.sku && e.type === "PO_CREATED" && e.timestamp >= decision.timestamp);
  if (created) return { ok: false as const, error: `PO ${created.reference} already exists.` };
  const raised = await raisePo(rec, decision, ctx, false, deps);
  if (!raised) return { ok: false as const, error: "This decision needs no PO." };
  const [po] = inOrder([raised], decision.timestamp);
  await repo.append([po]);
  return { ok: true as const, entries: [po] };
}

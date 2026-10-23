// Human review: Approve / Edit / Reject, and the audit and exception records they produce.

import { addDays, isoWeekToWeekEnding } from "./dates";
import { RULES } from "./rulesConfig";
import type { ActionCode, AuditEntry, Decision, DecisionStatus, ExceptionCategory, Recommendation, RubricNote } from "./types";

export type DecisionInput =
  | { kind: "APPROVE" }
  | { kind: "EDIT"; action: ActionCode; qty: number; reason: string; category: ExceptionCategory | null }
  | { kind: "REJECT"; reason: string; category: ExceptionCategory | null };

export type DecisionResult = { ok: true; decision: Decision; audit: AuditEntry } | { ok: false; error: string };

const MIN_REASON = 5;

export function decisionKey(runId: string, sku: string): string {
  return `${runId}|${sku}`;
}

export function statusOf(rec: Recommendation, runId: string, decisions: Record<string, Decision>): DecisionStatus {
  return decisions[decisionKey(runId, rec.sku)]?.status ?? "NEEDS_REVIEW";
}

/** Validates a reviewer's decision and returns the decision plus its audit entry. */
export function decide(rec: Recommendation, runId: string, input: DecisionInput, user: string, now: string): DecisionResult {
  let decision: Decision;
  if (input.kind === "APPROVE") {
    if (rec.action === "MANUAL_REVIEW") return { ok: false, error: "There is no system action to approve. Use Edit to choose an action and quantity." };
    decision = { runId, sku: rec.sku, status: "APPROVED", finalAction: rec.action, finalQty: rec.suggestedQty, reason: "", exceptionCategory: null, user, timestamp: now };
  } else if (input.kind === "EDIT") {
    if (input.action === "MANUAL_REVIEW") return { ok: false, error: "Choose a concrete action for procurement." };
    if (!Number.isInteger(input.qty) || input.qty < 0) return { ok: false, error: "Quantity must be a whole number of units, 0 or more." };
    if ((input.action === "IMMEDIATE_REORDER" || input.action === "REORDER_1_5X") && input.qty === 0) return { ok: false, error: "A reorder needs a quantity above 0." };
    if (input.action === rec.action && input.qty === rec.suggestedQty) return { ok: false, error: "Nothing changed. Use Approve to accept the recommendation as it is." };
    if (input.reason.trim().length < MIN_REASON) return { ok: false, error: "Add a reason so the override can be audited and learned from." };
    decision = { runId, sku: rec.sku, status: "EDITED", finalAction: input.action, finalQty: input.qty, reason: input.reason.trim(), exceptionCategory: input.category, user, timestamp: now };
  } else {
    if (input.reason.trim().length < MIN_REASON) return { ok: false, error: "Add a reason so the rejection can be audited and learned from." };
    decision = { runId, sku: rec.sku, status: "REJECTED", finalAction: rec.action, finalQty: 0, reason: input.reason.trim(), exceptionCategory: input.category, user, timestamp: now };
  }
  return { ok: true, decision, audit: auditFor(rec, decision) };
}

function auditFor(rec: Recommendation, d: Decision): AuditEntry {
  return {
    id: `${d.runId}-${rec.sku}-${d.timestamp}`,
    timestamp: d.timestamp,
    runId: d.runId,
    type: d.status,
    user: d.user,
    sku: rec.sku,
    product: rec.product,
    systemAction: rec.action,
    systemQty: rec.suggestedQty,
    finalAction: d.status === "REJECTED" ? null : d.finalAction,
    finalQty: d.status === "REJECTED" ? 0 : d.finalQty,
    override: d.status !== "APPROVED",
    reason: d.reason,
    exceptionCategory: d.exceptionCategory,
    risk: rec.risk,
  };
}

export function reopenAudit(rec: Recommendation, runId: string, user: string, now: string, previous: Decision): AuditEntry {
  return {
    id: `${runId}-${rec.sku}-reopen-${now}`,
    timestamp: now,
    runId,
    type: "REOPENED",
    user,
    sku: rec.sku,
    product: rec.product,
    systemAction: rec.action,
    systemQty: rec.suggestedQty,
    finalAction: null,
    finalQty: null,
    override: false,
    reason: `Decision "${previous.status.toLowerCase()}" reopened for review.`,
    exceptionCategory: null,
    risk: rec.risk,
  };
}

/** The decision that currently stands for each run + SKU, after later decisions and reopenings. */
export function effectiveDecisions(audit: AuditEntry[]): AuditEntry[] {
  const latest = new Map<string, AuditEntry | null>();
  for (const e of [...audit].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    if (!e.sku) continue;
    const k = decisionKey(e.runId, e.sku);
    if (e.type === "REOPENED") latest.set(k, null);
    else if (e.type === "APPROVED" || e.type === "EDITED" || e.type === "REJECTED") latest.set(k, e);
  }
  return [...latest.values()].filter((e): e is AuditEntry => e !== null);
}

export interface ExceptionEntry {
  id: string;
  runId: string;
  date: string;
  sku: string;
  product: string;
  original: string;
  decision: string;
  reason: string;
  category: ExceptionCategory;
  demo: boolean;
}

/** Exception library: every override (edit or rejection) that currently stands. */
export function exceptionLibrary(audit: AuditEntry[], describe: (a: ActionCode | null, q: number | null) => string): ExceptionEntry[] {
  return effectiveDecisions(audit)
    .filter((e) => e.override)
    .map((e) => ({
      id: e.id,
      runId: e.runId,
      date: e.timestamp,
      sku: e.sku!,
      product: e.product ?? "",
      original: describe(e.systemAction, e.systemQty),
      decision: e.type === "REJECTED" ? "Rejected" : `Edited → ${describe(e.finalAction, e.finalQty)}`,
      reason: e.reason,
      category: e.exceptionCategory ?? "Other judgement",
      demo: !!e.demo,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface ExceptionPattern {
  key: string;
  title: string;
  count: number;
  runs: number;
  skus: string[];
  category: ExceptionCategory;
  suggestion: string;
}

const SUGGESTION: Record<ExceptionCategory, string> = {
  "New product launch": "Document a launch rule: fixed launch quantity per distributor until 12 weeks of history exist.",
  "Unusual distributor behaviour": "Document a rule to exclude or cap one-off distributor bulk orders from the 4-week average.",
  "One-off market event": "Add known local events to the festival calendar so the uplift is planned, not overridden.",
  "Data issue": "Ask IT to exclude quality-hold and near-expiry stock from the SAP inventory export.",
  "Supply constraint": "Capture planned plant maintenance and route closures as an input to the weekly run.",
  "Other judgement": "Review with Raghav whether this should become a documented rule.",
};

/** Recurring override patterns: the same category or the same SKU overridden more than once. Deterministic grouping, no model training. */
export function exceptionPatterns(entries: ExceptionEntry[]): ExceptionPattern[] {
  const byCategory = new Map<ExceptionCategory, ExceptionEntry[]>();
  for (const e of entries) byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e]);
  const patterns: ExceptionPattern[] = [];
  for (const [category, list] of byCategory) {
    if (list.length < 2) continue;
    patterns.push({
      key: `cat-${category}`,
      title: category,
      count: list.length,
      runs: new Set(list.map((e) => e.runId)).size,
      skus: [...new Set(list.map((e) => e.sku))],
      category,
      suggestion: SUGGESTION[category],
    });
  }
  return patterns.sort((a, b) => b.count - a.count);
}

export function repeatSkus(entries: ExceptionEntry[]): { sku: string; product: string; count: number; categories: ExceptionCategory[] }[] {
  const m = new Map<string, ExceptionEntry[]>();
  for (const e of entries) m.set(e.sku, [...(m.get(e.sku) ?? []), e]);
  return [...m.entries()]
    .filter(([, l]) => l.length >= 2)
    .map(([sku, l]) => ({ sku, product: l[0].product, count: l.length, categories: [...new Set(l.map((e) => e.category))] }))
    .sort((a, b) => b.count - a.count);
}

/** "2026-W42" plus n weeks. */
export function runIdPlus(runId: string, n: number): string {
  const [y, w] = runId.split("-W").map(Number);
  const end = addDays(isoWeekToWeekEnding(y, w), 7 * n);
  const d = new Date(end + "T00:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Rejects → Rubric: every standing rejection becomes a rubric note for the following runs. */
export function rubricNotes(audit: AuditEntry[], retiredIds: string[]): RubricNote[] {
  return effectiveDecisions(audit)
    .filter((e) => e.type === "REJECTED" && e.sku)
    .map((e) => {
      const id = `note-${e.runId}-${e.sku}`;
      return {
        id,
        sku: e.sku!,
        product: e.product ?? "",
        fromRunId: e.runId,
        untilRunId: runIdPlus(e.runId, RULES.rubricNoteRuns),
        reason: e.reason,
        category: e.exceptionCategory,
        createdAt: e.timestamp,
        retired: retiredIds.includes(id),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

import type { AuditEntry, AuditEventType } from "./types";

/** Builds a non-decision audit event (runs, POs, kill switch, emails, exports). */
export function auditEvent(type: AuditEventType, runId: string, user: string, reason: string, extra: Partial<AuditEntry> = {}): AuditEntry {
  const timestamp = extra.timestamp ?? new Date().toISOString();
  return {
    id: `${runId}-${type}-${extra.sku ?? "all"}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
    runId,
    type,
    user,
    sku: null,
    product: null,
    systemAction: null,
    systemQty: null,
    finalAction: null,
    finalQty: null,
    override: false,
    reason,
    exceptionCategory: null,
    risk: null,
    ...extra,
  };
}

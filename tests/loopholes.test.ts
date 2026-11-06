import { describe, expect, it, vi } from "vitest";
import { parseCsv, safeCell, toCsv } from "@/business/csv";
import { auditEvent } from "@/business/events";
import { runAnalysis } from "@/business/recommendationEngine";
import type { AuditEntry } from "@/business/types";
import { validateAndPrepare } from "@/business/validationEngine";
import { freshrootsRawFiles } from "@/data/freshrootsFiles";
import { buildClientEvents, resolveDecisionItems } from "@/lib/server/guards";
import { MemoryRepo } from "@/lib/server/repo";
import { recordDecisions } from "@/lib/server/workflow";

const a = runAnalysis(validateAndPrepare(freshrootsRawFiles()).dataset!, "2026-11-06T04:00:00Z");
const ctx = { runId: a.runId, analysisWeek: a.analysisWeek, weekLabel: a.weekLabel };
const deps = () => ({
  createPurchaseOrder: vi.fn(async (po: { reference: string }) => ({ ok: true, poNumber: po.reference })),
  sendKillSwitchEmail: vi.fn(async () => ({ ok: true, mode: "preview" as const, to: null, subject: "x" })),
});

describe("Loophole: browser-supplied recommendations", () => {
  it("ignores a tampered quantity and uses the server's own recommendation", async () => {
    const tampered = { ...a.recommendations.find((r) => r.sku === "SKU001")!, suggestedQty: 99999, action: "REORDER_1_5X" as const };
    const items = resolveDecisionItems(a, a.runId, [{ rec: tampered, input: { kind: "APPROVE" } }]);
    expect(items.ok).toBe(true);
    if (!items.ok) return;
    expect(items.value[0].rec.suggestedQty).toBe(750);
    const d = deps();
    const res = await recordDecisions(new MemoryRepo(), ctx, items.value, d);
    expect(res.entries[0]).toMatchObject({ type: "APPROVED", systemQty: 750, finalQty: 750 });
    expect(d.createPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({ quantity: 750 }));
  });

  it("refuses decisions made on an outdated page or for unknown SKUs", () => {
    expect(resolveDecisionItems(a, "2026-W41", [{ sku: "SKU001", input: { kind: "APPROVE" } }])).toMatchObject({ ok: false, status: 409 });
    expect(resolveDecisionItems(a, a.runId, [{ sku: "SKU999", input: { kind: "APPROVE" } }])).toMatchObject({ ok: false, status: 400 });
  });
});

describe("Loophole: events posted straight to the server", () => {
  const now = "2026-11-06T10:00:00.000Z";
  async function approved() {
    const repo = new MemoryRepo();
    const items = resolveDecisionItems(a, a.runId, [{ sku: "SKU001", input: { kind: "APPROVE" } }]);
    if (!items.ok) throw new Error();
    await recordDecisions(repo, ctx, items.value, deps());
    return repo.auditForRun(a.runId);
  }

  it("will not reopen a decision whose purchase order is already raised", async () => {
    const audit = await approved();
    const res = buildClientEvents([{ type: "REOPENED", runId: a.runId, sku: "SKU001" }], audit, a, now);
    expect(res).toMatchObject({ ok: false, status: 409 });
    if (!res.ok) expect(res.error).toMatch(/already raised/);
  });

  it("will not resume a kill switch that is not active, or without a reason", async () => {
    const audit = await approved();
    expect(buildClientEvents([{ type: "KILL_SWITCH_RESUMED", runId: a.runId, reason: "PO creation resumed: fine" }], audit, a, now)).toMatchObject({ ok: false, status: 409 });
    const fired = [auditEvent("KILL_SWITCH", a.runId, "System", "fired", { reference: "8", timestamp: "2026-11-06T09:00:00.000Z" }), ...audit];
    expect(buildClientEvents([{ type: "KILL_SWITCH_RESUMED", runId: a.runId, reason: "PO creation resumed: " }], fired, a, now)).toMatchObject({ ok: false, status: 400 });
    const ok = buildClientEvents([{ type: "KILL_SWITCH_RESUMED", runId: a.runId, reason: "PO creation resumed: Test rejections only.", reference: "0" }], fired, a, now);
    expect(ok.ok && ok.value[0].reference).toBe("0"); // server's own count: no rejections in this audit
  });

  it("re-stamps user and time, and rejects other event types", async () => {
    const res = buildClientEvents([{ type: "EXPORT", runId: a.runId, user: "Someone Else", timestamp: "2020-01-01T00:00:00Z", reason: "Exported 1 order" }], [], a, now);
    expect(res.ok && res.value[0]).toMatchObject({ user: "Raghav Kulkarni", timestamp: now });
    for (const type of ["APPROVED", "PO_CREATED", "KILL_SWITCH", "EMAIL_SENT"] as AuditEntry["type"][]) {
      expect(buildClientEvents([{ type, runId: a.runId, sku: "SKU001" }], [], a, now)).toMatchObject({ ok: false, status: 400 });
    }
  });
});

describe("Loophole: spreadsheet formulas in the CSV export", () => {
  it("neutralises formula text but leaves numbers and percentages alone", () => {
    expect(safeCell('=HYPERLINK("http://x","click")')).toBe(`'=HYPERLINK("http://x","click")`);
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("-3.6%")).toBe("-3.6%");
    expect(safeCell(-12)).toBe(-12);
    const csv = toCsv(["Product", "Qty"], [["=1+1", 750]]);
    expect(parseCsv(csv).rows[0]).toEqual({ Product: "'=1+1", Qty: "750" });
  });
});

describe("Loophole: CSV export from a stale browser view", () => {
  it("builds the CSV from the audit log, including approvals made elsewhere, edited quantities and PO numbers", async () => {
    const { procurementCsv } = await import("@/business/procurementExport");
    const repo = new MemoryRepo();
    const items = resolveDecisionItems(a, a.runId, [
      { sku: "SKU001", input: { kind: "APPROVE" } },
      { sku: "SKU003", input: { kind: "EDIT", action: "IMMEDIATE_REORDER", qty: 200, reason: "Supplier short this week.", category: null } },
      { sku: "SKU002", input: { kind: "APPROVE" } }, // no change: not an order
      { sku: "SKU006", input: { kind: "REJECT", reason: "Promotion next week.", category: null } },
    ]);
    if (!items.ok) throw new Error();
    await recordDecisions(repo, ctx, items.value, deps());
    const out = procurementCsv(a, (await repo.state()).audit);
    expect(out.count).toBe(2);
    const rows = parseCsv(out.csv).rows;
    expect(rows.map((r) => [r.SKU, r["Approved quantity"], r.Decision, r["PO number"]])).toEqual([
      ["SKU001", "750", "Approved", "FR-PO-2026-W42-001"],
      ["SKU003", "200", "Edited", "FR-PO-2026-W42-003"],
    ]);
  });
});

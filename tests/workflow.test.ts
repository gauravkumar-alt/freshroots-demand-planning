import { describe, expect, it, vi } from "vitest";
import { auditEvent } from "@/business/events";
import { runAnalysis } from "@/business/recommendationEngine";
import type { Recommendation } from "@/business/types";
import { validateAndPrepare } from "@/business/validationEngine";
import { freshrootsRawFiles } from "@/data/freshrootsFiles";
import { MemoryRepo } from "@/lib/server/repo";
import { recordDecisions, retryPurchaseOrder, type WorkflowDeps } from "@/lib/server/workflow";

const a = runAnalysis(validateAndPrepare(freshrootsRawFiles()).dataset!, "2026-10-19T07:30:00Z");
const ctx = { runId: a.runId, analysisWeek: a.analysisWeek, weekLabel: a.weekLabel };
const rec = (sku: string) => a.recommendations.find((r) => r.sku === sku)!;
const others = a.recommendations.filter((r) => !["SKU001", "SKU003"].includes(r.sku));

function deps() {
  let n = 0;
  return {
    createPurchaseOrder: vi.fn(async () => ({ ok: true, mode: "simulated" as const, poNumber: `SIM-PO-${++n}` })),
    sendKillSwitchEmail: vi.fn(async () => ({ ok: true, mode: "live" as const, to: "gaurav_kumar@pg27.mesaschool.co", subject: "Kill switch fired", id: "email-1" })),
  } satisfies WorkflowDeps;
}

const reject = (r: Recommendation) => ({ rec: r, input: { kind: "REJECT" as const, reason: "Test rejection for the kill switch.", category: null } });

describe("Approve → threshold check → PO on Zoho (server workflow)", () => {
  it("raises a PO for an approved reorder and stores the decision", async () => {
    const repo = new MemoryRepo();
    const d = deps();
    const res = await recordDecisions(repo, ctx, [{ rec: rec("SKU001"), input: { kind: "APPROVE" } }], d);
    expect(res.results).toEqual([{ sku: "SKU001", ok: true }]);
    expect(res.entries.map((e) => e.type)).toEqual(["APPROVED", "PO_CREATED"]);
    expect(d.createPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({ sku: "SKU001", quantity: 750 }));
    expect((await repo.state()).audit).toHaveLength(2);
  });

  it("refuses a second decision on the same SKU", async () => {
    const repo = new MemoryRepo();
    await recordDecisions(repo, ctx, [{ rec: rec("SKU001"), input: { kind: "APPROVE" } }], deps());
    const again = await recordDecisions(repo, ctx, [reject(rec("SKU001"))], deps());
    expect(again.results[0].ok).toBe(false);
    expect(again.results[0].error).toMatch(/already approved/);
  });

  it("fires the kill switch once above 50%, emails once, then holds POs until resumed", async () => {
    const repo = new MemoryRepo();
    const d = deps();
    // 9 rejections + 1 approval of a non-reorder = 10 decisions, 90% rejected.
    const res = await recordDecisions(repo, ctx, [...others.slice(0, 9).map(reject), { rec: others[9], input: { kind: "APPROVE" } }], d);
    const types = res.entries.map((e) => e.type);
    expect(types.filter((t) => t === "KILL_SWITCH")).toHaveLength(1);
    expect(types.filter((t) => t === "EMAIL_SENT")).toHaveLength(1);
    expect(d.sendKillSwitchEmail).toHaveBeenCalledTimes(1);

    // An approved reorder after the switch fired is held, not sent to Zoho.
    const held = await recordDecisions(repo, ctx, [{ rec: rec("SKU001"), input: { kind: "APPROVE" } }], d);
    expect(held.entries.map((e) => e.type)).toEqual(["APPROVED", "PO_HELD"]);
    expect(d.createPurchaseOrder).not.toHaveBeenCalled();
    expect((await retryPurchaseOrder(repo, ctx, rec("SKU001"), d)).ok).toBe(false);

    // Resume, then the held PO can be raised; no second email without new rejections.
    // In a test everything happens in the same millisecond; a real resume always comes later.
    const later = new Date(Date.now() + 1000).toISOString();
    await repo.append([auditEvent("KILL_SWITCH_RESUMED", ctx.runId, "Raghav Kulkarni", "Test only.", { reference: "9", timestamp: later })]);
    const retry = await retryPurchaseOrder(repo, ctx, rec("SKU001"), d);
    expect(retry.ok).toBe(true);
    expect(d.createPurchaseOrder).toHaveBeenCalledTimes(1);
    const next = await recordDecisions(repo, ctx, [{ rec: rec("SKU003"), input: { kind: "APPROVE" } }], d);
    expect(next.entries.map((e) => e.type)).toEqual(["APPROVED", "PO_CREATED"]);
    expect(d.sendKillSwitchEmail).toHaveBeenCalledTimes(1);
  });
});

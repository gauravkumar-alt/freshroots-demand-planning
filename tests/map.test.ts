import { describe, expect, it } from "vitest";
import { rubricNotes, runIdPlus } from "@/business/decisions";
import { fallbackHighlights, highlightFacts, validateHighlights } from "@/business/highlights";
import { killSwitchCheck } from "@/business/measurement";
import { activeRubricNotes, runAnalysis } from "@/business/recommendationEngine";
import type { AuditEntry } from "@/business/types";
import { validateAndPrepare } from "@/business/validationEngine";
import { poNumberOf, purchaseOrderDocument, purchaseOrderRequest, withRaisedPurchaseOrders } from "@/business/purchaseOrder";
import { freshrootsRawFiles } from "@/data/freshrootsFiles";

const entry = (sku: string, type: "APPROVED" | "REJECTED", runId = "2026-W42", i = 0): AuditEntry => ({
  id: `${runId}-${sku}-${type}-${i}`,
  timestamp: `2026-10-19T10:${String(i).padStart(2, "0")}:00+05:30`,
  runId,
  type,
  user: "Raghav Kulkarni",
  sku,
  product: sku,
  systemAction: "REORDER_1_5X",
  systemQty: 1500,
  finalAction: type === "REJECTED" ? null : "REORDER_1_5X",
  finalQty: type === "REJECTED" ? 0 : 1500,
  override: type === "REJECTED",
  reason: type === "REJECTED" ? "One-off order, not repeat demand." : "",
  exceptionCategory: null,
  risk: "HIGH_DEMAND",
});

const decisions = (rejected: number, approved: number) => [
  ...Array.from({ length: rejected }, (_, i) => entry(`R${i}`, "REJECTED", "2026-W42", i)),
  ...Array.from({ length: approved }, (_, i) => entry(`A${i}`, "APPROVED", "2026-W42", 30 + i)),
];

describe("Kill switch (more than 50% rejected)", () => {
  it("fires above 50% once at least 10 decisions exist", () => {
    expect(killSwitchCheck(decisions(6, 4), "2026-W42")).toMatchObject({ decided: 10, rejected: 6, breached: true, status: "TRIGGERED" });
  });
  it("does not fire at exactly 50%", () => {
    expect(killSwitchCheck(decisions(5, 5), "2026-W42").breached).toBe(false);
  });
  it("does not fire on a small sample", () => {
    const c = killSwitchCheck(decisions(3, 0), "2026-W42");
    expect(c.rate).toBe(1);
    expect(c.breached).toBe(false);
    expect(c.status).toBe("NOT_YET_MEASURABLE");
  });
});

describe("Rejects → Rubric", () => {
  it("run ids roll over correctly", () => {
    expect(runIdPlus("2026-W42", 2)).toBe("2026-W44");
    expect(runIdPlus("2026-W52", 2)).toBe("2027-W01");
  });

  it("a rejection routes that SKU to judgement for the next two runs only", () => {
    const notes = rubricNotes([entry("SKU001", "REJECTED", "2026-W41")], []);
    expect(notes).toHaveLength(1);
    expect(notes[0].untilRunId).toBe("2026-W43");
    expect(activeRubricNotes(notes, "2026-W41")).toHaveLength(0);
    expect(activeRubricNotes(notes, "2026-W42")).toHaveLength(1);
    expect(activeRubricNotes(notes, "2026-W44")).toHaveLength(0);
    expect(activeRubricNotes(rubricNotes([entry("SKU001", "REJECTED", "2026-W41")], [notes[0].id]), "2026-W42")).toHaveLength(0);

    const ds = validateAndPrepare(freshrootsRawFiles()).dataset!;
    const before = runAnalysis(ds, "2026-10-19T07:30:00Z").recommendations.find((r) => r.sku === "SKU001")!;
    const after = runAnalysis(ds, "2026-10-19T07:30:00Z", notes).recommendations.find((r) => r.sku === "SKU001")!;
    expect(before.decisionMode).toBe("RULE_BASED");
    expect(after.decisionMode).toBe("JUDGEMENT");
    // The rubric note never changes the numbers or the action.
    expect(after.action).toBe(before.action);
    expect(after.suggestedQty).toBe(before.suggestedQty);
  });


});

describe("Gemini highlights only write words", () => {
  const a = runAnalysis(validateAndPrepare(freshrootsRawFiles()).dataset!, "2026-10-19T07:30:00Z");
  const facts = highlightFacts(a);

  it("keeps highlights that use numbers from the facts", () => {
    const mango = facts.skus.find((s) => s.sku === "SKU001")!;
    const res = validateHighlights({ highlights: [{ title: "Mango Drink running short", detail: `Demand is ${mango.demandChange} with ${mango.weeksOfStock} weeks of stock.`, skus: ["SKU001"], tone: "risk" }] }, facts);
    expect(res.highlights).toHaveLength(1);
  });

  it("drops highlights with invented numbers or SKUs", () => {
    const res = validateHighlights(
      {
        highlights: [
          { title: "Demand will rise 73% next month", detail: "Forecast.", skus: ["SKU001"], tone: "demand" },
          { title: "Unknown SKU", detail: "Check it.", skus: ["SKU999"], tone: "info" },
        ],
      },
      facts,
    );
    expect(res.highlights).toHaveLength(0);
    expect(res.dropped).toBe(2);
  });

  it("has a rule-generated fallback", () => {
    expect(fallbackHighlights(a).length).toBeGreaterThanOrEqual(3);
  });
});

describe("Purchase orders raised in the app", () => {
  const a = runAnalysis(validateAndPrepare(freshrootsRawFiles()).dataset!, "2026-10-19T07:30:00Z");
  const mango = a.recommendations.find((r) => r.sku === "SKU001")!;
  const approved = { ...entry("SKU001", "APPROVED"), finalAction: "IMMEDIATE_REORDER" as const, finalQty: 600 };
  it("raises a PO only for approved reorders, at the approved quantity, with a fixed number", () => {
    expect(purchaseOrderRequest(mango, approved)).toMatchObject({ sku: "SKU001", quantity: 600, reference: "FR-PO-2026-W42-001" });
    expect(purchaseOrderRequest(mango, { ...approved, finalAction: "PAUSE_NEXT_ORDER", finalQty: 0 })).toBeNull();
  });
  it("gives older PO entries the same fixed number", () => {
    expect(poNumberOf({ runId: "2026-W42", sku: "SKU013", reference: "SIM-PO-16853" })).toBe("FR-PO-2026-W42-013");
  });
  it("builds the printed PO: quantity × unit cost, delivery after the lead time", () => {
    const po = { ...approved, id: "po", type: "PO_CREATED" as const, timestamp: "2026-11-04T04:59:00Z", user: "System", reference: "FR-PO-2026-W42-001" };
    const doc = purchaseOrderDocument(po, approved, mango);
    expect(doc).toMatchObject({ number: "FR-PO-2026-W42-001", quantity: 600, approvedBy: approved.user });
    expect(doc.total).toBe(600 * mango.economics.unitCost!);
    expect(doc.expectedDelivery).toBe(new Date(Date.parse("2026-11-04") + mango.economics.leadTimeDays! * 864e5).toISOString().slice(0, 10));
  });
});

describe("POs the app raised count as stock on the way next week", () => {
  const ds = validateAndPrepare(freshrootsRawFiles()).dataset!;
  const po = (runId: string, sku: string, day: string, qty: number): AuditEntry => ({
    ...entry(sku, "APPROVED", runId),
    id: `${runId}-${sku}-po`,
    type: "PO_CREATED",
    user: "System",
    timestamp: `${day}T05:00:00Z`,
    finalAction: "IMMEDIATE_REORDER",
    finalQty: qty,
    reference: `FR-PO-${runId}-${sku.slice(3)}`,
  });

  it("adds last week's undelivered PO as an open order, and skips delivered or same-week ones", () => {
    const audit = [po("2026-W41", "SKU001", "2026-10-16", 750), po("2026-W40", "SKU003", "2026-10-01", 300), po("2026-W42", "SKU011", "2026-10-19", 400)];
    const out = withRaisedPurchaseOrders(ds, audit);
    const orders = (sku: string) => out.skus.find((s) => s.master.sku === sku)!.purchaseOrders;
    expect(orders("SKU001")).toMatchObject([{ orderQty: 750, poNumber: "FR-PO-2026-W41-001" }]);
    expect(orders("SKU003")).toEqual([]); // delivered before the 19 Oct stock count
    expect(orders("SKU011")).toEqual([]); // this week's own PO
  });

  it("sends the SKU to Raghav with an 'already ordered' note and lowers the shortfall", () => {
    const before = runAnalysis(ds, "2026-10-19T07:30:00Z").recommendations.find((r) => r.sku === "SKU001")!;
    const after = runAnalysis(withRaisedPurchaseOrders(ds, [po("2026-W41", "SKU001", "2026-10-16", 750)]), "2026-10-19T07:30:00Z").recommendations.find((r) => r.sku === "SKU001")!;
    expect(after.openPoQty).toBe(750);
    expect(after.decisionMode).toBe("JUDGEMENT");
    expect(after.judgementReasons.join(" ")).toMatch(/Already ordered: FR-PO-2026-W41-001, 750 units due/);
    expect(after.economics.shortfallUnits).toBeLessThan(before.economics.shortfallUnits);
  });
});

describe("Edits → Rubric (as on the component map)", () => {
  const edited: AuditEntry = {
    ...entry("SKU003", "APPROVED", "2026-W41"),
    type: "EDITED",
    id: "2026-W41-SKU003-edit",
    systemAction: "IMMEDIATE_REORDER",
    systemQty: 300,
    finalAction: "IMMEDIATE_REORDER",
    finalQty: 200,
    override: true,
    reason: "Supplier short this week.",
  };

  it("an edit creates a rubric note that remembers the edited quantity", () => {
    const [note] = rubricNotes([edited], []);
    expect(note).toMatchObject({ sku: "SKU003", kind: "EDITED", editedTo: { action: "IMMEDIATE_REORDER", qty: 200 }, fromRunId: "2026-W41", untilRunId: "2026-W43" });
  });

  it("sends the edited SKU to Raghav's judgement next week, without changing the numbers", () => {
    const ds = validateAndPrepare(freshrootsRawFiles()).dataset!;
    const before = runAnalysis(ds, "2026-10-19T07:30:00Z").recommendations.find((r) => r.sku === "SKU003")!;
    const after = runAnalysis(ds, "2026-10-19T07:30:00Z", rubricNotes([edited], [])).recommendations.find((r) => r.sku === "SKU003")!;
    expect(before.decisionMode).toBe("RULE_BASED");
    expect(after.decisionMode).toBe("JUDGEMENT");
    expect(after.judgementReasons[0]).toBe("Rubric note from your edit (to 200 units) in 2026-W41: “Supplier short this week.”");
    expect([after.action, after.suggestedQty]).toEqual([before.action, before.suggestedQty]);
  });

  it("a plain approval creates no note", () => {
    expect(rubricNotes([entry("SKU001", "APPROVED", "2026-W41")], [])).toEqual([]);
  });
});

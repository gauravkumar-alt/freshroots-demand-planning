import { describe, expect, it } from "vitest";
import { rubricNotes, runIdPlus } from "@/business/decisions";
import { fallbackHighlights, highlightFacts, validateHighlights } from "@/business/highlights";
import { killSwitchCheck } from "@/business/measurement";
import { activeRubricNotes, runAnalysis } from "@/business/recommendationEngine";
import type { AuditEntry } from "@/business/types";
import { validateAndPrepare } from "@/business/validationEngine";
import { purchaseOrderRequest } from "@/business/zohoPurchaseOrder";
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

describe("PO on Zoho", () => {
  const a = runAnalysis(validateAndPrepare(freshrootsRawFiles()).dataset!, "2026-10-19T07:30:00Z");
  const mango = a.recommendations.find((r) => r.sku === "SKU001")!;
  it("raises a PO only for approved reorders, at the approved quantity", () => {
    const approved = { ...entry("SKU001", "APPROVED"), finalAction: "IMMEDIATE_REORDER" as const, finalQty: 600 };
    expect(purchaseOrderRequest(mango, approved, a.analysisWeek)).toMatchObject({ sku: "SKU001", quantity: 600, reference: "FR-PLAN-2026-W42-SKU001" });
    expect(purchaseOrderRequest(mango, { ...approved, finalAction: "PAUSE_NEXT_ORDER", finalQty: 0 }, a.analysisWeek)).toBeNull();
  });
});

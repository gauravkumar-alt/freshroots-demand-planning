// Trends + highlights (the AI lane of the map). Gemini writes words; every number it may use
// comes from the facts below, and any highlight quoting a number not in the facts is dropped.

import { pct, units, weeks } from "./format";
import { ACTION_LABEL, RISK_LABEL } from "./labels";
import type { AnalysisResult } from "./types";

export interface Highlight {
  title: string;
  detail: string;
  skus: string[];
  tone: "risk" | "demand" | "excess" | "info";
}

export interface HighlightFacts {
  runId: string;
  week: string;
  festival: string | null;
  counts: { skus: number; stockout: number; overstock: number; highDemand: number; judgement: number };
  skus: { sku: string; product: string; category: string; risk: string; demandChange: string; avg4: string; avg12: string; weeksOfStock: string; action: string; judgement: string[] }[];
}

/** Compact, already-calculated facts sent to Gemini. Only flagged SKUs, to keep the prompt small. */
export function highlightFacts(a: AnalysisResult): HighlightFacts {
  const flagged = a.recommendations.filter((r) => r.risk !== "NONE" || r.decisionMode === "JUDGEMENT");
  return {
    runId: a.runId,
    week: a.weekLabel,
    festival: a.festival.applied ? `${a.festival.monthName} festival uplift +25% applied` : null,
    counts: {
      skus: a.recommendations.length,
      stockout: a.recommendations.filter((r) => r.risk === "STOCKOUT").length,
      overstock: a.recommendations.filter((r) => r.risk === "OVERSTOCK").length,
      highDemand: a.recommendations.filter((r) => r.triggered.some((h) => h.code === "HIGH_DEMAND")).length,
      judgement: a.recommendations.filter((r) => r.decisionMode === "JUDGEMENT").length,
    },
    skus: flagged.map((r) => ({
      sku: r.sku,
      product: r.product,
      category: r.category,
      risk: RISK_LABEL[r.risk],
      demandChange: pct(r.demandChange),
      avg4: units(r.avg4),
      avg12: units(r.avg12),
      weeksOfStock: weeks(r.weeksOfStock),
      action: ACTION_LABEL[r.action],
      judgement: r.judgementReasons,
    })),
  };
}

export const HIGHLIGHT_SYSTEM = `You write the weekly demand-planning highlights for Raghav Kulkarni, Senior Demand Planner at Freshroots, a regional FMCG company in Maharashtra and Goa.
You receive facts the application has already calculated from SAP and Zoho exports.
Rules:
- Write 4 to 6 highlights, most important first: stockout risks, demand trends by category, overstock, and cases that need Raghav's judgement.
- Group SKUs where they share a pattern (e.g. several namkeen SKUs rising ahead of Diwali).
- Use only numbers that appear in the facts, written exactly as given. Never calculate new totals, averages or percentages.
- Never recommend a different action or quantity than the facts show. You describe; the rules decide.
- Each highlight: a title under 70 characters, one or two plain sentences of detail, the SKU codes it covers, and a tone: risk (stockout), demand (rising demand), excess (overstock) or info.
- Plain operational English. No hype. Never write the facts' field names (weeksOfStock, demandChange, avg4, action…); say "1.8 weeks of stock", "demand up 21.4%", "4-week average of 261 units".
- Refer to products by name without the "Freshroots" brand prefix.`;

export const HIGHLIGHT_SCHEMA = {
  type: "object",
  properties: {
    highlights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          skus: { type: "array", items: { type: "string" } },
          tone: { type: "string", enum: ["risk", "demand", "excess", "info"] },
        },
        required: ["title", "detail", "skus", "tone"],
      },
    },
  },
  required: ["highlights"],
} as const;

const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const numberTokens = (text: string) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, ""));

/** Keeps only well-formed highlights whose numbers and SKU codes all come from the facts. */
export function validateHighlights(raw: unknown, facts: HighlightFacts): { highlights: Highlight[]; dropped: number } {
  const allowed = new Set([...numberTokens(JSON.stringify(facts)), "4", "12", "20", "25", "6", "14", "3"]);
  const skuSet = new Set(facts.skus.map((s) => s.sku));
  const list = (raw as { highlights?: unknown })?.highlights;
  if (!Array.isArray(list)) return { highlights: [], dropped: 0 };
  const highlights: Highlight[] = [];
  let dropped = 0;
  for (const h of list.slice(0, 6)) {
    const ok =
      h &&
      typeof h.title === "string" &&
      typeof h.detail === "string" &&
      Array.isArray(h.skus) &&
      ["risk", "demand", "excess", "info"].includes(h.tone) &&
      h.skus.every((s: unknown) => typeof s === "string" && skuSet.has(s)) &&
      numberTokens(h.title + " " + h.detail).every((n) => allowed.has(n) || /^FR/.test(n));
    if (ok) highlights.push({ title: h.title.slice(0, 90), detail: h.detail.slice(0, 400), skus: h.skus, tone: h.tone });
    else dropped++;
  }
  return { highlights, dropped };
}

/** Rule-generated highlights, used when Gemini is not configured or its answer fails validation. */
export function fallbackHighlights(a: AnalysisResult): Highlight[] {
  const recs = a.recommendations;
  const out: Highlight[] = [];
  const stockout = recs.filter((r) => r.risk === "STOCKOUT").sort((x, y) => (x.weeksOfStock ?? 0) - (y.weeksOfStock ?? 0));
  if (stockout.length) {
    const worst = stockout.slice(0, 3);
    out.push({
      title: `${n(stockout.length, "SKU")} below minimum cover`,
      detail: `Lowest cover: ${worst.map((r) => `${r.product} (${weeks(r.weeksOfStock)} wks)`).join(", ")}.`,
      skus: stockout.map((r) => r.sku),
      tone: "risk",
    });
  }
  const rising = recs.filter((r) => r.triggered.some((h) => h.code === "HIGH_DEMAND")).sort((x, y) => (y.demandChange ?? 0) - (x.demandChange ?? 0));
  if (rising.length) {
    out.push({
      title: `Demand up more than 20% on ${n(rising.length, "SKU")}`,
      detail: `Biggest rises: ${rising.slice(0, 3).map((r) => `${r.product} ${pct(r.demandChange)}`).join(", ")}.`,
      skus: rising.map((r) => r.sku),
      tone: "demand",
    });
  }
  const over = recs.filter((r) => r.risk === "OVERSTOCK");
  if (over.length) {
    out.push({
      title: `${n(over.length, "SKU")} carrying too much stock`,
      detail: `Highest cover: ${[...over].sort((x, y) => (y.weeksOfStock ?? 0) - (x.weeksOfStock ?? 0)).slice(0, 3).map((r) => `${r.product} (${weeks(r.weeksOfStock)} wks)`).join(", ")}.`,
      skus: over.map((r) => r.sku),
      tone: "excess",
    });
  }
  const j = recs.filter((r) => r.decisionMode === "JUDGEMENT");
  if (j.length) {
    out.push({ title: `${n(j.length, "SKU")} need${j.length === 1 ? "s" : ""} your judgement`, detail: "New launches, distributor spikes, conflicting signals and rubric notes from earlier rejections.", skus: j.map((r) => r.sku), tone: "info" });
  }
  if (a.festival.applied) out.push({ title: `${a.festival.monthName} festival uplift applied`, detail: "Demand is planned 25% above the recent run-rate before stock checks.", skus: [], tone: "info" });
  return out;
}

"use client";

import { activeRubricNotes } from "@/business/recommendationEngine";
import { RULES } from "@/business/rulesConfig";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { RuleBadge } from "@/components/RuleBadge";
import { cn, formatTime } from "@/lib/utils";
import { useStore } from "@/state/store";
import Link from "next/link";

const RUBRIC = [
  { code: "HIGH_DEMAND" as const, name: "High demand", when: "4-week average more than 20% above the 12-week average", then: "Reorder at 1.5× the standard order quantity" },
  { code: "STOCKOUT" as const, name: "Stockout risk", when: "Weeks of stock below 6 (normal SKUs)", then: "Immediate reorder: 1× standard, or 1.5× if high demand also fired" },
  { code: "OVERSTOCK" as const, name: "Overstock risk", when: "Weeks of stock above 14 (normal SKUs)", then: "Pause the next order" },
  { code: "FESTIVAL_UPLIFT" as const, name: "Festival uplift", when: "Analysis week falls in October, November or March", then: "Demand × 1.25 before any stock threshold is checked" },
  { code: "PERISHABLE_ABOVE" as const, name: "High perishability", when: "SKU marked High perishability", then: "Target window 3–4 weeks instead of 6–14. Below 3 → reorder, above 4 → pause" },
  { code: "INSUFFICIENT_DATA" as const, name: "Insufficient data", when: "Under 12 weeks of history, zero recent sales or no stock record", then: "No confident recommendation. Manual review required" },
];

export default function RulesPage() {
  const store = useStore();
  const runId = store.analysis?.runId ?? "";
  const active = activeRubricNotes(store.notes, runId);
  const recs = store.analysis?.recommendations ?? [];
  const fired = (code: string) => recs.filter((r) => r.triggered.some((h) => h.code === code || (code === "PERISHABLE_ABOVE" && h.code === "PERISHABLE_BELOW") || (code === "INSUFFICIENT_DATA" && h.code === "ZERO_SALES"))).length;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">Rules</h1>
        <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">
          Raghav’s documented rubric, exactly as the engine applies it. Every recommendation is the result of these rules and simple calculations. Gemini only describes the results; it never changes a number or an action.
        </p>
      </div>

      <Card>
        <CardHeader title="The rubric" description="Weeks of stock = current stock ÷ festival-adjusted 4-week average weekly sales" />
        <div className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-3">
          {RUBRIC.map((r) => (
            <div key={r.code} className="bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-semibold">{r.name}</p>
                <RuleBadge code={r.code} />
              </div>
              <p className="mt-2 text-[13px]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">When </span>
                {r.when}
              </p>
              <p className="mt-1 text-[13px]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Then </span>
                {r.then}
              </p>
              <p className="mt-2 text-[12px] text-ink-3 tnum">Fired on {fired(r.code)} SKUs this week</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 border-t border-line p-4 text-[13px] md:grid-cols-2">
          <div>
            <p className="font-semibold">When several rules fire</p>
            <p className="mt-1 text-ink-2">All triggered rules are shown. The primary action follows this priority:</p>
            <ol className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
              {["Stockout risk", "High demand", "Overstock risk", "No immediate action"].map((s, i) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className="rounded-[4px] border border-line bg-sunken px-2 py-0.5">
                    {i + 1}. {s}
                  </span>
                  {i < 3 && <span className="text-ink-3">›</span>}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="font-semibold">Sent to Raghav’s judgement instead of settled by rules</p>
            <p className="mt-1 text-ink-2">
              New launches, one distributor taking 25+ points more share, high demand with overstock, a stockout an open Zoho PO already covers within {RULES.openPoHorizonDays} days, and SKUs with an active rubric note.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Rubric feedback from rejections"
          description={`Rejects → Rubric. Each rejection sends that SKU to Raghav’s judgement for the next ${RULES.rubricNoteRuns} weekly runs, with his reason shown. Numbers and actions are not changed.`}
          action={
            <Link href="/audit#exceptions" className="text-[12.5px] font-medium text-ink-2 hover:underline">
              Patterns in the exception library →
            </Link>
          }
        />
        {store.notes.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-ink-3">No rejections yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {store.notes.map((n) => {
              const isActive = active.some((a) => a.id === n.id);
              const upcoming = !n.retired && n.fromRunId >= runId;
              const state = n.retired ? "Retired" : isActive ? "Active this week" : upcoming ? `Applies from next run until ${n.untilRunId}` : `Expired after ${n.untilRunId}`;
              return (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px]">
                      <button className="font-semibold hover:underline" onClick={() => store.openDetail(n.sku)}>
                        {n.product}
                      </button>{" "}
                      <span className="font-mono text-[11.5px] text-ink-3">{n.sku}</span>
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-2">“{n.reason}”</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      Rejected in {n.fromRunId} · {formatTime(n.createdAt)}
                      {n.category ? ` · ${n.category}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-semibold", isActive || upcoming ? "bg-manual-bg text-manual" : "bg-normal-bg text-normal")}>{state}</span>
                    {(isActive || upcoming) && (
                      <Button size="sm" variant="ghost" onClick={() => (store.retireNote(n.id), store.notify("Rubric note retired. It applies from the next analysis run."))}>
                        Retire
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Kill switch" description="The map’s “Breaches threshold?” step" />
        <p className="px-4 py-3 text-[13px] text-ink-2">
          After every decision, the app checks this week’s rejection rate. Once at least 10 decisions exist and more than 50% are rejections, the kill switch fires: Zoho PO creation stops, approved reorders are held, and an email goes to {store.integrations?.emailTo ?? "the configured address"}. Resuming requires a logged reason.
        </p>
      </Card>
    </div>
  );
}

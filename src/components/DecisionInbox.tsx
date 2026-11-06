"use client";

import { Check, ChevronRight, CircleCheck } from "lucide-react";
import * as React from "react";
import { formatDate } from "@/business/dates";
import { rupees, units } from "@/business/format";
import type { Recommendation } from "@/business/types";
import { gsap, prefersMotion, useStaggerIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import { ActionText, JudgementTag, RiskBadge } from "./RuleBadge";
import { Button } from "./ui/button";
import { Card, CardHeader } from "./ui/card";

const shortDay = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short" });

function Stake({ r }: { r: Recommendation }) {
  const e = r.economics;
  if (e.valueAtRisk === null) return null;
  return (
    <span className={cn("whitespace-nowrap rounded-[4px] px-1.5 py-0.5 font-mono text-[11.5px] font-semibold", e.valueKind === "MARGIN_AT_RISK" ? "bg-stockout-bg text-stockout" : "bg-overstock-bg text-overstock")}>
      {rupees(e.valueAtRisk)} {e.valueKind === "MARGIN_AT_RISK" ? "margin at risk" : "tied up"}
    </span>
  );
}

/** Home screen: what needs a decision, most money first. Routine rule-based calls can be approved in one go. */
export function DecisionInbox() {
  const store = useStore();
  const recs = store.analysis?.recommendations ?? [];
  const [busy, setBusy] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const flagged = recs.filter((r) => r.risk !== "NONE" || r.decisionMode === "JUDGEMENT");
  const pending = flagged.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW");
  // Routine = everything waiting that is not flagged above: no risk, no judgement, nothing to change.
  const routine = recs.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW" && !flagged.includes(r) && r.action !== "MANUAL_REVIEW");
  const decided = flagged.length - pending.length;
  useStaggerIn(listRef, [pending.length === 0]);

  /** Slide a row out, then record the decision; slide it back if the server refuses. */
  const leave = async (skusToGo: string[], act: () => Promise<boolean>) => {
    const rows = skusToGo.map((s) => listRef.current?.querySelector<HTMLElement>(`[data-sku="${s}"]`)).filter((r): r is HTMLElement => !!r);
    if (rows.length && prefersMotion()) await gsap.to(rows, { x: 48, autoAlpha: 0, duration: 0.32, ease: "power2.in", stagger: 0.03 });
    const ok = await act();
    if (!ok && rows.length) gsap.to(rows, { x: 0, autoAlpha: 1, duration: 0.25, clearProps: "transform,opacity,visibility" });
  };

  const approve = (r: Recommendation) =>
    leave([r.sku], async () => {
      setBusy(r.sku);
      const res = await store.decide(r, { kind: "APPROVE" });
      setBusy(null);
      store.notify(res.ok ? `${r.product} approved.` : res.error);
      return res.ok;
    });
  const approveRoutine = () =>
    leave(
      routine.map((r) => r.sku),
      async () => {
        setBusy("all");
        const n = await store.approveMany(routine);
        setBusy(null);
        store.notify(`${n} routine recommendation${n === 1 ? "" : "s"} approved.`);
        return n > 0;
      },
    );

  return (
    <Card id="inbox" className="scroll-mt-4">
      <CardHeader
        title="Decisions this week"
        description={pending.length ? `${pending.length} need you, most money first${decided ? ` · ${decided} already decided` : ""}` : "Nothing waiting"}
        action={
          routine.length > 0 && (
            <Button variant="approve" size="sm" onClick={approveRoutine} disabled={busy !== null}>
              <Check /> {busy === "all" ? "Approving…" : `Approve ${routine.length} with no change`}
            </Button>
          )
        }
      />
      {pending.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6">
          <CircleCheck className="size-6 shrink-0 text-approved" />
          <div>
            <p className="text-[14px] font-semibold">All clear this week.</p>
            <p className="text-[13px] text-ink-3">Every flagged SKU has a decision. Approved reorders are in Procurement.</p>
          </div>
        </div>
      ) : (
        <ul ref={listRef} className="divide-y divide-line">
          {pending.map((r) => {
            const e = r.economics;
            const urgent = (e.stockoutGapDays ?? 0) > 0;
            return (
              <li key={r.sku} data-sku={r.sku} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", urgent && "bg-stockout-bg/50")}>
                <button type="button" onClick={() => store.openDetail(r.sku)} className="group min-w-0 flex-1 basis-[280px] text-left">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] font-semibold group-hover:underline">{r.product}</span>
                    <RiskBadge risk={r.risk} />
                    {r.decisionMode === "JUDGEMENT" && <JudgementTag />}
                    {urgent && <span className="rounded-[4px] bg-stockout px-1.5 py-0.5 text-[11px] font-semibold text-white">Urgent</span>}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{r.headline}.</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                    <Stake r={r} />
                    {e.arrivalIfOrderedToday && r.action !== "PAUSE_NEXT_ORDER" && r.action !== "NO_ACTION" && <span>Order today → arrives {shortDay(e.arrivalIfOrderedToday)}</span>}
                  </div>
                </button>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <ActionText action={r.action} className="text-[13px]" />
                    {r.suggestedQty ? <p className="text-[12px] text-ink-3 tnum">{units(r.suggestedQty)} units</p> : null}
                  </div>
                  {r.decisionMode === "RULE_BASED" && r.action !== "MANUAL_REVIEW" ? (
                    <Button size="md" variant="approve" onClick={() => approve(r)} disabled={busy !== null} aria-label={`Approve ${r.product}`}>
                      <Check /> {busy === r.sku ? "…" : "Approve"}
                    </Button>
                  ) : (
                    <Button size="md" variant="secondary" onClick={() => store.openDetail(r.sku)}>
                      Decide <ChevronRight />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

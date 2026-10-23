"use client";

import Link from "next/link";
import { KILL, decisionStats, exposure } from "@/business/measurement";
import { units } from "@/business/format";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

function Kpi({ label, value, sub, href, tone }: { label: string; value: React.ReactNode; sub: React.ReactNode; href?: string; tone: string }) {
  const body = (
    <>
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", tone)} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{label}</p>
      <p className="mt-1 font-cond text-[30px] font-semibold leading-none tnum">{value}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{sub}</p>
    </>
  );
  const cls = "relative block overflow-hidden rounded-md border border-line bg-surface px-4 py-3";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-line-2 hover:bg-sunken")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KPIGrid() {
  const store = useStore();
  const recs = store.analysis?.recommendations ?? [];
  const ex = exposure(recs);
  const pending = recs.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW").length;
  const highDemand = recs.filter((r) => r.triggered.some((h) => h.code === "HIGH_DEMAND")).length;
  const pilot = decisionStats(store.audit);
  const week = store.killSwitch;
  const rejectPct = week?.rate == null ? null : week.rate * 100;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Kpi label="SKUs analysed" value={recs.length} sub={store.isDemo ? "demo subset of 400 active SKUs" : "from the SKU master"} tone="bg-ink" href="/recommendations" />
      <Kpi label="Stockout risks" value={ex.stockoutSkus} sub={`${units(ex.unitsShort)} units short of minimum cover`} tone="bg-stockout" href="/recommendations?risk=STOCKOUT" />
      <Kpi label="Overstock risks" value={ex.overstockSkus} sub={`${units(ex.unitsExcess)} units above maximum cover`} tone="bg-overstock" href="/recommendations?risk=OVERSTOCK" />
      <Kpi label="High-demand SKUs" value={highDemand} sub="4-wk avg >20% above 12-wk" tone="bg-demand" href="/recommendations?rule=HIGH_DEMAND" />
      <Kpi label="Awaiting review" value={pending} sub={`of ${recs.length} this week`} tone="bg-review" href="/recommendations?status=NEEDS_REVIEW" />
      <Kpi
        label="Approval rate"
        value={pilot.approvalRate === null ? "—" : `${Math.round(pilot.approvalRate * 100)}%`}
        sub={
          <>
            pilot to date · this week rejected <span className={cn("font-semibold", rejectPct !== null && rejectPct > KILL.maxRejectionRate * 100 ? "text-rejected" : "text-ink-2")}>{rejectPct === null ? "—" : `${rejectPct.toFixed(1)}%`}</span> (kill switch at 50%)
          </>
        }
        tone="bg-approved"
        href="/#impact"
      />
    </div>
  );
}

/** The 80–85% / 15–20% split for this week's run. */
export function AutomationSplit() {
  const store = useStore();
  const recs = store.analysis?.recommendations ?? [];
  const ex = exposure(recs);
  const total = recs.length || 1;
  const rulePct = (ex.ruleBased / total) * 100;
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold">This week: rules settle the routine, Raghav decides the exceptions</p>
        <p className="text-[12px] text-ink-3">Target from Raghav’s documented logic: 80–85% rule-based</p>
      </div>
      <div className="mt-2.5 flex h-3 overflow-hidden rounded-[3px]">
        <div className="bg-ink" style={{ width: `${rulePct}%` }} />
        <div className="bg-manual/70" style={{ width: `${100 - rulePct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[12.5px]">
        <span>
          <span className="font-semibold tnum">{ex.ruleBased}</span> rule-based ({rulePct.toFixed(1)}%) · quick approve
        </span>
        <Link href="/recommendations?mode=JUDGEMENT" className="font-medium text-manual hover:underline">
          <span className="font-semibold tnum">{ex.judgement}</span> need judgement ({(100 - rulePct).toFixed(1)}%): new launches, distributor spikes, conflicts →
        </Link>
      </div>
    </div>
  );
}

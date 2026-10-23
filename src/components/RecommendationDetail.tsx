"use client";

import { ArrowRight, Info, TriangleAlert } from "lucide-react";
import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "@/business/dates";
import { pct, units, weeks } from "@/business/format";
import { ACTION_LABEL } from "@/business/labels";
import type { Recommendation } from "@/business/types";
import { cn, formatTime, shortDistributor } from "@/lib/utils";
import { useStore } from "@/state/store";
import { DecisionActions } from "./DecisionActions";
import { JudgementTag, RiskBadge, RuleBadge, StatusBadge } from "./RuleBadge";
import { Button } from "./ui/button";
import { Sheet, SheetContent } from "./ui/sheet";

export function RecommendationDetail() {
  const store = useStore();
  const rec = store.analysis?.recommendations.find((r) => r.sku === store.detailSku) ?? null;

  const nextPending = () => {
    const list = store.analysis?.recommendations ?? [];
    const next = list.find((r) => r.sku !== rec?.sku && store.statusOf(r.sku) === "NEEDS_REVIEW");
    store.openDetail(next?.sku ?? null);
  };

  return (
    <Sheet open={!!rec} onOpenChange={(o) => !o && store.openDetail(null)}>
      {rec && (
        <SheetContent title={`${rec.product} recommendation`} description={rec.headline}>
          <div className="flex-1 overflow-y-auto">
            <DetailBody rec={rec} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-2.5 text-[12.5px] text-ink-3">
            <span>Every number above is calculated from the SAP and Zoho files. No AI model is involved.</span>
            <Button size="sm" variant="secondary" onClick={nextPending}>
              Next needing review <ArrowRight />
            </Button>
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 bg-surface px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <p className={cn("mt-0.5 font-cond text-[20px] font-semibold leading-tight tnum", tone)}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{sub}</p>}
    </div>
  );
}

function DetailBody({ rec }: { rec: Recommendation }) {
  const store = useStore();
  const status = store.statusOf(rec.sku);
  const history = store.audit.filter((e) => e.sku === rec.sku && e.type !== "ANALYSIS_RUN").slice(0, 6);
  const coverAfter =
    rec.suggestedQty && rec.adjustedDemand > 0 && rec.currentStock !== null ? (rec.currentStock + rec.suggestedQty + rec.openPoQty) / rec.adjustedDemand : null;
  const wosTone = rec.risk === "STOCKOUT" ? "text-stockout" : rec.risk === "OVERSTOCK" ? "text-overstock" : undefined;

  return (
    <div className="grid gap-5 px-5 pb-6 pt-5">
      {/* Identity + the one-line answer */}
      <div className="pr-8">
        <p className="font-mono text-[12px] text-ink-3">
          {rec.sku} · {rec.category} · {rec.perishability} perishability · Standard order {units(rec.standardOrderQty)}
        </p>
        <h2 className="mt-1 text-[22px] font-semibold leading-tight">{rec.product}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <RiskBadge risk={rec.risk} />
          {rec.decisionMode === "JUDGEMENT" && <JudgementTag />}
          <StatusBadge status={status} />
        </div>
        <p className="mt-3 text-[16px] font-medium leading-snug text-ink">{rec.headline}.</p>
      </div>

      {/* Recommended action + decision */}
      <section className="rounded-md border border-line bg-sunken p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Recommended action</p>
            <p className="mt-0.5 text-[20px] font-semibold">{ACTION_LABEL[rec.action]}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Suggested quantity</p>
            <p className="mt-0.5 font-cond text-[24px] font-semibold tnum">{rec.suggestedQty === null ? "—" : units(rec.suggestedQty)}</p>
            {coverAfter !== null && <p className="text-[12px] text-ink-3">Cover after order{rec.openPoQty ? " and open POs" : ""}: {weeks(coverAfter)} wks</p>}
          </div>
        </div>
        {rec.judgementReasons.length > 0 && (
          <div className="mt-3 rounded-[5px] border border-dashed border-manual/50 bg-manual-bg/60 p-3">
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-manual">
              <TriangleAlert className="size-4" /> Needs your judgement
            </p>
            <ul className="mt-1 grid gap-1 text-[13px] text-ink">
              {rec.judgementReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4">
          <DecisionActions rec={rec} />
        </div>
      </section>

      {/* Why */}
      <section>
        <h3 className="text-[13px] font-semibold">Why</h3>
        <ul className="mt-1.5 grid gap-1.5 text-[13.5px] leading-snug text-ink-2">
          {rec.explanation.map((l) => (
            <li key={l} className="flex gap-2">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" />
              {l}
            </li>
          ))}
        </ul>
      </section>

      {/* Metrics */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        <Metric label="4-week avg" value={units(rec.avg4)} sub="units / week" />
        <Metric label="12-week avg" value={units(rec.avg12)} sub="units / week" />
        <Metric
          label="Demand change"
          value={pct(rec.demandChange)}
          sub={rec.triggered.some((h) => h.code === "HIGH_DEMAND") ? "above +20% threshold" : "threshold +20%"}
          tone={rec.triggered.some((h) => h.code === "HIGH_DEMAND") ? "text-demand" : undefined}
        />
        <Metric label="Current stock" value={rec.currentStock === null ? "—" : units(rec.currentStock)} sub="units (SAP)" />
        <Metric
          label="Weeks of stock"
          value={weeks(rec.weeksOfStock)}
          sub={rec.festival.applied && rec.weeksOfStockBaseline !== null ? `${weeks(rec.weeksOfStockBaseline)} before festival uplift` : "stock ÷ weekly demand"}
          tone={wosTone}
        />
        <Metric label="Target window" value={`${rec.window.min}–${rec.window.max} wks`} sub={rec.window.kind === "perishable" ? "high perishability" : "normal SKU"} />
        <Metric
          label="Festival uplift"
          value={rec.festival.applied ? "+25%" : "None"}
          sub={rec.festival.applied ? `${rec.festival.monthName}: plan ${units(rec.adjustedDemand)}/wk` : `${rec.festival.monthName} is not a festival month`}
        />
        <Metric
          label="Open Zoho POs"
          value={rec.openPoQty ? units(rec.openPoQty) : "None"}
          sub={rec.nextDelivery ? `next due ${formatDate(rec.nextDelivery, { day: "numeric", month: "short" })}` : rec.lastOrderDate ? `last order ${formatDate(rec.lastOrderDate, { day: "numeric", month: "short" })}` : "no orders on file"}
        />
      </section>

      <CoverageBar rec={rec} />

      {/* Triggered rules */}
      <section>
        <h3 className="text-[13px] font-semibold">Triggered rules</h3>
        {rec.triggered.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-3">No rule fired. Stock and demand are within range.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {rec.triggered.map((h) => (
              <li key={h.code + h.detail} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <RuleBadge code={h.code} className="w-fit shrink-0" />
                <span className="text-[13px] text-ink-2">{h.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {rec.triggered.filter((h) => h.code !== "FESTIVAL_UPLIFT").length > 1 && (
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-ink-3">
            <Info className="mt-px size-3.5 shrink-0" /> Several rules fired. The primary action follows the documented priority: stockout, then high demand, then overstock.
          </p>
        )}
      </section>

      {/* Trend */}
      <section>
        <h3 className="text-[13px] font-semibold">Weekly sales, all distributors</h3>
        <div className="mt-2 h-[180px] rounded-md border border-line bg-surface p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rec.trend} margin={{ top: 8, right: 64, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="week" tickFormatter={(w: string) => formatDate(w, { day: "numeric", month: "short" })} tick={{ fontSize: 11, fill: "var(--ink-3)" }} minTickGap={28} />
              <YAxis tick={{ fontSize: 11, fill: "var(--ink-3)" }} width={44} tickFormatter={(v: number) => v.toLocaleString("en-IN")} />
              <Tooltip formatter={(v) => [`${Number(v).toLocaleString("en-IN")} units`, "Sold"]} labelFormatter={(w) => `Week ending ${formatDate(String(w))}`} />
              <ReferenceLine y={rec.avg12} stroke="var(--ink-3)" strokeDasharray="4 3" label={{ value: "12-wk avg", position: "right", fontSize: 10, fill: "var(--ink-3)" }} />
              <ReferenceLine y={rec.avg4} stroke="var(--demand)" strokeDasharray="4 3" label={{ value: "4-wk avg", position: "right", fontSize: 10, fill: "var(--demand)" }} />
              <Line type="monotone" dataKey="units" stroke="var(--ink)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Distributors */}
      {rec.distributorShares.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold">Distributors ({rec.distributorShares.length})</h3>
          <div className="mt-2 overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-sunken text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  <th className="px-3 py-1.5 text-left font-semibold">Distributor</th>
                  <th className="px-3 py-1.5 text-right font-semibold">4-wk avg</th>
                  <th className="px-3 py-1.5 text-right font-semibold">12-wk avg</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Share 4 wk</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Share 12 wk</th>
                </tr>
              </thead>
              <tbody>
                {rec.distributorShares.slice(0, 6).map((d) => {
                  const shifted = d.share4 - d.share12 >= 0.25;
                  return (
                    <tr key={d.distributor} className={cn("border-b border-line last:border-0", shifted && "bg-manual-bg/60")}>
                      <td className="px-3 py-1.5">{d.distributor}</td>
                      <td className="px-3 py-1.5 text-right tnum">{units(d.avg4)}</td>
                      <td className="px-3 py-1.5 text-right tnum">{units(d.avg12)}</td>
                      <td className={cn("px-3 py-1.5 text-right tnum", shifted && "font-semibold text-manual")}>{Math.round(d.share4 * 100)}%</td>
                      <td className="px-3 py-1.5 text-right tnum">{Math.round(d.share12 * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rec.distributorShares.length > 6 && <p className="mt-1 text-[12px] text-ink-3">Top 6 by recent volume. Lead distributor: {shortDistributor(rec.leadDistributor)}.</p>}
        </section>
      )}

      {/* History */}
      <section>
        <h3 className="text-[13px] font-semibold">Decision history for this SKU</h3>
        {history.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-3">No earlier decisions.</p>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-[12.5px]">
            {history.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2 text-ink-2">
                <span className="font-mono text-ink-3">{e.runId}</span>
                <span className="font-medium text-ink">{e.type === "REOPENED" ? "Reopened" : e.type.charAt(0) + e.type.slice(1).toLowerCase()}</span>
                {e.type === "EDITED" && e.finalAction && (
                  <span>
                    → {ACTION_LABEL[e.finalAction]}
                    {e.finalQty ? ` ${units(e.finalQty)}` : ""}
                  </span>
                )}
                {e.reason && <span className="text-ink-3">“{e.reason}”</span>}
                <span className="text-ink-3">{formatTime(e.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Weeks of stock against the target window (0–20 week scale, 0–8 for perishables). */
function CoverageBar({ rec }: { rec: Recommendation }) {
  if (rec.weeksOfStock === null) return null;
  const max = Math.max(rec.window.kind === "perishable" ? 8 : 20, Math.ceil(rec.weeksOfStock + 2));
  const x = (w: number) => `${(Math.min(w, max) / max) * 100}%`;
  const tone = rec.weeksOfStock < rec.window.min ? "bg-stockout" : rec.weeksOfStock > rec.window.max ? "bg-overstock" : "bg-approved";
  return (
    <section>
      <h3 className="text-[13px] font-semibold">Stock cover vs target window</h3>
      <div className="relative mt-3 h-7">
        <div className="absolute inset-x-0 top-2.5 h-2 rounded-full bg-line" />
        <div className="absolute top-2.5 h-2 bg-approved/30" style={{ left: x(rec.window.min), width: `calc(${x(rec.window.max)} - ${x(rec.window.min)})` }} />
        <div className={cn("absolute top-0.5 h-6 w-[3px] -translate-x-1/2 rounded-full", tone)} style={{ left: x(rec.weeksOfStock) }} />
      </div>
      <div className="relative h-4 text-[11px] text-ink-3 tnum">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: x(rec.window.min) }}>
          {rec.window.min}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: x(rec.window.max) }}>
          {rec.window.max}
        </span>
        <span className="absolute right-0">{max} wks</span>
      </div>
    </section>
  );
}

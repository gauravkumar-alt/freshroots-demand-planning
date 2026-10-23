"use client";

import Link from "next/link";
import * as React from "react";
import { pct, rupees } from "@/business/format";
import { backtest } from "@/business/outcomes";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

/** The owner's one-glance view: money at stake, what is waiting, and whether the forecast can be trusted. */
const skus = (n: number) => `${n} SKU${n === 1 ? "" : "s"}`;

export function OwnerSummary() {
  const store = useStore();
  const recs = store.analysis?.recommendations ?? [];
  const bt = React.useMemo(() => (store.report.dataset ? backtest(store.report.dataset, 8) : null), [store.report.dataset]);

  const marginAtRisk = recs.filter((r) => r.economics.valueKind === "MARGIN_AT_RISK").reduce((s, r) => s + (r.economics.valueAtRisk ?? 0), 0);
  const cashTied = recs.filter((r) => r.economics.valueKind === "CASH_TIED_UP").reduce((s, r) => s + (r.economics.valueAtRisk ?? 0), 0);
  const hasMoney = recs.some((r) => r.economics.marginPerUnit !== null);
  const pending = recs.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW" && (r.risk !== "NONE" || r.decisionMode === "JUDGEMENT"));
  const urgent = pending.filter((r) => (r.economics.stockoutGapDays ?? 0) > 0);
  const placeholder = !store.uploads.skuMaster;

  const tiles = [
    {
      label: "Margin at risk",
      value: hasMoney ? rupees(marginAtRisk) : "—",
      sub: hasMoney ? `${skus(recs.filter((r) => r.economics.valueKind === "MARGIN_AT_RISK").length)} below minimum cover` : "Add cost and price to the SKU master",
      tone: "bg-stockout",
      href: "/recommendations?risk=STOCKOUT",
    },
    {
      label: "Cash tied up in overstock",
      value: hasMoney ? rupees(cashTied) : "—",
      sub: hasMoney ? `${skus(recs.filter((r) => r.economics.valueKind === "CASH_TIED_UP").length)} above maximum cover` : "Add unit cost to the SKU master",
      tone: "bg-overstock",
      href: "/recommendations?risk=OVERSTOCK",
    },
    {
      label: "Decisions waiting",
      value: String(pending.length),
      sub: urgent.length ? `${urgent.length} run${urgent.length === 1 ? "s" : ""} out before an order can arrive` : pending.length ? "none run out before delivery" : "nothing needs you this week",
      tone: urgent.length ? "bg-stockout" : "bg-review",
      href: "#inbox",
    },
    {
      label: "Forecast accuracy",
      value: bt?.wape == null ? "—" : `${Math.round((1 - bt.wape) * 100)}%`,
      sub:
        bt?.bias == null
          ? "needs 5+ weeks of sales"
          : `last 8 weeks · forecasts ran ${Math.abs(bt.bias) < 0.02 ? "on target" : `${pct(Math.abs(bt.bias), false)} ${bt.bias > 0 ? "high" : "low"}`}`,
      tone: "bg-approved",
      href: "/audit#outcomes",
    },
  ];

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="relative block overflow-hidden rounded-md border border-line bg-surface px-4 py-3 hover:border-line-2 hover:bg-sunken">
            <span className={cn("absolute inset-y-0 left-0 w-[3px]", t.tone)} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{t.label}</p>
            <p className="mt-1 font-cond text-[30px] font-semibold leading-none tnum">{t.value}</p>
            <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{t.sub}</p>
          </Link>
        ))}
      </div>
      {placeholder && hasMoney && (
        <p className="text-[12px] text-review">
          ₹ figures and run-out dates use placeholder cost, price and lead-time values in the sample SKU master. Upload your SKU master with Unit_Cost, Selling_Price and
          Lead_Time_Days to use real ones.
        </p>
      )}
    </div>
  );
}

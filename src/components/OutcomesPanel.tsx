"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "@/business/dates";
import { pct, units } from "@/business/format";
import { backtest, decisionOutcomes, type Verdict } from "@/business/outcomes";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "./ui/card";
import { Table, Td, Th } from "./ui/table";

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  OVERRIDE_RIGHT: { label: "Raghav was right", cls: "bg-approved-bg text-approved" },
  RULES_RIGHT: { label: "Rules were right", cls: "bg-review-bg text-review" },
  TOO_CLOSE: { label: "Too close to call", cls: "bg-normal-bg text-normal" },
  FORECAST_CHECK: { label: "Forecast check", cls: "bg-info-bg text-info" },
};

const accuracy = (wape: number | null) => (wape === null ? "—" : `${Math.max(0, Math.round((1 - wape) * 100))}%`);
const biasText = (b: number | null) => (b === null ? "—" : Math.abs(b) < 0.02 ? "on target" : `${pct(Math.abs(b), false)} ${b > 0 ? "too high" : "too low"}`);

/** Did it work? Forecast accuracy from a back-test, and each past decision checked against the sales that followed. */
export function OutcomesPanel() {
  const store = useStore();
  const ds = store.report.dataset;
  const bt = React.useMemo(() => (ds ? backtest(ds, 8) : null), [ds]);
  const outcomes = React.useMemo(() => (ds ? decisionOutcomes(store.audit, ds) : []), [ds, store.audit]);
  if (!ds || !bt) return <p className="text-[13px] text-ink-3">Load sales data to see outcomes.</p>;
  const overrides = outcomes.filter((o) => o.verdict === "OVERRIDE_RIGHT" || o.verdict === "RULES_RIGHT");
  const raghavRight = overrides.filter((o) => o.verdict === "OVERRIDE_RIGHT").length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        {[
          ["Forecast accuracy", accuracy(bt.wape), "last 8 weeks, all SKUs"],
          ["Forecast bias", biasText(bt.bias), "positive = forecast more than sold"],
          ["Festival weeks", biasText(bt.festivalBias), `with the +25% uplift · normal weeks ${biasText(bt.normalBias)}`],
          ["Overrides checked", overrides.length ? `${raghavRight} of ${overrides.length}` : "—", overrides.length ? "where Raghav beat the rules" : "appears once next week's sales arrive"],
        ].map(([l, v, d]) => (
          <div key={l} className="bg-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{l}</p>
            <p className="mt-1 font-cond text-[22px] font-semibold tnum">{v}</p>
            <p className="text-[12px] text-ink-3">{d}</p>
          </div>
        ))}
      </div>
      {bt.festivalBias !== null && bt.normalBias !== null && bt.festivalBias - bt.normalBias > 0.1 && (
        <p className="rounded-md border border-review/30 bg-review-bg px-3 py-2 text-[13px] text-review">
          In festival weeks the forecast ran {biasText(bt.festivalBias)}, against {biasText(bt.normalBias)} in normal weeks. The +25% uplift may be too large for these SKUs:
          worth reviewing with Raghav before November.
        </p>
      )}

      <Card>
        <CardHeader title="Forecast vs actual, by week" description="What the engine would have forecast each week (4-week average, festival uplift applied) against units actually sold" />
        <div className="h-[260px] px-2 pb-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bt.weeks.map((w) => ({ ...w, label: formatDate(w.week, { day: "numeric", month: "short" }) + (w.festival ? " ★" : "") }))} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-3)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--ink-3)" }} width={48} tickFormatter={(v: number) => v.toLocaleString("en-IN")} />
              <Tooltip formatter={(v, n) => [`${Number(v).toLocaleString("en-IN")} units`, n === "forecast" ? "Forecast" : "Actual"]} labelFormatter={(l) => `Week ending ${l}${String(l).includes("★") ? " (festival uplift)" : ""}`} />
              <Legend formatter={(v) => (v === "forecast" ? "Forecast" : "Actual sold")} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="forecast" fill="var(--line-2)" radius={2} isAnimationActive={false} />
              <Bar dataKey="actual" fill="var(--ink)" radius={2} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3">★ festival-uplift weeks</p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Least accurate SKUs" description="Where the 4-week average misses most; candidates for Raghav's judgement" />
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th align="right">Accuracy</Th>
                <Th align="right">Bias</Th>
              </tr>
            </thead>
            <tbody>
              {bt.skus.slice(0, 8).map((s) => (
                <tr key={s.sku} className="cursor-pointer hover:bg-sunken" onClick={() => store.openDetail(s.sku)}>
                  <Td>
                    <span className="font-mono text-[11.5px] text-ink-3">{s.sku}</span> <span className="font-medium">{s.product}</span>
                  </Td>
                  <Td align="right">{accuracy(s.wape)}</Td>
                  <Td align="right" className={cn((s.bias ?? 0) > 0.1 ? "text-overstock" : (s.bias ?? 0) < -0.1 ? "text-stockout" : "")}>
                    {s.bias === null ? "—" : pct(s.bias)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Were the decisions right?" description="Each past decision against the sales in the week that followed" />
          {outcomes.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-3">
              No decision has a following week of sales yet. After this week’s decisions, upload next week’s SAP sales file and each one is checked here automatically.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Run</Th>
                  <Th>SKU</Th>
                  <Th>Decision</Th>
                  <Th align="right">Forecast</Th>
                  <Th align="right">Actual</Th>
                  <Th>Verdict</Th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.runId + o.sku}>
                    <Td className="font-mono text-[12px] text-ink-3">{o.runId}</Td>
                    <Td className="font-medium">{o.product}</Td>
                    <Td className="text-[12.5px]">{o.decision.charAt(0) + o.decision.slice(1).toLowerCase()}</Td>
                    <Td align="right">{units(o.forecast)}</Td>
                    <Td align="right">
                      {units(o.actual)} <span className="text-[11.5px] text-ink-3">({pct(o.surprise)})</span>
                    </Td>
                    <Td>
                      <span className={cn("whitespace-nowrap rounded-[4px] px-1.5 py-[2px] text-[11.5px] font-semibold", VERDICT[o.verdict].cls)}>{VERDICT[o.verdict].label}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

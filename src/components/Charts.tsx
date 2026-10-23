"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { pct, weeks } from "@/business/format";
import { RISK_LABEL } from "@/business/labels";
import type { Recommendation, RiskLevel } from "@/business/types";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "./ui/card";

const RISK_COLOR: Record<RiskLevel, string> = {
  STOCKOUT: "var(--stockout)",
  HIGH_DEMAND: "var(--demand)",
  OVERSTOCK: "var(--overstock)",
  NONE: "var(--line-2)",
  MANUAL_REVIEW: "var(--manual)",
};

const Y_MAX = 26;

interface Point {
  sku: string;
  product: string;
  x: number;
  y: number;
  risk: RiskLevel;
  wos: number;
  change: number;
  perishable: boolean;
}

function points(recs: Recommendation[]): Point[] {
  return recs
    .filter((r) => r.weeksOfStock !== null && r.demandChange !== null && r.risk !== "MANUAL_REVIEW")
    .map((r) => ({
      sku: r.sku,
      product: r.product,
      x: Math.max(-40, Math.min(60, r.demandChange! * 100)),
      y: Math.min(Y_MAX, r.weeksOfStock!),
      risk: r.risk,
      wos: r.weeksOfStock!,
      change: r.demandChange!,
      perishable: r.window.kind === "perishable",
    }));
}

function PointTip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow">
      <p className="font-semibold">{p.product}</p>
      <p className="text-ink-2">
        {weeks(p.wos)} wks stock · demand {pct(p.change)}
      </p>
      <p style={{ color: RISK_COLOR[p.risk] }} className="font-medium">
        {RISK_LABEL[p.risk]}
        {p.perishable ? " · perishable (3–4 wk window)" : ""}
      </p>
    </div>
  );
}

/** Each SKU placed by demand change (x) and weeks of stock (y), with Raghav's thresholds drawn in. */
export function CoverageMap() {
  const store = useStore();
  const recs = store.analysis?.recommendations ?? [];
  const data = points(recs);
  const byRisk = (["NONE", "OVERSTOCK", "HIGH_DEMAND", "STOCKOUT"] as RiskLevel[]).map((risk) => ({ risk, data: data.filter((d) => d.risk === risk) }));
  const manual = recs.filter((r) => r.risk === "MANUAL_REVIEW").length;

  return (
    <Card>
      <CardHeader
        title="Stock cover vs demand change"
        description={`Weeks of stock (festival-adjusted) against 4-wk vs 12-wk demand change. Click a SKU to open it.${manual ? ` ${manual} manual-review SKUs not plotted.` : ""}`}
      />
      <div className="h-[300px] px-2 pb-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 20, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="var(--line)" />
            <ReferenceArea y1={0} y2={6} fill="var(--stockout)" fillOpacity={0.05} />
            <ReferenceArea y1={14} y2={Y_MAX} fill="var(--overstock)" fillOpacity={0.05} />
            <ReferenceArea x1={20} x2={60} fill="var(--demand)" fillOpacity={0.05} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[-40, 60]}
              ticks={[-40, -20, 0, 20, 40, 60]}
              tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
              tick={{ fontSize: 11, fill: "var(--ink-3)" }}
              label={{ value: "Demand change, 4-wk vs 12-wk", position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--ink-3)" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, Y_MAX]}
              ticks={[0, 3, 6, 10, 14, 20, 26]}
              tick={{ fontSize: 11, fill: "var(--ink-3)" }}
              width={40}
              label={{ value: "Weeks of stock", angle: -90, position: "insideLeft", offset: 12, fontSize: 11, fill: "var(--ink-3)" }}
            />
            <ZAxis range={[46, 46]} />
            <ReferenceLine y={6} stroke="var(--stockout)" strokeDasharray="4 3" label={{ value: "6 wk min", position: "insideTopRight", fontSize: 10, fill: "var(--stockout)" }} />
            <ReferenceLine y={14} stroke="var(--overstock)" strokeDasharray="4 3" label={{ value: "14 wk max", position: "insideTopRight", fontSize: 10, fill: "var(--overstock)" }} />
            <ReferenceLine x={20} stroke="var(--demand)" strokeDasharray="4 3" label={{ value: "+20%", position: "insideTopLeft", fontSize: 10, fill: "var(--demand)" }} />
            <Tooltip content={<PointTip />} cursor={false} />
            {byRisk.map(({ risk, data }) => (
              <Scatter
                key={risk}
                data={data}
                fill={RISK_COLOR[risk]}
                isAnimationActive={false}
                onClick={(p: unknown) => store.openDetail((p as { payload?: Point }).payload?.sku ?? (p as Point).sku)}
                className="cursor-pointer"
                shape={(props: { cx?: number; cy?: number; payload?: Point }) => {
                  const { cx = 0, cy = 0, payload } = props;
                  return payload?.perishable ? (
                    <path d={`M${cx},${cy - 5.5} L${cx + 5.5},${cy + 4.5} L${cx - 5.5},${cy + 4.5} Z`} fill={RISK_COLOR[risk]} stroke="var(--surface)" strokeWidth={1} />
                  ) : (
                    <circle cx={cx} cy={cy} r={4.6} fill={RISK_COLOR[risk]} stroke="var(--surface)" strokeWidth={1} />
                  );
                }}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[12px] text-ink-3">
        {(["STOCKOUT", "HIGH_DEMAND", "OVERSTOCK", "NONE"] as RiskLevel[]).map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: RISK_COLOR[r] }} />
            {RISK_LABEL[r]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M5 0 L10 9 L0 9 Z" fill="var(--ink-3)" />
          </svg>
          High perishability (judged on 3–4 wks)
        </span>
      </div>
    </Card>
  );
}

/** Largest demand movers this week: increasing and decreasing demand. */
export function DemandMovers() {
  const store = useStore();
  const recs = (store.analysis?.recommendations ?? []).filter((r) => r.demandChange !== null && r.risk !== "MANUAL_REVIEW");
  const sorted = [...recs].sort((a, b) => b.demandChange! - a.demandChange!);
  const data = [...sorted.slice(0, 7), ...sorted.slice(-5)].map((r) => ({
    sku: r.sku,
    name: r.product.length > 22 ? r.product.slice(0, 21) + "…" : r.product,
    value: +(r.demandChange! * 100).toFixed(1),
  }));
  return (
    <Card>
      <CardHeader title="Demand movers" description="Biggest increases and decreases, 4-week vs 12-week average" />
      <div className="h-[340px] px-2 pb-2 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--line)" horizontal={false} />
            <XAxis type="number" domain={[-40, 60]} ticks={[-40, -20, 0, 20, 40, 60]} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`} tick={{ fontSize: 11, fill: "var(--ink-3)" }} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11.5, fill: "var(--ink-2)" }} interval={0} />
            <ReferenceLine x={20} stroke="var(--demand)" strokeDasharray="4 3" />
            <ReferenceLine x={0} stroke="var(--ink-3)" />
            <Tooltip formatter={(v) => [`${Number(v) > 0 ? "+" : ""}${v}%`, "Demand change"]} cursor={{ fill: "var(--sunken)" }} />
            <Bar
              dataKey="value"
              isAnimationActive={false}
              radius={2}
              onClick={(d: unknown) => store.openDetail((d as { sku?: string; payload?: { sku: string } }).payload?.sku ?? (d as { sku: string }).sku)}
              className="cursor-pointer"
              label={{ position: "right", fontSize: 11, fill: "var(--ink-2)", formatter: (v: unknown) => `${Number(v) > 0 ? "+" : ""}${v}%` }}
            >
              {data.map((d) => (
                <Cell key={d.sku} fill={d.value > 20 ? "var(--demand)" : d.value < 0 ? "var(--overstock)" : "var(--line-2)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

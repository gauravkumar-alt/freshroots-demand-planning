"use client";

// Raghav's dashboard: greeting, four headline numbers and four bar charts. Charts lay out to their real
// pixel width (so labels stay readable on a phone), show a tooltip on hover or keyboard focus, and open
// the SKU's detail panel on click. Bars grow in with GSAP when motion is allowed.

import Link from "next/link";
import * as React from "react";
import { daysBetween, formatDate } from "@/business/dates";
import { pct, rupees, units, weeks } from "@/business/format";
import { ACTION_LABEL } from "@/business/labels";
import { backtest, forecastFor } from "@/business/outcomes";
import type { Recommendation } from "@/business/types";
import { AnimatedNumber, gsap, useGSAP, withMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import { Button } from "./ui/button";

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const shortDay = (iso: string) => formatDate(iso, { day: "numeric", month: "short" });
const shortName = (name: string) => name.replace(/^Freshroots /, "");
const brandless = (name: string) => shortName(name).replace(/ \d.*$/, "");
/** Short label for narrow screens: no brand, no pack size, at most 14 characters. */
const compact = (name: string) => {
  const n = brandless(name);
  return n.length > 14 ? `${n.slice(0, 13).trimEnd()}…` : n;
};

// ---------- shared chart plumbing ----------

/** Width of an element, kept current as it resizes. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Horizontal bar with a 4px rounded data end, square at the baseline. Grows right (dir 1) or left (dir −1). */
function hbarPath(x0: number, y: number, w: number, h: number, dir: 1 | -1 = 1) {
  const len = Math.max(w, 1), r = Math.min(4, len, h / 2), s = dir;
  return `M${x0} ${y}h${s * (len - r)}a${r} ${r} 0 0 ${s > 0 ? 1 : 0} ${s * r} ${r}v${h - 2 * r}a${r} ${r} 0 0 ${s > 0 ? 1 : 0} ${-s * r} ${r}h${-s * (len - r)}z`;
}

/** Vertical column with a 4px rounded cap, square at the baseline. */
function vbarPath(x: number, y0: number, w: number, h: number) {
  const len = Math.max(h, 1), r = Math.min(4, len, w / 2);
  return `M${x} ${y0}v${-(len - r)}a${r} ${r} 0 0 1 ${r} ${-r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${len - r}z`;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  // Near the top of a chart there is no room above (and the sticky header sits there), so open downwards.
  const below = tip.y < 90;
  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-20 w-max max-w-[260px] -translate-x-1/2 rounded-md border border-white/70 bg-white/90 px-3 py-2 text-[12px] shadow-lg backdrop-blur-md",
        below ? "translate-y-[34px]" : "-translate-y-[calc(100%+10px)]",
      )}
      style={{ left: tip.x, top: tip.y }}
    >
      <p className="font-semibold text-ink">{tip.title}</p>
      {tip.lines.map((l) => (
        <p key={l} className="text-ink-2">
          {l}
        </p>
      ))}
    </div>
  );
}

/** Hover/focus target for one data row: bigger than the mark, keyboard reachable, opens the SKU. */
function HitRow({ x, y, w, h, label, onTip, onOpen, tip }: { x: number; y: number; w: number; h: number; label: string; tip: Tip; onTip: (t: Tip | null) => void; onOpen?: () => void }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill="transparent"
      className={cn("outline-none", onOpen && "cursor-pointer")}
      tabIndex={0}
      role={onOpen ? "button" : "img"}
      aria-label={label}
      onMouseEnter={() => onTip(tip)}
      onMouseLeave={() => onTip(null)}
      onFocus={() => onTip(tip)}
      onBlur={() => onTip(null)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
    />
  );
}

function Swatch({ color, label, line, band }: { color: string; label: string; line?: boolean; band?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
      <span
        className={cn("inline-block", line ? "h-[3px] w-3 rounded-full" : "size-2.5 rounded-[3px]")}
        style={band ? { background: "var(--viz-band)", border: "1px dashed var(--viz-band-edge)" } : { background: color }}
      />
      {label}
    </span>
  );
}

function ChartCard({ title, caption, legend, children, className }: { title: string; caption: string; legend?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border border-line bg-surface px-4 pb-3 pt-4 sm:px-5", className)}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-3">{caption}</p>
      {legend && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{legend}</div>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Grow every `.viz-bar` in the chart from its baseline when the data changes. */
function useGrow(ref: React.RefObject<SVGSVGElement | null>, key: unknown, axis: "x" | "y") {
  useGSAP(
    () =>
      withMotion(() => {
        const bars = ref.current?.querySelectorAll(".viz-bar");
        if (!bars?.length) return;
        gsap.from(bars, {
          ...(axis === "x" ? { scaleX: 0 } : { scaleY: 0 }),
          transformOrigin: axis === "x" ? "left center" : "center bottom",
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.03,
          clearProps: "transform",
        });
      }),
    { scope: ref, dependencies: [key] },
  );
}

// ---------- 1. Stock cover against target ----------

function urgencyOrder(today: string) {
  return (a: Recommendation, b: Recommendation) => {
    const outA = a.economics.runOutDate !== null && a.economics.runOutDate < today ? 1 : 0;
    const outB = b.economics.runOutDate !== null && b.economics.runOutDate < today ? 1 : 0;
    return outB - outA || (b.economics.stockoutGapDays ?? 0) - (a.economics.stockoutGapDays ?? 0) || (a.weeksOfStock ?? 0) / a.window.min - (b.weeksOfStock ?? 0) / b.window.min;
  };
}

function StockCoverChart({ recs, onOpen }: { recs: Recommendation[]; onOpen: (sku: string) => void }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const svg = React.useRef<SVGSVGElement>(null);
  const [tip, setTip] = React.useState<Tip | null>(null);
  const today = todayIst();
  const rows = recs.filter((r) => r.weeksOfStock !== null).sort(urgencyOrder(today));
  useGrow(svg, rows.map((r) => r.sku + r.weeksOfStock).join(), "x");

  const narrow = width < 520;
  const L = narrow ? 118 : 190, R = Math.max(L + 80, width - (narrow ? 56 : 150)), rowH = narrow ? 30 : 30, top = 6;
  const maxWeeks = Math.max(16, Math.ceil(Math.max(...rows.map((r) => r.window.max), ...rows.map((r) => Math.min(r.weeksOfStock ?? 0, 30))) / 4) * 4);
  const x = (v: number) => L + (Math.min(v, maxWeeks) / maxWeeks) * (R - L);
  const height = top + rows.length * rowH + 24;
  const tickStep = narrow ? 8 : 4;
  const ticks = Array.from({ length: Math.floor(maxWeeks / tickStep) + 1 }, (_, i) => i * tickStep);

  return (
    <div ref={box} className="relative">
      {width > 0 && (
        <svg ref={svg} width={width} height={height} role="group" aria-label="Weeks of stock per SKU against its target window">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={top} y2={top + rows.length * rowH} stroke="var(--viz-grid)" />
              <text x={x(t)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--viz-axis)">
                {t === ticks[ticks.length - 1] ? `${t} wks` : t}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const y = top + i * rowH, yc = y + rowH / 2, wos = r.weeksOfStock!;
            const state = wos < r.window.min ? "below" : wos > r.window.max ? "above" : "within";
            const color = state === "below" ? "var(--viz-critical)" : state === "above" ? "var(--viz-warning)" : "var(--viz-good)";
            const e = r.economics;
            const isOut = e.runOutDate !== null && e.runOutDate < today;
            const late = (e.stockoutGapDays ?? 0) > 0;
            const note = isOut ? `out since ${shortDay(e.runOutDate!)}` : late && e.runOutDate ? `runs out ${shortDay(e.runOutDate)}` : "";
            const labelX = Math.max(x(wos), x(r.window.max)) + 8;
            const tipLines = [
              `${weeks(wos)} weeks of stock · target ${r.window.min}–${r.window.max}`,
              ...(e.runOutDate ? [isOut ? `Ran out ${shortDay(e.runOutDate)}` : `Runs out ${shortDay(e.runOutDate)}`] : []),
              ...(e.arrivalIfOrderedToday && r.action !== "NO_ACTION" && r.action !== "PAUSE_NEXT_ORDER" ? [`Order today arrives ${shortDay(e.arrivalIfOrderedToday)}`] : []),
              `${ACTION_LABEL[r.action]}${r.suggestedQty ? ` · ${units(r.suggestedQty)} units` : ""}`,
            ];
            return (
              <g key={r.sku}>
                <rect x={x(r.window.min)} y={y + 5} width={x(r.window.max) - x(r.window.min)} height={rowH - 10} rx={4} fill="var(--viz-band)" stroke="var(--viz-band-edge)" strokeDasharray="3 3" />
                <path className="viz-bar" d={hbarPath(L, yc - 7, x(wos) - L, 14)} fill={color} />
                <text x={L - 10} y={narrow ? yc + 4 : yc - 1} textAnchor="end" fontSize={narrow ? 12 : 13} fontWeight={600} fill="var(--ink)">
                  {narrow ? compact(r.product) : shortName(r.product)}
                </text>
                {!narrow && (
                  <text x={L - 10} y={yc + 12} textAnchor="end" fontSize={10.5} fill="var(--ink-3)" fontFamily="var(--font-mono)">
                    {r.sku}
                    {r.perishability === "High" ? " · perishable" : ""}
                  </text>
                )}
                <text x={labelX} y={yc + 4} fontSize={12} fontWeight={late || isOut ? 600 : 400} fill={late || isOut ? "var(--ink)" : "var(--ink-2)"}>
                  {late || isOut ? "⚠ " : ""}
                  {weeks(wos)}
                  {narrow ? "" : " wks"}
                  {note && !narrow ? ` · ${note}` : ""}
                </text>
                <HitRow
                  x={0}
                  y={y}
                  w={width}
                  h={rowH}
                  label={`${shortName(r.product)}: ${tipLines.join(". ")}`}
                  tip={{ x: Math.min(Math.max(x(wos), 140), width - 140), y: y + 4, title: shortName(r.product), lines: tipLines }}
                  onTip={setTip}
                  onOpen={() => onOpen(r.sku)}
                />
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

// ---------- 2. ₹ at stake ----------

function MoneyChart({ recs, onOpen }: { recs: Recommendation[]; onOpen: (sku: string) => void }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const svg = React.useRef<SVGSVGElement>(null);
  const [tip, setTip] = React.useState<Tip | null>(null);
  const rows = recs.filter((r) => r.economics.valueAtRisk).sort((a, b) => b.economics.valueAtRisk! - a.economics.valueAtRisk!).slice(0, 8);
  useGrow(svg, rows.map((r) => r.sku + r.economics.valueAtRisk).join(), "x");
  const L = Math.min(150, width * 0.36), R = width - 78, rowH = 34;
  const max = Math.max(1, ...rows.map((r) => r.economics.valueAtRisk!));
  const x = (v: number) => L + (v / max) * (R - L);
  const height = rows.length * rowH + 8;
  return (
    <div ref={box} className="relative">
      {!rows.length && <p className="py-6 text-[13px] text-ink-3">Nothing at stake, or add cost and price to the SKU master to see ₹ values.</p>}
      {width > 0 && rows.length > 0 && (
        <svg ref={svg} width={width} height={height} role="group" aria-label="Rupees at stake per SKU">
          <line x1={L} x2={L} y1={2} y2={height - 4} stroke="var(--viz-axis)" />
          {rows.map((r, i) => {
            const e = r.economics, yc = 4 + i * rowH + rowH / 2, margin = e.valueKind === "MARGIN_AT_RISK";
            const lines = margin
              ? [`${rupees(e.valueAtRisk)} margin at risk`, `${units(e.shortfallUnits)} units short of ${r.window.min} weeks`, `${rupees(e.marginPerUnit)} margin per unit`]
              : [`${rupees(e.valueAtRisk)} cash tied up`, `${units(e.excessUnits)} units above ${r.window.max} weeks`, `${rupees(e.unitCost)} cost per unit`];
            return (
              <g key={r.sku}>
                <path className="viz-bar" d={hbarPath(L, yc - 8, x(e.valueAtRisk!) - L, 16)} fill={margin ? "var(--viz-critical)" : "var(--viz-warning)"} />
                <text x={L - 10} y={yc + 4} textAnchor="end" fontSize={12.5} fontWeight={500} fill="var(--ink)">
                  {width < 420 ? compact(r.product) : brandless(r.product)}
                </text>
                <text x={x(e.valueAtRisk!) + 8} y={yc + 4} fontSize={12.5} fontWeight={600} fill="var(--ink)" fontFamily="var(--font-mono)">
                  {rupees(e.valueAtRisk)}
                </text>
                <HitRow x={0} y={yc - rowH / 2} w={width} h={rowH} label={`${shortName(r.product)}: ${lines.join(", ")}`} tip={{ x: Math.min(x(e.valueAtRisk!), width - 130), y: yc - 12, title: shortName(r.product), lines }} onTip={setTip} onOpen={() => onOpen(r.sku)} />
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

// ---------- 3. Demand change (diverging) ----------

function DemandChart({ recs, onOpen }: { recs: Recommendation[]; onOpen: (sku: string) => void }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const svg = React.useRef<SVGSVGElement>(null);
  const [tip, setTip] = React.useState<Tip | null>(null);
  const sorted = recs.filter((r) => r.demandChange !== null).sort((a, b) => b.demandChange! - a.demandChange!);
  const rows = sorted.length > 8 ? [...sorted.slice(0, 5), ...sorted.slice(-3)] : sorted;
  useGrow(svg, rows.map((r) => r.sku + r.demandChange).join(), "x");

  const L = Math.min(150, width * 0.36), R = width - 64, rowH = 30;
  const lo = Math.min(-0.1, ...rows.map((r) => r.demandChange!)), hi = Math.max(0.25, ...rows.map((r) => r.demandChange!));
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (R - L);
  const plotH = rows.length * rowH + 6, height = plotH + 22;
  return (
    <div ref={box} className="relative">
      {width > 0 && (
        <svg ref={svg} width={width} height={height} role="group" aria-label="Demand change, last 4 weeks against the 12-week average">
          <line x1={x(0.2)} x2={x(0.2)} y1={2} y2={plotH} stroke="var(--viz-axis)" strokeDasharray="4 3" />
          <text x={x(0.2)} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--viz-axis)">
            +20% rule
          </text>
          <line x1={x(0)} x2={x(0)} y1={2} y2={plotH} stroke="var(--viz-axis)" />
          <text x={x(0)} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--viz-axis)">
            0
          </text>
          {rows.map((r, i) => {
            const v = r.demandChange!, yc = 4 + i * rowH + rowH / 2, up = v >= 0;
            const lines = [`${pct(v)} vs the 12-week average`, `4-week avg ${units(r.avg4)} · 12-week avg ${units(r.avg12)} units/week`, v > 0.2 ? "High-demand rule fired" : "Below the +20% rule"];
            return (
              <g key={r.sku}>
                <path className="viz-bar" d={up ? hbarPath(x(0), yc - 7, x(v) - x(0), 14, 1) : hbarPath(x(0), yc - 7, x(0) - x(v), 14, -1)} fill={up ? "var(--viz-up)" : "var(--viz-down)"} />
                <text x={L - 10} y={yc + 4} textAnchor="end" fontSize={12.5} fontWeight={500} fill="var(--ink)">
                  {width < 420 ? compact(r.product) : brandless(r.product)}
                </text>
                <text x={(up ? x(v) : x(0)) + 6} y={yc + 4} fontSize={12} fontWeight={v > 0.2 ? 600 : 400} fill="var(--ink)" fontFamily="var(--font-mono)">
                  {pct(v)}
                </text>
                <HitRow x={0} y={yc - rowH / 2} w={width} h={rowH} label={`${shortName(r.product)}: ${lines.join(", ")}`} tip={{ x: Math.min(Math.max(x(v), 130), width - 130), y: yc - 10, title: shortName(r.product), lines }} onTip={setTip} onOpen={() => onOpen(r.sku)} />
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

// ---------- 4. Weekly units vs forecast ----------

function WeeklyChart() {
  const store = useStore();
  const ds = store.report.dataset;
  const [box, width] = useWidth<HTMLDivElement>();
  const svg = React.useRef<SVGSVGElement>(null);
  const [tip, setTip] = React.useState<Tip | null>(null);
  const data = React.useMemo(() => {
    if (!ds) return [];
    return ds.weeks.map((week, t) => ({
      week,
      actual: ds.skus.reduce((s, k) => s + (k.weekly[t] ?? 0), 0),
      forecast: t >= 4 ? Math.round(ds.skus.reduce((s, k) => s + (forecastFor(k.weekly, t, week, ds.festivalCalendar) ?? 0), 0)) : null,
      festival: ds.festivalCalendar ? !!ds.festivalCalendar[week.slice(0, 7)] : ["10", "11", "03"].includes(week.slice(5, 7)),
    }));
  }, [ds]);
  const shown = width < 560 ? data.slice(-8) : data;
  useGrow(svg, shown.map((d) => d.week + d.actual).join(), "y");

  const L = 48, R = width - 8, T = 40, B = 230;
  const top = Math.max(1, ...shown.map((d) => Math.max(d.actual, d.forecast ?? 0)));
  const step = top > 3000 ? 1000 : top > 1200 ? 600 : 200;
  const max = Math.ceil(top / step) * step;
  const y = (v: number) => B - (v / max) * (B - T);
  const band = (R - L) / shown.length, cw = Math.min(24, band * 0.55);
  const fi = shown.findIndex((d) => d.festival);
  const lastFest = fi >= 0 ? shown.length - 1 - [...shown].reverse().findIndex((d) => d.festival) : -1;
  const labelled = new Set(shown.slice(-3).map((d) => d.week));
  return (
    <div ref={box} className="relative">
      {width > 0 && shown.length > 0 && (
        <svg ref={svg} width={width} height={B + 26} role="group" aria-label="Weekly units sold against the engine forecast">
          {fi >= 0 && (
            <g>
              <rect x={L + fi * band} y={T - 34} width={(lastFest - fi + 1) * band} height={B - T + 34} rx={6} fill="var(--viz-festival)" />
              <text x={L + fi * band + 8} y={T - 18} fontSize={11.5} fontWeight={600} fill="#7a5200">
                Festival uplift +25%
              </text>
            </g>
          )}
          {Array.from({ length: max / step + 1 }, (_, i) => i * step).map((t) => (
            <g key={t}>
              <line x1={L} x2={R} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--viz-axis)">
                {t.toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {shown.map((d, i) => {
            const cx = L + i * band + band / 2;
            const diff = d.forecast ? (d.forecast - d.actual) / d.actual : null;
            const lines = [`Sold ${units(d.actual)} units`, ...(d.forecast ? [`Forecast ${units(d.forecast)} (${pct(diff)} vs actual)`] : ["No forecast (needs 4 weeks of history)"]), ...(d.festival ? ["Festival uplift week"] : [])];
            return (
              <g key={d.week}>
                <path className="viz-bar" d={vbarPath(cx - cw / 2, B, cw, B - y(d.actual))} fill="var(--viz-actual)" />
                {d.forecast !== null && <line x1={cx - cw * 0.75} x2={cx + cw * 0.75} y1={y(d.forecast)} y2={y(d.forecast)} stroke="var(--viz-forecast)" strokeWidth={3} strokeLinecap="round" />}
                {labelled.has(d.week) && (
                  <>
                    {d.forecast !== null && (
                      <text x={cx} y={y(d.forecast) - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)" fontFamily="var(--font-mono)">
                        {units(d.forecast)}
                      </text>
                    )}
                    <text x={cx} y={y(d.actual) - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink-2)" fontFamily="var(--font-mono)">
                      {units(d.actual)}
                    </text>
                  </>
                )}
                <text x={cx} y={B + 17} textAnchor="middle" fontSize={11} fill="var(--viz-axis)">
                  {shortDay(d.week)}
                </text>
                <HitRow x={cx - band / 2} y={T - 34} w={band} h={B - T + 50} label={`Week ending ${shortDay(d.week)}: ${lines.join(", ")}`} tip={{ x: Math.min(Math.max(cx, 120), width - 120), y: Math.min(y(d.actual), d.forecast ? y(d.forecast) : B) - 4, title: `Week ending ${shortDay(d.week)}`, lines }} onTip={setTip} />
              </g>
            );
          })}
          <line x1={L} x2={R} y1={B} y2={B} stroke="var(--viz-axis)" />
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

// ---------- header + headline numbers ----------

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Headlines({ recs }: { recs: Recommendation[] }) {
  const store = useStore();
  const today = todayIst();
  const bt = React.useMemo(() => (store.report.dataset ? backtest(store.report.dataset, 8) : null), [store.report.dataset]);
  const waiting = recs.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW" && (r.risk !== "NONE" || r.decisionMode === "JUDGEMENT"));
  const reorders = waiting.filter((r) => r.action === "IMMEDIATE_REORDER" || r.action === "REORDER_1_5X").length;
  const pauses = waiting.filter((r) => r.action === "PAUSE_NEXT_ORDER").length;
  const out = recs.filter((r) => r.economics.runOutDate !== null && r.economics.runOutDate < today);
  const late = recs.filter((r) => (r.economics.stockoutGapDays ?? 0) > 0);
  const margin = recs.filter((r) => r.economics.valueKind === "MARGIN_AT_RISK").reduce((s, r) => s + (r.economics.valueAtRisk ?? 0), 0);
  const hasMoney = recs.some((r) => r.economics.marginPerUnit !== null);
  const outNames = out.map((r) => brandless(r.product));
  const accuracy = bt?.wape == null ? null : Math.max(0, Math.round((1 - bt.wape) * 100));

  const tiles = [
    { k: "To review", v: <AnimatedNumber value={waiting.length} format={(n) => String(Math.round(n))} duration={0.6} />, d: waiting.length ? [reorders && `${reorders} reorder${reorders === 1 ? "" : "s"}`, pauses && `${pauses} pause${pauses === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || "judgement calls" : "nothing waiting", tone: "var(--ink)", href: "#inbox" },
    {
      k: "Out of stock now",
      v: <AnimatedNumber value={out.length} format={(n) => String(Math.round(n))} duration={0.6} />,
      d: out.length ? `${outNames.slice(0, 2).join(" · ")}${outNames.length > 2 ? ` +${outNames.length - 2}` : ""} since ${shortDay(out.map((r) => r.economics.runOutDate!).sort()[0])}` : "none, based on the latest stock file",
      tone: out.length ? "var(--viz-critical)" : "var(--viz-good)",
      href: "/recommendations?risk=STOCKOUT",
    },
    {
      k: "Margin at risk",
      v: hasMoney ? <AnimatedNumber value={margin} format={rupees} /> : "—",
      d: hasMoney ? (late.length ? `${late.length} SKU${late.length === 1 ? "" : "s"} can’t be restocked before ${late.length === 1 ? "it runs" : "they run"} out` : "all can be restocked in time") : "add cost and price to the SKU master",
      tone: "var(--viz-critical)",
      href: "/recommendations?risk=STOCKOUT",
    },
    {
      k: "Forecast accuracy",
      v: accuracy === null ? "—" : <AnimatedNumber value={accuracy} format={(n) => `${Math.round(n)}%`} />,
      d: bt?.bias == null ? "needs 5+ weeks of sales" : `last 8 weeks · running ${Math.abs(bt.bias) < 0.02 ? "on target" : `${pct(Math.abs(bt.bias), false)} ${bt.bias > 0 ? "high" : "low"}`}`,
      tone: "var(--viz-good)",
      href: "/audit#outcomes",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Link key={t.k} href={t.href} className="relative block overflow-hidden rounded-md border border-line bg-surface px-4 py-3.5 hover:bg-white/60">
          <span className="absolute bottom-3.5 left-0 top-3.5 w-[3px] rounded-r" style={{ background: t.tone }} />
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t.k}</p>
          <p className="mt-1.5 font-cond text-[34px] font-semibold leading-none">{t.v}</p>
          <p className="mt-2 text-[12.5px] leading-snug text-ink-3">{t.d}</p>
        </Link>
      ))}
    </div>
  );
}

// ---------- the dashboard ----------

export function RaghavDashboard({ actions }: { actions?: React.ReactNode }) {
  const store = useStore();
  const a = store.analysis;
  if (!a) return null;
  const recs = a.recommendations;
  const asOf = store.report.dataset?.asOfDate ?? a.analysisWeek;
  const age = Math.max(0, daysBetween(asOf, todayIst()));
  const waiting = recs.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW" && (r.risk !== "NONE" || r.decisionMode === "JUDGEMENT")).length;
  const placeholder = !store.uploads.skuMaster && recs.some((r) => r.economics.marginPerUnit !== null);
  const bt = store.report.dataset ? backtest(store.report.dataset, 8) : null;
  const festivalGap = bt?.festivalBias != null && bt.normalBias != null && bt.festivalBias - bt.normalBias > 0.1;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">{greeting()}, Raghav</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {a.weekLabel}
            {a.festival.applied ? ` · ${a.festival.monthName} festival uplift +25% applied` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {age > 7 && (
            <Link href="/data" className="rounded-full border border-review/40 bg-review-bg/80 px-3 py-1.5 text-[12.5px] font-semibold text-review hover:bg-review-bg">
              ⚠ Sales data is {age} days old · upload this week’s files
            </Link>
          )}
          <Button asChild variant="primary" size="md">
            <Link href="#inbox">{waiting ? `Review ${waiting} decision${waiting === 1 ? "" : "s"} →` : "All decided ✓"}</Link>
          </Button>
        </div>
      </div>

      <Headlines recs={recs} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ChartCard
          title="Stock cover against target"
          caption="Weeks of stock at festival-adjusted demand. Shaded band = target window (6–14 weeks, 3–4 for perishables). Most urgent first; click a row to review it."
          legend={
            <>
              <Swatch color="var(--viz-critical)" label="Below target" />
              <Swatch color="var(--viz-good)" label="Within target" />
              <Swatch color="var(--viz-warning)" label="Above target" />
              <Swatch color="" label="Target window" band />
            </>
          }
        >
          <StockCoverChart recs={recs} onOpen={store.openDetail} />
        </ChartCard>
        <div className="grid content-start gap-4">
          <ChartCard
            title="₹ at stake"
            caption="Margin lost if cover isn’t restored · cash tied up above target"
            legend={
              <>
                <Swatch color="var(--viz-critical)" label="Margin at risk" />
                <Swatch color="var(--viz-warning)" label="Cash tied up" />
              </>
            }
          >
            <MoneyChart recs={recs} onOpen={store.openDetail} />
          </ChartCard>
          <ChartCard title="Demand change" caption="Last 4 weeks vs 12-week average · the high-demand rule fires above +20%">
            <DemandChart recs={recs} onOpen={store.openDetail} />
          </ChartCard>
        </div>
      </div>

      <ChartCard
        title="Weekly units sold vs engine forecast"
        caption="All SKUs. Columns = actual units sold; marker = what the engine forecast for that week."
        legend={
          <>
            <Swatch color="var(--viz-actual)" label="Actual units sold" />
            <Swatch color="var(--viz-forecast)" label="Engine forecast" line />
          </>
        }
      >
        <WeeklyChart />
        {festivalGap && (
          <p className="mt-2 border-t border-line pt-2.5 text-[13px] text-ink-2">
            <span className="font-semibold text-ink">Festival-week forecasts ran {pct(bt!.festivalBias!, false)} high</span>, against {Math.abs(bt!.normalBias!) < 0.02 ? "on target" : pct(bt!.normalBias!)} in
            normal weeks. The +25% uplift may be too large for these SKUs; worth reviewing before the next festival month.
          </p>
        )}
      </ChartCard>

      {placeholder && (
        <p className="text-[12px] text-review">
          ₹ figures and run-out dates use placeholder cost, price and lead-time values in the sample SKU master. Upload your SKU master with Unit_Cost, Selling_Price and Lead_Time_Days to use real ones.
        </p>
      )}
    </div>
  );
}

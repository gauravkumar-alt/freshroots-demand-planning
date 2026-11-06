"use client";

// Raghav's dashboard: greeting, four headline numbers and one bar chart of the SKUs that need a decision. Charts lay out to their real
// pixel width (so labels stay readable on a phone), show a tooltip on hover or keyboard focus, and open
// the SKU's detail panel on click. Bars grow in with GSAP when motion is allowed.

import Link from "next/link";
import * as React from "react";
import { daysBetween, formatDate } from "@/business/dates";
import { pct, rupees, units, weeks } from "@/business/format";
import { ACTION_LABEL } from "@/business/labels";
import { backtest } from "@/business/outcomes";
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
    <section className={cn("min-w-0 rounded-md border border-line bg-surface px-4 pb-3 pt-4 sm:px-5", className)}>
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

// ---------- the one chart: SKUs that need a decision ----------

function urgencyOrder(today: string) {
  return (a: Recommendation, b: Recommendation) => {
    const outA = a.economics.runOutDate !== null && a.economics.runOutDate < today ? 1 : 0;
    const outB = b.economics.runOutDate !== null && b.economics.runOutDate < today ? 1 : 0;
    return (
      outB - outA ||
      (b.economics.stockoutGapDays ?? 0) - (a.economics.stockoutGapDays ?? 0) ||
      (a.risk === "STOCKOUT" ? 0 : 1) - (b.risk === "STOCKOUT" ? 0 : 1) ||
      (b.economics.valueAtRisk ?? 0) - (a.economics.valueAtRisk ?? 0)
    );
  };
}

/** Next to the bar end, unless that would sit on the target band; then just past the band. */
function valueLabelX(barEnd: number, bandStart: number, bandEnd: number, labelWidth = 30) {
  const at = barEnd + 6;
  const hitsBand = at < bandEnd && at + labelWidth > bandStart && barEnd < bandStart;
  return hitsBand ? bandEnd + 6 : at;
}

/** One row per SKU waiting for Raghav: weeks of stock against its target band, with what's at stake written beside it. */
function DecisionChart({ recs, onOpen }: { recs: Recommendation[]; onOpen: (sku: string) => void }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const svg = React.useRef<SVGSVGElement>(null);
  const [tip, setTip] = React.useState<Tip | null>(null);
  const today = todayIst();
  const rows = [...recs].sort(urgencyOrder(today));
  useGrow(svg, rows.map((r) => r.sku).join(), "x");

  const narrow = width < 560;
  const rowH = narrow ? 52 : 46, top = 4;
  const L = narrow ? 112 : 200;
  const R = narrow ? width - 44 : Math.max(L + 120, width - 300);
  const maxWeeks = Math.max(16, Math.ceil(Math.max(0, ...rows.map((r) => r.window.max), ...rows.map((r) => Math.min(r.weeksOfStock ?? 0, 30))) / 4) * 4);
  const x = (v: number) => L + (Math.min(v, maxWeeks) / maxWeeks) * (R - L);
  const height = top + rows.length * rowH + 24;
  const tickStep = narrow ? 8 : 4;
  const ticks = Array.from({ length: Math.floor(maxWeeks / tickStep) + 1 }, (_, i) => i * tickStep);

  return (
    <div ref={box} className="relative w-full min-w-0 overflow-hidden">
      {rows.length === 0 && (
        <p className="flex items-center gap-2 py-6 text-[14px] font-medium text-approved">
          <span className="grid size-6 place-items-center rounded-full bg-approved-bg">✓</span> Nothing needs your decision this week.
        </p>
      )}
      {width > 0 && rows.length > 0 && (
        // width="100%" so the chart never sets the page width; the viewBox matches the measured width, so nothing is scaled.
        <svg ref={svg} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMin meet" className="block" role="group" aria-label="SKUs that need a decision: weeks of stock against target">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={top} y2={top + rows.length * rowH} stroke="var(--viz-grid)" />
              <text x={x(t)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--viz-axis)">
                {t === ticks[ticks.length - 1] ? `${t} wks` : t}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const y = top + i * rowH, yc = y + rowH / 2, wos = r.weeksOfStock;
            const e = r.economics;
            const color = wos === null ? "var(--viz-axis)" : wos < r.window.min ? "var(--viz-critical)" : wos > r.window.max ? "var(--viz-warning)" : "var(--viz-good)";
            const isOut = e.runOutDate !== null && e.runOutDate < today;
            const late = (e.stockoutGapDays ?? 0) > 0;
            const status = wos === null ? "Needs manual review" : isOut ? `Out of stock since ${shortDay(e.runOutDate!)}` : late && e.runOutDate ? `Runs out ${shortDay(e.runOutDate)}, before an order can arrive` : e.runOutDate && wos < r.window.min ? `Runs out ${shortDay(e.runOutDate)}` : `${weeks(wos)} weeks of stock`;
            const action = `${ACTION_LABEL[r.action]}${r.suggestedQty ? ` ${units(r.suggestedQty)}` : ""}`;
            const stake = e.valueAtRisk !== null ? `${rupees(e.valueAtRisk)} ${e.valueKind === "MARGIN_AT_RISK" ? "at risk" : "tied up"}` : "";
            const tipLines = [
              ...(wos !== null ? [`${weeks(wos)} weeks of stock · target ${r.window.min}–${r.window.max}`] : []),
              status,
              ...(e.arrivalIfOrderedToday && (r.action === "IMMEDIATE_REORDER" || r.action === "REORDER_1_5X") ? [`Order today arrives ${shortDay(e.arrivalIfOrderedToday)}`] : []),
              ...(r.demandChange !== null ? [`Demand ${pct(r.demandChange)} vs 12-week average${r.demandChange > 0.2 ? " (high-demand rule)" : ""}`] : []),
              ...(stake ? [stake] : []),
              `Recommended: ${action}`,
              "Click to decide",
            ];
            const urgent = isOut || late;
            return (
              <g key={r.sku}>
                {urgent && <rect x={0} y={y + 2} width={width} height={rowH - 4} rx={6} fill="var(--stockout-bg)" opacity={0.55} />}
                <rect x={x(r.window.min)} y={yc - 9} width={x(r.window.max) - x(r.window.min)} height={18} rx={4} fill="var(--viz-band)" stroke="var(--viz-band-edge)" strokeDasharray="3 3" />
                {wos !== null && <path className="viz-bar" d={hbarPath(L, yc - 7, x(wos) - L, 14)} fill={color} />}
                <text x={L - 12} y={yc - 3} textAnchor="end" fontSize={narrow ? 12.5 : 13.5} fontWeight={600} fill="var(--ink)">
                  {narrow ? compact(r.product) : shortName(r.product)}
                </text>
                <text x={L - 12} y={yc + 12} textAnchor="end" fontSize={narrow ? 10.5 : 11.5} fill="var(--ink-3)">
                  {narrow ? (stake || action) : `${r.sku}${r.perishability === "High" ? " · perishable" : ""}`}
                </text>
                {wos !== null && (
                  <text x={valueLabelX(x(wos), x(r.window.min), x(r.window.max))} y={yc + 4} fontSize={11.5} fontWeight={600} fill="var(--ink-2)" fontFamily="var(--font-mono)">
                    {weeks(wos)}
                  </text>
                )}
                {!narrow && (
                  <>
                    <text x={R + 24} y={yc - 3} fontSize={12.5} fontWeight={urgent ? 600 : 500} fill="var(--ink)">
                      {urgent ? "⚠ " : ""}
                      {status}
                    </text>
                    <text x={R + 24} y={yc + 13} fontSize={12} fill="var(--ink-2)">
                      {action}
                      {stake ? ` · ${stake}` : ""}
                    </text>
                  </>
                )}
                <HitRow
                  x={0}
                  y={y}
                  w={width}
                  h={rowH}
                  label={`${shortName(r.product)}: ${tipLines.join(". ")}`}
                  tip={{ x: Math.min(Math.max(wos !== null ? x(wos) : L, 140), width - 140), y: y + 6, title: shortName(r.product), lines: tipLines }}
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
  const pendingRecs = recs.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW" && (r.risk !== "NONE" || r.decisionMode === "JUDGEMENT"));
  const waiting = pendingRecs.length;
  const placeholder = !store.uploads.skuMaster && recs.some((r) => r.economics.marginPerUnit !== null);

  return (
    <div className="grid min-w-0 gap-4">
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

      <ChartCard
        title="Needs your decision"
        caption={
          pendingRecs.length
            ? `${pendingRecs.length} SKU${pendingRecs.length === 1 ? "" : "s"} waiting, most urgent first. Bar = weeks of stock; shaded band = target (6–14 weeks, 3–4 for perishables). Click a row to decide.`
            : "Every flagged SKU has a decision."
        }
        legend={
          pendingRecs.length ? (
            <>
              <Swatch color="var(--viz-critical)" label="Below target" />
              <Swatch color="var(--viz-good)" label="Within target" />
              <Swatch color="var(--viz-warning)" label="Above target" />
              <Swatch color="" label="Target window" band />
            </>
          ) : undefined
        }
      >
        <DecisionChart recs={pendingRecs} onOpen={store.openDetail} />
      </ChartCard>

      {placeholder && (
        <p className="text-[12px] text-review">
          ₹ figures and run-out dates use placeholder cost, price and lead-time values in the sample SKU master. Upload your SKU master with Unit_Cost, Selling_Price and Lead_Time_Days to use real ones.
        </p>
      )}
    </div>
  );
}

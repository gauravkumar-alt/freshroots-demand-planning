"use client";

import { ClipboardCheck, Database, FileClock, LayoutDashboard, ListChecks, Play, ScrollText, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { daysBetween, formatDate } from "@/business/dates";
import { DEMO_EXPORT_DATE } from "@/data/demoData";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import { KillSwitchBanner } from "./KillSwitchBanner";
import { RecommendationDetail } from "./RecommendationDetail";
import { Button } from "./ui/button";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/recommendations", label: "Recommendations", icon: ListChecks },
  { href: "/procurement", label: "Procurement", icon: Truck },
  { href: "/data", label: "Data", icon: Database },
  { href: "/rules", label: "Rules", icon: ScrollText },
  { href: "/audit", label: "Audit Log", icon: FileClock },
];

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const store = useStore();
  const { analysis, isDemo, stale, ready } = store;
  const pending = analysis ? analysis.recommendations.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW").length : 0;

  const exportDate = analysis ? (store.report.dataset?.asOfDate ?? (isDemo ? DEMO_EXPORT_DATE : analysis.analysisWeek)) : null;
  const age = exportDate ? Math.max(0, daysBetween(exportDate, todayIso())) : null;

  const onRun = () => {
    const res = store.runAnalysis();
    store.notify(res.message);
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 lg:block">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-[6px] bg-leaf font-cond text-[15px] font-bold text-white">fr</span>
              <span className="leading-tight">
                <span className="block text-[14px] font-semibold">Freshroots</span>
                <span className="block text-[11.5px] text-ink-3">Demand planning assistant</span>
              </span>
            </Link>
            <div className="lg:mt-4">
              {isDemo ? (
                <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-review/40 bg-review-bg px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.08em] text-review">
                  <span className="size-1.5 rounded-full bg-review" /> DEMO DATA
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-approved/40 bg-approved-bg px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.08em] text-approved">
                  {store.dataLabel}
                </span>
              )}
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:mt-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-[13px] font-medium",
                    active ? "bg-ink text-white" : "text-ink-2 hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                  {href === "/recommendations" && pending > 0 && (
                    <span className={cn("ml-auto rounded-[3px] px-1.5 font-mono text-[11px]", active ? "bg-white/20" : "bg-review-bg text-review")}>{pending}</span>
                  )}
                  {href === "/procurement" && store.procurement.length > 0 && (
                    <span className={cn("ml-auto rounded-[3px] px-1.5 font-mono text-[11px]", active ? "bg-white/20" : "bg-approved-bg text-approved")}>{store.procurement.length}</span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto hidden border-t border-line p-4 lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Reviewer</p>
            <p className="mt-1 text-[13px] font-medium">{store.user}</p>
            <p className="text-[12px] text-ink-3">Senior Demand Planner</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-line bg-surface">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 lg:px-6">
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <ClipboardCheck className="size-4 text-ink-3" />
              <span className="font-semibold">Weekly run</span>
              <span className="text-ink-2">{analysis ? analysis.weekLabel : "Not run yet"}</span>
            </div>
            {analysis && exportDate && (
              <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <span className="size-1.5 rounded-full bg-approved" />
                Data through {formatDate(analysis.analysisWeek, { day: "numeric", month: "short" })} · SAP/Zoho export {formatDate(exportDate, { day: "numeric", month: "short" })}
                <span className="font-semibold text-ink">({age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} old`})</span>
                <span className="hidden text-ink-3 xl:inline">· was 3–4 weeks old under the monthly process</span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {stale && <span className="text-[12px] font-medium text-review">Files changed since last run</span>}
              <Button variant="primary" size="sm" onClick={onRun} disabled={!ready}>
                <Play /> Run analysis
              </Button>
            </div>
          </div>
        </header>
        {ready && <KillSwitchBanner />}

        <main className="px-4 py-5 lg:px-6">{ready ? children : <Loading />}</main>
      </div>

      {ready && <RecommendationDetail />}
      {store.toast && (
        <div role="status" className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-md bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-lg">
          {store.toast}
        </div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid gap-3">
      <div className="h-6 w-56 animate-pulse rounded bg-line" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-md bg-line/60" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-md bg-line/50" />
    </div>
  );
}

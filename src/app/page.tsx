"use client";

import Link from "next/link";
import { BusinessImpact, WorkflowCompare } from "@/components/BusinessImpact";
import { CoverageMap, DemandMovers } from "@/components/Charts";
import { AutomationSplit, KPIGrid } from "@/components/KPIGrid";
import { PriorityQueue } from "@/components/PriorityQueue";
import { RecommendationCard } from "@/components/RecommendationCard";
import { TrendsHighlights } from "@/components/TrendsHighlights";
import { Card, CardHeader } from "@/components/ui/card";
import { useStore } from "@/state/store";
import { NoAnalysis } from "@/components/EmptyStates";

export default function OverviewPage() {
  const store = useStore();
  const a = store.analysis;
  if (!a) return <NoAnalysis />;
  const judgement = a.recommendations.filter((r) => r.decisionMode === "JUDGEMENT");
  const pendingJudgement = judgement.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">What needs attention this week</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {a.weekLabel}
            {a.festival.applied && <span className="ml-2 rounded-[4px] border border-line-2 px-1.5 py-px text-[11.5px] font-semibold text-ink-2">{a.festival.monthName}: festival uplift +25% applied</span>}
          </p>
        </div>
      </div>

      <KPIGrid />
      <AutomationSplit />
      <TrendsHighlights />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <PriorityQueue />
        <Card className="self-start">
          <CardHeader
            title="Needs your judgement"
            description={judgement.length ? `${pendingJudgement.length} of ${judgement.length} still open. The rules cannot settle these on their own.` : "Cases the rules cannot settle on their own"}
            action={
              <Link href="/recommendations?mode=JUDGEMENT" className="text-[12.5px] font-medium text-ink-2 hover:underline">
                See all
              </Link>
            }
          />
          <div className="grid gap-2 p-3">
            {judgement.length === 0 && (
              <p className="px-1 py-4 text-[13px] text-ink-3">
                Nothing this week. Every SKU has enough history, one clear signal and no rubric note, so the documented rules settle all of them.
              </p>
            )}
            {(pendingJudgement.length ? pendingJudgement : judgement).slice(0, 5).map((r) => (
              <RecommendationCard key={r.sku} rec={r} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <CoverageMap />
        <DemandMovers />
      </div>

      <section id="impact" className="grid scroll-mt-4 gap-3">
        <h2 className="text-[16px] font-semibold">Business impact and kill criteria</h2>
        <BusinessImpact />
      </section>

      <WorkflowCompare />
    </div>
  );
}

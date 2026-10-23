"use client";

import { BusinessImpact, WorkflowCompare } from "@/components/BusinessImpact";
import { CoverageMap, DemandMovers } from "@/components/Charts";
import { DecisionInbox } from "@/components/DecisionInbox";
import { NoAnalysis } from "@/components/EmptyStates";
import { AutomationSplit, KPIGrid } from "@/components/KPIGrid";
import { OwnerSummary } from "@/components/OwnerSummary";
import { TrendsHighlights } from "@/components/TrendsHighlights";
import { Button } from "@/components/ui/button";
import { useStore } from "@/state/store";
import { Mail } from "lucide-react";
import * as React from "react";

export default function OverviewPage() {
  const store = useStore();
  const a = store.analysis;
  if (!a) return <NoAnalysis />;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
        <h1 className="text-[22px] font-semibold leading-tight">This week</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {a.weekLabel}
          {a.festival.applied && <span className="ml-2 rounded-[4px] border border-line-2 px-1.5 py-px text-[11.5px] font-semibold text-ink-2">{a.festival.monthName}: festival uplift +25% applied</span>}
        </p>
        </div>
        <EmailDigestButton />
      </div>

      {/* Money first, then the decisions, then the story. */}
      <OwnerSummary />
      <DecisionInbox />
      <TrendsHighlights />

      <details className="group rounded-md border border-line bg-surface">
        <summary className="cursor-pointer list-none px-4 py-3 text-[14px] font-semibold marker:hidden">
          <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span> Analysis: rule coverage, stock cover, demand movers, kill criteria
        </summary>
        <div className="grid gap-5 border-t border-line p-4">
          <KPIGrid />
          <AutomationSplit />
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
      </details>
    </div>
  );
}

function EmailDigestButton() {
  const store = useStore();
  const [busy, setBusy] = React.useState(false);
  const send = async () => {
    setBusy(true);
    const res = await fetch("/api/digest", { method: "POST" }).then((r) => r.json()).catch(() => ({ ok: false, error: "Could not reach the server." }));
    setBusy(false);
    store.notify(res.ok ? `Digest sent to ${res.to}.` : res.error);
  };
  return (
    <Button variant="secondary" size="sm" onClick={send} disabled={busy} title="Sends the Monday digest now (it also goes out every Monday at 8:00 IST)">
      <Mail /> {busy ? "Sending…" : "Email me this summary"}
    </Button>
  );
}

"use client";

import { Mail } from "lucide-react";
import * as React from "react";
import { BusinessImpact } from "@/components/BusinessImpact";
import { DecisionInbox } from "@/components/DecisionInbox";
import { NoAnalysis } from "@/components/EmptyStates";
import { AutomationSplit, KPIGrid } from "@/components/KPIGrid";
import { RaghavDashboard } from "@/components/RaghavDashboard";
import { TrendsHighlights } from "@/components/TrendsHighlights";
import { Button } from "@/components/ui/button";
import { useStore } from "@/state/store";

export default function OverviewPage() {
  const store = useStore();
  if (!store.analysis) return <NoAnalysis />;

  return (
    <div className="grid min-w-0 gap-5">
      {/* Raghav's dashboard first, then his decisions, then the story and the deeper analysis. */}
      <RaghavDashboard actions={<EmailDigestButton />} />
      <DecisionInbox />
      <TrendsHighlights />

      <section className="grid gap-3">
        <h2 className="text-[16px] font-semibold">This week at a glance</h2>
        <KPIGrid />
        <AutomationSplit />
      </section>
      <section id="impact" className="grid scroll-mt-4 gap-3">
        <h2 className="text-[16px] font-semibold">Business impact and kill criteria</h2>
        <BusinessImpact />
      </section>
    </div>
  );
}

function EmailDigestButton() {
  const store = useStore();
  const [busy, setBusy] = React.useState(false);
  const send = async () => {
    setBusy(true);
    const res = await fetch("/api/digest", { method: "POST" })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "Could not reach the server." }));
    setBusy(false);
    store.notify(res.ok ? `Digest sent to ${res.to}.` : res.error);
  };
  return (
    <Button variant="secondary" size="md" onClick={send} disabled={busy} title="Sends the Monday digest now (it also goes out every Monday at 8:00 IST)">
      <Mail /> {busy ? "Sending…" : "Email me this summary"}
    </Button>
  );
}

"use client";

import * as React from "react";
import { AuditTable } from "@/components/AuditTable";
import { ExceptionLibrary } from "@/components/ExceptionLibrary";
import { OutcomesPanel } from "@/components/OutcomesPanel";
import { cn } from "@/lib/utils";

export default function AuditPage() {
  const [tab, setTab] = React.useState<"log" | "exceptions" | "outcomes">(() => {
    const h = typeof window !== "undefined" ? window.location.hash : "";
    return h === "#exceptions" ? "exceptions" : h === "#outcomes" ? "outcomes" : "log";
  });
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">Audit Log</h1>
        <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">
          Every analysis run, decision, Zoho PO, kill-switch event and email, with the original recommendation, the final decision, the reason, the user and the time.
        </p>
      </div>
      <div className="flex gap-1 border-b border-line" role="tablist">
        {(
          [
            ["log", "Decision log"],
            ["exceptions", "Exception library"],
            ["outcomes", "Outcomes"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => (setTab(k), history.replaceState(null, "", k === "log" ? "#" : `#${k}`))}
            className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold", tab === k ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "log" ? <AuditTable /> : tab === "exceptions" ? <ExceptionLibrary /> : <OutcomesPanel />}
    </div>
  );
}

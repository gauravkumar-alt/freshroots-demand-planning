"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import * as React from "react";
import { formatDate } from "@/business/dates";
import { FILE_SPECS, type Severity } from "@/business/validationEngine";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import { Button } from "./ui/button";
import { Card, CardHeader } from "./ui/card";

const SEV: Record<Severity, { icon: typeof Info; cls: string; label: string }> = {
  error: { icon: CircleAlert, cls: "text-rejected", label: "Errors" },
  warning: { icon: TriangleAlert, cls: "text-review", label: "Warnings" },
  info: { icon: Info, cls: "text-info", label: "Standardised" },
};

export function ValidationResults() {
  const store = useStore();
  const rep = store.report;
  const [showAll, setShowAll] = React.useState(false);
  const counts = { error: 0, warning: 0, info: 0 } as Record<Severity, number>;
  rep.issues.forEach((i) => counts[i.severity]++);
  const sorted = [...rep.issues].sort((a, b) => ["error", "warning", "info"].indexOf(a.severity) - ["error", "warning", "info"].indexOf(b.severity));
  const visible = showAll ? sorted : sorted.slice(0, 12);
  const total = rep.files.reduce((s, f) => s + f.rowsRead, 0);
  const accepted = rep.files.reduce((s, f) => s + f.rowsAccepted, 0);

  return (
    <Card>
      <CardHeader
        title="Validation results"
        description={
          rep.canRun
            ? `${accepted.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} rows accepted (${total ? ((accepted / total) * 100).toFixed(1) : 0}%). Ready to run.`
            : "Blocking problems found. The analysis cannot run until they are fixed."
        }
        action={
          <div className="flex gap-1.5">
            {(Object.keys(SEV) as Severity[]).map((s) => {
              const Icon = SEV[s].icon;
              return (
                <span key={s} className={cn("inline-flex items-center gap-1 rounded-[4px] border border-line px-1.5 py-0.5 text-[12px] font-semibold", SEV[s].cls)}>
                  <Icon className="size-3.5" /> {counts[s]} {SEV[s].label.toLowerCase()}
                </span>
              );
            })}
          </div>
        }
      />
      {rep.canRun && (
        <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5">
          {[
            ["SKUs", rep.summary.skus],
            ["Distributors", rep.summary.distributors],
            ["Weeks of history", rep.summary.weeks],
            ["Sales rows", rep.summary.salesRows.toLocaleString("en-IN")],
            ["Period", rep.summary.firstWeek && rep.summary.lastWeek ? `${formatDate(rep.summary.firstWeek, { day: "numeric", month: "short" })} – ${formatDate(rep.summary.lastWeek, { day: "numeric", month: "short" })}` : "—"],
          ].map(([l, v]) => (
            <div key={String(l)} className="bg-surface px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{l}</p>
              <p className="font-cond text-[18px] font-semibold tnum">{v}</p>
            </div>
          ))}
        </div>
      )}
      {rep.issues.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-approved">
          <CircleCheck className="size-4" /> All four files passed every check.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((i, idx) => {
            const Icon = SEV[i.severity].icon;
            return (
              <li key={idx} className="flex items-start gap-2.5 px-4 py-2 text-[13px]">
                <Icon className={cn("mt-0.5 size-4 shrink-0", SEV[i.severity].cls)} />
                <span className="w-28 shrink-0 text-[12px] font-medium text-ink-3">{i.file === "combined" ? "All files" : FILE_SPECS[i.file].label}</span>
                <span className="min-w-0 text-ink-2">{i.message}</span>
              </li>
            );
          })}
        </ul>
      )}
      {sorted.length > 12 && (
        <div className="border-t border-line px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${sorted.length} issues`}
          </Button>
        </div>
      )}
    </Card>
  );
}

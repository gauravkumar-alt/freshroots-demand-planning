"use client";

import { NoAnalysis } from "@/components/EmptyStates";
import { ProcurementQueue } from "@/components/ProcurementQueue";
import { useStore } from "@/state/store";

export default function ProcurementPage() {
  const store = useStore();
  if (!store.analysis) return <NoAnalysis />;
  const ks = store.killSwitch;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">Procurement</h1>
        <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">
          {store.analysis.weekLabel}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-line bg-surface px-4 py-2.5 text-[12.5px]">
        <span>
          Kill switch:{" "}
          <span className={ks?.active ? "font-semibold text-rejected" : "font-semibold text-approved"}>{ks?.active ? "breached, purchase orders on hold" : "clear"}</span>
        </span>
        <span className="text-ink-2">
          This week rejected: {ks?.rejected ?? 0} of {ks?.decided ?? 0} ({ks?.rate == null ? "—" : `${(ks.rate * 100).toFixed(1)}%`})
        </span>
      </div>
      <ProcurementQueue />
    </div>
  );
}

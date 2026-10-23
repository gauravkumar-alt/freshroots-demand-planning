"use client";

import { NoAnalysis } from "@/components/EmptyStates";
import { ProcurementQueue } from "@/components/ProcurementQueue";
import { useStore } from "@/state/store";

export default function ProcurementPage() {
  const store = useStore();
  if (!store.analysis) return <NoAnalysis />;
  const ks = store.killSwitch;
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">Procurement</h1>
        <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">
          {store.analysis.weekLabel}. Approved reorders pass the kill-switch check, then go to Zoho as purchase orders. Paused orders need no PO and are listed as instructions. The CSV export contains approved items only.
        </p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-line bg-surface px-4 py-2.5 text-[12.5px]">
        <span>
          Threshold check:{" "}
          <span className={ks?.active ? "font-semibold text-rejected" : "font-semibold text-approved"}>{ks?.active ? "breached, POs halted" : "clear, POs flow to Zoho"}</span>
        </span>
        <span className="text-ink-2">
          This week rejected: {ks?.rejected ?? 0} of {ks?.decided ?? 0} ({ks?.rate == null ? "—" : `${(ks.rate * 100).toFixed(1)}%`}; fires above 50% once 10 decisions exist)
        </span>
        <span className="text-ink-2">Zoho: {store.integrations?.zoho ? "live API" : "simulated, no credentials"}</span>
      </div>
      <ProcurementQueue />
    </div>
  );
}

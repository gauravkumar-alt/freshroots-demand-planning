"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { NoAnalysis } from "@/components/EmptyStates";
import { EMPTY_FILTERS, RecommendationTable, type TableFilters } from "@/components/RecommendationTable";
import { useStore } from "@/state/store";

function RecommendationsInner() {
  const store = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [filters, setFiltersState] = React.useState<TableFilters>(() => ({
    ...EMPTY_FILTERS,
    risk: (params.get("risk") as TableFilters["risk"]) ?? "",
    status: (params.get("status") as TableFilters["status"]) ?? "",
    mode: (params.get("mode") as TableFilters["mode"]) ?? "",
    rule: params.get("rule") ?? "",
  }));
  const setFilters = (f: TableFilters) => {
    setFiltersState(f);
    const qs = new URLSearchParams();
    for (const k of ["risk", "status", "mode", "rule"] as const) if (f[k]) qs.set(k, f[k]);
    router.replace(`/recommendations${qs.size ? `?${qs}` : ""}`, { scroll: false });
  };
  if (!store.analysis) return <NoAnalysis />;
  const recs = store.analysis.recommendations;
  const waiting = recs.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW");
  const needYou = waiting.filter((r) => r.risk !== "NONE" || r.decisionMode === "JUDGEMENT").length;
  const decided = recs.length - waiting.length;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">Recommendations</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {store.analysis.weekLabel} · {needYou} need a decision · {waiting.length - needYou} with no change · {decided} decided
        </p>
      </div>
      {filters.rule && (
        <p className="text-[12.5px] text-ink-2">
          Showing SKUs where the <span className="font-semibold">{filters.rule.replace("_", " ").toLowerCase()}</span> rule fired.{" "}
          <button className="underline" onClick={() => setFilters({ ...filters, rule: "" })}>
            Remove
          </button>
        </p>
      )}
      <RecommendationTable filters={filters} setFilters={setFilters} />
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <React.Suspense>
      <RecommendationsInner />
    </React.Suspense>
  );
}

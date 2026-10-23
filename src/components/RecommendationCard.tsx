"use client";

import type { Recommendation } from "@/business/types";
import { useStore } from "@/state/store";
import { ActionText, RiskBadge, StatusBadge } from "./RuleBadge";

/** Compact card for a recommendation that needs Raghav's judgement. */
export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const store = useStore();
  return (
    <button
      type="button"
      onClick={() => store.openDetail(rec.sku)}
      className="flex w-full flex-col gap-2 rounded-md border border-dashed border-manual/45 bg-surface p-3 text-left hover:border-manual hover:bg-sunken"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11.5px] text-ink-3">{rec.sku}</p>
          <p className="truncate text-[13.5px] font-semibold">{rec.product}</p>
        </div>
        <StatusBadge status={store.statusOf(rec.sku)} />
      </div>
      <p className="line-clamp-3 text-[12.5px] leading-snug text-ink-2">{rec.judgementReasons[0]}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <RiskBadge risk={rec.risk} />
        <ActionText action={rec.action} qty={rec.suggestedQty} className="text-[12.5px]" />
      </div>
    </button>
  );
}

"use client";

import { Sparkles } from "lucide-react";
import type { Highlight } from "@/business/highlights";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "./ui/card";

const TONE: Record<Highlight["tone"], string> = {
  risk: "bg-stockout",
  demand: "bg-demand",
  excess: "bg-overstock",
  info: "bg-manual",
};

/** The map's AI step: Gemini describes this week's trends from numbers the rules already calculated. */
export function TrendsHighlights() {
  const store = useStore();
  const { status, items, note } = store.highlights;
  const recs = store.analysis?.recommendations ?? [];
  const name = (sku: string) => recs.find((r) => r.sku === sku)?.product ?? sku;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-ink-3" /> Trends and highlights
          </span>
        }
        description={
          status === "gemini"
            ? `${note} Gemini writes the words; every number comes from the rules engine and is checked.`
            : status === "loading"
              ? "Asking Gemini for this week’s highlights…"
              : `Rule-generated summary. ${note}`
        }
        action={
          <span className={cn("rounded-[4px] px-1.5 py-0.5 font-mono text-[11px] font-semibold", status === "gemini" ? "bg-approved-bg text-approved" : "bg-normal-bg text-normal")}>
            {status === "gemini" ? "GEMINI" : status === "loading" ? "…" : "RULES ONLY"}
          </span>
        }
      />
      <ul className="divide-y divide-line">
        {items.map((h) => (
          <li key={h.title} className="flex gap-3 px-4 py-3">
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE[h.tone])} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">{h.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{h.detail}</p>
              {h.skus.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {h.skus.slice(0, 6).map((s) => (
                    <button key={s} type="button" onClick={() => store.openDetail(s)} className="rounded-[3px] border border-line px-1.5 py-px text-[11.5px] text-ink-2 hover:border-ink hover:text-ink">
                      {name(s)}
                    </button>
                  ))}
                  {h.skus.length > 6 && <span className="px-1 text-[11.5px] text-ink-3">+{h.skus.length - 6} more</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

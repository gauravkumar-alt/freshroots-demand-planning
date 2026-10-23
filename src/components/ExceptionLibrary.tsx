"use client";

import { exceptionLibrary, exceptionPatterns, repeatSkus } from "@/business/decisions";
import { units } from "@/business/format";
import { ACTION_LABEL } from "@/business/labels";
import type { ActionCode } from "@/business/types";
import { formatTime } from "@/lib/utils";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "./ui/card";
import { Table, Td, Th } from "./ui/table";

export const describeAction = (a: ActionCode | null, q: number | null) => (a ? `${ACTION_LABEL[a]}${q ? ` — ${units(q)} units` : ""}` : "—");

/** The 15–20%: every override, grouped into recurring patterns that point to rubric improvements. */
export function ExceptionLibrary() {
  const store = useStore();
  const entries = exceptionLibrary(store.audit, describeAction);
  const patterns = exceptionPatterns(entries);
  const repeats = repeatSkus(entries);

  return (
    <div className="grid gap-4">
      <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
        {[
          ["Human feedback", `${entries.length} overrides recorded`, "Every edit and rejection, with Raghav's reason and a category."],
          ["Exception patterns", `${patterns.length} recurring categories`, "Grouped by category and SKU. Plain counting, no model training."],
          ["Rubric improvement", `${patterns.length} candidate rules`, "Raghav decides which patterns become documented rules."],
        ].map(([t, v, d], i) => (
          <div key={t} className="bg-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
              {i + 1} · {t}
            </p>
            <p className="mt-0.5 text-[15px] font-semibold">{v}</p>
            <p className="text-[12.5px] text-ink-3">{d}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Recurring patterns" description="Categories overridden more than once across the pilot" />
          {patterns.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-3">No category has been overridden twice yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {patterns.map((p) => (
                <li key={p.key} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13.5px] font-semibold">{p.title}</p>
                    <p className="text-[12px] text-ink-3 tnum">
                      {p.count} overrides · {p.runs} run{p.runs > 1 ? "s" : ""} · {p.skus.length} SKU{p.skus.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-2">
                    <span className="font-medium text-ink">Candidate rule:</span> {p.suggestion}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="SKUs overridden repeatedly" description="Likely candidates for a SKU-specific rule" />
          {repeats.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-3">No SKU has been overridden twice yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {repeats.map((r) => (
                <li key={r.sku} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <button className="min-w-0 text-left" onClick={() => store.openDetail(r.sku)}>
                    <p className="truncate text-[13px] font-medium hover:underline">{r.product}</p>
                    <p className="text-[12px] text-ink-3">{r.categories.join(", ")}</p>
                  </button>
                  <span className="font-cond text-[18px] font-semibold tnum">{r.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Exception library" description="SKU, original recommendation, Raghav's decision, reason, date and category" />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Run</Th>
              <Th>SKU</Th>
              <Th>Original recommendation</Th>
              <Th>Raghav’s decision</Th>
              <Th>Override reason</Th>
              <Th>Category</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-[12.5px] text-ink-2">{formatTime(e.date)}</Td>
                <Td className="font-mono text-[12px] text-ink-3">{e.runId}</Td>
                <Td className="min-w-[150px]">
                  <span className="font-mono text-[11.5px] text-ink-3">{e.sku}</span>
                  <span className="block font-medium">{e.product}</span>
                </Td>
                <Td className="text-[12.5px]">{e.original}</Td>
                <Td className={e.decision === "Rejected" ? "font-semibold text-rejected" : "font-semibold text-edited"}>{e.decision}</Td>
                <Td className="min-w-[220px] text-[12.5px] text-ink-2">{e.reason}</Td>
                <Td className="whitespace-nowrap text-[12.5px]">{e.category}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

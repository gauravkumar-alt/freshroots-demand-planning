"use client";

import { ArrowDownRight, ArrowUpRight, Check, Minus, Search } from "lucide-react";
import * as React from "react";
import { pct, units, weeks } from "@/business/format";
import { RISK_LABEL, STATUS_LABEL } from "@/business/labels";
import type { DecisionStatus, Recommendation, RiskLevel } from "@/business/types";
import { cn, shortDistributor } from "@/lib/utils";
import { useStore } from "@/state/store";
import { ActionText, JudgementTag, PoStatus, PriorityChip, RiskBadge, RuleBadge, StatusBadge } from "./RuleBadge";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/form";
import { Table, Td, Th } from "./ui/table";

export interface TableFilters {
  q: string;
  risk: RiskLevel | "";
  category: string;
  distributor: string;
  perishability: string;
  status: DecisionStatus | "";
  mode: "" | "RULE_BASED" | "JUDGEMENT";
  rule: string;
}

export const EMPTY_FILTERS: TableFilters = { q: "", risk: "", category: "", distributor: "", perishability: "", status: "", mode: "", rule: "" };

function Trend({ change }: { change: number | null }) {
  if (change === null) return <span className="text-ink-3">—</span>;
  const Icon = change > 0.05 ? ArrowUpRight : change < -0.05 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tnum", change > 0.2 ? "font-semibold text-demand" : change < -0.05 ? "text-overstock" : "text-ink-2")}>
      <Icon className="size-3.5" />
      {pct(change)}
    </span>
  );
}

export function RecommendationTable({ filters, setFilters }: { filters: TableFilters; setFilters: (f: TableFilters) => void }) {
  const store = useStore();
  const recs = store.analysis?.recommendations ?? [];
  const [selected, setSelected] = React.useState<string[]>([]);

  const categories = [...new Set(recs.map((r) => r.category))].sort();
  const distributors = [...new Set(recs.map((r) => r.leadDistributor).filter((d): d is string => !!d))].sort();

  const rows = recs.filter((r) => {
    const q = filters.q.trim().toLowerCase();
    if (q && !`${r.sku} ${r.product} ${r.category} ${r.leadDistributor ?? ""}`.toLowerCase().includes(q)) return false;
    if (filters.risk && r.risk !== filters.risk) return false;
    if (filters.category && r.category !== filters.category) return false;
    if (filters.distributor && r.leadDistributor !== filters.distributor) return false;
    if (filters.perishability && r.perishability !== filters.perishability) return false;
    if (filters.status && store.statusOf(r.sku) !== filters.status) return false;
    if (filters.mode && r.decisionMode !== filters.mode) return false;
    if (filters.rule && !r.triggered.some((h) => h.code === filters.rule)) return false;
    return true;
  });

  const approvable = (r: Recommendation) => r.decisionMode === "RULE_BASED" && store.statusOf(r.sku) === "NEEDS_REVIEW" && r.action !== "MANUAL_REVIEW";
  const selectable = rows.filter(approvable);
  const chosen = selectable.filter((r) => selected.includes(r.sku));
  const active = Object.entries(filters).filter(([, v]) => v).length;

  const set = <K extends keyof TableFilters>(k: K, v: TableFilters[K]) => setFilters({ ...filters, [k]: v });

  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-ink-3" />
          <Input aria-label="Search" placeholder="Search SKU, product, category or distributor" value={filters.q} onChange={(e) => set("q", e.target.value)} className="w-full pl-8" />
        </div>
        <Select aria-label="Risk" value={filters.risk} onChange={(e) => set("risk", e.target.value as RiskLevel | "")}>
          <option value="">All risks</option>
          {(Object.keys(RISK_LABEL) as RiskLevel[]).map((r) => (
            <option key={r} value={r}>
              {RISK_LABEL[r]}
            </option>
          ))}
        </Select>
        <Select aria-label="Category" value={filters.category} onChange={(e) => set("category", e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select aria-label="Distributor" value={filters.distributor} onChange={(e) => set("distributor", e.target.value)} className="max-w-[210px]">
          <option value="">All lead distributors</option>
          {distributors.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select aria-label="Perishability" value={filters.perishability} onChange={(e) => set("perishability", e.target.value)}>
          <option value="">Any perishability</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </Select>
        <Select aria-label="Status" value={filters.status} onChange={(e) => set("status", e.target.value as DecisionStatus | "")}>
          <option value="">Any status</option>
          {(Object.keys(STATUS_LABEL) as DecisionStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="Decision type" value={filters.mode} onChange={(e) => set("mode", e.target.value as TableFilters["mode"])}>
          <option value="">Rule-based + judgement</option>
          <option value="RULE_BASED">Rule-based only</option>
          <option value="JUDGEMENT">Needs judgement</option>
        </Select>
        {active > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear {active} filter{active > 1 ? "s" : ""}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken px-3 py-2 text-[12.5px]">
        <span className="text-ink-2">
          <span className="font-semibold text-ink tnum">{rows.length}</span> of {recs.length} recommendations
        </span>
        <div className="flex items-center gap-2">
          {chosen.length > 0 && <span className="text-ink-2">{chosen.length} rule-based selected</span>}
          <Button
            size="sm"
            variant="approve"
            disabled={chosen.length === 0}
            onClick={() => {
              const n = store.approveMany(chosen);
              setSelected([]);
              store.notify(`${n} rule-based recommendation${n === 1 ? "" : "s"} approved.`);
            }}
          >
            <Check /> Approve selected
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-[14px] font-semibold">No recommendations match these filters.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        </div>
      ) : (
        <Table className="max-h-[calc(100vh-260px)] overflow-y-auto">
          <thead>
            <tr>
              <Th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Select all rule-based recommendations needing review"
                  checked={selectable.length > 0 && chosen.length === selectable.length}
                  onChange={(e) => setSelected(e.target.checked ? selectable.map((r) => r.sku) : [])}
                  disabled={selectable.length === 0}
                />
              </Th>
              <Th>Pri.</Th>
              <Th>SKU</Th>
              <Th>Product</Th>
              <Th>Lead distributor</Th>
              <Th align="right">Trend</Th>
              <Th align="right">4-wk avg</Th>
              <Th align="right">12-wk avg</Th>
              <Th align="right">Wks stock</Th>
              <Th>Risk</Th>
              <Th>Recommendation</Th>
              <Th align="right">Qty</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const status = store.statusOf(r.sku);
              const po = store.poFor(r.sku);
              return (
                <tr key={r.sku} className="cursor-pointer hover:bg-sunken" onClick={() => store.openDetail(r.sku)}>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {approvable(r) && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.product}`}
                        checked={selected.includes(r.sku)}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.sku] : s.filter((x) => x !== r.sku)))}
                      />
                    )}
                  </Td>
                  <Td>
                    <PriorityChip priority={r.priority} />
                  </Td>
                  <Td className="font-mono text-[12px] text-ink-2">{r.sku}</Td>
                  <Td className="min-w-[170px]">
                    <span className="font-medium">{r.product}</span>
                    <span className="block text-[11.5px] text-ink-3">
                      {r.category} · {r.perishability} perishability
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{shortDistributor(r.leadDistributor)}</Td>
                  <Td align="right">
                    <Trend change={r.demandChange} />
                  </Td>
                  <Td align="right">{units(r.avg4)}</Td>
                  <Td align="right" className="text-ink-2">
                    {units(r.avg12)}
                  </Td>
                  <Td align="right" className={r.risk === "STOCKOUT" ? "font-semibold text-stockout" : r.risk === "OVERSTOCK" ? "font-semibold text-overstock" : ""}>
                    {weeks(r.weeksOfStock)}
                    {r.window.kind === "perishable" && <span className="block text-[10.5px] font-normal text-ink-3">target 3–4</span>}
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <RiskBadge risk={r.risk} />
                      {r.triggered
                        .filter((h) => h.code !== "FESTIVAL_UPLIFT" && h.code !== (r.risk === "STOCKOUT" ? "STOCKOUT" : r.risk === "OVERSTOCK" ? "OVERSTOCK" : r.risk))
                        .filter((h) => !(r.risk === "HIGH_DEMAND" && h.code === "HIGH_DEMAND"))
                        .map((h) => (
                          <RuleBadge key={h.code} code={h.code} />
                        ))}
                      {r.decisionMode === "JUDGEMENT" && <JudgementTag />}
                    </div>
                  </Td>
                  <Td>
                    <ActionText action={r.action} />
                  </Td>
                  <Td align="right" className="font-semibold">
                    {r.suggestedQty === null ? "—" : units(r.suggestedQty)}
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={status} />
                      {po.kind !== "NOT_NEEDED" && <PoStatus po={po} />}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

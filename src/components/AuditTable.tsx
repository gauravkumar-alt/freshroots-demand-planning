"use client";

import * as React from "react";
import { units } from "@/business/format";
import { ACTION_LABEL } from "@/business/labels";
import type { AuditEntry, AuditEventType } from "@/business/types";
import { cn, formatTime } from "@/lib/utils";
import { useStore } from "@/state/store";
import { Input, Select } from "./ui/form";
import { Table, Td, Th } from "./ui/table";

const TYPE: Record<AuditEventType, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "bg-approved-bg text-approved" },
  EDITED: { label: "Edited", cls: "bg-edited-bg text-edited" },
  REJECTED: { label: "Rejected", cls: "bg-rejected-bg text-rejected" },
  REOPENED: { label: "Reopened", cls: "bg-review-bg text-review" },
  ANALYSIS_RUN: { label: "Analysis run", cls: "bg-normal-bg text-normal" },
  EXPORT: { label: "CSV export", cls: "bg-normal-bg text-normal" },
  PO_CREATED: { label: "Zoho PO", cls: "bg-approved-bg text-approved" },
  PO_FAILED: { label: "PO failed", cls: "bg-rejected-bg text-rejected" },
  PO_HELD: { label: "PO held", cls: "bg-rejected-bg text-rejected" },
  KILL_SWITCH: { label: "Kill switch", cls: "bg-rejected text-white" },
  KILL_SWITCH_RESUMED: { label: "Resumed", cls: "bg-review-bg text-review" },
  EMAIL_SENT: { label: "Email", cls: "bg-info-bg text-info" },
};

const act = (a: AuditEntry["finalAction"], q: number | null) => (a ? `${ACTION_LABEL[a]}${q ? ` — ${units(q)} units` : ""}` : "—");

export function AuditTable() {
  const store = useStore();
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<string>("");
  const [run, setRun] = React.useState<string>("");
  const runs = [...new Set(store.audit.map((e) => e.runId))].sort().reverse();
  const rows = store.audit.filter((e) => {
    if (type === "DECISIONS" ? !["APPROVED", "EDITED", "REJECTED", "REOPENED"].includes(e.type) : type && e.type !== type) return false;
    if (run && e.runId !== run) return false;
    const s = q.trim().toLowerCase();
    if (s && !`${e.sku ?? ""} ${e.product ?? ""} ${e.reason}`.toLowerCase().includes(s)) return false;
    return true;
  });

  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <Input aria-label="Search audit log" placeholder="Search SKU, product or reason" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-[220px] flex-1" />
        <Select aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All events</option>
          <option value="DECISIONS">Decisions only</option>
          {(Object.keys(TYPE) as AuditEventType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE[t].label}
            </option>
          ))}
        </Select>
        <Select aria-label="Run" value={run} onChange={(e) => setRun(e.target.value)}>
          <option value="">All runs</option>
          {runs.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <span className="text-[12.5px] text-ink-3 tnum">{rows.length} entries</span>
      </div>
      <Table className="max-h-[calc(100vh-300px)] overflow-y-auto">
        <thead>
          <tr>
            <Th>Time (IST)</Th>
            <Th>Run</Th>
            <Th>Event</Th>
            <Th>SKU</Th>
            <Th>System recommended</Th>
            <Th>Final decision</Th>
            <Th>Reason / detail</Th>
            <Th>User</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 400).map((e) => (
            <tr key={e.id} className={cn(e.type === "KILL_SWITCH" && "bg-rejected-bg/60")}>
              <Td className="whitespace-nowrap text-[12.5px] text-ink-2">{formatTime(e.timestamp)}</Td>
              <Td className="font-mono text-[12px] text-ink-3">{e.runId}</Td>
              <Td>
                <span className={cn("whitespace-nowrap rounded-[4px] px-1.5 py-[2px] text-[11.5px] font-semibold", TYPE[e.type].cls)}>{TYPE[e.type].label}</span>
                {e.override && <span className="ml-1 text-[11px] font-semibold text-edited">override</span>}
              </Td>
              <Td className="min-w-[140px]">
                {e.sku ? (
                  <>
                    <span className="font-mono text-[11.5px] text-ink-3">{e.sku}</span>
                    <span className="block text-[13px] font-medium">{e.product}</span>
                  </>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </Td>
              <Td className="text-[12.5px]">{["APPROVED", "EDITED", "REJECTED"].includes(e.type) ? act(e.systemAction, e.systemQty) : "—"}</Td>
              <Td className="text-[12.5px] font-medium">{e.type === "REJECTED" ? <span className="text-rejected">Rejected</span> : ["APPROVED", "EDITED"].includes(e.type) ? act(e.finalAction, e.finalQty) : "—"}</Td>
              <Td className="min-w-[240px] text-[12.5px] text-ink-2">
                {e.reason || <span className="text-ink-3">As recommended</span>}
                {e.exceptionCategory && <span className="mt-0.5 block text-[11.5px] text-ink-3">{e.exceptionCategory}</span>}
              </Td>
              <Td className="whitespace-nowrap text-[12.5px] text-ink-2">
                {e.user}
                {e.demo && <span className="block text-[11px] text-review">demo history</span>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {rows.length > 400 && <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3">Showing the latest 400. Filter by run to see older entries.</p>}
    </div>
  );
}

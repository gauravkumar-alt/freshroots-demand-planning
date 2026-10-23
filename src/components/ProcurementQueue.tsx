"use client";

import { Download, RefreshCw } from "lucide-react";
import Link from "next/link";
import { rupees, units } from "@/business/format";
import { cn, downloadText, formatTime, shortDistributor } from "@/lib/utils";
import { useStore } from "@/state/store";
import { ActionText, PoStatus, StatusBadge } from "./RuleBadge";
import { Button } from "./ui/button";
import { Card, CardHeader } from "./ui/card";
import { Table, Td, Th } from "./ui/table";

/** Approved recommendations only, with each reorder's Zoho PO status. */
export function ProcurementQueue() {
  const store = useStore();
  const items = store.procurement;
  const reorders = items.filter((i) => i.po.kind !== "NOT_NEEDED");
  const created = reorders.filter((i) => i.po.kind === "CREATED");
  const units_ = reorders.reduce((s, i) => s + (i.entry.finalQty ?? 0), 0);
  const spend = reorders.reduce((s, i) => s + (i.entry.finalQty ?? 0) * (i.rec.economics.unitCost ?? 0), 0);
  const hasCost = reorders.some((i) => i.rec.economics.unitCost !== null);
  const halted = !!store.killSwitch?.active;
  const retryable = reorders.filter((i) => i.po.kind === "HELD" || i.po.kind === "FAILED");

  const exportCsv = () => {
    const { filename, csv, count } = store.exportProcurementCsv();
    downloadText(filename, csv);
    store.notify(`${filename} downloaded with ${count} approved order${count === 1 ? "" : "s"}.`);
  };

  return (
    <Card>
      <CardHeader
        title="Procurement queue"
        description={`${items.length} approved · ${reorders.length} reorders (${units(units_)} units${hasCost ? `, ${rupees(spend)} at cost` : ""}) · ${created.length} POs raised in Zoho${store.integrations?.zoho ? "" : " (simulated: no Zoho credentials)"}`}
        action={
          <>
            {retryable.length > 0 && (
              <Button size="sm" variant="secondary" disabled={halted} onClick={async () => {
                  for (const i of retryable) {
                    const r = await store.retryPo(i.rec.sku);
                    if (!r.ok) return store.notify(r.error);
                  }
                  store.notify("Held and failed POs raised.");
                }} title={halted ? "Resume PO creation first" : undefined}>
                <RefreshCw /> Raise {retryable.length} held/failed PO{retryable.length > 1 ? "s" : ""}
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={exportCsv} disabled={items.length === 0}>
              <Download /> Export approved orders
            </Button>
          </>
        }
      />
      {items.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-[14px] font-semibold">Nothing approved yet this week.</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-3">Only recommendations Raghav approves or edits appear here. Rejected and undecided ones never reach procurement.</p>
          <Button asChild size="sm" variant="secondary" className="mt-3">
            <Link href="/recommendations?status=NEEDS_REVIEW">Review recommendations</Link>
          </Button>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Product</Th>
              <Th>Lead distributor</Th>
              <Th>Action</Th>
              <Th align="right">Approved qty</Th>
              <Th align="right">System qty</Th>
              <Th align="right">Order value</Th>
              <Th>Decision</Th>
              <Th>Approved</Th>
              <Th>Reason</Th>
              <Th>Zoho PO</Th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ rec, entry, po }) => (
              <tr key={rec.sku} className="hover:bg-sunken">
                <Td className="font-mono text-[12px] text-ink-2">{rec.sku}</Td>
                <Td className="min-w-[160px]">
                  <button type="button" className="text-left font-medium hover:underline" onClick={() => store.openDetail(rec.sku)}>
                    {rec.product}
                  </button>
                </Td>
                <Td className="whitespace-nowrap text-ink-2">{shortDistributor(rec.leadDistributor)}</Td>
                <Td>
                  <ActionText action={entry.finalAction!} />
                </Td>
                <Td align="right" className="font-semibold">
                  {units(entry.finalQty ?? 0)}
                </Td>
                <Td align="right" className={cn("text-ink-3", entry.finalQty !== rec.suggestedQty && "line-through")}>
                  {rec.suggestedQty === null ? "—" : units(rec.suggestedQty)}
                </Td>
                <Td align="right">{rec.economics.unitCost !== null && entry.finalQty ? rupees(entry.finalQty * rec.economics.unitCost) : "—"}</Td>
                <Td>
                  <StatusBadge status={entry.type === "EDITED" ? "EDITED" : "APPROVED"} />
                </Td>
                <Td className="whitespace-nowrap text-[12.5px] text-ink-2">
                  {formatTime(entry.timestamp)}
                  <span className="block text-ink-3">{entry.user}</span>
                </Td>
                <Td className="min-w-[180px] text-[12.5px] text-ink-2">{entry.reason || "As recommended"}</Td>
                <Td className="whitespace-nowrap">
                  <PoStatus po={po} />
                  {po.kind === "FAILED" && <span className="block max-w-[200px] whitespace-normal text-[11.5px] text-rejected">{po.error}</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

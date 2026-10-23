"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { weeks } from "@/business/format";
import { useStore } from "@/state/store";
import { ActionText, JudgementTag, PriorityChip, RiskBadge, StatusBadge } from "./RuleBadge";
import { Button } from "./ui/button";
import { Card, CardHeader } from "./ui/card";
import { Table, Td, Th } from "./ui/table";

/** The most urgent recommendations still waiting for a decision. */
export function PriorityQueue({ limit = 10 }: { limit?: number }) {
  const store = useStore();
  const recs = (store.analysis?.recommendations ?? []).filter((r) => r.risk !== "NONE" || r.decisionMode === "JUDGEMENT");
  const pending = recs.filter((r) => store.statusOf(r.sku) === "NEEDS_REVIEW");
  const rows = pending.slice(0, limit);

  return (
    <Card>
      <CardHeader
        title="Priority queue"
        description={`${pending.length} flagged SKUs waiting for review, most urgent first`}
        action={
          <Button asChild size="sm" variant="secondary">
            <Link href="/recommendations?status=NEEDS_REVIEW">View all</Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-[14px] font-semibold">Every flagged SKU has a decision.</p>
          <p className="mt-1 text-[13px] text-ink-3">Approved orders are waiting in Procurement.</p>
          <Button asChild variant="primary" size="sm" className="mt-3">
            <Link href="/procurement">Open procurement queue</Link>
          </Button>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-10">Pri.</Th>
              <Th>SKU</Th>
              <Th>Product</Th>
              <Th>Risk</Th>
              <Th>Recommendation</Th>
              <Th align="right">Quantity</Th>
              <Th align="right">Wks stock</Th>
              <Th>Status</Th>
              <Th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku} className="cursor-pointer hover:bg-sunken" onClick={() => store.openDetail(r.sku)}>
                <Td>
                  <PriorityChip priority={r.priority} />
                </Td>
                <Td className="font-mono text-[12px] text-ink-2">{r.sku}</Td>
                <Td className="min-w-[180px]">
                  <span className="font-medium">{r.product}</span>
                  <span className="block text-[12px] text-ink-3">{r.headline}</span>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <RiskBadge risk={r.risk} />
                    {r.decisionMode === "JUDGEMENT" && <JudgementTag />}
                  </div>
                </Td>
                <Td>
                  <ActionText action={r.action} />
                </Td>
                <Td align="right" className="font-semibold">
                  {r.suggestedQty === null ? "—" : r.suggestedQty ? r.suggestedQty.toLocaleString("en-IN") : "0"}
                </Td>
                <Td align="right" className={r.risk === "STOCKOUT" ? "font-semibold text-stockout" : r.risk === "OVERSTOCK" ? "font-semibold text-overstock" : ""}>
                  {weeks(r.weeksOfStock)}
                </Td>
                <Td>
                  <StatusBadge status={store.statusOf(r.sku)} />
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  {r.decisionMode === "RULE_BASED" && (
                    <Button
                      size="sm"
                      variant="approve"
                      aria-label={`Approve ${r.product}`}
                      onClick={async () => {
                        const res = await store.decide(r, { kind: "APPROVE" });
                        store.notify(res.ok ? `${r.product} approved.` : res.error);
                      }}
                    >
                      <Check /> Approve
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

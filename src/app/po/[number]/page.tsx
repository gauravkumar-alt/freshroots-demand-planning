"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatDate } from "@/business/dates";
import { units } from "@/business/format";
import { ACTION_LABEL } from "@/business/labels";
import { poNumberOf, purchaseOrderDocument } from "@/business/purchaseOrder";
import type { AuditEntry } from "@/business/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";
import { useStore } from "@/state/store";

const inr = (n: number) => n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export default function PurchaseOrderPage() {
  const { number } = useParams<{ number: string }>();
  const store = useStore();
  const po = store.audit.find((e) => e.type === "PO_CREATED" && poNumberOf(e) === decodeURIComponent(number));

  if (!po) {
    return (
      <Card className="p-6">
        <p className="font-semibold">Purchase order {decodeURIComponent(number)} not found.</p>
        <Button asChild variant="secondary" size="sm" className="mt-3">
          <Link href="/procurement">Back to Procurement</Link>
        </Button>
      </Card>
    );
  }

  const decision =
    store.audit
      .filter((e): e is AuditEntry => e.runId === po.runId && e.sku === po.sku && (e.type === "APPROVED" || e.type === "EDITED") && e.timestamp <= po.timestamp)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null;
  const rec = store.analysis?.recommendations.find((r) => r.sku === po.sku) ?? null;
  const doc = purchaseOrderDocument(po, decision, rec);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href="/procurement">
            <ArrowLeft /> Procurement
          </Link>
        </Button>
        <Button size="md" onClick={() => window.print()}>
          <Printer /> Download PDF / Print
        </Button>
      </div>

      <Card className="mx-auto w-full max-w-[820px] bg-white p-6 sm:p-10 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-[20px] font-semibold tracking-tight">Freshroots</p>
            <p className="text-[12.5px] text-ink-3">Packaged foods · Demand planning</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Purchase order</p>
            <p className="font-mono text-[18px] font-semibold">{doc.number}</p>
            <p className="text-[12.5px] text-ink-2">Issued {formatDate(doc.issuedAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </header>

        <section className="grid gap-4 border-b border-line py-5 sm:grid-cols-3">
          <Field label="Distributor">{doc.distributor ?? "—"}</Field>
          <Field label="Expected delivery">
            {doc.expectedDelivery ? formatDate(doc.expectedDelivery, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "—"}
            {doc.leadTimeDays != null && <span className="block text-[12px] text-ink-3">{doc.leadTimeDays}-day lead time</span>}
          </Field>
          <Field label="Planning week">{doc.runId}</Field>
        </section>

        <table className="mt-5 w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.07em] text-ink-3">
              <th className="py-2 pr-3 font-semibold">SKU</th>
              <th className="py-2 pr-3 font-semibold">Item</th>
              <th className="py-2 pr-3 text-right font-semibold">Quantity</th>
              <th className="py-2 pr-3 text-right font-semibold">Unit cost</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line align-top">
              <td className="py-3 pr-3 font-mono text-[12.5px]">{doc.sku}</td>
              <td className="py-3 pr-3">
                <span className="font-medium">{doc.product}</span>
                <span className="block text-[12px] text-ink-3">
                  {[doc.category, doc.action && ACTION_LABEL[doc.action]].filter(Boolean).join(" · ")}
                </span>
              </td>
              <td className="tnum py-3 pr-3 text-right">{units(doc.quantity)}</td>
              <td className="tnum py-3 pr-3 text-right">{doc.unitCost != null ? inr(doc.unitCost) : "—"}</td>
              <td className="tnum py-3 text-right font-medium">{doc.total != null ? inr(doc.total) : "—"}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-3 pr-3 text-right font-semibold">
                Total
              </td>
              <td className="tnum pt-3 text-right text-[16px] font-semibold">{doc.total != null ? inr(doc.total) : "—"}</td>
            </tr>
          </tfoot>
        </table>

        <section className="mt-8 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <Field label="Approved by">
            {doc.approvedBy}
            <span className="block text-[12px] text-ink-3">{formatTime(doc.approvedAt)}</span>
          </Field>
          {doc.decision === "EDITED" && (
            <Field label="Quantity changed">
              {doc.systemQty != null ? `Recommended ${units(doc.systemQty)}, ordered ${units(doc.quantity)}` : `Ordered ${units(doc.quantity)}`}
              {doc.note && <span className="block text-[12px] text-ink-3">{doc.note}</span>}
            </Field>
          )}
        </section>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{label}</p>
      <div className="mt-1 text-[14px]">{children}</div>
    </div>
  );
}

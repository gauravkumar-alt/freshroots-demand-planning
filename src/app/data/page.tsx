"use client";

import { Play } from "lucide-react";
import { DataUpload } from "@/components/DataUpload";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { ValidationResults } from "@/components/ValidationResults";
import { formatDate } from "@/business/dates";
import { useStore } from "@/state/store";

export default function DataPage() {
  const store = useStore();
  const ds = store.report.dataset;
  const preview = ds
    ? ds.skus.slice(0, 8).flatMap((s) =>
        ds.weeks.slice(-2).map((w) => {
          const i = ds.weeks.indexOf(w);
          return { sku: s.master.sku, product: s.master.product, week: w, units: s.weekly[i], dist: Object.values(s.byDistributor).filter((v) => v[i] > 0).length, stock: s.currentStock, pos: s.purchaseOrders.length };
        }),
      )
    : [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">Data</h1>
          <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">
            Raghav uploads the weekly SAP and Zoho CSV exports. The app validates them, cleans and standardises them, and combines them into one weekly analysis table. Uploads are saved to Supabase, so everyone works from the same files. Until a file is uploaded, its slot uses the Freshroots sample file.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => store.notify(store.runAnalysis().message)} disabled={!store.report.canRun}>
            <Play /> Run analysis on these files
          </Button>
        </div>
      </div>
      <DataUpload />
      <ValidationResults />
      {ds && (
        <Card>
          <CardHeader title="Prepared weekly dataset" description={`One row per SKU per week: sales, inventory, SKU master and Zoho POs combined. Sample of ${preview.length} rows.`} />
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Week ending</Th>
                <Th align="right">Units sold</Th>
                <Th align="right">Distributors</Th>
                <Th align="right">Current stock</Th>
                <Th align="right">Zoho POs</Th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.sku + r.week}>
                  <Td className="font-mono text-[12px]">{r.sku}</Td>
                  <Td>{r.product}</Td>
                  <Td>{formatDate(r.week)}</Td>
                  <Td align="right">{r.units === null ? "not listed" : r.units.toLocaleString("en-IN")}</Td>
                  <Td align="right">{r.dist}</Td>
                  <Td align="right">{r.stock === null ? "missing" : r.stock.toLocaleString("en-IN")}</Td>
                  <Td align="right">{r.pos}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

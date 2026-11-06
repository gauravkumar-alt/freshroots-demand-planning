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
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">Data</h1>
          <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">
            Upload this week’s files, then run the analysis.
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
    </div>
  );
}

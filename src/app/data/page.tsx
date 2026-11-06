"use client";

import { Play } from "lucide-react";
import { DataUpload } from "@/components/DataUpload";
import { Button } from "@/components/ui/button";
import { useStore } from "@/state/store";

export default function DataPage() {
  const store = useStore();

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">Data</h1>
          <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3">
            {store.report.canRun ? "Upload this week’s files, then run the analysis." : "A file needs fixing before the analysis can run. See the card marked Blocked."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => store.notify(store.runAnalysis().message)} disabled={!store.report.canRun}>
            <Play /> Run analysis on these files
          </Button>
        </div>
      </div>
      <DataUpload />
    </div>
  );
}

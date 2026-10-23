"use client";

import { Download, FileUp, RotateCcw } from "lucide-react";
import * as React from "react";
import { toCsv } from "@/business/csv";
import { FILE_KINDS, FILE_SPECS, type FileKind } from "@/business/validationEngine";
import { demoRawFiles } from "@/data/demoData";
import { FRESHROOTS_FILE_NAMES, freshrootsCsv } from "@/data/freshrootsFiles";
import { cn, downloadText, formatTime } from "@/lib/utils";
import { useStore } from "@/state/store";
import { Button } from "./ui/button";

const KINDS = FILE_KINDS;

export function DataUpload() {
  const store = useStore();
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {KINDS.map((k) => (
        <Slot key={k} kind={k} />
      ))}
      <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-3">
        <span className="text-[12.5px] text-ink-3">Dataset:</span>
        <Button size="sm" variant={store.base === "freshroots" ? "primary" : "secondary"} onClick={() => (store.setBase("freshroots"), store.notify("Loaded the Freshroots files and ran the analysis."))}>
          Freshroots files (15 SKUs)
        </Button>
        <Button size="sm" variant={store.base === "demo" ? "primary" : "secondary"} onClick={() => (store.setBase("demo"), store.notify("Loaded the demo exports and ran the analysis."))}>
          Demo exports (60 SKUs)
        </Button>
        <Button size="sm" variant={store.base === "messy" ? "primary" : "secondary"} onClick={() => store.setBase("messy")}>
          Demo exports with data issues
        </Button>
        <span className="text-[12px] text-ink-3">Each dataset keeps its own decisions. An uploaded file replaces that slot’s file.</span>
      </div>
    </div>
  );
}

function Slot({ kind }: { kind: FileKind }) {
  const store = useStore();
  const spec = FILE_SPECS[kind];
  const up = store.uploads[kind];
  const rep = store.report.files.find((f) => f.kind === kind)!;
  const input = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);

  const take = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return store.notify("Upload a .csv export.");
    await store.uploadFile(kind, file);
    store.notify(`${file.name} loaded. Check the results, then run the analysis.`);
  };

  const template = () => {
    const own = freshrootsCsv(kind);
    if (own) return downloadText(FRESHROOTS_FILE_NAMES[kind]!, own);
    const f = demoRawFiles()[kind as keyof ReturnType<typeof demoRawFiles>];
    if (f) downloadText(`freshroots-${kind}-demo.csv`, toCsv(f.headers, f.rows.map((r) => f.headers.map((h) => r[h] ?? ""))));
  };

  const optional = ["purchaseOrders", "distributors", "calendar"].includes(kind);
  const ok = (rep.provided || optional) && rep.missingColumns.length === 0;
  return (
    <div
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => (e.preventDefault(), setDrag(false), take(e.dataTransfer.files[0]))}
      className={cn("flex flex-col rounded-md border bg-surface p-3", drag ? "border-ink bg-sunken" : "border-line")}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{spec.system}</p>
          <p className="text-[14px] font-semibold">{spec.label}</p>
        </div>
        <span className={cn("rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold", !ok ? "bg-rejected-bg text-rejected" : up ? "bg-approved-bg text-approved" : "bg-review-bg text-review")}>
          {!ok ? "Blocked" : up ? "Uploaded" : !rep.provided ? "Optional" : store.base === "freshroots" ? "Loaded" : "Demo"}
        </span>
      </div>
      <p className="mt-1.5 truncate text-[12.5px] text-ink-2" title={up?.name}>
        {up
          ? `${up.name} · ${formatTime(up.uploadedAt)}`
          : store.base === "freshroots"
            ? (FRESHROOTS_FILE_NAMES[kind] ?? "Not provided")
            : rep.provided
              ? `Demo export (${store.base === "messy" ? "with issues" : "clean"})`
              : "Not provided (optional)"}
      </p>
      <p className="mt-0.5 text-[12.5px] tnum">
        <span className="font-semibold">{rep.rowsAccepted.toLocaleString("en-IN")}</span>
        <span className="text-ink-3"> of {rep.rowsRead.toLocaleString("en-IN")} rows accepted</span>
      </p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">Columns: {spec.columns.map((c) => c.label + (c.required ? "" : " (optional)")).join(", ")}</p>
      <div className="mt-3 flex flex-wrap gap-1.5 pt-1">
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" id={`file-${kind}`} onChange={(e) => (take(e.target.files?.[0]), (e.target.value = ""))} />
        <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>
          <FileUp /> {up ? "Replace" : "Upload CSV"}
        </Button>
        {up && (
          <Button size="sm" variant="ghost" onClick={() => store.removeUpload(kind)}>
            <RotateCcw /> Use demo
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={template} title="Download the sample file as a template">
          <Download /> Template
        </Button>
      </div>
    </div>
  );
}

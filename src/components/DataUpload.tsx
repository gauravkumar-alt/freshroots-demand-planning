"use client";

import { Download, FileUp, RotateCcw } from "lucide-react";
import * as React from "react";
import { toCsv } from "@/business/csv";
import { FILE_KINDS, FILE_SPECS, type FileKind } from "@/business/validationEngine";
import { FRESHROOTS_FILE_NAMES, freshrootsCsv } from "@/data/freshrootsFiles";
import { cn, downloadText, formatTime } from "@/lib/utils";
import { useStore } from "@/state/store";
import { Button } from "./ui/button";

const OPTIONAL: FileKind[] = ["purchaseOrders", "distributors", "calendar"];

export function DataUpload() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {FILE_KINDS.map((k) => (
        <Slot key={k} kind={k} />
      ))}
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
  const [busy, setBusy] = React.useState(false);

  const take = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return store.notify("Upload a .csv export.");
    setBusy(true);
    const r = await store.uploadFile(kind, file);
    setBusy(false);
    store.notify(r.ok ? `${file.name} saved. Check the results, then run the analysis.` : r.error);
  };

  const remove = async () => {
    setBusy(true);
    const r = await store.removeUpload(kind);
    setBusy(false);
    if (!r.ok) store.notify(r.error);
  };

  // The sample file where there is one; otherwise just the expected header row.
  const template = () => {
    const sample = freshrootsCsv(kind);
    if (sample) return downloadText(FRESHROOTS_FILE_NAMES[kind]!, sample);
    downloadText(`freshroots-${kind}-template.csv`, toCsv(spec.columns.map((c) => c.label), []));
  };

  const optional = OPTIONAL.includes(kind);
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
        <span className={cn("rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold", !ok ? "bg-rejected-bg text-rejected" : up ? "bg-approved-bg text-approved" : !rep.provided ? "bg-normal-bg text-normal" : "bg-review-bg text-review")}>
          {!ok ? "Blocked" : up ? "Uploaded" : !rep.provided ? "Optional" : "Sample"}
        </span>
      </div>
      <p className="mt-1.5 truncate text-[12.5px] text-ink-2" title={up?.name}>
        {up ? `${up.name} · ${formatTime(up.uploadedAt)}` : FRESHROOTS_FILE_NAMES[kind] ? `Sample: ${FRESHROOTS_FILE_NAMES[kind]}` : "Not provided"}
      </p>
      <p className="mt-0.5 text-[12.5px] tnum">
        <span className="font-semibold">{rep.rowsAccepted.toLocaleString("en-IN")}</span>
        <span className="text-ink-3"> of {rep.rowsRead.toLocaleString("en-IN")} rows accepted</span>
      </p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">Columns: {spec.columns.map((c) => c.label + (c.required ? "" : " (optional)")).join(", ")}</p>
      <div className="mt-3 flex flex-wrap gap-1.5 pt-1">
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" id={`file-${kind}`} onChange={(e) => (take(e.target.files?.[0]), (e.target.value = ""))} />
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          <FileUp /> {busy ? "Saving…" : up ? "Replace" : "Upload CSV"}
        </Button>
        {up && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>
            <RotateCcw /> {FRESHROOTS_FILE_NAMES[kind] ? "Use sample" : "Remove"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={template} title="Download the sample file, or a header-only template">
          <Download /> Template
        </Button>
      </div>
    </div>
  );
}

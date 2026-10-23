"use client";

// App state. Shared data (audit log, uploaded files, retired rubric notes, quarter outcomes) lives on the server
// in Supabase; this store loads it, keeps it fresh, and derives statuses from the audit log.
// The analysis itself runs in the browser from the current files: it is deterministic and needs no server.

import * as React from "react";
import { REVIEWER } from "@/business/config";
import { parseCsv, toCsv } from "@/business/csv";
import { decide as validateDecision, effectiveDecisions, reopenAudit, rubricNotes, type DecisionInput } from "@/business/decisions";
import { auditEvent } from "@/business/events";
import { fallbackHighlights, highlightFacts, type Highlight } from "@/business/highlights";
import { ACTION_LABEL, PROCUREMENT_ACTIONS } from "@/business/labels";
import { killSwitchState, type KillSwitchCheck, type RunSummary } from "@/business/measurement";
import { runAnalysis as runEngine } from "@/business/recommendationEngine";
import type { AnalysisResult, AuditEntry, DecisionStatus, QuarterOutcome, Recommendation, RubricNote } from "@/business/types";
import { validateAndPrepare, type FileKind, type RawFile, type ValidationReport } from "@/business/validationEngine";
import { freshrootsRawFiles } from "@/data/freshrootsFiles";
import { formatTime, shortDistributor } from "@/lib/utils";

const REFRESH_MS = 30_000;

export interface UploadedFile {
  name: string;
  text: string;
  uploadedAt: string;
}

export type PoState =
  | { kind: "NOT_NEEDED" }
  | { kind: "PENDING" }
  | { kind: "CREATED"; poNumber: string; simulated: boolean; at: string }
  | { kind: "HELD"; at: string }
  | { kind: "FAILED"; error: string; at: string };

export interface ProcurementItem {
  rec: Recommendation;
  entry: AuditEntry;
  po: PoState;
}

export interface Integrations {
  supabase: boolean;
  gemini: boolean;
  zoho: boolean;
  email: boolean;
  emailTo: string | null;
}

export interface HighlightsState {
  status: "loading" | "gemini" | "rules";
  items: Highlight[];
  note: string | null;
}

export interface KillSwitchView extends KillSwitchCheck {
  active: boolean;
  firedAt: string | null;
  lastEmail: AuditEntry | null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

interface Store {
  ready: boolean;
  loadError: string | null;
  storage: "supabase" | "memory" | null;
  user: string;
  uploads: Partial<Record<FileKind, UploadedFile>>;
  dataLabel: string;
  report: ValidationReport;
  analysis: AnalysisResult | null;
  stale: boolean;
  audit: AuditEntry[];
  outcomes: QuarterOutcome[];
  runs: RunSummary[];
  notes: RubricNote[];
  integrations: Integrations | null;
  highlights: HighlightsState;
  killSwitch: KillSwitchView | null;
  statusOf: (sku: string) => DecisionStatus;
  decisionFor: (sku: string) => AuditEntry | undefined;
  poFor: (sku: string) => PoState;
  procurement: ProcurementItem[];

  runAnalysis: () => { ok: boolean; message: string };
  uploadFile: (kind: FileKind, file: File) => Promise<ActionResult>;
  removeUpload: (kind: FileKind) => Promise<ActionResult>;
  decide: (rec: Recommendation, input: DecisionInput) => Promise<ActionResult>;
  approveMany: (recs: Recommendation[]) => Promise<number>;
  reopen: (rec: Recommendation) => Promise<ActionResult>;
  retryPo: (sku: string) => Promise<ActionResult>;
  resumeKillSwitch: (reason: string) => Promise<ActionResult>;
  retireNote: (id: string) => Promise<ActionResult>;
  exportProcurementCsv: () => { filename: string; csv: string; count: number };
  setOutcome: (o: QuarterOutcome) => Promise<ActionResult>;

  detailSku: string | null;
  openDetail: (sku: string | null) => void;
  toast: string | null;
  notify: (message: string) => void;
}

const StoreContext = React.createContext<Store | null>(null);

export function useStore(): Store {
  const s = React.useContext(StoreContext);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

/** The Freshroots sample files, with any uploaded file replacing its slot. */
function filesFor(uploads: Partial<Record<FileKind, UploadedFile>>): Partial<Record<FileKind, RawFile>> {
  const files = freshrootsRawFiles();
  for (const [kind, up] of Object.entries(uploads) as [FileKind, UploadedFile][]) files[kind] = parseCsv(up.text);
  return files;
}

const uploadsKey = (u: Partial<Record<FileKind, UploadedFile>>) =>
  Object.entries(u)
    .map(([k, v]) => `${k}:${v?.uploadedAt}`)
    .sort()
    .join("|");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body;
}

const isReorder = (e: AuditEntry) => e.finalAction === "IMMEDIATE_REORDER" || e.finalAction === "REORDER_1_5X";
const byTimeDesc = (a: AuditEntry, b: AuditEntry) => b.timestamp.localeCompare(a.timestamp);

interface SharedState {
  storage: "supabase" | "memory";
  audit: AuditEntry[];
  uploads: Partial<Record<FileKind, UploadedFile>>;
  retiredNotes: string[];
  outcomes: QuarterOutcome[];
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [storage, setStorage] = React.useState<SharedState["storage"] | null>(null);
  const [uploads, setUploads] = React.useState<Partial<Record<FileKind, UploadedFile>>>({});
  const [audit, setAudit] = React.useState<AuditEntry[]>([]);
  const [outcomes, setOutcomes] = React.useState<QuarterOutcome[]>([]);
  const [retiredNotes, setRetiredNotes] = React.useState<string[]>([]);
  const [analysis, setAnalysis] = React.useState<AnalysisResult | null>(null);
  const [analysisFiles, setAnalysisFiles] = React.useState("");
  const [detailSku, setDetailSku] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [integrations, setIntegrations] = React.useState<Integrations | null>(null);
  const [highlights, setHighlights] = React.useState<HighlightsState>({ status: "loading", items: [], note: null });
  const [pendingPo, setPendingPo] = React.useState<string[]>([]);

  const report = React.useMemo(() => validateAndPrepare(filesFor(uploads)), [uploads]);
  const coreUploaded = (["sales", "inventory", "skuMaster"] as FileKind[]).every((k) => uploads[k]);
  const dataLabel = coreUploaded ? "UPLOADED DATA" : Object.keys(uploads).length ? "SAMPLE + UPLOADS" : "SAMPLE FILES";
  const sourceLabel = coreUploaded ? "uploaded SAP and Zoho exports" : Object.keys(uploads).length ? "uploaded files and the Freshroots sample files" : "the Freshroots sample files";
  const notes = React.useMemo(() => rubricNotes(audit, retiredNotes), [audit, retiredNotes]);

  const notify = React.useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3200);
  }, []);

  /** Adds entries the server confirmed, without duplicating ones already loaded. */
  const merge = React.useCallback((entries: AuditEntry[]) => {
    setAudit((list) => {
      const ids = new Set(list.map((e) => e.id));
      return [...list, ...entries.filter((e) => !ids.has(e.id))].sort(byTimeDesc);
    });
  }, []);

  const applyShared = React.useCallback((s: SharedState) => {
    setStorage(s.storage);
    setAudit([...s.audit].sort(byTimeDesc));
    setUploads(s.uploads);
    setRetiredNotes(s.retiredNotes);
    setOutcomes(s.outcomes);
  }, []);

  const postEvents = React.useCallback(
    async (entries: AuditEntry[]): Promise<ActionResult> => {
      try {
        await api("/api/events", { method: "POST", body: JSON.stringify({ entries }) });
        merge(entries);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [merge],
  );

  // First load: shared state from the server, then run this week's analysis on the current files.
  React.useEffect(() => {
    (async () => {
      try {
        const s = await api<SharedState>("/api/state");
        applyShared(s);
        const rep = validateAndPrepare(filesFor(s.uploads));
        if (rep.dataset) {
          const a = runEngine(rep.dataset, new Date().toISOString(), rubricNotes(s.audit, s.retiredNotes));
          setAnalysis(a);
          setAnalysisFiles(uploadsKey(s.uploads));
          if (!s.audit.some((e) => e.runId === a.runId && e.type === "ANALYSIS_RUN")) {
            const run = auditEvent("ANALYSIS_RUN", a.runId, "System", `Weekly analysis: ${a.recommendations.length} SKUs from the current files.`, { timestamp: a.ranAt });
            await api("/api/events", { method: "POST", body: JSON.stringify({ entries: [run] }) })
              .then(() => setAudit((l) => [run, ...l]))
              .catch(() => {});
          }
        }
      } catch (e) {
        setLoadError((e as Error).message);
      } finally {
        setReady(true);
      }
    })();
    fetch("/api/status")
      .then((r) => r.json())
      .then(setIntegrations)
      .catch(() => setIntegrations({ supabase: false, gemini: false, zoho: false, email: false, emailTo: null }));
  }, [applyShared]);

  // Keep shared state fresh so everyone sees the same decisions.
  React.useEffect(() => {
    if (!ready || loadError) return;
    const refresh = () => api<SharedState>("/api/state").then(applyShared).catch(() => {});
    const id = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
    };
  }, [ready, loadError, applyShared]);

  // Gemini trends + highlights for each new run, with rule-generated highlights as the fallback.
  React.useEffect(() => {
    if (!analysis) return;
    let cancelled = false;
    setHighlights({ status: "loading", items: fallbackHighlights(analysis), note: null });
    fetch("/api/highlights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(highlightFacts(analysis)) })
      .then((r) => r.json())
      .then((res: { ok: boolean; highlights?: Highlight[]; model?: string; error?: string; dropped?: number }) => {
        if (cancelled) return;
        if (res.ok && res.highlights) {
          setHighlights({ status: "gemini", items: res.highlights, note: `Written by ${res.model}${res.dropped ? `; ${res.dropped} highlight(s) dropped for unverified numbers` : ""}.` });
        } else setHighlights({ status: "rules", items: fallbackHighlights(analysis), note: res.error ?? "Gemini unavailable." });
      })
      .catch(() => !cancelled && setHighlights({ status: "rules", items: fallbackHighlights(analysis), note: "Gemini unavailable." }));
    return () => {
      cancelled = true;
    };
  }, [analysis]);

  const current = React.useMemo(() => {
    const m = new Map<string, AuditEntry>();
    if (!analysis) return m;
    for (const e of effectiveDecisions(audit)) if (e.runId === analysis.runId && e.sku) m.set(e.sku, e);
    return m;
  }, [audit, analysis]);

  const statusOf = React.useCallback((sku: string): DecisionStatus => (current.get(sku)?.type as DecisionStatus | undefined) ?? "NEEDS_REVIEW", [current]);
  const decisionFor = React.useCallback((sku: string) => current.get(sku), [current]);

  const killSwitch = React.useMemo<KillSwitchView | null>(() => {
    if (!analysis) return null;
    const ks = killSwitchState(audit, analysis.runId);
    return {
      ...ks.check,
      active: ks.active,
      firedAt: audit.find((e) => e.runId === analysis.runId && e.type === "KILL_SWITCH")?.timestamp ?? null,
      lastEmail: audit.find((e) => e.runId === analysis.runId && e.type === "EMAIL_SENT") ?? null,
    };
  }, [audit, analysis]);

  const poFor = React.useCallback(
    (sku: string): PoState => {
      const d = current.get(sku);
      if (!d || d.type === "REJECTED" || !isReorder(d)) return { kind: "NOT_NEEDED" };
      if (pendingPo.includes(sku)) return { kind: "PENDING" };
      const po = audit.find((e) => e.runId === d.runId && e.sku === sku && (e.type === "PO_CREATED" || e.type === "PO_FAILED" || e.type === "PO_HELD") && e.timestamp >= d.timestamp);
      if (!po) return { kind: "PENDING" };
      if (po.type === "PO_CREATED") return { kind: "CREATED", poNumber: po.reference ?? "", simulated: (po.reference ?? "").startsWith("SIM-"), at: po.timestamp };
      if (po.type === "PO_HELD") return { kind: "HELD", at: po.timestamp };
      return { kind: "FAILED", error: po.reason, at: po.timestamp };
    },
    [current, audit, pendingPo],
  );

  const procurement = React.useMemo<ProcurementItem[]>(() => {
    if (!analysis) return [];
    return analysis.recommendations
      .map((rec) => ({ rec, entry: current.get(rec.sku) }))
      .filter((x): x is { rec: Recommendation; entry: AuditEntry } => !!x.entry && (x.entry.type === "APPROVED" || x.entry.type === "EDITED") && PROCUREMENT_ACTIONS.includes(x.entry.finalAction!))
      .map((x) => ({ ...x, po: poFor(x.rec.sku) }))
      .sort((a, b) => a.entry.timestamp.localeCompare(b.entry.timestamp));
  }, [analysis, current, poFor]);

  const runs = React.useMemo<RunSummary[]>(() => {
    if (!analysis) return [];
    const recs = analysis.recommendations;
    return [
      {
        runId: analysis.runId,
        weekLabel: analysis.weekLabel,
        generated: recs.length,
        ruleBased: recs.filter((r) => r.decisionMode === "RULE_BASED").length,
        judgement: recs.filter((r) => r.decisionMode === "JUDGEMENT").length,
        stockout: recs.filter((r) => r.risk === "STOCKOUT").length,
        overstock: recs.filter((r) => r.risk === "OVERSTOCK").length,
        highDemand: recs.filter((r) => r.triggered.some((h) => h.code === "HIGH_DEMAND")).length,
      },
    ];
  }, [analysis]);

  const ctx = React.useMemo(() => (analysis ? { runId: analysis.runId, analysisWeek: analysis.analysisWeek, weekLabel: analysis.weekLabel } : null), [analysis]);

  const runAnalysis = React.useCallback(() => {
    if (!report.canRun || !report.dataset) return { ok: false, message: "Fix the blocking data errors on the Data page before running the analysis." };
    const a = runEngine(report.dataset, new Date().toISOString(), notes);
    setAnalysis(a);
    setAnalysisFiles(uploadsKey(uploads));
    void postEvents([auditEvent("ANALYSIS_RUN", a.runId, "System", `Weekly analysis: ${a.recommendations.length} SKUs from ${sourceLabel}.`, { timestamp: a.ranAt })]);
    return { ok: true, message: `Analysis complete: ${a.recommendations.length} SKUs for ${a.weekLabel}.` };
  }, [report, notes, uploads, sourceLabel, postEvents]);

  const uploadFile = React.useCallback(async (kind: FileKind, file: File): Promise<ActionResult> => {
    try {
      const text = await file.text();
      const res = await api<{ upload: UploadedFile }>("/api/uploads", { method: "PUT", body: JSON.stringify({ kind, name: file.name, text }) });
      setUploads((u) => ({ ...u, [kind]: res.upload }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  const removeUpload = React.useCallback(async (kind: FileKind): Promise<ActionResult> => {
    try {
      await api(`/api/uploads?kind=${kind}`, { method: "DELETE" });
      setUploads((u) => {
        const next = { ...u };
        delete next[kind];
        return next;
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  /** Sends decisions to the server, which records them, checks the kill switch and raises or holds each PO. */
  const submit = React.useCallback(
    async (items: { rec: Recommendation; input: DecisionInput }[]) => {
      if (!ctx) throw new Error("Run the analysis first.");
      const reorderSkus = items.filter((i) => i.input.kind !== "REJECT").map((i) => i.rec.sku);
      setPendingPo((p) => [...p, ...reorderSkus]);
      try {
        const res = await api<{ results: { sku: string; ok: boolean; error?: string }[]; entries: AuditEntry[] }>("/api/decisions", {
          method: "POST",
          body: JSON.stringify({ ...ctx, items }),
        });
        merge(res.entries);
        return res.results;
      } finally {
        setPendingPo((p) => p.filter((s) => !reorderSkus.includes(s)));
      }
    },
    [ctx, merge],
  );

  const decide = React.useCallback(
    async (rec: Recommendation, input: DecisionInput): Promise<ActionResult> => {
      if (!ctx) return { ok: false, error: "Run the analysis first." };
      // Same validation the server runs, so form errors show instantly.
      const check = validateDecision(rec, ctx.runId, input, REVIEWER, new Date().toISOString());
      if (!check.ok) return check;
      try {
        const [r] = await submit([{ rec, input }]);
        return r.ok ? { ok: true } : { ok: false, error: r.error ?? "The decision was not recorded." };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [ctx, submit],
  );

  const approveMany = React.useCallback(
    async (recs: Recommendation[]) => {
      try {
        const results = await submit(recs.map((rec) => ({ rec, input: { kind: "APPROVE" as const } })));
        return results.filter((r) => r.ok).length;
      } catch {
        return 0;
      }
    },
    [submit],
  );

  const reopen = React.useCallback(
    async (rec: Recommendation): Promise<ActionResult> => {
      const prev = current.get(rec.sku);
      if (!ctx || !prev) return { ok: false, error: "Nothing to reopen." };
      return postEvents([
        reopenAudit(rec, ctx.runId, REVIEWER, new Date().toISOString(), {
          runId: prev.runId,
          sku: rec.sku,
          status: prev.type as "APPROVED" | "EDITED" | "REJECTED",
          finalAction: prev.finalAction ?? rec.action,
          finalQty: prev.finalQty,
          reason: prev.reason,
          exceptionCategory: prev.exceptionCategory,
          user: prev.user,
          timestamp: prev.timestamp,
        }),
      ]);
    },
    [ctx, current, postEvents],
  );

  const retryPo = React.useCallback(
    async (sku: string): Promise<ActionResult> => {
      const rec = analysis?.recommendations.find((r) => r.sku === sku);
      if (!ctx || !rec) return { ok: false, error: "Unknown SKU." };
      setPendingPo((p) => [...p, sku]);
      try {
        const res = await api<{ ok: boolean; error?: string; entries?: AuditEntry[] }>("/api/po/retry", { method: "POST", body: JSON.stringify({ ...ctx, rec }) });
        if (res.entries) merge(res.entries);
        return res.ok ? { ok: true } : { ok: false, error: res.error ?? "PO not raised." };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      } finally {
        setPendingPo((p) => p.filter((s) => s !== sku));
      }
    },
    [analysis, ctx, merge],
  );

  const resumeKillSwitch = React.useCallback(
    async (reason: string): Promise<ActionResult> => {
      if (!ctx || !killSwitch) return { ok: false, error: "No kill switch to resume." };
      return postEvents([auditEvent("KILL_SWITCH_RESUMED", ctx.runId, REVIEWER, `PO creation resumed: ${reason}`, { reference: String(killSwitch.rejected) })]);
    },
    [ctx, killSwitch, postEvents],
  );

  const retireNote = React.useCallback(async (id: string): Promise<ActionResult> => {
    try {
      await api("/api/notes", { method: "POST", body: JSON.stringify({ noteId: id }) });
      setRetiredNotes((l) => (l.includes(id) ? l : [...l, id]));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  const exportProcurementCsv = React.useCallback(() => {
    const runId = analysis?.runId ?? "run";
    const csv = toCsv(
      ["Run", "SKU", "Product", "Category", "Lead distributor", "Action", "Approved quantity", "System quantity", "Decision", "Approved by", "Approved at (IST)", "Reason", "Zoho PO"],
      procurement.map(({ rec, entry, po }) => [
        runId,
        rec.sku,
        rec.product,
        rec.category,
        rec.leadDistributor ?? "",
        ACTION_LABEL[entry.finalAction!],
        entry.finalQty ?? 0,
        rec.suggestedQty ?? "",
        entry.type === "EDITED" ? "Edited" : "Approved",
        entry.user,
        formatTime(entry.timestamp, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        entry.reason || "As recommended",
        po.kind === "CREATED" ? po.poNumber : po.kind === "NOT_NEEDED" ? "Not needed" : po.kind === "HELD" ? "Held by kill switch" : po.kind === "FAILED" ? "Failed" : "Pending",
      ]),
    );
    if (analysis) {
      void postEvents([
        auditEvent(
          "EXPORT",
          runId,
          REVIEWER,
          `Exported ${procurement.length} approved order${procurement.length === 1 ? "" : "s"} as CSV (${procurement
            .slice(0, 3)
            .map((p) => `${p.rec.sku} ${shortDistributor(p.rec.leadDistributor)}`)
            .join(", ")}${procurement.length > 3 ? "…" : ""}).`,
        ),
      ]);
    }
    return { filename: `freshroots-approved-orders-${runId}.csv`, csv, count: procurement.length };
  }, [analysis, procurement, postEvents]);

  const setOutcome = React.useCallback(async (o: QuarterOutcome): Promise<ActionResult> => {
    try {
      await api("/api/outcomes", { method: "POST", body: JSON.stringify(o) });
      setOutcomes((list) => [...list.filter((x) => x.quarter !== o.quarter), o]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  const value: Store = {
    ready,
    loadError,
    storage,
    user: REVIEWER,
    uploads,
    dataLabel,
    report,
    analysis,
    stale: !!analysis && analysisFiles !== uploadsKey(uploads),
    audit,
    outcomes,
    runs,
    notes,
    integrations,
    highlights,
    killSwitch,
    statusOf,
    decisionFor,
    poFor,
    procurement,
    runAnalysis,
    uploadFile,
    removeUpload,
    decide,
    approveMany,
    reopen,
    retryPo,
    resumeKillSwitch,
    retireNote,
    exportProcurementCsv,
    setOutcome,
    detailSku,
    openDetail: setDetailSku,
    toast,
    notify,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

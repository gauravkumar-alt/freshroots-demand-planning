"use client";

// App state: which files are loaded, the latest analysis run, and the audit log.
// The audit log is the single source of truth for decisions, POs and kill-switch events; statuses are derived from it.

import * as React from "react";
import { parseCsv, toCsv } from "@/business/csv";
import { decide as decideRec, effectiveDecisions, reopenAudit, rubricNotes, type DecisionInput, type DecisionResult } from "@/business/decisions";
import { fallbackHighlights, highlightFacts, type Highlight } from "@/business/highlights";
import { ACTION_LABEL, PROCUREMENT_ACTIONS } from "@/business/labels";
import { killSwitchCheck, type KillSwitchCheck } from "@/business/measurement";
import { runAnalysis as runEngine } from "@/business/recommendationEngine";
import type { AnalysisResult, AuditEntry, AuditEventType, DecisionStatus, QuarterOutcome, Recommendation, RubricNote } from "@/business/types";
import { validateAndPrepare, type FileKind, type RawFile, type ValidationReport } from "@/business/validationEngine";
import { purchaseOrderRequest, type PurchaseOrderResult } from "@/business/zohoPurchaseOrder";
import { demoHistory, demoRawFiles, messyRawFiles, REVIEWER } from "@/data/demoData";
import { freshrootsRawFiles } from "@/data/freshrootsFiles";
import type { RunSummary } from "@/data/demoHistory";
import { formatTime, shortDistributor } from "@/lib/utils";

const STORAGE_KEY = "freshroots:planning:v3";

export interface UploadedFile {
  name: string;
  text: string;
  uploadedAt: string;
}

export type BaseData = "demo" | "messy" | "freshroots";

interface Persisted {
  base: BaseData;
  uploads: Partial<Record<FileKind, UploadedFile>>;
  /** Per dataset, so decisions on the demo never mix with decisions on real files. */
  ranAt: Partial<Record<BaseData, string>>;
  audits: Partial<Record<BaseData, AuditEntry[]>>;
  outcomes: QuarterOutcome[];
  retiredNotes: string[];
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

export interface KillSwitchState extends KillSwitchCheck {
  /** The kill switch has fired for this run and PO creation is halted. */
  active: boolean;
  firedAt: string | null;
  lastEmail: AuditEntry | null;
}

interface Store {
  ready: boolean;
  user: string;
  base: BaseData;
  uploads: Partial<Record<FileKind, UploadedFile>>;
  isDemo: boolean;
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
  killSwitch: KillSwitchState | null;
  statusOf: (sku: string) => DecisionStatus;
  decisionFor: (sku: string) => AuditEntry | undefined;
  poFor: (sku: string) => PoState;
  procurement: ProcurementItem[];

  runAnalysis: () => { ok: boolean; message: string };
  uploadFile: (kind: FileKind, file: File) => Promise<void>;
  removeUpload: (kind: FileKind) => void;
  setBase: (base: BaseData) => void;
  decide: (rec: Recommendation, input: DecisionInput) => DecisionResult;
  approveMany: (recs: Recommendation[]) => number;
  reopen: (rec: Recommendation) => void;
  retryPo: (sku: string) => void;
  resumeKillSwitch: (reason: string) => void;
  retireNote: (id: string) => void;
  exportProcurementCsv: () => { filename: string; csv: string; count: number };
  setOutcome: (o: QuarterOutcome) => void;
  resetDemo: () => void;

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

function filesFor(base: BaseData, uploads: Partial<Record<FileKind, UploadedFile>>): Partial<Record<FileKind, RawFile>> {
  const files: Partial<Record<FileKind, RawFile>> = base === "freshroots" ? freshrootsRawFiles() : base === "messy" ? messyRawFiles() : demoRawFiles();
  for (const [kind, up] of Object.entries(uploads) as [FileKind, UploadedFile][]) files[kind] = parseCsv(up.text);
  return files;
}

function event(type: AuditEventType, runId: string, user: string, reason: string, extra: Partial<AuditEntry> = {}): AuditEntry {
  const timestamp = extra.timestamp ?? new Date().toISOString();
  return {
    id: `${runId}-${type}-${extra.sku ?? "all"}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
    runId,
    type,
    user,
    sku: null,
    product: null,
    systemAction: null,
    systemQty: null,
    finalAction: null,
    finalQty: null,
    override: false,
    reason,
    exceptionCategory: null,
    risk: null,
    ...extra,
  };
}

const runEntry = (a: AnalysisResult, source: string) =>
  event("ANALYSIS_RUN", a.runId, "System", `Weekly analysis: ${a.recommendations.length} SKUs from ${source}.`, { timestamp: a.ranAt });

function load(): Persisted | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

const NO_HISTORY = { audit: [] as AuditEntry[], runs: [] as RunSummary[] };
const historyFor = (base: BaseData) => (base === "freshroots" ? NO_HISTORY : demoHistory);

const isReorder = (e: AuditEntry) => e.finalAction === "IMMEDIATE_REORDER" || e.finalAction === "REORDER_1_5X";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [base, setBaseState] = React.useState<BaseData>("freshroots");
  const [uploads, setUploads] = React.useState<Partial<Record<FileKind, UploadedFile>>>({});
  const [audits, setAudits] = React.useState<Partial<Record<BaseData, AuditEntry[]>>>({});
  const [ranAts, setRanAts] = React.useState<Partial<Record<BaseData, string>>>({});
  const [outcomes, setOutcomes] = React.useState<QuarterOutcome[]>([]);
  const [retiredNotes, setRetiredNotes] = React.useState<string[]>([]);
  const [analysis, setAnalysis] = React.useState<AnalysisResult | null>(null);
  const [filesVersion, setFilesVersion] = React.useState(0);
  const [analysisVersion, setAnalysisVersion] = React.useState(0);
  const [detailSku, setDetailSku] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [integrations, setIntegrations] = React.useState<Integrations | null>(null);
  const [highlights, setHighlights] = React.useState<HighlightsState>({ status: "loading", items: [], note: null });
  const [pendingPo, setPendingPo] = React.useState<string[]>([]);
  const firing = React.useRef(false);

  const report = React.useMemo(() => validateAndPrepare(filesFor(base, uploads)), [base, uploads]);
  const coreUploaded = (["sales", "inventory", "skuMaster"] as FileKind[]).every((k) => uploads[k]);
  const isDemo = base !== "freshroots" && !coreUploaded;
  const dataLabel = coreUploaded ? "UPLOADED DATA" : base === "freshroots" ? "FRESHROOTS FILES" : "DEMO DATA";
  const sourceLabel = coreUploaded ? "uploaded SAP and Zoho exports" : base === "freshroots" ? "the Freshroots sample files" : Object.keys(uploads).length ? "uploaded files and demo exports" : "demo SAP and Zoho exports";
  const history = historyFor(base);

  const ownAudit = React.useMemo(() => audits[base] ?? [], [audits, base]);
  const setOwnAudit = React.useCallback((fn: (list: AuditEntry[]) => AuditEntry[]) => setAudits((a) => ({ ...a, [base]: fn(a[base] ?? []) })), [base]);

  const audit = React.useMemo(() => [...history.audit, ...ownAudit].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [history, ownAudit]);
  const notes = React.useMemo(() => rubricNotes(audit, retiredNotes), [audit, retiredNotes]);

  // Load saved state once, then auto-run the analysis so the app works without any upload.
  React.useEffect(() => {
    const saved = load();
    const b = saved?.base ?? "freshroots";
    const ups = saved?.uploads ?? {};
    const retired = saved?.retiredNotes ?? [];
    setBaseState(b);
    setUploads(ups);
    setOutcomes(saved?.outcomes ?? []);
    setRetiredNotes(retired);
    const savedAudits = saved?.audits ?? {};
    const savedRanAt = saved?.ranAt ?? {};
    const rep = validateAndPrepare(filesFor(b, ups));
    let own = savedAudits[b] ?? [];
    const ran = { ...savedRanAt };
    if (rep.dataset) {
      const a = runEngine(rep.dataset, savedRanAt[b] ?? new Date().toISOString(), rubricNotes([...historyFor(b).audit, ...own], retired));
      setAnalysis(a);
      if (!savedRanAt[b]) own = [...own, runEntry(a, b === "freshroots" ? "the Freshroots sample files" : "demo SAP and Zoho exports")];
      ran[b] = a.ranAt;
    }
    setAudits({ ...savedAudits, [b]: own });
    setRanAts(ran);
    setReady(true);
    fetch("/api/status")
      .then((r) => r.json())
      .then(setIntegrations)
      .catch(() => setIntegrations({ gemini: false, zoho: false, email: false, emailTo: null }));
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    const data: Persisted = { base, uploads, ranAt: ranAts, audits, outcomes, retiredNotes };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Large uploads can exceed browser storage. Keep decisions; the files stay for this session only.
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, uploads: {} }));
      } catch {
        /* storage unavailable: state lives for this session */
      }
    }
  }, [ready, base, uploads, ranAts, audits, outcomes, retiredNotes]);

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

  const notify = React.useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3200);
  }, []);

  const append = React.useCallback((...entries: AuditEntry[]) => setOwnAudit((list) => [...list, ...entries]), [setOwnAudit]);

  const current = React.useMemo(() => {
    const m = new Map<string, AuditEntry>();
    if (!analysis) return m;
    for (const e of effectiveDecisions(audit)) if (e.runId === analysis.runId && e.sku) m.set(e.sku, e);
    return m;
  }, [audit, analysis]);

  const statusOf = React.useCallback((sku: string): DecisionStatus => (current.get(sku)?.type as DecisionStatus | undefined) ?? "NEEDS_REVIEW", [current]);
  const decisionFor = React.useCallback((sku: string) => current.get(sku), [current]);

  const killSwitch = React.useMemo<KillSwitchState | null>(() => {
    if (!analysis) return null;
    const check = killSwitchCheck(audit, analysis.runId);
    const events = audit.filter((e) => e.runId === analysis.runId && (e.type === "KILL_SWITCH" || e.type === "KILL_SWITCH_RESUMED"));
    const last = events[0];
    return {
      ...check,
      active: last?.type === "KILL_SWITCH",
      firedAt: events.find((e) => e.type === "KILL_SWITCH")?.timestamp ?? null,
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

  /** The map's last step: approved reorder → threshold check → PO on Zoho (or held). */
  const createPo = React.useCallback(
    async (rec: Recommendation, entry: AuditEntry, halted: boolean) => {
      if (!analysis) return;
      const req = purchaseOrderRequest(rec, entry, analysis.analysisWeek);
      if (!req) return;
      const base = { sku: rec.sku, product: rec.product, finalAction: entry.finalAction, finalQty: entry.finalQty };
      if (halted) {
        append(event("PO_HELD", analysis.runId, "System", "Kill switch active: purchase order held, not sent to Zoho.", base));
        return;
      }
      setPendingPo((p) => [...p, rec.sku]);
      try {
        const res = (await fetch("/api/zoho/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) }).then((r) => r.json())) as PurchaseOrderResult;
        if (res.ok) {
          append(
            event("PO_CREATED", analysis.runId, "System", `${res.mode === "live" ? "Zoho" : "Simulated Zoho"} PO ${res.poNumber} for ${req.quantity.toLocaleString("en-IN")} units.`, {
              ...base,
              reference: res.poNumber,
            }),
          );
        } else append(event("PO_FAILED", analysis.runId, "System", res.error ?? "Zoho rejected the purchase order.", base));
      } catch {
        append(event("PO_FAILED", analysis.runId, "System", "Could not reach the server to create the PO.", base));
      } finally {
        setPendingPo((p) => p.filter((s) => s !== rec.sku));
      }
    },
    [analysis, append],
  );

  // Kill switch: fire once when the run breaches 50% rejections, and again only if more rejections follow a resume.
  React.useEffect(() => {
    if (!ready || !analysis || !killSwitch || !killSwitch.breached || killSwitch.active || firing.current) return;
    const resumed = audit.find((e) => e.runId === analysis.runId && e.type === "KILL_SWITCH_RESUMED");
    if (resumed && Number(resumed.reference ?? 0) >= killSwitch.rejected) return;
    firing.current = true;
    const runId = analysis.runId;
    const held = [...current.values()].filter((e) => isReorder(e) && e.type !== "REJECTED").length;
    append(
      event("KILL_SWITCH", runId, "System", `Kill switch fired: ${killSwitch.rejected} of ${killSwitch.decided} decisions rejected (${((killSwitch.rate ?? 0) * 100).toFixed(1)}% > 50%). Zoho PO creation halted.`, {
        reference: String(killSwitch.rejected),
      }),
    );
    const recentRejections = [...current.values()].filter((e) => e.type === "REJECTED").map((e) => ({ sku: e.sku!, product: e.product ?? "", reason: e.reason }));
    fetch("/api/kill-switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check: killSwitch, weekLabel: analysis.weekLabel, heldPos: held, recentRejections }) })
      .then((r) => r.json())
      .then((res: { ok: boolean; mode: string; to: string | null; subject: string; id?: string; error?: string; reason?: string }) => {
        const msg = res.ok
          ? res.mode === "live"
            ? `Kill-switch email sent to ${res.to}: “${res.subject}”.`
            : `Kill-switch email prepared${res.to ? ` for ${res.to}` : ""} but not sent: ${res.reason}`
          : `Kill-switch email failed${res.to ? ` to ${res.to}` : ""}: ${res.error}`;
        append(event("EMAIL_SENT", runId, "System", msg, { reference: res.mode === "live" ? (res.id ?? "sent") : "preview" }));
        notify(res.ok && res.mode === "live" ? "Kill switch fired. Email sent." : "Kill switch fired. POs are on hold.");
      })
      .catch(() => append(event("EMAIL_SENT", runId, "System", "Kill-switch email failed: server unreachable.", { reference: "failed" })))
      .finally(() => {
        firing.current = false;
      });
  }, [ready, analysis, killSwitch, audit, current, append, notify]);

  const procurement = React.useMemo<ProcurementItem[]>(() => {
    if (!analysis) return [];
    return analysis.recommendations
      .map((rec) => ({ rec, entry: current.get(rec.sku) }))
      .filter((x): x is { rec: Recommendation; entry: AuditEntry } => !!x.entry && (x.entry.type === "APPROVED" || x.entry.type === "EDITED") && PROCUREMENT_ACTIONS.includes(x.entry.finalAction!))
      .map((x) => ({ ...x, po: poFor(x.rec.sku) }))
      .sort((a, b) => a.entry.timestamp.localeCompare(b.entry.timestamp));
  }, [analysis, current, poFor]);

  const runs = React.useMemo<RunSummary[]>(() => {
    const list = [...history.runs];
    if (analysis && !list.some((r) => r.runId === analysis.runId)) {
      const recs = analysis.recommendations;
      list.push({
        runId: analysis.runId,
        weekLabel: analysis.weekLabel,
        generated: recs.length,
        ruleBased: recs.filter((r) => r.decisionMode === "RULE_BASED").length,
        judgement: recs.filter((r) => r.decisionMode === "JUDGEMENT").length,
        stockout: recs.filter((r) => r.risk === "STOCKOUT").length,
        overstock: recs.filter((r) => r.risk === "OVERSTOCK").length,
        highDemand: recs.filter((r) => r.triggered.some((h) => h.code === "HIGH_DEMAND")).length,
      });
    }
    return list;
  }, [analysis, history]);

  const runAnalysis = React.useCallback(() => {
    if (!report.canRun || !report.dataset) return { ok: false, message: "Fix the blocking data errors on the Data page before running the analysis." };
    const a = runEngine(report.dataset, new Date().toISOString(), notes);
    setAnalysis(a);
    setAnalysisVersion(filesVersion);
    setRanAts((r) => ({ ...r, [base]: a.ranAt }));
    append(runEntry(a, sourceLabel));
    return { ok: true, message: `Analysis complete: ${a.recommendations.length} SKUs for ${a.weekLabel}.` };
  }, [report, filesVersion, sourceLabel, notes, append, base]);

  const touchFiles = () => setFilesVersion((v) => v + 1);

  const uploadFile = React.useCallback(async (kind: FileKind, file: File) => {
    const text = await file.text();
    setUploads((u) => ({ ...u, [kind]: { name: file.name, text, uploadedAt: new Date().toISOString() } }));
    touchFiles();
  }, []);

  const removeUpload = React.useCallback((kind: FileKind) => {
    setUploads((u) => {
      const next = { ...u };
      delete next[kind];
      return next;
    });
    touchFiles();
  }, []);

  /** Switching dataset runs it straight away, with that dataset's own decisions and history. */
  const setBase = React.useCallback(
    (b: BaseData) => {
      setBaseState(b);
      const rep = validateAndPrepare(filesFor(b, uploads));
      if (!rep.dataset) {
        setAnalysis(null);
        touchFiles();
        return;
      }
      const own = audits[b] ?? [];
      const a = runEngine(rep.dataset, new Date().toISOString(), rubricNotes([...historyFor(b).audit, ...own], retiredNotes));
      setAnalysis(a);
      setRanAts((r) => ({ ...r, [b]: a.ranAt }));
      setAudits((all) => ({ ...all, [b]: [...(all[b] ?? []), runEntry(a, b === "freshroots" ? "the Freshroots sample files" : b === "messy" ? "demo exports with data issues" : "demo SAP and Zoho exports")] }));
      setFilesVersion(0);
      setAnalysisVersion(0);
    },
    [uploads, audits, retiredNotes],
  );

  const decide = React.useCallback(
    (rec: Recommendation, input: DecisionInput): DecisionResult => {
      if (!analysis) return { ok: false, error: "Run the analysis first." };
      const res = decideRec(rec, analysis.runId, input, REVIEWER, new Date().toISOString());
      if (res.ok) {
        append(res.audit);
        if (res.audit.type !== "REJECTED") void createPo(rec, res.audit, !!killSwitch?.active);
      }
      return res;
    },
    [analysis, append, createPo, killSwitch],
  );

  const approveMany = React.useCallback(
    (recs: Recommendation[]) => {
      if (!analysis) return 0;
      const now = Date.now();
      const ok = recs.map((rec, i) => ({ rec, res: decideRec(rec, analysis.runId, { kind: "APPROVE" }, REVIEWER, new Date(now + i).toISOString()) })).filter((x) => x.res.ok);
      append(...ok.map((x) => (x.res as Extract<DecisionResult, { ok: true }>).audit));
      for (const x of ok) void createPo(x.rec, (x.res as Extract<DecisionResult, { ok: true }>).audit, !!killSwitch?.active);
      return ok.length;
    },
    [analysis, append, createPo, killSwitch],
  );

  const reopen = React.useCallback(
    (rec: Recommendation) => {
      const prev = analysis && current.get(rec.sku);
      if (!analysis || !prev) return;
      append(
        reopenAudit(rec, analysis.runId, REVIEWER, new Date().toISOString(), {
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
      );
    },
    [analysis, current, append],
  );

  const retryPo = React.useCallback(
    (sku: string) => {
      const rec = analysis?.recommendations.find((r) => r.sku === sku);
      const entry = current.get(sku);
      if (rec && entry) void createPo(rec, entry, !!killSwitch?.active);
    },
    [analysis, current, createPo, killSwitch],
  );

  const resumeKillSwitch = React.useCallback(
    (reason: string) => {
      if (!analysis || !killSwitch) return;
      append(event("KILL_SWITCH_RESUMED", analysis.runId, REVIEWER, `PO creation resumed: ${reason}`, { reference: String(killSwitch.rejected) }));
    },
    [analysis, killSwitch, append],
  );

  const retireNote = React.useCallback((id: string) => setRetiredNotes((l) => (l.includes(id) ? l : [...l, id])), []);

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
      append(
        event(
          "EXPORT",
          runId,
          REVIEWER,
          `Exported ${procurement.length} approved order${procurement.length === 1 ? "" : "s"} as CSV (${procurement
            .slice(0, 3)
            .map((p) => `${p.rec.sku} ${shortDistributor(p.rec.leadDistributor)}`)
            .join(", ")}${procurement.length > 3 ? "…" : ""}).`,
        ),
      );
    }
    return { filename: `freshroots-approved-orders-${runId}.csv`, csv, count: procurement.length };
  }, [analysis, procurement, append]);

  const setOutcome = React.useCallback((o: QuarterOutcome) => {
    setOutcomes((list) => [...list.filter((x) => x.quarter !== o.quarter), o]);
  }, []);

  const resetDemo = React.useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setUploads({});
    setOutcomes([]);
    setRetiredNotes([]);
    const rep = validateAndPrepare(filesFor(base, {}));
    const a = rep.dataset ? runEngine(rep.dataset, new Date().toISOString(), rubricNotes(historyFor(base).audit, [])) : null;
    setAnalysis(a);
    setAudits(a ? { [base]: [runEntry(a, base === "freshroots" ? "the Freshroots sample files" : "demo SAP and Zoho exports")] } : {});
    setRanAts(a ? { [base]: a.ranAt } : {});
    setFilesVersion(0);
    setAnalysisVersion(0);
  }, [base]);

  const value: Store = {
    ready,
    user: REVIEWER,
    base,
    uploads,
    isDemo,
    dataLabel,
    report,
    analysis,
    stale: filesVersion !== analysisVersion,
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
    setBase,
    decide,
    approveMany,
    reopen,
    retryPo,
    resumeKillSwitch,
    retireNote,
    exportProcurementCsv,
    setOutcome,
    resetDemo,
    detailSku,
    openDetail: setDetailSku,
    toast,
    notify,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

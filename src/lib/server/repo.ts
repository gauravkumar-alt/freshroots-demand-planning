import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditEntry, QuarterOutcome } from "@/business/types";
import type { FileKind } from "@/business/validationEngine";
import { env } from "./env";

export interface StoredUpload {
  name: string;
  text: string;
  uploadedAt: string;
}

export interface SharedState {
  storage: "supabase" | "memory";
  audit: AuditEntry[];
  uploads: Partial<Record<FileKind, StoredUpload>>;
  retiredNotes: string[];
  outcomes: QuarterOutcome[];
}

/** Persistence for everything people share: the audit log, uploaded files, retired rubric notes and quarter outcomes. */
export interface Repo {
  kind: "supabase" | "memory";
  state(): Promise<SharedState>;
  auditForRun(runId: string): Promise<AuditEntry[]>;
  append(entries: AuditEntry[]): Promise<void>;
  putUpload(kind: FileKind, upload: StoredUpload, user: string): Promise<void>;
  deleteUpload(kind: FileKind): Promise<void>;
  retireNote(noteId: string, user: string): Promise<void>;
  putOutcome(o: QuarterOutcome, user: string): Promise<void>;
}

type Row = {
  id: string;
  created_at: string;
  run_id: string;
  type: AuditEntry["type"];
  user_name: string;
  sku: string | null;
  product: string | null;
  system_action: AuditEntry["systemAction"];
  system_qty: number | null;
  final_action: AuditEntry["finalAction"];
  final_qty: number | null;
  override: boolean;
  reason: string;
  exception_category: AuditEntry["exceptionCategory"];
  risk: AuditEntry["risk"];
  reference: string | null;
};

const toRow = (e: AuditEntry): Row => ({
  id: e.id,
  created_at: e.timestamp,
  run_id: e.runId,
  type: e.type,
  user_name: e.user,
  sku: e.sku,
  product: e.product,
  system_action: e.systemAction,
  system_qty: e.systemQty,
  final_action: e.finalAction,
  final_qty: e.finalQty,
  override: e.override,
  reason: e.reason,
  exception_category: e.exceptionCategory,
  risk: e.risk,
  reference: e.reference ?? null,
});

const fromRow = (r: Row): AuditEntry => ({
  id: r.id,
  timestamp: new Date(r.created_at).toISOString(),
  runId: r.run_id,
  type: r.type,
  user: r.user_name,
  sku: r.sku,
  product: r.product,
  systemAction: r.system_action,
  systemQty: r.system_qty,
  finalAction: r.final_action,
  finalQty: r.final_qty,
  override: r.override,
  reason: r.reason,
  exceptionCategory: r.exception_category,
  risk: r.risk,
  ...(r.reference ? { reference: r.reference } : {}),
});

class SupabaseRepo implements Repo {
  kind = "supabase" as const;
  constructor(private db: SupabaseClient) {}

  private check<T>(res: { data: T | null; error: { message: string } | null }): T {
    if (res.error) throw new Error(`Supabase: ${res.error.message}`);
    return res.data as T;
  }

  async state(): Promise<SharedState> {
    const [audit, uploads, notes, outcomes] = await Promise.all([
      this.db.from("fr_audit_events").select("*").order("created_at", { ascending: false }).limit(5000),
      this.db.from("fr_uploads").select("kind, file_name, content, uploaded_at"),
      this.db.from("fr_retired_notes").select("note_id"),
      this.db.from("fr_quarter_outcomes").select("quarter, stockout_loss_lakh, overstock_loss_lakh"),
    ]);
    return {
      storage: "supabase",
      audit: this.check(audit).map((r) => fromRow(r as Row)),
      uploads: Object.fromEntries(
        this.check(uploads).map((u: { kind: string; file_name: string; content: string; uploaded_at: string }) => [u.kind, { name: u.file_name, text: u.content, uploadedAt: u.uploaded_at }]),
      ),
      retiredNotes: this.check(notes).map((n: { note_id: string }) => n.note_id),
      outcomes: this.check(outcomes).map((o: { quarter: string; stockout_loss_lakh: number; overstock_loss_lakh: number }) => ({
        quarter: o.quarter,
        stockoutLossLakh: Number(o.stockout_loss_lakh),
        overstockLossLakh: Number(o.overstock_loss_lakh),
      })),
    };
  }

  async auditForRun(runId: string) {
    const res = await this.db.from("fr_audit_events").select("*").eq("run_id", runId).order("created_at", { ascending: false });
    return this.check(res).map((r) => fromRow(r as Row));
  }

  async append(entries: AuditEntry[]) {
    if (!entries.length) return;
    this.check(await this.db.from("fr_audit_events").upsert(entries.map(toRow), { onConflict: "id", ignoreDuplicates: true }));
  }

  async putUpload(kind: FileKind, u: StoredUpload, user: string) {
    this.check(await this.db.from("fr_uploads").upsert({ kind, file_name: u.name, content: u.text, uploaded_at: u.uploadedAt, uploaded_by: user }));
  }

  async deleteUpload(kind: FileKind) {
    this.check(await this.db.from("fr_uploads").delete().eq("kind", kind));
  }

  async retireNote(noteId: string, user: string) {
    this.check(await this.db.from("fr_retired_notes").upsert({ note_id: noteId, retired_by: user }));
  }

  async putOutcome(o: QuarterOutcome, user: string) {
    this.check(
      await this.db.from("fr_quarter_outcomes").upsert({ quarter: o.quarter, stockout_loss_lakh: o.stockoutLossLakh, overstock_loss_lakh: o.overstockLossLakh, recorded_by: user, recorded_at: new Date().toISOString() }),
    );
  }
}

/** Used when Supabase is not configured (local development, tests). Lives only as long as the server process. */
export class MemoryRepo implements Repo {
  kind = "memory" as const;
  private audit: AuditEntry[] = [];
  private uploads: Partial<Record<FileKind, StoredUpload>> = {};
  private notes = new Set<string>();
  private outcomes = new Map<string, QuarterOutcome>();

  async state(): Promise<SharedState> {
    return {
      storage: "memory",
      audit: [...this.audit].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      uploads: { ...this.uploads },
      retiredNotes: [...this.notes],
      outcomes: [...this.outcomes.values()],
    };
  }
  async auditForRun(runId: string) {
    return this.audit.filter((e) => e.runId === runId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  async append(entries: AuditEntry[]) {
    const ids = new Set(this.audit.map((e) => e.id));
    this.audit.push(...entries.filter((e) => !ids.has(e.id)));
  }
  async putUpload(kind: FileKind, u: StoredUpload) {
    this.uploads[kind] = u;
  }
  async deleteUpload(kind: FileKind) {
    delete this.uploads[kind];
  }
  async retireNote(noteId: string) {
    this.notes.add(noteId);
  }
  async putOutcome(o: QuarterOutcome) {
    this.outcomes.set(o.quarter, o);
  }
}

const g = globalThis as unknown as { __frRepo?: Repo };

export function repo(): Repo {
  if (!g.__frRepo) {
    const url = env.supabaseUrl(), key = env.supabaseServiceKey();
    g.__frRepo = url && key ? new SupabaseRepo(createClient(url, key, { auth: { persistSession: false } })) : new MemoryRepo();
  }
  return g.__frRepo;
}

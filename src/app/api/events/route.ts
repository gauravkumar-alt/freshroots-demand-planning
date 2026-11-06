import { NextResponse } from "next/server";
import type { AuditEntry } from "@/business/types";
import { currentAnalysis } from "@/lib/server/analysis";
import { buildClientEvents } from "@/lib/server/guards";
import { repo } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/** Runs, exports, reopenings and kill-switch resumes. Decisions, POs and kill-switch firing go through /api/decisions. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { entries?: Partial<AuditEntry>[] } | null;
  const entries = body?.entries ?? [];
  if (!entries.length || entries.length > 20) return NextResponse.json({ error: "Invalid events." }, { status: 400 });
  try {
    const r = repo();
    const current = await currentAnalysis(r);
    if (!current) return NextResponse.json({ error: "The current files have blocking errors." }, { status: 409 });
    const runAudit = await r.auditForRun(current.analysis.runId);
    const built = buildClientEvents(entries, runAudit, current.analysis);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });
    await r.append(built.value);
    return NextResponse.json({ ok: true, entries: built.value });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import type { AuditEntry } from "@/business/types";
import { repo } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

// Decisions, POs and kill-switch firing go through /api/decisions; only these are recorded directly.
const ALLOWED = new Set<AuditEntry["type"]>(["ANALYSIS_RUN", "EXPORT", "REOPENED", "KILL_SWITCH_RESUMED"]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { entries?: AuditEntry[] } | null;
  const entries = body?.entries ?? [];
  if (!entries.length || entries.some((e) => !ALLOWED.has(e.type) || !e.id || !e.runId)) return NextResponse.json({ error: "Invalid events." }, { status: 400 });
  try {
    await repo().append(entries);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

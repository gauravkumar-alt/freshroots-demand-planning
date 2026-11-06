import { NextResponse } from "next/server";
import type { DecisionInput } from "@/business/decisions";
import { currentAnalysis } from "@/lib/server/analysis";
import { liveDeps } from "@/lib/server/deps";
import { resolveDecisionItems } from "@/lib/server/guards";
import { repo } from "@/lib/server/repo";
import { recordDecisions } from "@/lib/server/workflow";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { runId?: string; items?: { rec?: { sku?: string }; sku?: string; input: DecisionInput }[] } | null;
  if (!body?.runId || !body.items?.length || body.items.length > 500) return NextResponse.json({ error: "Invalid decision request." }, { status: 400 });
  try {
    const r = repo();
    const current = await currentAnalysis(r);
    if (!current) return NextResponse.json({ error: "The current files have blocking errors, so there is nothing to decide." }, { status: 409 });
    // The server's own recommendation is used; the browser only says which SKU and what was chosen.
    const items = resolveDecisionItems(current.analysis, body.runId, body.items);
    if (!items.ok) return NextResponse.json({ error: items.error }, { status: items.status });
    const { analysis } = current;
    return NextResponse.json(await recordDecisions(r, { runId: analysis.runId, analysisWeek: analysis.analysisWeek, weekLabel: analysis.weekLabel }, items.value, liveDeps));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

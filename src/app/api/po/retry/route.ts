import { NextResponse } from "next/server";
import { currentAnalysis } from "@/lib/server/analysis";
import { liveDeps } from "@/lib/server/deps";
import { repo } from "@/lib/server/repo";
import { retryPurchaseOrder } from "@/lib/server/workflow";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { runId?: string; rec?: { sku?: string }; sku?: string } | null;
  const sku = body?.rec?.sku ?? body?.sku;
  if (!body?.runId || !sku) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  try {
    const r = repo();
    const current = await currentAnalysis(r);
    if (!current || current.analysis.runId !== body.runId) return NextResponse.json({ ok: false, error: "This week's data changed since the page loaded. Refresh and try again." }, { status: 409 });
    const rec = current.analysis.recommendations.find((x) => x.sku === sku);
    if (!rec) return NextResponse.json({ ok: false, error: `Unknown SKU ${sku}.` }, { status: 400 });
    const { analysis } = current;
    return NextResponse.json(await retryPurchaseOrder(r, { runId: analysis.runId, analysisWeek: analysis.analysisWeek, weekLabel: analysis.weekLabel }, rec, liveDeps));
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

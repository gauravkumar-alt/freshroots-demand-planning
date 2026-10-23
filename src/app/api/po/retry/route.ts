import { NextResponse } from "next/server";
import type { Recommendation } from "@/business/types";
import { liveDeps } from "@/lib/server/deps";
import { repo } from "@/lib/server/repo";
import { retryPurchaseOrder, type RunContext } from "@/lib/server/workflow";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as (RunContext & { rec?: Recommendation }) | null;
  if (!body?.runId || !body.rec) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    return NextResponse.json(await retryPurchaseOrder(repo(), body, body.rec, liveDeps));
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

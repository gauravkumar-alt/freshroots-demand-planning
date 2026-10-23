import { NextResponse } from "next/server";
import { liveDeps } from "@/lib/server/deps";
import { repo } from "@/lib/server/repo";
import { recordDecisions, type DecisionItem, type RunContext } from "@/lib/server/workflow";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as (RunContext & { items?: DecisionItem[] }) | null;
  if (!body?.runId || !body.analysisWeek || !body.items?.length) return NextResponse.json({ error: "Invalid decision request." }, { status: 400 });
  try {
    return NextResponse.json(await recordDecisions(repo(), body, body.items, liveDeps));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

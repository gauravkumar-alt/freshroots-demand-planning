import { NextResponse } from "next/server";
import { REVIEWER } from "@/business/config";
import type { QuarterOutcome } from "@/business/types";
import { repo } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const o = (await req.json().catch(() => null)) as QuarterOutcome | null;
  const valid = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (!o?.quarter || !valid(o.stockoutLossLakh) || !valid(o.overstockLossLakh)) return NextResponse.json({ error: "Enter both losses in ₹ lakh, 0 or more." }, { status: 400 });
  try {
    await repo().putOutcome(o, REVIEWER);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

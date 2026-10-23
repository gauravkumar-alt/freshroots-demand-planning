import { NextResponse } from "next/server";
import { repo } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/** Everything people share: audit log, uploaded files, retired rubric notes, quarter outcomes. */
export async function GET() {
  try {
    return NextResponse.json(await repo().state());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

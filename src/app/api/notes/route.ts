import { NextResponse } from "next/server";
import { REVIEWER } from "@/business/config";
import { repo } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/** Retire a rubric note before it expires. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { noteId?: string } | null;
  if (!body?.noteId) return NextResponse.json({ error: "Missing note." }, { status: 400 });
  try {
    await repo().retireNote(body.noteId, REVIEWER);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

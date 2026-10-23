import { NextResponse } from "next/server";
import { REVIEWER } from "@/business/config";
import { FILE_KINDS, type FileKind } from "@/business/validationEngine";
import { repo } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as { kind?: FileKind; name?: string; text?: string } | null;
  if (!body?.kind || !FILE_KINDS.includes(body.kind) || !body.name || typeof body.text !== "string") return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  if (body.text.length > MAX_BYTES) return NextResponse.json({ error: "File is larger than 8 MB." }, { status: 413 });
  const upload = { name: body.name, text: body.text, uploadedAt: new Date().toISOString() };
  try {
    await repo().putUpload(body.kind, upload, REVIEWER);
    return NextResponse.json({ ok: true, upload });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") as FileKind | null;
  if (!kind || !FILE_KINDS.includes(kind)) return NextResponse.json({ error: "Invalid file kind." }, { status: 400 });
  try {
    await repo().deleteUpload(kind);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

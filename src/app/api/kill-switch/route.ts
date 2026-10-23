import { NextResponse } from "next/server";
import { renderKillSwitchEmail, type KillSwitchEmailInput } from "@/business/killSwitchEmail";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Sends the kill-switch email. Without email credentials it returns the rendered email as a preview. */
export async function POST(req: Request) {
  const input = (await req.json().catch(() => null)) as Omit<KillSwitchEmailInput, "appUrl"> | null;
  if (!input?.check?.breached) return NextResponse.json({ ok: false, error: "Kill switch is not breached." }, { status: 400 });
  const email = renderKillSwitchEmail({ ...input, appUrl: env.appUrl() });
  const to = env.killSwitchEmail();
  if (!env.resendKey() || !to) {
    return NextResponse.json({ ok: true, mode: "preview", to: to || null, subject: email.subject, text: email.text, reason: "Email is not configured (RESEND_API_KEY, KILL_SWITCH_EMAIL)." });
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom(), to: [to], subject: email.subject, html: email.html, text: email.text }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return NextResponse.json({ ok: false, mode: "live", to, subject: email.subject, error: body.message ?? `Resend returned ${res.status}.` });
    return NextResponse.json({ ok: true, mode: "live", to, subject: email.subject, id: body.id });
  } catch {
    return NextResponse.json({ ok: false, mode: "live", to, subject: email.subject, error: "The email service did not respond." });
  }
}

import { NextResponse } from "next/server";
import { buildDigest } from "@/business/digest";
import { auditEvent } from "@/business/events";
import { currentAnalysis } from "@/lib/server/analysis";
import { env } from "@/lib/server/env";
import { repo } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

const MANUAL_COOLDOWN_MS = 10 * 60 * 1000;

async function send(trigger: "schedule" | "manual") {
  const r = repo();
  const current = await currentAnalysis(r);
  if (!current) return NextResponse.json({ ok: false, error: "The current files have blocking errors, so there is no analysis to send." }, { status: 409 });
  const { analysis } = current;

  if (trigger === "manual") {
    const last = current.state.audit.find((e) => e.type === "DIGEST_SENT");
    if (last && Date.now() - Date.parse(last.timestamp) < MANUAL_COOLDOWN_MS) {
      return NextResponse.json({ ok: false, error: "A digest was sent in the last 10 minutes. Try again later." }, { status: 429 });
    }
  }

  const to = env.digestEmail();
  const digest = buildDigest({ analysis, statusOf: current.statusOf, backtest: current.backtest, appUrl: env.appUrl(), placeholderFinancials: current.placeholderFinancials });
  if (!env.resendKey() || !to) return NextResponse.json({ ok: false, error: "Email is not configured (RESEND_API_KEY and DIGEST_EMAIL or KILL_SWITCH_EMAIL)." }, { status: 503 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom(), to: [to], subject: digest.subject, html: digest.html, text: digest.text }),
    cache: "no-store",
  }).catch(() => null);
  const body = res ? ((await res.json().catch(() => ({}))) as { id?: string; message?: string }) : {};
  const ok = !!res?.ok;
  await r.append([
    auditEvent(
      "DIGEST_SENT",
      analysis.runId,
      "System",
      ok
        ? `${trigger === "schedule" ? "Monday" : "Requested"} digest sent to ${to}: “${digest.subject}”.`
        : `${trigger === "schedule" ? "Monday" : "Requested"} digest failed to ${to}: ${body.message ?? "email service did not respond"}.`,
      { reference: ok ? (body.id ?? "sent") : "failed" },
    ),
  ]);
  return NextResponse.json(ok ? { ok: true, to, subject: digest.subject } : { ok: false, error: body.message ?? "The email service did not respond." }, { status: ok ? 200 : 502 });
}

/** Vercel Cron, Mondays 08:00 IST. Vercel sends CRON_SECRET as a bearer token. */
export async function GET(req: Request) {
  const secret = env.cronSecret();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    return await send("schedule");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

/** "Email me this summary" from the app, limited to once every 10 minutes. */
export async function POST() {
  try {
    return await send("manual");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

import "server-only";
import { renderKillSwitchEmail, type KillSwitchEmailInput } from "@/business/killSwitchEmail";
import { env } from "./env";

export interface EmailResult {
  ok: boolean;
  mode: "live" | "preview";
  to: string | null;
  subject: string;
  id?: string;
  error?: string;
}

/** Sends the kill-switch email via Resend; without credentials, reports what would have been sent. */
export async function sendKillSwitchEmail(input: Omit<KillSwitchEmailInput, "appUrl">): Promise<EmailResult> {
  const email = renderKillSwitchEmail({ ...input, appUrl: env.appUrl() });
  const to = env.killSwitchEmail() || null;
  if (!env.resendKey() || !to) return { ok: true, mode: "preview", to, subject: email.subject, error: "Email is not configured (RESEND_API_KEY, KILL_SWITCH_EMAIL)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom(), to: [to], subject: email.subject, html: email.html, text: email.text }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, mode: "live", to, subject: email.subject, error: body.message ?? `Resend returned ${res.status}.` };
    return { ok: true, mode: "live", to, subject: email.subject, id: body.id };
  } catch {
    return { ok: false, mode: "live", to, subject: email.subject, error: "The email service did not respond." };
  }
}

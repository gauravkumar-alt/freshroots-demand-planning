import type { KillSwitchCheck } from "./measurement";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface KillSwitchEmailInput {
  check: KillSwitchCheck;
  weekLabel: string;
  heldPos: number;
  recentRejections: { sku: string; product: string; reason: string }[];
  appUrl: string;
}

export function renderKillSwitchEmail(i: KillSwitchEmailInput): { subject: string; html: string; text: string } {
  const pct = ((i.check.rate ?? 0) * 100).toFixed(1);
  const subject = `Kill switch fired: ${pct}% of ${i.check.runId} recommendations rejected`;
  const rows = i.recentRejections
    .slice(0, 8)
    .map((r) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e1e4df;font:12px Menlo,monospace">${esc(r.sku)}</td><td style="padding:6px 8px;border-bottom:1px solid #e1e4df">${esc(r.product)}</td><td style="padding:6px 8px;border-bottom:1px solid #e1e4df;color:#48514b">${esc(r.reason)}</td></tr>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f3;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#161a1d">
<div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e1e4df;border-radius:6px;overflow:hidden">
  <div style="background:#b3261e;color:#fff;padding:14px 20px;font:700 12px Menlo,monospace;letter-spacing:.12em">FRESHROOTS DEMAND PLANNING · KILL SWITCH</div>
  <div style="padding:20px">
    <h1 style="font-size:22px;margin:0 0 8px">${pct}% of this week's recommendations were rejected</h1>
    <p style="font-size:14px;line-height:1.5;color:#48514b;margin:0 0 12px">${esc(i.weekLabel)}: ${i.check.rejected} of ${i.check.decided} decisions were rejections, above the 50% kill threshold. Purchase-order creation in Zoho is on hold (${i.heldPos} approved order${i.heldPos === 1 ? "" : "s"} waiting).</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">A rejection rate this high means the documented rubric no longer matches how Raghav plans. Review the rejections and the rubric before resuming.</p>
    ${rows ? `<table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>` : ""}
    <p style="margin:20px 0 0"><a href="${esc(i.appUrl)}/audit" style="background:#161a1d;color:#fff;padding:10px 14px;border-radius:5px;text-decoration:none;font-size:13px;font-weight:600">Open the audit log</a></p>
  </div>
</div></body></html>`;
  const text = `${subject}\n\n${i.weekLabel}: ${i.check.rejected} of ${i.check.decided} decisions rejected (threshold 50%). Zoho PO creation is on hold (${i.heldPos} waiting).\n\n${i.recentRejections
    .slice(0, 8)
    .map((r) => `- ${r.sku} ${r.product}: ${r.reason}`)
    .join("\n")}\n\n${i.appUrl}/audit`;
  return { subject, html, text };
}

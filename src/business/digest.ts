// The Monday digest: what the owner and Raghav need to know in one email.

import { formatDate } from "./dates";
import { pct, rupees, units } from "./format";
import { ACTION_LABEL } from "./labels";
import type { Backtest } from "./outcomes";
import type { AnalysisResult, DecisionStatus } from "./types";

export interface DigestInput {
  analysis: AnalysisResult;
  statusOf: (sku: string) => DecisionStatus;
  backtest: Backtest | null;
  appUrl: string;
  placeholderFinancials: boolean;
}

export interface Digest {
  subject: string;
  html: string;
  text: string;
  waiting: number;
  urgent: number;
  marginAtRisk: number;
  cashTiedUp: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const day = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short" });

export function buildDigest(i: DigestInput): Digest {
  const recs = i.analysis.recommendations;
  const waiting = recs.filter((r) => i.statusOf(r.sku) === "NEEDS_REVIEW" && (r.risk !== "NONE" || r.decisionMode === "JUDGEMENT"));
  const urgent = waiting.filter((r) => (r.economics.stockoutGapDays ?? 0) > 0);
  const marginAtRisk = recs.filter((r) => r.economics.valueKind === "MARGIN_AT_RISK").reduce((s, r) => s + (r.economics.valueAtRisk ?? 0), 0);
  const cashTiedUp = recs.filter((r) => r.economics.valueKind === "CASH_TIED_UP").reduce((s, r) => s + (r.economics.valueAtRisk ?? 0), 0);
  const hasMoney = recs.some((r) => r.economics.marginPerUnit !== null);
  const accuracy = i.backtest?.wape == null ? null : Math.max(0, Math.round((1 - i.backtest.wape) * 100));

  const subject = waiting.length
    ? `Freshroots ${i.analysis.runId}: ${waiting.length} decision${waiting.length === 1 ? "" : "s"} waiting${urgent.length ? `, ${urgent.length} urgent` : ""}${hasMoney ? `, ${rupees(marginAtRisk)} margin at risk` : ""}`
    : `Freshroots ${i.analysis.runId}: all clear this week`;

  const top = waiting.slice(0, 6);
  const rows = top
    .map((r) => {
      const e = r.economics;
      const stake = e.valueAtRisk !== null ? `${rupees(e.valueAtRisk)} ${e.valueKind === "MARGIN_AT_RISK" ? "at risk" : "tied up"}` : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e1e4df;vertical-align:top">
          <div style="font-weight:600;font-size:14px">${esc(r.product)}${(e.stockoutGapDays ?? 0) > 0 ? ' <span style="background:#c0262d;color:#fff;font-size:11px;padding:1px 6px;border-radius:3px">URGENT</span>' : ""}</div>
          <div style="color:#48514b;font-size:13px;margin-top:2px">${esc(r.headline)}.</div>
        </td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid #e1e4df;vertical-align:top;text-align:right;white-space:nowrap;font-size:13px">
          <div style="font-weight:600">${esc(ACTION_LABEL[r.action])}${r.suggestedQty ? ` · ${units(r.suggestedQty)}` : ""}</div>
          <div style="color:#c0262d;font-size:12px">${esc(stake)}</div>
        </td></tr>`;
    })
    .join("");

  const tile = (label: string, value: string, sub: string) =>
    `<td style="padding:10px 12px;border:1px solid #e1e4df;width:25%;vertical-align:top"><div style="font:600 10px Menlo,monospace;letter-spacing:.08em;color:#737c76;text-transform:uppercase">${label}</div><div style="font-size:22px;font-weight:700;margin-top:4px">${value}</div><div style="font-size:11px;color:#737c76;margin-top:2px">${sub}</div></td>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f3;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#161a1d">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e1e4df;border-radius:6px;overflow:hidden">
  <div style="background:#1f6b45;color:#fff;padding:14px 20px;font:700 12px Menlo,monospace;letter-spacing:.12em">FRESHROOTS · MONDAY PLANNING DIGEST</div>
  <div style="padding:20px">
    <div style="font-size:13px;color:#737c76">${esc(i.analysis.weekLabel)}${i.analysis.festival.applied ? ` · ${esc(i.analysis.festival.monthName)} festival uplift +25%` : ""}</div>
    <h1 style="font-size:22px;margin:6px 0 16px">${waiting.length ? `${waiting.length} decision${waiting.length === 1 ? "" : "s"} need${waiting.length === 1 ? "s" : ""} you this week` : "All clear this week"}</h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tr>
      ${tile("Margin at risk", hasMoney ? rupees(marginAtRisk) : "—", "below minimum cover")}
      ${tile("Cash tied up", hasMoney ? rupees(cashTiedUp) : "—", "above maximum cover")}
      ${tile("Urgent", String(urgent.length), "run out before delivery")}
      ${tile("Forecast accuracy", accuracy === null ? "—" : `${accuracy}%`, i.backtest?.bias != null ? `ran ${pct(Math.abs(i.backtest.bias), false)} ${i.backtest.bias > 0 ? "high" : "low"}` : "last 8 weeks")}
    </tr></table>
    ${rows ? `<table style="width:100%;border-collapse:collapse">${rows}</table>` : `<p style="font-size:14px;color:#48514b">Every flagged SKU already has a decision.</p>`}
    ${waiting.length > top.length ? `<p style="font-size:13px;color:#737c76">…and ${waiting.length - top.length} more.</p>` : ""}
    <p style="margin:20px 0 0"><a href="${esc(i.appUrl)}/#inbox" style="background:#161a1d;color:#fff;padding:11px 16px;border-radius:5px;text-decoration:none;font-size:14px;font-weight:600">Review decisions</a></p>
    ${i.placeholderFinancials ? `<p style="font-size:11px;color:#946000;margin-top:16px">₹ figures and run-out dates use placeholder cost, price and lead-time values until a real SKU master is uploaded.</p>` : ""}
  </div>
</div></body></html>`;

  const text = [
    subject,
    i.analysis.weekLabel,
    "",
    hasMoney ? `Margin at risk: ${rupees(marginAtRisk)} · Cash tied up: ${rupees(cashTiedUp)}` : "",
    `Urgent (run out before delivery): ${urgent.length}`,
    accuracy === null ? "" : `Forecast accuracy, last 8 weeks: ${accuracy}%`,
    "",
    ...top.map((r) => `- ${r.product}: ${r.headline}. ${ACTION_LABEL[r.action]}${r.suggestedQty ? ` ${units(r.suggestedQty)}` : ""}${r.economics.runOutDate ? ` (runs out ${day(r.economics.runOutDate)})` : ""}`),
    "",
    `${i.appUrl}/#inbox`,
  ]
    .filter((l, idx, arr) => l !== "" || arr[idx - 1] !== "")
    .join("\n");

  return { subject, html, text, waiting: waiting.length, urgent: urgent.length, marginAtRisk, cashTiedUp };
}

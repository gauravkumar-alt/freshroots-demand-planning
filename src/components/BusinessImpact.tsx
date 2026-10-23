"use client";

import * as React from "react";
import { BASELINE, KILL, PILOT_QUARTERS, decisionStats, lossKillStatus, type KillStatus } from "@/business/measurement";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import { Button } from "./ui/button";
import { Card, CardHeader } from "./ui/card";
import { Input, Label } from "./ui/form";
import { Table, Td, Th } from "./ui/table";

const KILL_STYLE: Record<KillStatus, { label: string; cls: string }> = {
  ON_TRACK: { label: "On track", cls: "bg-approved-bg text-approved" },
  AT_RISK: { label: "At risk", cls: "bg-review-bg text-review" },
  TRIGGERED: { label: "Kill criterion met", cls: "bg-rejected text-white" },
  NOT_YET_MEASURABLE: { label: "Not yet measurable", cls: "bg-normal-bg text-normal" },
};

function KillPill({ status }: { status: KillStatus }) {
  const s = KILL_STYLE[status];
  return <span className={cn("rounded-[4px] px-2 py-0.5 text-[11.5px] font-semibold", s.cls)}>{s.label}</span>;
}

const pctText = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

export function BusinessImpact() {
  const store = useStore();
  const pilot = decisionStats(store.audit);
  const thisRun = store.analysis ? decisionStats(store.audit, store.analysis.runId) : null;
  const ks = store.killSwitch;
  const loss = lossKillStatus(store.outcomes);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Baseline */}
        <Card>
          <CardHeader title="The problem being measured" description="Quarterly losses under the monthly, manual process (Freshroots finance baseline)" />
          <div className="grid grid-cols-3 divide-x divide-line">
            {[
              { label: "Stockout losses", v: BASELINE.stockout, tone: "text-stockout" },
              { label: "Overstock losses", v: BASELINE.overstock, tone: "text-overstock" },
              { label: "Total impact", v: BASELINE.total, tone: "text-ink" },
            ].map((b) => (
              <div key={b.label} className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{b.label}</p>
                <p className={cn("mt-1 font-cond text-[26px] font-semibold leading-none tnum", b.tone)}>
                  ₹{b.v.low}–{b.v.high}
                  <span className="ml-1 text-[13px] font-medium text-ink-3">lakh</span>
                </p>
                <p className="mt-1 text-[12px] text-ink-3">per quarter</p>
              </div>
            ))}
          </div>
          <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-2">
            No savings are claimed. Actual losses are compared with this baseline only once finance records them for a completed quarter.
          </p>
        </Card>

        {/* Decision measurement */}
        <Card>
          <CardHeader title="Decision measurement" description="From the audit log. Approval = approved + edited; override = edited + rejected." />
          <div className="grid grid-cols-3 gap-px bg-line">
            {[
              ["Generated", thisRun ? (store.analysis?.recommendations.length ?? 0) : "—", store.runs.reduce((s, r) => s + r.generated, 0)],
              ["Approved", thisRun?.approved ?? "—", pilot.approved],
              ["Edited", thisRun?.edited ?? "—", pilot.edited],
              ["Rejected", thisRun?.rejected ?? "—", pilot.rejected],
              ["Approval rate", pctText(thisRun?.approvalRate ?? null), pctText(pilot.approvalRate)],
              ["Override rate", pctText(thisRun?.overrideRate ?? null), pctText(pilot.overrideRate)],
            ].map(([label, now, total]) => (
              <div key={String(label)} className="bg-surface px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
                <p className="mt-0.5 font-cond text-[20px] font-semibold tnum">{total}</p>
                <p className="text-[11.5px] text-ink-3">this week: {now}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Kill criteria */}
      <Card>
        <CardHeader title="Kill criteria" description="The kill switch watches rejections every week. Losses are measured each quarter once finance records them." />
        <div className="grid gap-px bg-line md:grid-cols-2">
          <div className="bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold">Losses do not decrease within two full quarters</p>
              <KillPill status={loss.status} />
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">
              A quarter counts as a decrease when total stockout + overstock loss is below ₹{BASELINE.total.low} lakh, the bottom of the baseline range. {loss.recorded} of {KILL.quartersToMeasure} quarters recorded.
            </p>
            <OutcomeForm />
          </div>
          <div className="bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold">Kill switch · more than 50% of a week’s recommendations rejected</p>
              <KillPill status={ks?.active ? "TRIGGERED" : (ks?.status ?? "NOT_YET_MEASURABLE")} />
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">
              This week: {ks?.rejected ?? 0} rejected of {ks?.decided ?? 0} decisions (checked once 10 or more exist). When it fires, Zoho PO creation stops and you get an email. Pilot to date: {pctText(pilot.rejectionRate)} rejected.
            </p>
            <RejectionGauge rate={ks?.rate ?? null} />
            <RunTable />
          </div>
        </div>
      </Card>
    </div>
  );
}

function RejectionGauge({ rate }: { rate: number | null }) {
  const v = rate === null ? 0 : Math.min(1, rate);
  return (
    <div className="mt-3">
      <div className="relative h-3 rounded-[3px] bg-line">
        <div className={cn("absolute inset-y-0 left-0 rounded-[3px]", v > KILL.maxRejectionRate ? "bg-rejected" : "bg-ink")} style={{ width: `${v * 100}%` }} />
        <div className="absolute -top-1 bottom-[-4px] w-[2px] bg-rejected" style={{ left: `${KILL.maxRejectionRate * 100}%` }} />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-ink-3 tnum">
        <span className="absolute left-0">0%</span>
        <span className="absolute -translate-x-1/2 font-semibold text-rejected" style={{ left: "50%" }}>
          50% kill switch
        </span>
        <span className="absolute right-0">100%</span>
      </div>
      <p className="mt-1 text-[13px]">
        Current: <span className="font-semibold tnum">{pctText(rate)}</span>
      </p>
    </div>
  );
}

function RunTable() {
  const store = useStore();
  return (
    <div className="mt-4 rounded-md border border-line">
      <Table>
        <thead>
          <tr>
            <Th>Run</Th>
            <Th align="right">Recs</Th>
            <Th align="right">Rule-based</Th>
            <Th align="right">Stockout</Th>
            <Th align="right">Overstock</Th>
            <Th align="right">Decided</Th>
            <Th align="right">Rejected</Th>
          </tr>
        </thead>
        <tbody>
          {[...store.runs].reverse().map((r) => {
            const s = decisionStats(store.audit, r.runId);
            return (
              <tr key={r.runId}>
                <Td className="font-mono text-[12px]">
                  {r.runId}
                  {r.runId === store.analysis?.runId && <span className="ml-1.5 font-sans text-[11px] font-semibold text-review">current</span>}
                </Td>
                <Td align="right">{r.generated}</Td>
                <Td align="right">{Math.round((r.ruleBased / r.generated) * 100)}%</Td>
                <Td align="right">{r.stockout}</Td>
                <Td align="right">{r.overstock}</Td>
                <Td align="right">{s.decided}</Td>
                <Td align="right" className={s.rejectionRate !== null && s.rejectionRate > KILL.maxRejectionRate ? "font-semibold text-rejected" : ""}>
                  {pctText(s.rejectionRate)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

function OutcomeForm() {
  const store = useStore();
  return (
    <div className="mt-3 grid gap-3">
      {PILOT_QUARTERS.map((q) => {
        const o = store.outcomes.find((x) => x.quarter === q.id);
        return <QuarterRow key={q.id} id={q.id} label={q.label} ends={q.ends} stockout={o?.stockoutLossLakh ?? null} overstock={o?.overstockLossLakh ?? null} />;
      })}
    </div>
  );
}

function QuarterRow({ id, label, ends, stockout, overstock }: { id: string; label: string; ends: string; stockout: number | null; overstock: number | null }) {
  const store = useStore();
  const [so, setSo] = React.useState(stockout === null ? "" : String(stockout));
  const [os, setOs] = React.useState(overstock === null ? "" : String(overstock));
  const [err, setErr] = React.useState<string | null>(null);
  const recorded = stockout !== null && overstock !== null;
  const total = recorded ? stockout! + overstock! : null;
  const complete = new Date() > new Date(ends + "T23:59:59+05:30");

  const save = () => {
    const a = Number(so), b = Number(os);
    if (so === "" || os === "" || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return setErr("Enter both losses in ₹ lakh, 0 or more.");
    setErr(null);
    store.setOutcome({ quarter: id, stockoutLossLakh: a, overstockLossLakh: b });
    store.notify(`${label} outcome recorded.`);
  };

  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">{label}</p>
        {recorded ? (
          <span className={cn("text-[12.5px] font-semibold", total! < BASELINE.total.low ? "text-approved" : "text-rejected")}>
            ₹{total!.toFixed(1)} lakh · {total! < BASELINE.total.low ? `₹${(BASELINE.total.low - total!).toFixed(1)}–${(BASELINE.total.high - total!).toFixed(1)} lakh below baseline` : "no decrease vs baseline"}
          </span>
        ) : (
          <span className="text-[12px] text-ink-3">{complete ? "Quarter complete · awaiting finance figures" : `In progress · ends ${new Date(ends).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-so`}>Stockout loss (₹ lakh)</Label>
          <Input id={`${id}-so`} inputMode="decimal" value={so} onChange={(e) => setSo(e.target.value)} className="w-32 tnum" placeholder="e.g. 16.5" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-os`}>Overstock loss (₹ lakh)</Label>
          <Input id={`${id}-os`} inputMode="decimal" value={os} onChange={(e) => setOs(e.target.value)} className="w-32 tnum" placeholder="e.g. 9.0" />
        </div>
        <Button size="md" variant="secondary" onClick={save}>
          Record actuals
        </Button>
      </div>
      {err && <p className="mt-1.5 text-[12px] font-medium text-rejected">{err}</p>}
    </div>
  );
}

/** Monthly + manual vs weekly + automated, with this week's real numbers. */
export function WorkflowCompare() {
  const store = useStore();
  const rows = store.report.summary.salesRows;
  const old = ["Monthly SAP extract", "Excel preparation (2 working days)", "Manual analysis", "Raghav", "Procurement"];
  const now = [
    "Raghav uploads weekly data",
    `Rubric + cleaning (${rows.toLocaleString("en-IN")} rows validated)`,
    "Gemini trends + highlights",
    "Recommended order qty",
    "Raghav approves or rejects",
    "Threshold check",
    "PO on Zoho",
  ];
  return (
    <Card>
      <CardHeader title="Monthly + manual → weekly + automated" description="We are not replacing Raghav. We are removing the repetitive work around him." />
      <div className="grid gap-px bg-line md:grid-cols-2">
        <div className="bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Before · monthly</p>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
            {old.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className="rounded-[4px] border border-line bg-sunken px-2 py-1">{s}</span>
                {i < old.length - 1 && <span className="text-ink-3">→</span>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12.5px] text-stockout">Data reaching procurement is 3–4 weeks old.</p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Now · weekly</p>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
            {now.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={cn("rounded-[4px] border px-2 py-1", s.startsWith("Raghav") ? "border-ink bg-ink text-white" : "border-line bg-sunken text-ink")}>{s}</span>
                {i < now.length - 1 && <span className="text-ink-3">→</span>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12.5px] text-approved">Data is days old, every recommendation carries its reason, and rejections feed back into the rubric.</p>
        </div>
      </div>
    </Card>
  );
}

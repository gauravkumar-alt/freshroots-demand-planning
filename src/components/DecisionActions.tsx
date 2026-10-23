"use client";

import { Check, Pencil, RotateCcw, X } from "lucide-react";
import * as React from "react";
import { ACTION_LABEL } from "@/business/labels";
import type { ActionCode, ExceptionCategory, Recommendation } from "@/business/types";
import { formatTime } from "@/lib/utils";
import { useStore } from "@/state/store";
import { ActionText, PoStatus, StatusBadge } from "./RuleBadge";
import { Button } from "./ui/button";
import { Input, Label, Select, Textarea } from "./ui/form";

const EDIT_ACTIONS: ActionCode[] = ["IMMEDIATE_REORDER", "REORDER_1_5X", "PAUSE_NEXT_ORDER", "NO_ACTION"];
export const CATEGORIES: ExceptionCategory[] = [
  "Unusual distributor behaviour",
  "One-off market event",
  "New product launch",
  "Supply constraint",
  "Data issue",
  "Other judgement",
];

function suggestedCategory(rec: Recommendation): ExceptionCategory | "" {
  const r = rec.judgementReasons.join(" ");
  if (r.includes("distributor")) return "Unusual distributor behaviour";
  if (r.includes("New or recently")) return "New product launch";
  if (r.includes("inventory export") || r.includes("No sales")) return "Data issue";
  return "";
}

/** Approve / Edit / Reject for one recommendation. Every path is recorded in the audit log. */
export function DecisionActions({ rec, onDecided }: { rec: Recommendation; onDecided?: () => void }) {
  const store = useStore();
  const status = store.statusOf(rec.sku);
  const decision = store.decisionFor(rec.sku);
  const [mode, setMode] = React.useState<"idle" | "edit" | "reject">("idle");
  const [action, setAction] = React.useState<ActionCode>(rec.action === "MANUAL_REVIEW" ? "NO_ACTION" : rec.action);
  const [qty, setQty] = React.useState<string>(String(rec.suggestedQty ?? 0));
  const [reason, setReason] = React.useState("");
  const [category, setCategory] = React.useState<ExceptionCategory | "">(suggestedCategory(rec));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setMode("idle");
    setAction(rec.action === "MANUAL_REVIEW" ? "NO_ACTION" : rec.action);
    setQty(String(rec.suggestedQty ?? 0));
    setReason("");
    setCategory(suggestedCategory(rec));
    setError(null);
  }, [rec]);

  const done = (msg: string) => {
    setMode("idle");
    setError(null);
    store.notify(msg);
    onDecided?.();
  };

  const run = async (input: Parameters<typeof store.decide>[1], message: string) => {
    setBusy(true);
    const res = await store.decide(rec, input);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    done(message);
  };
  const approve = () => run({ kind: "APPROVE" }, `${rec.product} approved.`);
  const saveEdit = () => {
    const n = Number(qty.replace(/,/g, ""));
    return run(
      { kind: "EDIT", action, qty: Number.isFinite(n) ? n : -1, reason, category: category || null },
      `${rec.product} edited: ${ACTION_LABEL[action]}${n ? `, ${n.toLocaleString("en-IN")} units` : ""}.`,
    );
  };
  const saveReject = () => run({ kind: "REJECT", reason, category: category || null }, `${rec.product} rejected. Nothing goes to procurement.`);

  if (status !== "NEEDS_REVIEW" && decision) {
    const po = store.poFor(rec.sku);
    return (
      <div className="rounded-md border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-[12.5px] text-ink-2">
            by {decision.user} · {formatTime(decision.timestamp)}
          </span>
          {po.kind === "CREATED" ? (
            <span className="ml-auto text-[12px] text-ink-3">PO raised; change it in Zoho</span>
          ) : (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { const r = await store.reopen(rec); store.notify(r.ok ? `${rec.product} reopened for review.` : r.error); }}>
              <RotateCcw /> Reopen
            </Button>
          )}
        </div>
        {status !== "REJECTED" && decision.finalAction && (
          <p className="mt-2 text-[13px]">
            Sent to procurement: <ActionText action={decision.finalAction} qty={decision.finalQty} />
          </p>
        )}
        {decision.reason && <p className="mt-1 text-[13px] text-ink-2">Reason: {decision.reason}</p>}
        {po.kind !== "NOT_NEEDED" && (
          <p className="mt-2 text-[12.5px]">
            <PoStatus po={po} />
          </p>
        )}
        {status === "REJECTED" && <p className="mt-2 text-[12.5px] text-ink-3">Fed back to the rubric: this SKU goes to your judgement for the next 2 weekly runs.</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="approve" size="lg" onClick={approve} disabled={busy || rec.action === "MANUAL_REVIEW"} title={rec.action === "MANUAL_REVIEW" ? "No system action to approve. Use Edit." : undefined}>
          <Check /> Approve
        </Button>
        <Button variant="edit" size="lg" onClick={() => (setMode(mode === "edit" ? "idle" : "edit"), setError(null))} aria-expanded={mode === "edit"}>
          <Pencil /> {rec.action === "MANUAL_REVIEW" ? "Decide manually" : "Edit"}
        </Button>
        <Button variant="reject" size="lg" onClick={() => (setMode(mode === "reject" ? "idle" : "reject"), setError(null))} aria-expanded={mode === "reject"}>
          <X /> Reject
        </Button>
      </div>
      {rec.action === "MANUAL_REVIEW" && mode === "idle" && (
        <p className="text-[12.5px] text-manual">No confident recommendation for this SKU. Choose an action and quantity with “Decide manually”.</p>
      )}

      {mode !== "idle" && (
        <div className="grid gap-3 rounded-md border border-line bg-surface p-3">
          {mode === "edit" && (
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div className="grid gap-1">
                <Label htmlFor={`act-${rec.sku}`}>Action</Label>
                <Select
                  id={`act-${rec.sku}`}
                  value={action}
                  onChange={(e) => {
                    const a = e.target.value as ActionCode;
                    setAction(a);
                    if (a === "PAUSE_NEXT_ORDER" || a === "NO_ACTION") setQty("0");
                    else if (qty === "0") setQty(String(a === "REORDER_1_5X" ? rec.standardOrderQty * 1.5 : rec.standardOrderQty));
                  }}
                >
                  {EDIT_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {ACTION_LABEL[a]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`qty-${rec.sku}`}>Quantity (units)</Label>
                <Input id={`qty-${rec.sku}`} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="tnum" />
              </div>
            </div>
          )}
          <div className="grid gap-1">
            <Label htmlFor={`why-${rec.sku}`}>Reason {mode === "edit" ? "for the change" : "for rejecting"}</Label>
            <Textarea
              id={`why-${rec.sku}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "edit" ? "e.g. Distributor confirmed temporary demand spike." : "e.g. Plant maintenance next week; order next run instead."}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`cat-${rec.sku}`}>Exception category</Label>
            <Select id={`cat-${rec.sku}`} value={category} onChange={(e) => setCategory(e.target.value as ExceptionCategory)}>
              <option value="">Choose one (feeds the exception library)</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          {error && <p className="text-[12.5px] font-medium text-rejected">{error}</p>}
          <div className="flex gap-2">
            <Button variant={mode === "edit" ? "primary" : "reject"} onClick={mode === "edit" ? saveEdit : saveReject} disabled={busy}>
              {busy ? "Saving…" : mode === "edit" ? "Save edit and raise PO" : "Reject and add to rubric"}
            </Button>
            <Button variant="ghost" onClick={() => (setMode("idle"), setError(null))}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {mode === "idle" && error && <p className="text-[12.5px] font-medium text-rejected">{error}</p>}
    </div>
  );
}

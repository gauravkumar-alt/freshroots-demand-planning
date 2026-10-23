import { ACTION_LABEL, RISK_LABEL, RULE_LABEL, STATUS_LABEL } from "@/business/labels";
import type { ActionCode, DecisionStatus, RiskLevel, RuleCode } from "@/business/types";
import { cn, formatTime } from "@/lib/utils";
import type { PoState } from "@/state/store";

const pill = "inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 py-[2px] text-[11.5px] font-semibold leading-4";

const RISK_STYLE: Record<RiskLevel, string> = {
  STOCKOUT: "bg-stockout-bg text-stockout",
  HIGH_DEMAND: "bg-demand-bg text-demand",
  OVERSTOCK: "bg-overstock-bg text-overstock",
  NONE: "bg-normal-bg text-normal",
  MANUAL_REVIEW: "bg-manual-bg text-manual",
};

const RISK_DOT: Record<RiskLevel, string> = {
  STOCKOUT: "bg-stockout",
  HIGH_DEMAND: "bg-demand",
  OVERSTOCK: "bg-overstock",
  NONE: "bg-normal",
  MANUAL_REVIEW: "bg-manual",
};

export function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  return (
    <span className={cn(pill, RISK_STYLE[risk], className)}>
      <span className={cn("size-1.5 rounded-full", RISK_DOT[risk])} />
      {RISK_LABEL[risk]}
    </span>
  );
}

const RULE_STYLE: Record<RuleCode, string> = {
  HIGH_DEMAND: "border-demand/40 text-demand",
  STOCKOUT: "border-stockout/40 text-stockout",
  OVERSTOCK: "border-overstock/40 text-overstock",
  FESTIVAL_UPLIFT: "border-line-2 text-ink-2",
  PERISHABLE_BELOW: "border-stockout/40 text-stockout",
  PERISHABLE_ABOVE: "border-overstock/40 text-overstock",
  INSUFFICIENT_DATA: "border-manual/40 text-manual",
  ZERO_SALES: "border-manual/40 text-manual",
};

/** A rule that fired for a SKU. Outlined, so it reads as evidence rather than the headline risk. */
export function RuleBadge({ code, className }: { code: RuleCode; className?: string }) {
  return <span className={cn(pill, "border bg-surface", RULE_STYLE[code], className)}>{RULE_LABEL[code]}</span>;
}

const STATUS_STYLE: Record<DecisionStatus, string> = {
  NEEDS_REVIEW: "bg-review-bg text-review",
  APPROVED: "bg-approved-bg text-approved",
  EDITED: "bg-edited-bg text-edited",
  REJECTED: "bg-rejected-bg text-rejected",
};

export function StatusBadge({ status, className }: { status: DecisionStatus; className?: string }) {
  return <span className={cn(pill, STATUS_STYLE[status], className)}>{STATUS_LABEL[status]}</span>;
}

export function ActionText({ action, qty, className }: { action: ActionCode; qty?: number | null; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap font-medium", className)}>
      {ACTION_LABEL[action]}
      {qty ? <span className="tnum text-ink-3"> · {qty.toLocaleString("en-IN")}</span> : null}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: 1 | 2 | 3 | 4 }) {
  const style = ["bg-stockout text-white", "bg-demand text-white", "bg-overstock/85 text-white", "bg-line text-ink-3"][priority - 1];
  return <span className={cn("inline-flex h-5 w-7 items-center justify-center rounded-[3px] font-mono text-[11px] font-semibold", style)}>P{priority}</span>;
}

export function JudgementTag({ className }: { className?: string }) {
  return <span className={cn(pill, "border border-dashed border-manual/50 text-manual", className)}>Needs judgement</span>;
}

export function PoStatus({ po }: { po: PoState }) {
  switch (po.kind) {
    case "CREATED":
      return (
        <span className={cn(pill, "bg-approved-bg text-approved")} title={`Raised ${formatTime(po.at)}`}>
          {po.simulated ? "Simulated Zoho PO" : "Zoho PO"} {po.poNumber}
        </span>
      );
    case "HELD":
      return <span className={cn(pill, "bg-rejected text-white")}>Held by kill switch</span>;
    case "FAILED":
      return (
        <span className={cn(pill, "bg-rejected-bg text-rejected")} title={po.error}>
          PO failed
        </span>
      );
    case "PENDING":
      return <span className={cn(pill, "bg-review-bg text-review")}>Raising PO…</span>;
    default:
      return <span className="text-[12px] text-ink-3">No PO needed</span>;
  }
}

// Business impact and kill-criteria measurement. Reports only what the data supports; no projected savings.

import { effectiveDecisions } from "./decisions";
import { KILL_SWITCH } from "./rulesConfig";
import type { AuditEntry, QuarterOutcome, Recommendation } from "./types";

export const BASELINE = {
  stockout: { low: 18, high: 22 },
  overstock: { low: 10, high: 12 },
  total: { low: 28, high: 34 },
} as const;

export const KILL = {
  maxRejectionRate: KILL_SWITCH.maxRejectionRate,
  quartersToMeasure: 2,
} as const;

/** The two full quarterly cycles of the pilot (Indian financial-year quarters). */
export const PILOT_QUARTERS = [
  { id: "FY27-Q3", label: "Q3 FY27 · Oct–Dec 2026", ends: "2026-12-31" },
  { id: "FY27-Q4", label: "Q4 FY27 · Jan–Mar 2027", ends: "2027-03-31" },
] as const;

/** Per weekly run: what the engine produced. */
export interface RunSummary {
  runId: string;
  weekLabel: string;
  generated: number;
  ruleBased: number;
  judgement: number;
  stockout: number;
  overstock: number;
  highDemand: number;
}

export interface DecisionStats {
  decided: number;
  approved: number;
  edited: number;
  rejected: number;
  /** (approved + edited) ÷ decided: share sent to procurement */
  approvalRate: number | null;
  /** rejected ÷ decided */
  rejectionRate: number | null;
  /** (edited + rejected) ÷ decided: share where Raghav changed the system's call */
  overrideRate: number | null;
}

export function decisionStats(audit: AuditEntry[], runId?: string): DecisionStats {
  const list = effectiveDecisions(audit).filter((e) => !runId || e.runId === runId);
  const approved = list.filter((e) => e.type === "APPROVED").length;
  const edited = list.filter((e) => e.type === "EDITED").length;
  const rejected = list.filter((e) => e.type === "REJECTED").length;
  const decided = list.length;
  const rate = (n: number) => (decided ? n / decided : null);
  return { decided, approved, edited, rejected, approvalRate: rate(approved + edited), rejectionRate: rate(rejected), overrideRate: rate(edited + rejected) };
}

export type KillStatus = "ON_TRACK" | "AT_RISK" | "TRIGGERED" | "NOT_YET_MEASURABLE";

export interface KillSwitchCheck {
  runId: string;
  decided: number;
  rejected: number;
  rate: number | null;
  /** Enough decisions to judge, and more than 50% rejected. */
  breached: boolean;
  status: KillStatus;
}

/** The map's "Breaches threshold?" step, evaluated on one weekly run. */
export function killSwitchCheck(audit: AuditEntry[], runId: string): KillSwitchCheck {
  const s = decisionStats(audit, runId);
  const measurable = s.decided >= KILL_SWITCH.minDecisions;
  const breached = measurable && s.rejectionRate !== null && s.rejectionRate > KILL_SWITCH.maxRejectionRate;
  return {
    runId,
    decided: s.decided,
    rejected: s.rejected,
    rate: s.rejectionRate,
    breached,
    status: !measurable ? "NOT_YET_MEASURABLE" : breached ? "TRIGGERED" : rejectionKillStatus(s.rejectionRate),
  };
}

export function rejectionKillStatus(rate: number | null): KillStatus {
  if (rate === null) return "NOT_YET_MEASURABLE";
  if (rate > KILL.maxRejectionRate) return "TRIGGERED";
  if (rate > KILL.maxRejectionRate * 0.75) return "AT_RISK";
  return "ON_TRACK";
}

/**
 * Loss criterion: each pilot quarter's recorded total loss is compared with the bottom of the ₹28–34 lakh baseline.
 * A decrease means the quarter came in below ₹28 lakh. Without recorded outcomes nothing is claimed.
 */
export function lossKillStatus(outcomes: QuarterOutcome[]): { status: KillStatus; recorded: number; decreased: number } {
  const recorded = PILOT_QUARTERS.map((q) => outcomes.find((o) => o.quarter === q.id)).filter(
    (o): o is QuarterOutcome => !!o && o.stockoutLossLakh !== null && o.overstockLossLakh !== null,
  );
  const decreased = recorded.filter((o) => o.stockoutLossLakh! + o.overstockLossLakh! < BASELINE.total.low).length;
  if (recorded.length === 0) return { status: "NOT_YET_MEASURABLE", recorded: 0, decreased: 0 };
  if (recorded.length < KILL.quartersToMeasure) return { status: decreased ? "ON_TRACK" : "AT_RISK", recorded: recorded.length, decreased };
  return { status: decreased === 0 ? "TRIGGERED" : "ON_TRACK", recorded: recorded.length, decreased };
}


export interface Exposure {
  stockoutSkus: number;
  /** Units needed to bring every at-risk SKU up to the bottom of its target window. */
  unitsShort: number;
  overstockSkus: number;
  /** Units held above the top of each SKU's target window. */
  unitsExcess: number;
  ruleBased: number;
  judgement: number;
}

export function exposure(recs: Recommendation[]): Exposure {
  let unitsShort = 0;
  let unitsExcess = 0;
  for (const r of recs) {
    if (r.currentStock === null || !(r.adjustedDemand > 0)) continue;
    if (r.risk === "STOCKOUT") unitsShort += Math.max(0, r.window.min * r.adjustedDemand - r.currentStock);
    if (r.triggered.some((h) => h.code === "OVERSTOCK" || h.code === "PERISHABLE_ABOVE")) unitsExcess += Math.max(0, r.currentStock - r.window.max * r.adjustedDemand);
  }
  return {
    stockoutSkus: recs.filter((r) => r.risk === "STOCKOUT").length,
    unitsShort: Math.round(unitsShort),
    overstockSkus: recs.filter((r) => r.triggered.some((h) => h.code === "OVERSTOCK" || h.code === "PERISHABLE_ABOVE")).length,
    unitsExcess: Math.round(unitsExcess),
    ruleBased: recs.filter((r) => r.decisionMode === "RULE_BASED").length,
    judgement: recs.filter((r) => r.decisionMode === "JUDGEMENT").length,
  };
}

export interface KillSwitchState {
  check: KillSwitchCheck;
  /** Fired and not resumed: PO creation is halted. */
  active: boolean;
  /** Breached now, and not already handled (fired, or resumed with no new rejections since). */
  shouldFire: boolean;
}

/** Kill-switch state for one run, from that run's audit events. */
export function killSwitchState(runAudit: AuditEntry[], runId: string): KillSwitchState {
  const check = killSwitchCheck(runAudit, runId);
  const events = runAudit
    .filter((e) => e.runId === runId && (e.type === "KILL_SWITCH" || e.type === "KILL_SWITCH_RESUMED"))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const active = events[0]?.type === "KILL_SWITCH";
  const resumed = events.find((e) => e.type === "KILL_SWITCH_RESUMED");
  const shouldFire = check.breached && !active && !(resumed && Number(resumed.reference ?? 0) >= check.rejected);
  return { check, active, shouldFire };
}

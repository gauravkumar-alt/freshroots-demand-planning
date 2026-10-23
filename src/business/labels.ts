import type { ActionCode, DecisionStatus, RiskLevel, RuleCode } from "./types";

export const ACTION_LABEL: Record<ActionCode, string> = {
  IMMEDIATE_REORDER: "Immediate reorder",
  REORDER_1_5X: "Reorder at 1.5× standard",
  PAUSE_NEXT_ORDER: "Pause next order",
  NO_ACTION: "No immediate action",
  MANUAL_REVIEW: "Manual review",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  STOCKOUT: "Stockout risk",
  HIGH_DEMAND: "High demand",
  OVERSTOCK: "Overstock risk",
  NONE: "Normal",
  MANUAL_REVIEW: "Insufficient data",
};

export const RULE_LABEL: Record<RuleCode, string> = {
  HIGH_DEMAND: "High demand",
  STOCKOUT: "Stockout risk",
  OVERSTOCK: "Overstock risk",
  FESTIVAL_UPLIFT: "Festival uplift +25%",
  PERISHABLE_BELOW: "Below 3–4 wk window",
  PERISHABLE_ABOVE: "Above 3–4 wk window",
  INSUFFICIENT_DATA: "Insufficient data",
  ZERO_SALES: "Zero recent sales",
};

export const STATUS_LABEL: Record<DecisionStatus, string> = {
  NEEDS_REVIEW: "Needs review",
  APPROVED: "Approved",
  EDITED: "Edited",
  REJECTED: "Rejected",
};

/** Actions that produce an instruction for procurement once approved. */
export const PROCUREMENT_ACTIONS: ActionCode[] = ["IMMEDIATE_REORDER", "REORDER_1_5X", "PAUSE_NEXT_ORDER"];

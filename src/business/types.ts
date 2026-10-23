// Domain model for the Freshroots demand-planning assistant.
// Everything here is plain data: no React, no browser APIs.

export type Perishability = "High" | "Medium" | "Low";

/** SAP: SKU master */
export interface SkuMasterRow {
  sku: string;
  product: string;
  category: string;
  perishability: Perishability;
  standardOrderQty: number;
  /** Distributor that carries the SKU, when the master names one. */
  distributorId?: string | null;
  /** ₹ per unit. Optional: without cost and price the app shows units only. */
  unitCost?: number | null;
  sellingPrice?: number | null;
  /** Days from placing a purchase order to stock arriving. */
  leadTimeDays?: number | null;
}

/** SAP: weekly distributor-level sales. `week` is the ISO date of the week-ending Sunday. */
export interface SalesRow {
  sku: string;
  product: string;
  distributor: string;
  week: string;
  units: number;
}

/** SAP: inventory snapshot */
export interface InventoryRow {
  sku: string;
  currentStock: number;
}

/** Zoho Inventory: purchase-order context */
export interface PurchaseOrderRow {
  sku: string;
  distributor: string;
  previousOrder: number;
  orderQty: number;
  orderDate: string;
  expectedDelivery: string | null;
}

export interface RawDatasets {
  sales: SalesRow[];
  inventory: InventoryRow[];
  skuMaster: SkuMasterRow[];
  purchaseOrders: PurchaseOrderRow[];
}

/** The single clean weekly dataset produced by data preparation. */
export interface PreparedDataset {
  /** Week-ending date of the latest week in the sales data. Analysis is "as of" this week. */
  analysisWeek: string;
  /** Inventory snapshot date from the export, when the file has one. */
  asOfDate: string | null;
  /** Festival flags by "YYYY-MM" from an uploaded calendar. Null = use the documented October, November, March. */
  festivalCalendar: Record<string, boolean> | null;
  /** All week-ending dates covered, oldest first. */
  weeks: string[];
  skus: PreparedSku[];
  distributors: string[];
}

export interface PreparedSku {
  master: SkuMasterRow;
  /** Total units per week (all distributors), aligned to PreparedDataset.weeks. null = before first sale record. */
  weekly: (number | null)[];
  /** Units per distributor per week, aligned to PreparedDataset.weeks. */
  byDistributor: Record<string, number[]>;
  currentStock: number | null;
  purchaseOrders: PurchaseOrderRow[];
}

export type RiskLevel = "STOCKOUT" | "HIGH_DEMAND" | "OVERSTOCK" | "NONE" | "MANUAL_REVIEW";

export type ActionCode =
  | "IMMEDIATE_REORDER"
  | "REORDER_1_5X"
  | "PAUSE_NEXT_ORDER"
  | "NO_ACTION"
  | "MANUAL_REVIEW";

export type RuleCode =
  | "HIGH_DEMAND"
  | "STOCKOUT"
  | "OVERSTOCK"
  | "FESTIVAL_UPLIFT"
  | "PERISHABLE_BELOW"
  | "PERISHABLE_ABOVE"
  | "INSUFFICIENT_DATA"
  | "ZERO_SALES";

export interface RuleHit {
  code: RuleCode;
  /** Short plain-English reason with the numbers that triggered it. */
  detail: string;
}

export interface InventoryWindow {
  min: number;
  max: number;
  kind: "normal" | "perishable";
}

export interface DistributorShare {
  distributor: string;
  avg4: number;
  avg12: number;
  share4: number;
  share12: number;
}

export interface FestivalInfo {
  applied: boolean;
  factor: number;
  monthName: string;
}

export interface Recommendation {
  id: string;
  sku: string;
  product: string;
  category: string;
  perishability: Perishability;
  standardOrderQty: number;

  leadDistributor: string | null;
  distributorShares: DistributorShare[];
  /** Last up-to-26 weeks of total units, oldest first. */
  trend: { week: string; units: number }[];

  historyWeeks: number;
  avg4: number;
  avg12: number;
  /** (avg4 - avg12) / avg12. null when avg12 is 0. */
  demandChange: number | null;

  baselineDemand: number;
  festival: FestivalInfo;
  adjustedDemand: number;

  currentStock: number | null;
  /** Weeks of stock against festival-adjusted demand. null when demand is 0 or stock is unknown. */
  weeksOfStock: number | null;
  /** Weeks of stock against unadjusted demand, shown for reference. */
  weeksOfStockBaseline: number | null;
  window: InventoryWindow;

  openPoQty: number;
  nextDelivery: string | null;
  lastOrderQty: number | null;
  lastOrderDate: string | null;

  /** Money and dates. Null where the SKU master has no cost, price or lead time. */
  economics: Economics;

  triggered: RuleHit[];
  risk: RiskLevel;
  action: ActionCode;
  suggestedQty: number | null;
  priority: 1 | 2 | 3 | 4;
  priorityScore: number;

  /** RULE_BASED = settled by documented logic. JUDGEMENT = one of the 15–20% that needs Raghav. */
  decisionMode: "RULE_BASED" | "JUDGEMENT";
  judgementReasons: string[];

  headline: string;
  explanation: string[];
}

export interface Economics {
  unitCost: number | null;
  sellingPrice: number | null;
  marginPerUnit: number | null;
  leadTimeDays: number | null;
  /** Stock snapshot date the dates count from. */
  asOfDate: string;
  /** When stock runs out at the festival-adjusted rate. */
  runOutDate: string | null;
  /** When an order placed today would arrive. */
  arrivalIfOrderedToday: string | null;
  /** Days with no stock between running out and that arrival (0 = none). */
  stockoutGapDays: number | null;
  /** Units needed to reach the bottom of the target window (after open POs). */
  shortfallUnits: number;
  /** Units held above the top of the target window. */
  excessUnits: number;
  /** ₹ margin lost if the cover gap is not closed (stockout), or ₹ cash tied up above the window (overstock). */
  valueAtRisk: number | null;
  valueKind: "MARGIN_AT_RISK" | "CASH_TIED_UP" | null;
}

export interface AnalysisResult {
  runId: string;
  analysisWeek: string;
  weekLabel: string;
  ranAt: string;
  festival: FestivalInfo;
  recommendations: Recommendation[];
}

// ---------- Human review ----------

export type DecisionStatus = "NEEDS_REVIEW" | "APPROVED" | "EDITED" | "REJECTED";

export type ExceptionCategory =
  | "New product launch"
  | "Unusual distributor behaviour"
  | "One-off market event"
  | "Data issue"
  | "Supply constraint"
  | "Other judgement";

export interface Decision {
  runId: string;
  sku: string;
  status: Exclude<DecisionStatus, "NEEDS_REVIEW">;
  finalAction: ActionCode;
  finalQty: number | null;
  reason: string;
  exceptionCategory: ExceptionCategory | null;
  user: string;
  timestamp: string;
}

export type AuditEventType =
  | "APPROVED"
  | "EDITED"
  | "REJECTED"
  | "REOPENED"
  | "ANALYSIS_RUN"
  | "EXPORT"
  | "PO_CREATED"
  | "PO_FAILED"
  | "PO_HELD"
  | "KILL_SWITCH"
  | "KILL_SWITCH_RESUMED"
  | "EMAIL_SENT"
  | "DIGEST_SENT";

export interface AuditEntry {
  id: string;
  timestamp: string;
  runId: string;
  type: AuditEventType;
  user: string;
  sku: string | null;
  product: string | null;
  systemAction: ActionCode | null;
  systemQty: number | null;
  finalAction: ActionCode | null;
  finalQty: number | null;
  override: boolean;
  reason: string;
  exceptionCategory: ExceptionCategory | null;
  risk: RiskLevel | null;
  /** PO number, email id, or other external reference. */
  reference?: string;
  /** True for entries that ship with the demo history. */
  demo?: boolean;
}

/** A rejection fed back into the rubric: the SKU goes to Raghav's judgement for the next few runs. */
export interface RubricNote {
  id: string;
  sku: string;
  product: string;
  fromRunId: string;
  /** Last run (inclusive) the note applies to. */
  untilRunId: string;
  reason: string;
  category: ExceptionCategory | null;
  createdAt: string;
  retired: boolean;
}

export interface QuarterOutcome {
  quarter: string;
  stockoutLossLakh: number | null;
  overstockLossLakh: number | null;
}

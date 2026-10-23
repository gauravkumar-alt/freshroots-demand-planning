// Raghav Kulkarni's documented demand-planning rules. Every threshold the engine uses lives here,
// so the Rules page and the engine can never disagree.

export const RULES = {
  shortWindowWeeks: 4,
  longWindowWeeks: 12,
  /** Weeks of history required before the engine will make a confident recommendation. */
  minHistoryWeeks: 12,

  /** Rule 1: 4-week average above 12-week average × 1.20 */
  highDemandRatio: 1.2,
  highDemandOrderMultiplier: 1.5,

  /** Rule 2 / 3: normal SKUs */
  stockoutWeeks: 6,
  overstockWeeks: 14,

  /** Rule 4: October, November, March (1-based months) */
  festivalMonths: [10, 11, 3] as const,
  festivalUplift: 1.25,

  /** Rule 5: high-perishability SKUs */
  perishableMinWeeks: 3,
  perishableMaxWeeks: 4,

  /** Judgement signal: one distributor's share of the SKU's volume moves this much (share points) between the 12-week and 4-week windows. */
  distributorShiftPoints: 0.25,
  /** Judgement signal: an open purchase order arriving within this many days. */
  openPoHorizonDays: 14,

  /** Rubric feedback: a rejected SKU is routed to Raghav's judgement for this many following weekly runs. */
  rubricNoteRuns: 2,
} as const;

/** Kill switch: fires when more than half of a weekly run's decisions are rejections. */
export const KILL_SWITCH = {
  maxRejectionRate: 0.5,
  /** Not evaluated until this many decisions exist in the run, so one early rejection cannot trip it. */
  minDecisions: 10,
} as const;

/** Primary-action priority when several rules fire. Lower number wins. */
export const RISK_PRIORITY = { STOCKOUT: 1, HIGH_DEMAND: 2, OVERSTOCK: 3, NONE: 4 } as const;

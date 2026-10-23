// Decisions Raghav made on the three weekly runs before this one (pilot started Week 39).
// Shipped with the demo so the audit log, exception library and measurement have real history to show.

import { quantityFor } from "@/business/recommendationEngine";
import type { ActionCode, AuditEntry, ExceptionCategory, RiskLevel } from "@/business/types";
import { PROFILES, type Scenario, type SkuProfile } from "./profiles";

export const PILOT_START_RUN = "2026-W39";
export const REVIEWER = "Raghav Kulkarni";

export interface RunSummary {
  runId: string;
  weekLabel: string;
  generated: number;
  ruleBased: number;
  judgement: number;
  stockout: number;
  overstock: number;
  highDemand: number;
  demo?: boolean;
}

interface PriorRun {
  runId: string;
  weekLabel: string;
  reviewDate: string; // Monday after the week, IST
  skus: SkuProfile[];
}

const PRIOR_RUNS: PriorRun[] = [
  { runId: "2026-W39", weekLabel: "Week 39 · 21–27 Sept 2026", reviewDate: "2026-09-28", skus: PROFILES.filter((p) => p.sku !== "FR-1083") },
  { runId: "2026-W40", weekLabel: "Week 40 · 28 Sept–4 Oct 2026", reviewDate: "2026-10-05", skus: PROFILES },
  { runId: "2026-W41", weekLabel: "Week 41 · 5–11 Oct 2026", reviewDate: "2026-10-12", skus: PROFILES },
];

function systemCall(s: Scenario): { risk: RiskLevel; action: ActionCode; highDemand: boolean } {
  switch (s) {
    case "STOCKOUT_HIGH_DEMAND":
      return { risk: "STOCKOUT", action: "IMMEDIATE_REORDER", highDemand: true };
    case "STOCKOUT":
    case "STOCKOUT_PO_COVERED":
    case "PERISHABLE_BELOW":
      return { risk: "STOCKOUT", action: "IMMEDIATE_REORDER", highDemand: false };
    case "HIGH_DEMAND":
    case "DISTRIBUTOR_SHIFT":
    case "CONFLICT":
      return { risk: "HIGH_DEMAND", action: "REORDER_1_5X", highDemand: true };
    case "OVERSTOCK":
    case "OVERSTOCK_FALLING":
    case "PERISHABLE_ABOVE":
      return { risk: "OVERSTOCK", action: "PAUSE_NEXT_ORDER", highDemand: false };
    case "NEW_LAUNCH":
    case "ZERO_SALES":
      return { risk: "MANUAL_REVIEW", action: "MANUAL_REVIEW", highDemand: false };
    default:
      return { risk: "NONE", action: "NO_ACTION", highDemand: false };
  }
}

interface Override {
  run: string;
  sku: string;
  time: string;
  type: "EDITED" | "REJECTED";
  system?: { action: ActionCode; qty: number | null };
  finalAction?: ActionCode;
  finalQty?: number | null;
  reason: string;
  category: ExceptionCategory;
}

const OVERRIDES: Override[] = [
  { run: "2026-W39", sku: "FR-1081", time: "09:52", type: "EDITED", finalAction: "REORDER_1_5X", finalQty: 500, reason: "Launch order to 6 distributors. Half a standard order until sell-out data comes in.", category: "New product launch" },
  { run: "2026-W39", sku: "FR-1019", time: "10:04", type: "EDITED", finalQty: 1200, reason: "Panjim Retail Supply is stocking up for the tourist season opening. Not repeat demand.", category: "Unusual distributor behaviour" },
  { run: "2026-W39", sku: "FR-1052", time: "10:11", type: "REJECTED", system: { action: "REORDER_1_5X", qty: 900 }, reason: "Ganesh Chaturthi demand is over. The spike in the 4-week average will not repeat.", category: "One-off market event" },
  { run: "2026-W39", sku: "FR-1041", time: "10:26", type: "EDITED", finalQty: 2000, reason: "Konkan route reopened after monsoon closures. Distributors are refilling empty shelves.", category: "Supply constraint" },
  { run: "2026-W39", sku: "FR-1009", time: "10:38", type: "REJECTED", reason: "SAP stock includes 3,000 units on quality hold. Usable stock is lower, so keep the order.", category: "Data issue" },
  { run: "2026-W39", sku: "FR-1029", time: "10:47", type: "EDITED", finalQty: 1800, reason: "Margao FMCG Depot bulk order for a hotel-chain contract. One-off.", category: "Unusual distributor behaviour" },
  { run: "2026-W39", sku: "FR-1053", time: "11:02", type: "EDITED", finalAction: "REORDER_1_5X", finalQty: 800, reason: "Diwali corporate gifting pre-orders start this week.", category: "One-off market event" },
  { run: "2026-W39", sku: "FR-1062", time: "11:15", type: "REJECTED", reason: "New DMart Pune listing starts next week. Do not pause.", category: "One-off market event" },
  { run: "2026-W40", sku: "FR-1019", time: "09:44", type: "EDITED", finalQty: 1200, reason: "Panjim Retail Supply again: Goa season stocking, second week running.", category: "Unusual distributor behaviour" },
  { run: "2026-W40", sku: "FR-1083", time: "09:58", type: "EDITED", finalAction: "REORDER_1_5X", finalQty: 2000, reason: "Launch week. Fill the 9 launch distributors.", category: "New product launch" },
  { run: "2026-W40", sku: "FR-1081", time: "10:07", type: "REJECTED", reason: "Trade loading only; sell-out still slow. Hold.", category: "New product launch" },
  { run: "2026-W40", sku: "FR-1045", time: "10:19", type: "EDITED", finalQty: 1000, reason: "Konkan Coast Agencies covering the Ganpatipule temple festival. Temporary.", category: "Unusual distributor behaviour" },
  { run: "2026-W40", sku: "FR-1022", time: "10:33", type: "EDITED", finalQty: 3000, reason: "Rusk line at the Bhosari plant is down next week for maintenance. Build a buffer.", category: "Supply constraint" },
  { run: "2026-W40", sku: "FR-1072", time: "10:51", type: "REJECTED", reason: "SAP stock count includes returned near-expiry dahi awaiting write-off.", category: "Data issue" },
  { run: "2026-W41", sku: "FR-1057", time: "09:48", type: "EDITED", finalQty: 600, reason: "Mapusa Market Agency stocking for a Goa food-festival stall. One-off.", category: "Unusual distributor behaviour" },
  { run: "2026-W41", sku: "FR-1081", time: "10:02", type: "EDITED", finalAction: "REORDER_1_5X", finalQty: 500, reason: "Sell-out picked up in Pune modern trade. Small top-up.", category: "New product launch" },
  { run: "2026-W41", sku: "FR-1083", time: "10:14", type: "EDITED", finalAction: "PAUSE_NEXT_ORDER", finalQty: 0, reason: "Launch stock still sitting with distributors. Wait one more week.", category: "New product launch" },
  { run: "2026-W41", sku: "FR-1031", time: "10:29", type: "REJECTED", reason: "Stock already covers 18 weeks. The rise is one Navratri event order.", category: "One-off market event" },
  { run: "2026-W41", sku: "FR-1001", time: "10:42", type: "EDITED", finalQty: 1000, reason: "Distributor confirmed temporary demand spike.", category: "Unusual distributor behaviour" },
];

const ist = (date: string, time: string) => `${date}T${time}:00+05:30`;

function buildHistory(): { audit: AuditEntry[]; runs: RunSummary[] } {
  const audit: AuditEntry[] = [];
  const runs: RunSummary[] = [];
  for (const run of PRIOR_RUNS) {
    let stockout = 0, overstock = 0, highDemand = 0, judgement = 0;
    audit.push({
      id: `${run.runId}-run`, timestamp: ist(run.reviewDate, "07:30"), runId: run.runId, type: "ANALYSIS_RUN", user: "System", sku: null, product: null,
      systemAction: null, systemQty: null, finalAction: null, finalQty: null, override: false,
      reason: `Weekly analysis: ${run.skus.length} SKUs from SAP and Zoho exports.`, exceptionCategory: null, risk: null, demo: true,
    });
    let minute = 0;
    for (const p of run.skus) {
      const call = systemCall(p.scenario);
      if (call.risk === "STOCKOUT") stockout++;
      if (call.risk === "OVERSTOCK") overstock++;
      if (call.highDemand) highDemand++;
      if (["NEW_LAUNCH", "ZERO_SALES", "DISTRIBUTOR_SHIFT", "CONFLICT", "STOCKOUT_PO_COVERED"].includes(p.scenario)) judgement++;
      const o = OVERRIDES.find((x) => x.run === run.runId && x.sku === p.sku);
      const sysAction = o?.system?.action ?? call.action;
      const sysQty = o?.system ? o.system.qty : quantityFor(sysAction, p.soq, call.highDemand);
      const base = {
        runId: run.runId, user: REVIEWER, sku: p.sku, product: p.product, systemAction: sysAction, systemQty: sysQty, risk: call.risk, demo: true,
      };
      if (o) {
        audit.push({
          ...base, id: `${run.runId}-${p.sku}`, timestamp: ist(run.reviewDate, o.time), type: o.type,
          finalAction: o.type === "REJECTED" ? null : (o.finalAction ?? sysAction), finalQty: o.type === "REJECTED" ? 0 : (o.finalQty ?? sysQty),
          override: true, reason: o.reason, exceptionCategory: o.category,
        });
      } else if (sysAction === "MANUAL_REVIEW") {
        audit.push({
          ...base, id: `${run.runId}-${p.sku}`, timestamp: ist(run.reviewDate, "11:18"), type: "EDITED",
          finalAction: "NO_ACTION", finalQty: 0, override: true,
          reason: p.scenario === "ZERO_SALES" ? "Delisted by two key accounts. No order until the relisting is confirmed." : "Launch SKU, checked sell-out with sales team. No order this week.",
          exceptionCategory: p.scenario === "ZERO_SALES" ? "Other judgement" : "New product launch",
        });
      } else {
        minute += 3;
        const t = 11 * 60 + 20 + minute;
        const time = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        audit.push({
          ...base, id: `${run.runId}-${p.sku}`, timestamp: ist(run.reviewDate, time > "13:59" ? "13:59" : time), type: "APPROVED",
          finalAction: sysAction, finalQty: sysQty, override: false, reason: "", exceptionCategory: null,
        });
      }
    }
    audit.push({
      id: `${run.runId}-export`, timestamp: ist(run.reviewDate, "14:10"), runId: run.runId, type: "EXPORT", user: REVIEWER, sku: null, product: null,
      systemAction: null, systemQty: null, finalAction: null, finalQty: null, override: false,
      reason: "Approved orders exported to procurement as CSV.", exceptionCategory: null, risk: null, demo: true,
    });
    runs.push({ runId: run.runId, weekLabel: run.weekLabel, generated: run.skus.length, ruleBased: run.skus.length - judgement, judgement, stockout, overstock, highDemand, demo: true });
  }
  return { audit, runs };
}

export const demoHistory = buildHistory();

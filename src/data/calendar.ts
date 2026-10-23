import { addDays } from "@/business/dates";

/** The demo's latest complete week (Mon 12 – Sun 18 Oct 2026). SAP and Zoho exports are dated the following Monday. */
export const DEMO_ANALYSIS_WEEK = "2026-10-18";
export const DEMO_EXPORT_DATE = "2026-10-19";
export const DEMO_WEEKS = 26;

export const demoWeeks: string[] = Array.from({ length: DEMO_WEEKS }, (_, i) => addDays(DEMO_ANALYSIS_WEEK, (i - (DEMO_WEEKS - 1)) * 7));

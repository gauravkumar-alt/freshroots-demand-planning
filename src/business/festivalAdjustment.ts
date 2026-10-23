import { monthName, monthOf } from "./dates";
import { RULES } from "./rulesConfig";
import type { FestivalInfo } from "./types";

/** Festival months come from the uploaded calendar when there is one, otherwise October, November and March. */
export function isFestivalMonth(isoDate: string, calendar: Record<string, boolean> | null = null): boolean {
  const key = isoDate.slice(0, 7);
  if (calendar && key in calendar) return calendar[key];
  return (RULES.festivalMonths as readonly number[]).includes(monthOf(isoDate));
}

/** Rule 4. Applied to baseline demand before any stock threshold is checked. */
export function festivalInfo(isoDate: string, calendar: Record<string, boolean> | null = null): FestivalInfo {
  const applied = isFestivalMonth(isoDate, calendar);
  return { applied, factor: applied ? RULES.festivalUplift : 1, monthName: monthName(monthOf(isoDate)) };
}

export function applyFestivalUplift(baselineDemand: number, isoDate: string, calendar: Record<string, boolean> | null = null): number {
  return baselineDemand * festivalInfo(isoDate, calendar).factor;
}

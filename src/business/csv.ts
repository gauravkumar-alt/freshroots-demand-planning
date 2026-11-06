import Papa from "papaparse";

export type CsvRecord = Record<string, string>;

export function parseCsv(text: string): { headers: string[]; rows: CsvRecord[] } {
  const result = Papa.parse<CsvRecord>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transform: (v) => v.trim() });
  return { headers: result.meta.fields ?? [], rows: result.data };
}

/** Text starting with = + - @ (or a tab/CR) would run as a formula in Excel or Sheets; prefix it with an apostrophe. */
export function safeCell(v: string | number | null): string | number {
  if (v === null) return "";
  if (typeof v === "number") return v;
  return /^[=+\-@\t\r]/.test(v) && !/^[-+]?\d+(\.\d+)?%?$/.test(v) ? `'${v}` : v;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return Papa.unparse({ fields: headers.map((h) => String(safeCell(h))), data: rows.map((r) => r.map(safeCell)) });
}

import Papa from "papaparse";

export type CsvRecord = Record<string, string>;

export function parseCsv(text: string): { headers: string[]; rows: CsvRecord[] } {
  const result = Papa.parse<CsvRecord>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transform: (v) => v.trim() });
  return { headers: result.meta.fields ?? [], rows: result.data };
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return Papa.unparse({ fields: headers, data: rows.map((r) => r.map((v) => (v === null ? "" : v))) });
}

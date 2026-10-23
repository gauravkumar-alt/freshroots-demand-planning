// Number formatting shared by the engine's explanations and the UI (Indian digit grouping).

export function units(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

export function weeks(n: number | null): string {
  return n === null ? "—" : n.toFixed(1);
}

export function pct(n: number | null, signed = true): string {
  if (n === null) return "—";
  const v = (n * 100).toFixed(1);
  return signed && n > 0 ? `+${v}%` : `${v}%`;
}

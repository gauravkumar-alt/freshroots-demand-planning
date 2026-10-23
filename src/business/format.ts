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

/** Indian rupees: ₹12,345 below a lakh, then ₹1.2L and ₹1.2Cr. */
export function rupees(n: number | null): string {
  if (n === null) return "—";
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

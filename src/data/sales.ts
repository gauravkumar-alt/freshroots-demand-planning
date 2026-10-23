import type { SalesRow } from "@/business/types";
import { demoWeeks } from "./calendar";
import { DISTRIBUTORS, PROFILES, type SkuProfile } from "./profiles";
import { hashSeed, mulberry32, splitExact } from "./rng";

const N = demoWeeks.length;

/** Total units per week for a profile, oldest first. null = SKU not yet listed. Latest-4 and latest-12 sums are exact. */
export function weeklyTotals(p: SkuProfile): (number | null)[] {
  const rnd = mulberry32(hashSeed(p.sku + ":weeks"));
  const noisy = (base: number, amp = 0.08) => Math.max(0, Math.round(base * (1 + (rnd() * 2 - 1) * amp)));
  const out: (number | null)[] = new Array(N).fill(null);

  if (p.scenario === "NEW_LAUNCH") {
    const h = p.history ?? 4;
    for (let k = 0; k < h; k++) out[N - h + k] = noisy(p.avg12 * (0.55 + (0.45 * (k + 1)) / h), 0.1);
    return out;
  }
  if (p.scenario === "ZERO_SALES") {
    for (let i = 0; i < N - 4; i++) out[i] = noisy(p.avg12 * (i < N - 8 ? 1.4 : 0.6), 0.15);
    for (let i = N - 4; i < N; i++) out[i] = 0;
    return out;
  }

  const sum4 = Math.round(4 * p.avg12 * (1 + p.change));
  const sum12 = 12 * p.avg12;
  const older8 = sum12 - sum4;
  const w4 = Array.from({ length: 4 }, (_, k) => 1 + (rnd() * 2 - 1) * 0.06 + (p.change > 0.15 ? k * 0.03 : 0));
  const w8 = Array.from({ length: 8 }, () => 1 + (rnd() * 2 - 1) * 0.07);
  splitExact(sum4, w4).forEach((v, k) => (out[N - 4 + k] = v));
  splitExact(older8, w8).forEach((v, k) => (out[N - 12 + k] = v));
  // Weeks before the 12-week window: around the 12-week average with a mild monsoon dip (Jul–Aug).
  for (let i = 0; i < N - 12; i++) {
    const monsoon = i >= 9 && i <= 15 ? 0.93 : 1;
    out[i] = noisy(p.avg12 * monsoon);
  }
  return out;
}

function carriers(p: SkuProfile): { idx: number[]; base: number[] } {
  const rnd = mulberry32(hashSeed(p.sku + ":dist"));
  const pool = DISTRIBUTORS.map((_, i) => i).sort(() => rnd() - 0.5);
  let idx = pool.slice(0, p.reach);
  if (p.shiftTo !== undefined && !idx.includes(p.shiftTo)) idx = [p.shiftTo, ...idx.slice(0, p.reach - 1)];
  const base = idx.map((_, k) => (k < 2 ? 2.2 : 1) * (0.6 + rnd() * 0.8));
  if (p.shiftTo !== undefined) {
    const s = idx.indexOf(p.shiftTo);
    const others = base.reduce((sum, w, k) => (k === s ? sum : sum + w), 0);
    base[s] = (0.1 / 0.9) * others;
  }
  return { idx, base };
}

function salesFor(p: SkuProfile): SalesRow[] {
  const totals = weeklyTotals(p);
  const { idx, base } = carriers(p);
  const rnd = mulberry32(hashSeed(p.sku + ":split"));
  const rows: SalesRow[] = [];
  totals.forEach((total, i) => {
    if (total === null || total === 0) return;
    let weights = base.map((w) => w * (1 + (rnd() * 2 - 1) * 0.12));
    if (p.shiftTo !== undefined && i >= N - 4) {
      const s = idx.indexOf(p.shiftTo);
      const others = weights.reduce((sum, w, k) => (k === s ? sum : sum + w), 0);
      weights = weights.map((w, k) => (k === s ? (0.62 / 0.38) * others : w));
    }
    splitExact(total, weights).forEach((units, k) => {
      if (units > 0) rows.push({ sku: p.sku, product: p.product, distributor: DISTRIBUTORS[idx[k]], week: demoWeeks[i], units });
    });
  });
  return rows;
}

/** SAP weekly distributor-level sales, 26 weeks ending 18 Oct 2026. */
export const sales: SalesRow[] = PROFILES.flatMap(salesFor);

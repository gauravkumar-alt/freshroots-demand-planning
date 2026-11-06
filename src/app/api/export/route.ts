import { NextResponse } from "next/server";
import { REVIEWER } from "@/business/config";
import { auditEvent } from "@/business/events";
import { procurementCsv } from "@/business/procurementExport";
import { currentAnalysis } from "@/lib/server/analysis";
import { repo } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/** Approved orders as CSV, from the database at the moment of export, and logged in the audit trail. */
export async function POST() {
  try {
    const r = repo();
    const current = await currentAnalysis(r);
    if (!current) return NextResponse.json({ ok: false, error: "The current files have blocking errors." }, { status: 409 });
    const out = procurementCsv(current.analysis, current.state.audit);
    const entry = auditEvent(
      "EXPORT",
      current.analysis.runId,
      REVIEWER,
      `Exported ${out.count} approved order${out.count === 1 ? "" : "s"} as CSV${out.count ? ` (${out.skus.slice(0, 4).join(", ")}${out.count > 4 ? "…" : ""})` : ""}.`,
    );
    await r.append([entry]);
    return NextResponse.json({ ok: true, ...out, entry });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

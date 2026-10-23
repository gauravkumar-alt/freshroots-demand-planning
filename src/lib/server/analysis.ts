import "server-only";
// Server-side copy of this week's analysis, for jobs that run without a browser (the Monday digest).

import { parseCsv } from "@/business/csv";
import { effectiveDecisions, rubricNotes } from "@/business/decisions";
import { backtest } from "@/business/outcomes";
import { runAnalysis } from "@/business/recommendationEngine";
import type { DecisionStatus } from "@/business/types";
import { validateAndPrepare, type FileKind } from "@/business/validationEngine";
import { freshrootsRawFiles } from "@/data/freshrootsFiles";
import type { Repo } from "./repo";

export async function currentAnalysis(repo: Repo) {
  const state = await repo.state();
  const files = freshrootsRawFiles();
  for (const [kind, up] of Object.entries(state.uploads)) if (up) files[kind as FileKind] = parseCsv(up.text);
  const report = validateAndPrepare(files);
  if (!report.dataset) return null;
  const analysis = runAnalysis(report.dataset, new Date().toISOString(), rubricNotes(state.audit, state.retiredNotes));
  const decided = new Map(effectiveDecisions(state.audit).filter((e) => e.runId === analysis.runId && e.sku).map((e) => [e.sku!, e.type as DecisionStatus]));
  return {
    state,
    analysis,
    backtest: backtest(report.dataset, 8),
    statusOf: (sku: string): DecisionStatus => decided.get(sku) ?? "NEEDS_REVIEW",
    placeholderFinancials: !state.uploads.skuMaster,
  };
}

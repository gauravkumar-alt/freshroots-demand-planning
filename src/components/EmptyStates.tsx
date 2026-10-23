"use client";

import { Database } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";

export function NoAnalysis() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-md border border-line bg-surface p-6 text-center">
      <Database className="mx-auto size-6 text-ink-3" />
      <p className="mt-3 text-[15px] font-semibold">No analysis for the loaded files</p>
      <p className="mt-1 text-[13px] text-ink-3">The current files have blocking errors, so no recommendations were produced. Fix them on the Data page, then run the analysis.</p>
      <Button asChild variant="primary" className="mt-4">
        <Link href="/data">Open data checks</Link>
      </Button>
    </div>
  );
}

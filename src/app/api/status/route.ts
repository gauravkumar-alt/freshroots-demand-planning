import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(integrationStatus());
}

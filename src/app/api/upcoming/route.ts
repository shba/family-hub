import { NextRequest, NextResponse } from "next/server";
import { getUpcoming } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 400) : 60;
  return NextResponse.json(getUpcoming(days));
}

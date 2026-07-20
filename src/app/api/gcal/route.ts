import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleEvents } from "@/lib/gcal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 400) : 90;
  const events = await fetchGoogleEvents(days);
  return NextResponse.json({ connected: !!process.env.GOOGLE_ICS_URL, events });
}

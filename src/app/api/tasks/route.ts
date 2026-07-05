import { NextRequest, NextResponse } from "next/server";
import { createTask } from "@/lib/queries";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const id = createTask({
    person_id: body.person_id ?? null,
    title: String(body.title),
    type: body.type,
    date: body.date,
    time: body.time ?? null,
    status: body.status,
    source: body.source,
  });
  return NextResponse.json({ id });
}

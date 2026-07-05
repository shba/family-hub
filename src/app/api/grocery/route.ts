import { NextRequest, NextResponse } from "next/server";
import { addGrocery } from "@/lib/queries";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const id = addGrocery(String(body.name), body.quantity ?? null, body.source ?? "manual");
  return NextResponse.json({ id });
}

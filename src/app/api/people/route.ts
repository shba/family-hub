import { NextResponse } from "next/server";
import { listPeople } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const people = listPeople().map((p) => ({ id: p.id, name: p.name, emoji: p.emoji }));
  return NextResponse.json({ people });
}

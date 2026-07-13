import { NextRequest, NextResponse } from "next/server";
import { createPlannedItem } from "@/lib/queries";
import type { PlannedItem } from "@/lib/types";

export const runtime = "nodejs";

// Creates the previewed items (already confirmed by the user in the inbox).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const items: PlannedItem[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "no items" }, { status: 400 });
  }

  const counts: Record<string, number> = {};
  for (const item of items) {
    createPlannedItem(item, "confirmed");
    counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  }

  return NextResponse.json({ ok: true, counts });
}

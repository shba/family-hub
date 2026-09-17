import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conversational endpoint used by the WhatsApp gateway: answers questions about
// the family's state and applies requested changes.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = body?.text ? String(body.text).trim() : "";
  if (!text) return NextResponse.json({ error: "provide text" }, { status: 400 });

  try {
    const result = await ask(text, body?.sender ? String(body.sender) : undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[assistant] failed:", err);
    return NextResponse.json({ error: String((err as Error)?.message ?? err) }, { status: 500 });
  }
}

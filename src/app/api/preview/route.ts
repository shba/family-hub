import { NextRequest, NextResponse } from "next/server";
import { extract, toPlannedItems } from "@/lib/gemini";
import { listPeople } from "@/lib/queries";

export const runtime = "nodejs";

// Runs extraction and returns the planned actions WITHOUT saving, so the inbox
// can show the user exactly what will happen before they confirm.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const text: string | undefined = body.text ? String(body.text) : undefined;
  let imageBase64: string | undefined;
  let mime: string | undefined;
  if (body.image) {
    const m = /^data:(.+?);base64,(.*)$/s.exec(String(body.image));
    if (m) {
      mime = m[1];
      imageBase64 = m[2];
    } else {
      imageBase64 = String(body.image);
      mime = body.mime || "image/jpeg";
    }
  }

  if (!text && !imageBase64) {
    return NextResponse.json({ error: "provide text or image" }, { status: 400 });
  }

  const people = listPeople();
  const ex = await extract({ text, imageBase64, mime, peopleNames: people.map((p) => p.name) });
  const items = toPlannedItems(ex);

  return NextResponse.json({ items, used_ai: ex.used_ai });
}

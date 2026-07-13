import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { extract, toPlannedItems } from "@/lib/gemini";
import { dataDir } from "@/lib/store";
import { listPeople, createPlannedItem, addMedia } from "@/lib/queries";

export const runtime = "nodejs";

// Used by the WhatsApp gateway: extracts and saves items as pending for review.
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

  for (const item of items) {
    createPlannedItem(item, "pending");
  }

  if (imageBase64) {
    const uploadsDir = path.join(dataDir, "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = (mime?.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const fname = `${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, fname), Buffer.from(imageBase64, "base64"));
    addMedia(text ? text.slice(0, 80) : items[0]?.title ?? "תמונה", `/api/uploads/${fname}`, null);
  }

  return NextResponse.json({ ok: true, count: items.length });
}

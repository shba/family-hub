import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { extract } from "@/lib/gemini";
import { dataDir } from "@/lib/store";
import {
  listPeople,
  findPersonByName,
  createTask,
  createEvent,
  addGrocery,
  addMeal,
  addMedia,
} from "@/lib/queries";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

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
    return NextResponse.json(
      { error: "provide text or image" },
      { status: 400 }
    );
  }

  const people = listPeople();
  const ex = await extract({
    text,
    imageBase64,
    mime,
    peopleNames: people.map((p) => p.name),
  });

  const person = findPersonByName(ex.person_name);
  const source = imageBase64 ? "photo" : "whatsapp";

  // A timed item becomes a schedule EVENT; otherwise a task. Both land as
  // "pending" so you can confirm them on the dashboard.
  const isEvent = ex.type === "event" && !!ex.time;
  let mainTaskId: number | null = null;

  if (isEvent) {
    createEvent({
      person_id: person?.id ?? null,
      title: ex.title,
      date: ex.date ?? undefined,
      time: ex.time,
      status: "pending",
      source,
    });
  } else {
    mainTaskId = createTask({
      person_id: person?.id ?? null,
      title: ex.title,
      type: ex.type,
      date: ex.date ?? undefined,
      time: ex.time,
      status: "pending",
      source,
    });
  }

  for (const item of ex.bring) {
    createTask({
      person_id: person?.id ?? null,
      title: item,
      type: "bring",
      date: ex.date ?? undefined,
      status: "pending",
      source,
    });
  }

  for (const g of ex.grocery) {
    addGrocery(g, null, "whatsapp");
  }

  if (ex.meal && person) {
    addMeal({
      person_id: person.id,
      slot: ex.meal.slot,
      description: ex.meal.description,
      date: ex.date ?? undefined,
    });
  }

  let filePath: string | null = null;
  if (imageBase64) {
    const uploadsDir = path.join(dataDir, "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = (mime?.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const fname = `${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, fname), Buffer.from(imageBase64, "base64"));
    filePath = `/api/uploads/${fname}`;
    addMedia(text ? text.slice(0, 80) : ex.title, filePath, mainTaskId);
  }

  return NextResponse.json({
    extraction: ex,
    person: person?.name ?? null,
    saved: true,
  });
}

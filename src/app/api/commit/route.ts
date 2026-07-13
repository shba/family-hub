import { NextRequest, NextResponse } from "next/server";
import {
  findPersonByName,
  createEvent,
  createTask,
  addGrocery,
  addMeal,
} from "@/lib/queries";
import type { PlannedItem, MealSlot } from "@/lib/types";

export const runtime = "nodejs";

// Creates the previewed items (already confirmed by the user in the inbox).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const items: PlannedItem[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "no items" }, { status: 400 });
  }

  const counts = { event: 0, task: 0, bring: 0, grocery: 0, meal: 0 };

  for (const item of items) {
    const person = findPersonByName(item.person_name ?? null);
    switch (item.kind) {
      case "event":
        createEvent({
          participants: person ? [person.id] : [],
          title: item.title,
          date: item.date ?? undefined,
          time: item.time ?? null,
          status: "confirmed",
          source: "inbox",
        });
        counts.event++;
        break;
      case "task":
      case "bring":
        createTask({
          person_id: person?.id ?? null,
          title: item.title,
          type: item.kind,
          date: item.date ?? undefined,
          time: item.time ?? null,
          status: "confirmed",
          source: "inbox",
        });
        counts[item.kind]++;
        break;
      case "grocery":
        addGrocery(item.title, item.quantity ?? null, "inbox");
        counts.grocery++;
        break;
      case "meal":
        if (person) {
          addMeal({
            person_id: person.id,
            slot: (item.slot as MealSlot) ?? "lunch",
            description: item.title,
            date: item.date ?? undefined,
          });
          counts.meal++;
        }
        break;
    }
  }

  return NextResponse.json({ ok: true, counts });
}

import {
  getState,
  getUpcoming,
  createPlannedItem,
  findTaskByTitle,
  setTaskDone,
  findGroceryByName,
  deleteGrocery,
} from "./queries";
import { askJson } from "./gemini";
import { hebrewLongDate, HEB_WEEKDAYS } from "./date";
import { eventParticipants } from "./types";
import type { MealSlot } from "./types";

export interface AssistantResult {
  reply: string;
  applied: string[];
}

const OPS = [
  "add_task",
  "complete_task",
  "add_event",
  "add_grocery",
  "remove_grocery",
  "add_meal",
] as const;

type Op = (typeof OPS)[number];

interface Action {
  op: Op;
  title: string;
  person?: string | null;
  date?: string | null;
  time?: string | null;
  quantity?: string | null;
  slot?: string | null;
}

// A compact snapshot of the family's state, small enough to send on every turn.
function buildContext(): string {
  const s = getState();
  const up = getUpcoming(7);
  const byId = new Map(s.people.map((p) => [p.id, p]));
  const who = (id: number | null) => (id == null ? "כל המשפחה" : byId.get(id)?.name ?? "?");
  const list = (rows: string[]) => (rows.length ? rows.join("\n") : "- (ריק)");

  return [
    `היום: ${hebrewLongDate()} (${s.today})`,
    `בני המשפחה: ${s.people.map((p) => p.name).join(", ")}`,
    "",
    "מטלות היום:",
    list(
      s.tasks.map((t) => `- ${t.title} [${who(t.person_id)}]${t.done ? " ✓ בוצע" : ""}`)
    ),
    "",
    "אירועי היום:",
    list(
      s.events.map((e) => {
        const names = eventParticipants(e).map((id) => who(id));
        return `- ${e.time ?? "כל היום"} ${e.title} [${names.join(", ") || "כל המשפחה"}]`;
      })
    ),
    "",
    "תפריט היום:",
    list(s.meals.map((m) => `- ${m.slot} ${who(m.person_id)}: ${m.description}`)),
    "",
    "רשימת קניות:",
    list(
      s.grocery
        .filter((g) => !g.checked)
        .map((g) => `- ${g.name}${g.quantity ? ` (${g.quantity})` : ""}`)
    ),
    "",
    "השבוע הקרוב:",
    list([
      ...up.events.map(
        (e) =>
          `- ${e.date} ${HEB_WEEKDAYS[new Date(e.date).getDay()]} ${e.time ?? ""} ${e.title} [${
            eventParticipants(e).map((id) => who(id)).join(", ") || "כל המשפחה"
          }]`
      ),
      ...up.tasks.map((t) => `- ${t.date} ${t.title} [${who(t.person_id)}]`),
    ]),
    "",
    "פריטים הממתינים לאישור בלוח:",
    list([
      ...s.pendingEvents.map((e) => `- ${e.date} ${e.title}`),
      ...s.pending.map((t) => `- ${t.title}`),
    ]),
  ].join("\n");
}

const SYSTEM = [
  "אתה העוזר המשפחתי של המשפחה, עונה בצ'אט וואטסאפ בעברית.",
  "ענה קצר, ידידותי וללא רשימות ארוכות מדי - זו הודעת וואטסאפ.",
  "",
  "יש לך שני סוגי תפקידים:",
  "1. שאלות (מה יש היום? מה המטלות של מאור? מה בקניות?) - ענה מתוך הנתונים שקיבלת בלבד.",
  "   אם המידע לא קיים בנתונים, אמור זאת במקום לנחש.",
  "2. בקשות לעדכון (תוסיף, תמחק, סיימתי, תרשום) - החזר גם actions מתאימים.",
  "",
  "החזר JSON בלבד במבנה:",
  '{ "reply": "טקסט התשובה בעברית", "actions": [ ... ] }',
  "",
  "סוגי actions אפשריים:",
  '- { "op": "add_task", "title": "...", "person": "שם או null", "date": "YYYY-MM-DD או null", "time": "HH:MM או null" }',
  '- { "op": "complete_task", "title": "שם המטלה לסימון כבוצעה" }',
  '- { "op": "add_event", "title": "...", "person": "שם או null", "date": "YYYY-MM-DD", "time": "HH:MM או null" }',
  '- { "op": "add_grocery", "title": "...", "quantity": "כמות או null" }',
  '- { "op": "remove_grocery", "title": "..." }',
  '- { "op": "add_meal", "title": "תיאור האוכל", "person": "שם או null", "slot": "breakfast|lunch|dinner", "date": "YYYY-MM-DD או null" }',
  "",
  'לשאלה רגילה החזר "actions": [].',
  "person חייב להיות אחד מבני המשפחה שקיבלת, אחרת null.",
  "פענח תאריכים יחסיים (מחר, יום שני הבא) לפי התאריך של היום שקיבלת.",
  "ב-reply אשר בדיוק מה עשית, כדי שהמשתמש ידע שהעדכון נכנס.",
].join("\n");

function validateActions(raw: unknown): Action[] {
  if (!Array.isArray(raw)) return [];
  const out: Action[] = [];
  for (const entry of raw.slice(0, 20)) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const op = String(r.op ?? "");
    const title = String(r.title ?? "").trim().slice(0, 200);
    if (!(OPS as readonly string[]).includes(op) || !title) continue;
    out.push({
      op: op as Op,
      title,
      person: r.person ? String(r.person) : null,
      date: r.date ? String(r.date) : null,
      time: r.time ? String(r.time) : null,
      quantity: r.quantity ? String(r.quantity) : null,
      slot: r.slot ? String(r.slot) : null,
    });
  }
  return out;
}

// Chat-driven changes are applied straight away (confirmed): the user asked for
// them explicitly, so there's nothing for them to re-approve on the dashboard.
function applyActions(actions: Action[]): string[] {
  const applied: string[] = [];

  for (const a of actions) {
    switch (a.op) {
      case "add_task":
      case "add_event":
      case "add_grocery":
      case "add_meal": {
        const kind = a.op === "add_task" ? "task" : a.op === "add_event" ? "event" : a.op === "add_grocery" ? "grocery" : "meal";
        createPlannedItem(
          {
            kind: kind as "task" | "event" | "grocery" | "meal",
            title: a.title,
            person_name: a.person ?? null,
            date: a.date ?? null,
            time: a.time ?? null,
            quantity: a.quantity ?? null,
            slot: (a.slot as MealSlot) ?? null,
          },
          "confirmed",
          "chat"
        );
        applied.push(`${a.op}: ${a.title}`);
        break;
      }
      case "complete_task": {
        const t = findTaskByTitle(a.title);
        if (t) {
          setTaskDone(t.id, true);
          applied.push(`complete_task: ${t.title}`);
        }
        break;
      }
      case "remove_grocery": {
        const g = findGroceryByName(a.title);
        if (g) {
          deleteGrocery(g.id);
          applied.push(`remove_grocery: ${g.name}`);
        }
        break;
      }
    }
  }

  return applied;
}

export async function ask(text: string, sender?: string): Promise<AssistantResult> {
  const user = [
    buildContext(),
    "",
    `הודעה מ${sender ? `-${sender}` : "המשתמש"}: "${text}"`,
  ].join("\n");

  const parsed = await askJson(SYSTEM, user);
  const actions = validateActions(parsed.actions);
  const applied = applyActions(actions);

  let reply = String(parsed.reply ?? "").trim();
  if (!reply) reply = applied.length ? "עדכנתי ✅" : "לא הבנתי, אפשר לנסח מחדש?";

  // Be explicit when the model promised a change we couldn't carry out.
  if (actions.length > applied.length) {
    reply += "\n(חלק מהפריטים לא נמצאו ולא עודכנו)";
  }

  return { reply: reply.slice(0, 1500), applied };
}

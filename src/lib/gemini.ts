import { todayStr, addDays } from "./date";
import type { EventDraft, PlannedItem, MealSlot } from "./types";

const REQUEST_TIMEOUT_MS = 35000;

async function postWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type ExtractType = "chore" | "bring" | "task" | "event";

export interface Extraction {
  person_name: string | null;
  type: ExtractType;
  title: string;
  date: string | null; // YYYY-MM-DD
  time: string | null;
  bring: string[];
  grocery: string[];
  meal: { slot: "breakfast" | "lunch" | "dinner"; description: string } | null;
  events: EventDraft[]; // multiple timed items (e.g. a games/fixture schedule)
  confidence: number;
  used_ai: boolean;
}

interface ExtractInput {
  text?: string;
  imageBase64?: string;
  mime?: string;
  peopleNames: string[];
}

const EMPTY: Omit<Extraction, "title" | "used_ai"> = {
  person_name: null,
  type: "task",
  date: null,
  time: null,
  bring: [],
  grocery: [],
  meal: null,
  events: [],
  confidence: 0,
};

export async function extract(input: ExtractInput): Promise<Extraction> {
  const gKey = process.env.GEMINI_API_KEY?.trim();
  const llmKey = process.env.LLM_API_KEY?.trim();
  const llmBase = process.env.LLM_BASE_URL?.trim();

  const tryGemini = () => (gKey ? extractWithGemini(input, gKey) : null);
  const tryLLM = () =>
    llmKey && llmBase
      ? extractWithOpenAI(input, {
          key: llmKey,
          baseUrl: llmBase,
          model: process.env.LLM_MODEL?.trim() || "google/gemma-3n-e4b-it",
        })
      : null;

  // Prefer Gemini (stronger at vision + long structured lists like fixtures);
  // fall back to the OpenAI-compatible model (NVIDIA Gemma) on failure.
  const order = [tryGemini, tryLLM];
  for (const provider of order) {
    try {
      const result = await provider();
      if (result) return result;
    } catch (err) {
      console.error("[extract] provider failed, trying next:", err);
    }
  }

  return heuristicExtract(input);
}

async function extractWithOpenAI(
  input: ExtractInput,
  cfg: { key: string; baseUrl: string; model: string }
): Promise<Extraction> {
  const today = todayStr();
  const prompt = buildPrompt(input.text ?? "", input.peopleNames, today, !!input.imageBase64);

  const userContent: unknown = input.imageBase64
    ? [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: `data:${input.mime || "image/jpeg"};base64,${input.imageBase64}` },
        },
      ]
    : prompt;

  const body = {
    model: cfg.model,
    messages: [
      {
        role: "system",
        content:
          "You extract structured data. Respond with ONLY valid minified JSON - no markdown fences, no explanations.",
      },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 4096,
  };

  const res = await postWithTimeout(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty LLM response");

  return normalize(parseJsonLoose(raw), true);
}

function parseJsonLoose(raw: string): Partial<Extraction> {
  try {
    return JSON.parse(raw) as Partial<Extraction>;
  } catch {
    /* try to salvage a JSON object from surrounding text/markdown */
  }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    return JSON.parse(match[0]) as Partial<Extraction>;
  }
  throw new Error("Could not parse JSON from model output");
}

async function extractWithGemini(input: ExtractInput, key: string): Promise<Extraction> {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const today = todayStr();
  const prompt = buildPrompt(input.text ?? "", input.peopleNames, today, !!input.imageBase64);

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  if (input.imageBase64) {
    parts.push({
      inline_data: { mime_type: input.mime || "image/jpeg", data: input.imageBase64 },
    });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  };

  const res = await postWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Empty Gemini response");

  return normalize(parseJsonLoose(raw), true);
}

function buildPrompt(text: string, names: string[], today: string, hasImage: boolean): string {
  return [
    "אתה עוזר משפחתי שמחלץ משימות מהודעות וואטסאפ או מתמונות (למשל בקשות ממורים).",
    hasImage
      ? "נתחת גם את התמונה המצורפת (טקסט/הודעה שצולמה)."
      : "",
    `התאריך היום הוא ${today}. אם ההודעה מזכירה "מחר" חשב את התאריך בהתאם (פורמט YYYY-MM-DD).`,
    `בני המשפחה האפשריים: ${names.join(", ")}. אם ניתן, שייך את המשימה לאדם המתאים לפי השם או ההקשר (למשל "מאיה", "כיתת מאיה").`,
    "החזר JSON תקין בלבד, במבנה הבא:",
    `{
  "person_name": string|null,
  "type": "chore"|"bring"|"task"|"event",
  "title": string,
  "date": string|null,
  "time": string|null,
  "bring": string[],
  "grocery": string[],
  "meal": {"slot":"breakfast"|"lunch"|"dinner","description":string}|null,
  "events": [{"title": string, "date": string|null, "time": string|null, "person_name": string|null}],
  "confidence": number
}`,
    'הנחיות: "bring" = פריטים שצריך להביא לבית הספר. "grocery" = פריטים לקנייה בסופר. אם זו בקשה כללית השתמש ב-type="task". שמור על הכיתוב בעברית.',
    'אם מבקשים להוסיף לוח זמנים / רשימת אירועים או משחקים (למשל "כל משחקי המונדיאל"), החזר כל פריט בנפרד בתוך "events" עם תאריך (YYYY-MM-DD) ושעה. חובה לפרק לרשימה - אסור להחזיר אירוע סיכום יחיד כמו "כל המשחקים". אם אינך יודע את התאריכים המדויקים, החזר בכל זאת כל משחק בנפרד עם ההערכה הטובה ביותר (יריבים + תאריך + שעה). החזר עד 60 אירועים לכל היותר.',
    text ? `ההודעה: """${text}"""` : "אין טקסט - נתח מהתמונה.",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalize(p: Partial<Extraction>, usedAi: boolean): Extraction {
  return {
    person_name: p.person_name ?? null,
    type: (p.type as ExtractType) ?? "task",
    title: (p.title ?? "").toString().slice(0, 200) || "משימה חדשה",
    date: p.date ?? null,
    time: p.time ?? null,
    bring: Array.isArray(p.bring) ? p.bring.map(String) : [],
    grocery: Array.isArray(p.grocery) ? p.grocery.map(String) : [],
    meal: p.meal && p.meal.slot ? { slot: p.meal.slot, description: String(p.meal.description ?? "") } : null,
    events: Array.isArray(p.events)
      ? p.events
          .filter((e) => e && (e.title || e.date || e.time))
          .slice(0, 60)
          .map((e) => ({
            title: String(e.title ?? "").slice(0, 200) || "אירוע",
            date: e.date ?? null,
            time: e.time ?? null,
            person_name: e.person_name ?? null,
          }))
      : [],
    confidence: typeof p.confidence === "number" ? p.confidence : usedAi ? 0.7 : 0.3,
    used_ai: usedAi,
  };
}

// Flattens an extraction into the concrete actions to preview/create.
export function toPlannedItems(ex: Extraction): PlannedItem[] {
  const items: PlannedItem[] = [];

  for (const e of ex.events) {
    items.push({
      kind: "event",
      title: e.title,
      person_name: e.person_name,
      date: e.date,
      time: e.time,
    });
  }

  // Only treat the single main item as its own action when there isn't a
  // dedicated events[] list (otherwise it's just a wrapper for the list).
  if (ex.events.length === 0 && ex.title) {
    items.push({
      kind: ex.type === "event" ? "event" : ex.type === "bring" ? "bring" : "task",
      title: ex.title,
      person_name: ex.person_name,
      date: ex.date,
      time: ex.time,
    });
  }

  for (const b of ex.bring) {
    items.push({ kind: "bring", title: b, person_name: ex.person_name, date: ex.date, time: null });
  }
  for (const g of ex.grocery) {
    items.push({ kind: "grocery", title: g, person_name: null, date: null, time: null });
  }
  if (ex.meal) {
    items.push({
      kind: "meal",
      title: ex.meal.description,
      person_name: ex.person_name,
      date: ex.date,
      time: null,
      slot: ex.meal.slot as MealSlot,
    });
  }

  return items;
}

// Very small offline parser so the demo works with no API key.
function heuristicExtract(input: ExtractInput): Extraction {
  const text = (input.text ?? "").trim();
  const lower = text.toLowerCase();

  let date: string | null = null;
  if (/(מחר|tomorrow)/.test(lower)) date = todayStr(addDays(new Date(), 1));
  else if (/(היום|today)/.test(lower)) date = todayStr();

  const person = input.peopleNames.find((n) => text.includes(n)) ?? null;

  const bring: string[] = [];
  const bringMatch = text.match(/להביא(.+?)(?:\.|$)/);
  if (bringMatch) {
    bring.push(...bringMatch[1].split(/,|ו-|ו |and/).map((s) => s.trim()).filter(Boolean));
  }

  const grocery: string[] = [];
  if (/(לקנות|סופר|נגמר|out of|buy|grocery)/.test(lower)) {
    const gm = text.match(/(?:לקנות|נגמר לנו)(.+?)(?:\.|$)/);
    if (gm) grocery.push(...gm[1].split(/,|ו-|ו /).map((s) => s.trim()).filter(Boolean));
  }

  const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const time = timeMatch ? timeMatch[0] : null;

  const type: ExtractType = bring.length ? "bring" : time ? "event" : "task";
  const title =
    text.length > 0
      ? text.replace(/\s+/g, " ").slice(0, 120)
      : input.imageBase64
      ? "משימה מתמונה (יש לבדוק ידנית)"
      : "משימה חדשה";

  return {
    ...EMPTY,
    person_name: person,
    type,
    title,
    date,
    time,
    bring,
    grocery,
    confidence: 0.3,
    used_ai: false,
  };
}

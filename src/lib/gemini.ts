import { todayStr, addDays } from "./date";

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
  confidence: 0,
};

export async function extract(input: ExtractInput): Promise<Extraction> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (key) {
    try {
      return await extractWithGemini(input, key);
    } catch (err) {
      console.error("[gemini] extraction failed, using fallback:", err);
    }
  }
  return heuristicExtract(input);
}

async function extractWithGemini(input: ExtractInput, key: string): Promise<Extraction> {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
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
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  };

  const res = await fetch(url, {
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

  const parsed = JSON.parse(raw) as Partial<Extraction>;
  return normalize(parsed, true);
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
  "confidence": number
}`,
    'הנחיות: "bring" = פריטים שצריך להביא לבית הספר. "grocery" = פריטים לקנייה בסופר. אם זו בקשה כללית השתמש ב-type="task". שמור על הכיתוב בעברית.',
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
    confidence: typeof p.confidence === "number" ? p.confidence : usedAi ? 0.7 : 0.3,
    used_ai: usedAi,
  };
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

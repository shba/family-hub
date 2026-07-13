import { todayStr, addDays } from "./date";
import type { PlannedItem, MealSlot } from "./types";

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

export interface Extraction {
  items: PlannedItem[];
  confidence: number;
  used_ai: boolean;
}

interface ExtractInput {
  text?: string;
  imageBase64?: string;
  mime?: string;
  peopleNames: string[];
}

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

  // Prefer Gemini (stronger at vision + structured lists); fall back to the
  // OpenAI-compatible model (NVIDIA Gemma), then an offline heuristic.
  for (const provider of [tryGemini, tryLLM]) {
    try {
      const result = await provider();
      if (result) return result;
    } catch (err) {
      console.error("[extract] provider failed, trying next:", err);
    }
  }
  return heuristicExtract(input);
}

function buildPrompt(text: string, names: string[], today: string, hasImage: boolean): string {
  return [
    "אתה עוזר משפחתי שממיר הודעות/תמונות (למשל לוח מטלות או תפריט שבועי) לרשימת פריטים מובנית.",
    hasImage ? "נתח היטב את התמונה המצורפת, כולל כותרות עמודות/מקטעים." : "",
    `התאריך היום הוא ${today}. "מחר" = היום+1 (פורמט YYYY-MM-DD).`,
    `בני המשפחה: ${names.join(", ")}. שייך כל פריט לאדם לפי שם או לפי כותרת המקטע/עמודה (למשל מטלה תחת "מאור" -> person_name="מאור"; תחת "כולם" -> person_name=null).`,
    "מיפוי ימים לעמודות: יום א'=0, יום ב'=1, יום ג'=2, יום ד'=3, יום ה'=4, יום ו'=5, שבת=6.",
    "החזר JSON תקין בלבד במבנה:",
    `{
  "items": [
    { "kind": "task"|"event"|"bring"|"grocery"|"meal",
      "title": string,
      "person_name": string|null,
      "date": string|null,
      "weekday": number|null,
      "time": string|null,
      "slot": "breakfast"|"lunch"|"dinner"|null }
  ],
  "confidence": number
}`,
    "כללי סיווג:",
    '- "task" = מטלה/משימה, כולל מטלות בית (קיפול, סידור, פינוי/מילוי מדיח, שאיבה, האכלה וכו").',
    '- "event" = דבר עם שעה או תאריך ספציפי (פגישה, חוג, משחק).',
    '- "meal" = פריט מתוך תפריט/ארוחות. חובה למלא "slot" (בוקר=breakfast, צהריים=lunch, ערב=dinner) ו-"weekday" לפי עמודת היום. תפריט משפחתי כללי -> person_name=null.',
    '- "bring" = מה להביא. "grocery" = קניות.',
    "פרק כל תא/שורה לפריט נפרד. אל תאחד רשימה לפריט סיכום יחיד. החזר עד 80 פריטים.",
    text ? `הטקסט: """${text}"""` : "אין טקסט - נתח מהתמונה.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function extractWithGemini(input: ExtractInput, key: string): Promise<Extraction> {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const prompt = buildPrompt(input.text ?? "", input.peopleNames, todayStr(), !!input.imageBase64);

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  if (input.imageBase64) {
    parts.push({ inline_data: { mime_type: input.mime || "image/jpeg", data: input.imageBase64 } });
  }

  const res = await postWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Empty Gemini response");
  return normalize(parseJsonLoose(raw), true);
}

async function extractWithOpenAI(
  input: ExtractInput,
  cfg: { key: string; baseUrl: string; model: string }
): Promise<Extraction> {
  const prompt = buildPrompt(input.text ?? "", input.peopleNames, todayStr(), !!input.imageBase64);
  const userContent: unknown = input.imageBase64
    ? [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: `data:${input.mime || "image/jpeg"};base64,${input.imageBase64}` },
        },
      ]
    : prompt;

  const res = await postWithTimeout(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: "system",
          content:
            "You extract structured data. Respond with ONLY valid minified JSON - no markdown, no prose.",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty LLM response");
  return normalize(parseJsonLoose(raw), true);
}

function parseJsonLoose(raw: string): { items?: unknown[]; confidence?: number } {
  try {
    return JSON.parse(raw);
  } catch {
    /* try to salvage */
  }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error("Could not parse JSON from model output");
}

const KINDS = ["event", "task", "bring", "grocery", "meal"] as const;

function validateItem(raw: unknown): PlannedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = String(r.title ?? "").trim().slice(0, 200);
  if (!title) return null;
  const kind = (KINDS as readonly string[]).includes(String(r.kind))
    ? (r.kind as PlannedItem["kind"])
    : "task";
  const slot =
    r.slot === "breakfast" || r.slot === "lunch" || r.slot === "dinner"
      ? (r.slot as MealSlot)
      : null;
  return {
    kind,
    title,
    person_name: r.person_name ? String(r.person_name) : null,
    date: r.date ? String(r.date) : null,
    time: r.time ? String(r.time) : null,
    weekday: typeof r.weekday === "number" ? r.weekday : null,
    slot,
  };
}

function normalize(parsed: { items?: unknown[]; confidence?: number }, usedAi: boolean): Extraction {
  const items = Array.isArray(parsed.items)
    ? parsed.items.map(validateItem).filter((x): x is PlannedItem => x !== null).slice(0, 80)
    : [];
  return {
    items,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : usedAi ? 0.7 : 0.3,
    used_ai: usedAi,
  };
}

export function toPlannedItems(ex: Extraction): PlannedItem[] {
  return ex.items;
}

// Minimal offline parser (no API key) - one item from the text.
function heuristicExtract(input: ExtractInput): Extraction {
  const text = (input.text ?? "").trim();
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const title =
    text.length > 0
      ? text.replace(/\s+/g, " ").slice(0, 120)
      : input.imageBase64
      ? "פריט מתמונה (יש לבדוק ידנית)"
      : "משימה חדשה";
  const item: PlannedItem = {
    kind: timeMatch ? "event" : "task",
    title,
    person_name: input.peopleNames.find((n) => text.includes(n)) ?? null,
    date: /(מחר|tomorrow)/.test(text) ? todayStr(addDays(new Date(), 1)) : null,
    time: timeMatch ? timeMatch[0] : null,
    weekday: null,
    slot: null,
  };
  return { items: [item], confidence: 0.3, used_ai: false };
}

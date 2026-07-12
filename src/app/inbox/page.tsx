"use client";

import { useState } from "react";
import Link from "next/link";
import type { Extraction } from "@/lib/gemini";

const EXAMPLES = [
  "הזכורת להורי כיתת מאיה: מחר יש להביא בגדי התעמלות ו-20 שקל לקנטינה",
  "שלום הורים, ביום שישי יש יום תחפושות. נא להכין תחפושת לילדים.",
  "נגמר לנו החלב והביצים, לקנות בסופר",
  "איתי צריך להביא חלילית לשיעור מוזיקה ביום רביעי",
];

export default function InboxPage() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    { extraction: Extraction; person: string | null } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!text.trim() && !image) {
      setError("יש להזין טקסט או לבחור תמונה");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() || undefined, image: image || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">תיבת הודעות ותמונות</h1>
        <Link href="/" className="text-sm text-sky-400 hover:underline">
          ← חזרה ללוח
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        הדבק הודעת וואטסאפ ממורה או העלה צילום, והבינה המלאכותית תחלץ משימה. הפריט יופיע בלוח תחת
        &quot;דורש אישור&quot;.
      </p>

      <div className="mt-5 space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
        <div>
          <label className="text-sm font-medium text-slate-300">טקסט ההודעה</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="לדוגמה: מחר יש להביא בגדי התעמלות..."
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm outline-none focus:border-sky-500"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setText(ex)}
                className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                {ex.slice(0, 28)}...
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300">או צילום (אופציונלי)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="mt-1 block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-sky-500"
          />
          {image && (
            <div className="mt-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={imageName} className="h-20 w-20 rounded-lg object-cover" />
              <button onClick={() => { setImage(null); setImageName(""); }} className="text-xs text-rose-400 hover:underline">
                הסר תמונה
              </button>
            </div>
          )}
        </div>

        <button
          onClick={submit}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "מנתח..." : "חלץ משימה 🤖"}
        </button>

        {error && <div className="rounded-lg bg-rose-500/15 p-3 text-sm text-rose-200">{error}</div>}
      </div>

      {result && (
        <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <span className="font-semibold">נוצר פריט לאישור</span>
            <span className="mr-auto rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
              {result.extraction.used_ai ? "מודל AI" : "מנתח מקומי (ללא מפתח API)"}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-400">כותרת</dt>
            <dd>{result.extraction.title}</dd>
            <dt className="text-slate-400">משויך ל</dt>
            <dd>{result.person ?? "לא זוהה"}</dd>
            <dt className="text-slate-400">סוג</dt>
            <dd>{result.extraction.type}</dd>
            <dt className="text-slate-400">תאריך</dt>
            <dd>{result.extraction.date ?? "היום"}</dd>
            {result.extraction.time && (
              <>
                <dt className="text-slate-400">שעה</dt>
                <dd>{result.extraction.time}</dd>
              </>
            )}
            {result.extraction.bring.length > 0 && (
              <>
                <dt className="text-slate-400">להביא</dt>
                <dd>{result.extraction.bring.join(", ")}</dd>
              </>
            )}
            {result.extraction.grocery.length > 0 && (
              <>
                <dt className="text-slate-400">לקניות</dt>
                <dd>{result.extraction.grocery.join(", ")}</dd>
              </>
            )}
            <dt className="text-slate-400">ביטחון</dt>
            <dd>{Math.round(result.extraction.confidence * 100)}%</dd>
          </dl>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500"
          >
            צפה בלוח ואשר את הפריט ←
          </Link>
        </div>
      )}
    </main>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import type { PlannedItem } from "@/lib/types";

const EXAMPLES = [
  "מחר למאור יש רופא שיניים ב-15:00",
  "הוסף את כל משחקי המונדיאל 2026 ללוח",
  "נגמר לנו החלב והביצים, לקנות בסופר",
  "לזיו יש חוג כדורגל כל יום שלישי ב-17:00",
];

const KIND_LABEL: Record<PlannedItem["kind"], string> = {
  event: "🗓️ אירוע",
  task: "✔️ משימה",
  bring: "🎒 להביא",
  grocery: "🛒 קניות",
  meal: "🍽️ ארוחה",
};

export default function InboxPage() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PlannedItem[] | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [committed, setCommitted] = useState<Record<string, number> | null>(null);
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

  const analyze = async () => {
    if (!text.trim() && !image) {
      setError("יש להזין טקסט או לבחור תמונה");
      return;
    }
    setLoading(true);
    setError(null);
    setItems(null);
    setCommitted(null);
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() || undefined, image: image || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה");
      setItems(data.items || []);
      setUsedAi(!!data.used_ai);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!items || items.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה");
      setCommitted(data.counts || {});
      setItems(null);
      setText("");
      setImage(null);
      setImageName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setLoading(false);
    }
  };

  const removeItem = (idx: number) => {
    if (!items) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">הוספת משימות ואירועים</h1>
        <Link href="/" className="text-sm text-sky-400 hover:underline">
          ← חזרה ללוח
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        כתוב בקשה חופשית (או העלה תמונה). המערכת תנתח ותציג בדיוק מה עומד להתווסף - ורק אחרי
        שתאשר, זה יתווסף ללוח.
      </p>

      <div className="mt-5 space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="לדוגמה: הוסף את כל משחקי המונדיאל 2026 ללוח"
          className="w-full rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm outline-none focus:border-sky-500"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText(ex)}
              className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              {ex.slice(0, 30)}
            </button>
          ))}
        </div>

        <div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-sky-500"
          />
          {image && (
            <div className="mt-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={imageName} className="h-16 w-16 rounded-lg object-cover" />
              <button
                onClick={() => {
                  setImage(null);
                  setImageName("");
                }}
                className="text-xs text-rose-400 hover:underline"
              >
                הסר תמונה
              </button>
            </div>
          )}
        </div>

        <button
          onClick={analyze}
          disabled={loading}
          className="rounded-lg bg-slate-700 px-4 py-2 font-medium hover:bg-slate-600 disabled:opacity-50"
        >
          {loading ? "מנתח..." : "נתח 🔎"}
        </button>

        {error && <div className="rounded-lg bg-rose-500/15 p-3 text-sm text-rose-200">{error}</div>}
      </div>

      {items && (
        <div className="mt-5 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold">מה עומד להתווסף ({items.length})</span>
            <span className="mr-auto rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
              {usedAi ? "מודל AI" : "מנתח מקומי"}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">לא זוהו פריטים. נסה לנסח מחדש.</p>
          ) : (
            <ul className="mt-3 max-h-[420px] space-y-1 overflow-y-auto">
              {items.map((it, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-sm"
                >
                  <span className="shrink-0">{KIND_LABEL[it.kind]}</span>
                  <span className="flex-1">
                    {it.title}
                    {it.person_name && <span className="mr-1 text-slate-400">· {it.person_name}</span>}
                    {(it.date || it.time) && (
                      <span className="mr-1 text-slate-400 tabular-nums">
                        · {it.date ?? "היום"}
                        {it.time ? ` ${it.time}` : ""}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-slate-500 hover:text-rose-400"
                    aria-label="הסר"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={confirm}
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                {loading ? "מוסיף..." : `אשר והוסף (${items.length})`}
              </button>
              <button
                onClick={() => setItems(null)}
                className="rounded-lg bg-slate-700 px-4 py-2 font-medium hover:bg-slate-600"
              >
                ביטול
              </button>
            </div>
          )}
        </div>
      )}

      {committed && (
        <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="font-semibold">✅ נוסף ללוח</div>
          <div className="mt-2 text-sm text-slate-300">
            {Object.entries(committed)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${KIND_LABEL[k as PlannedItem["kind"]] || k}: ${n}`)
              .join(" · ") || "לא נוספו פריטים"}
          </div>
          <div className="mt-4 flex gap-2">
            <Link href="/" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500">
              ללוח היומי
            </Link>
            <Link
              href="/schedule"
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-600"
            >
              ללוח העתידי
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

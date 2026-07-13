"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Person, EventItem, Task } from "@/lib/types";
import { HEB_WEEKDAYS, HEB_MONTHS } from "@/lib/date";

interface Upcoming {
  start: string;
  end: string;
  people: Person[];
  events: EventItem[];
  tasks: Task[];
}

interface Row {
  time: string | null;
  title: string;
  person_id: number | null;
  kind: string;
}

function hebDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${HEB_WEEKDAYS[d.getDay()]}, ${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}`;
}

export default function SchedulePage() {
  const [data, setData] = useState<Upcoming | null>(null);

  useEffect(() => {
    fetch("/api/upcoming?days=90")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">טוען...</div>;
  }

  const byId = new Map(data.people.map((p) => [p.id, p]));
  const byDate = new Map<string, Row[]>();

  const push = (date: string, row: Row) => {
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(row);
  };

  for (const e of data.events) {
    push(e.date, { time: e.time, title: e.title, person_id: e.person_id, kind: "event" });
  }
  for (const t of data.tasks) {
    push(t.date, { time: t.time, title: t.title, person_id: t.person_id, kind: t.type });
  }

  const dates = [...byDate.keys()].sort();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">לוח עתידי</h1>
        <Link href="/" className="text-sm text-sky-400 hover:underline">
          ← חזרה ללוח היומי
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-400">אירועים ומשימות מהיום ועד 90 יום קדימה.</p>

      {dates.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 text-center text-slate-400">
          אין אירועים עתידיים. הוסף דרך ➕ הוספת משימות.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {dates.map((date) => {
            const rows = byDate
              .get(date)!
              .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
            return (
              <div key={date} className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
                <div className="mb-2 font-semibold text-sky-200">{hebDate(date)}</div>
                <ul className="space-y-1">
                  {rows.map((r, i) => {
                    const p = r.person_id ? byId.get(r.person_id) : null;
                    return (
                      <li key={i} className="flex items-baseline gap-2 text-sm">
                        <span className="w-14 shrink-0 tabular-nums text-slate-400">
                          {r.time ?? "--:--"}
                        </span>
                        <span className="text-slate-100">{r.title}</span>
                        {p && <span className="text-xs text-slate-500">· {p.emoji} {p.name}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

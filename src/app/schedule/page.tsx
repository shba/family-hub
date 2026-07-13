"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Person, EventItem, Task } from "@/lib/types";
import { eventParticipants } from "@/lib/types";
import { HEB_WEEKDAYS, HEB_MONTHS } from "@/lib/date";

interface Upcoming {
  start: string;
  end: string;
  people: Person[];
  events: EventItem[];
  tasks: Task[];
}

function hebDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${HEB_WEEKDAYS[d.getDay()]}, ${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}`;
}

export default function SchedulePage() {
  const [data, setData] = useState<Upcoming | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/upcoming?days=365");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleParticipant = async (eventId: number, personId: number, current: number[]) => {
    const next = current.includes(personId)
      ? current.filter((x) => x !== personId)
      : [...current, personId];
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participants: next }),
    });
    load();
  };

  const removeEvent = async (eventId: number) => {
    await fetch(`/api/events/${eventId}`, { method: "DELETE" });
    load();
  };

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">טוען...</div>;
  }

  const sections: { key: string; label: string; personId: number | null }[] = [
    ...data.people.map((p) => ({ key: `p${p.id}`, label: `${p.emoji} ${p.name}`, personId: p.id })),
    { key: "general", label: "👪 כל המשפחה / כללי", personId: null },
  ];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">לוח עתידי</h1>
        <Link href="/" className="text-sm text-sky-400 hover:underline">
          ← חזרה ללוח היומי
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        מחולק לפי בן משפחה. אפשר להוסיף/להסיר משתתפים לכל אירוע.
      </p>

      <div className="mt-5 space-y-5">
        {sections.map((section) => {
          const events = data.events.filter((e) => {
            const parts = eventParticipants(e);
            return section.personId === null ? parts.length === 0 : parts.includes(section.personId);
          });
          const tasks =
            section.personId === null
              ? []
              : data.tasks.filter((t) => t.person_id === section.personId);

          if (events.length === 0 && tasks.length === 0) return null;

          // group by date
          const byDate = new Map<string, { type: "event" | "task"; item: EventItem | Task }[]>();
          for (const e of events) {
            if (!byDate.has(e.date)) byDate.set(e.date, []);
            byDate.get(e.date)!.push({ type: "event", item: e });
          }
          for (const t of tasks) {
            if (!byDate.has(t.date)) byDate.set(t.date, []);
            byDate.get(t.date)!.push({ type: "task", item: t });
          }
          const dates = [...byDate.keys()].sort();

          return (
            <section key={section.key} className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
              <h2 className="mb-3 text-lg font-bold">{section.label}</h2>
              <div className="space-y-3">
                {dates.map((date) => {
                  const rows = byDate
                    .get(date)!
                    .sort((a, b) => (a.item.time ?? "").localeCompare(b.item.time ?? ""));
                  return (
                    <div key={date}>
                      <div className="mb-1 text-sm font-semibold text-sky-200">{hebDate(date)}</div>
                      <ul className="space-y-2">
                        {rows.map((row, i) => {
                          if (row.type === "task") {
                            const t = row.item as Task;
                            return (
                              <li key={`t${t.id}`} className="flex items-baseline gap-2 text-sm">
                                <span className="w-12 shrink-0 tabular-nums text-slate-400">
                                  {t.time ?? "--:--"}
                                </span>
                                <span className="text-slate-100">{t.title}</span>
                                <span className="text-xs text-slate-500">· משימה</span>
                              </li>
                            );
                          }
                          const e = row.item as EventItem;
                          const parts = eventParticipants(e);
                          return (
                            <li key={`e${e.id}`} className="rounded-lg bg-slate-800/40 p-2">
                              <div className="flex items-baseline gap-2 text-sm">
                                <span className="w-12 shrink-0 tabular-nums text-slate-400">
                                  {e.time ?? "--:--"}
                                </span>
                                <span className="flex-1 text-slate-100">{e.title}</span>
                                <button
                                  onClick={() => removeEvent(e.id)}
                                  className="text-slate-500 hover:text-rose-400"
                                  aria-label="מחק אירוע"
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1 pr-12">
                                <span className="mr-1 self-center text-[11px] text-slate-500">משתתפים:</span>
                                {data.people.map((p) => {
                                  const on = parts.includes(p.id);
                                  return (
                                    <button
                                      key={p.id}
                                      onClick={() => toggleParticipant(e.id, p.id, parts)}
                                      title={p.name}
                                      className={`rounded-full border px-2 py-0.5 text-xs ${
                                        on
                                          ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-100"
                                          : "border-slate-600 text-slate-400 hover:bg-slate-700"
                                      }`}
                                    >
                                      {p.emoji} {p.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {data.events.length === 0 && data.tasks.length === 0 && (
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 text-center text-slate-400">
            אין אירועים עתידיים. הוסף דרך ➕ הוספת משימות.
          </div>
        )}
      </div>
    </main>
  );
}

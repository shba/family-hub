"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  DashboardState,
  Person,
  Task,
  Meal,
  Grocery,
  Media,
  ClassItem,
  EventItem,
} from "@/lib/types";
import { eventParticipants } from "@/lib/types";
import { colorOf } from "@/lib/colors";
import { HEB_WEEKDAYS_SHORT, HEB_WEEKDAYS, HEB_MONTHS } from "@/lib/date";

const SLOT_LABEL: Record<string, string> = {
  breakfast: "בוקר",
  lunch: "צהריים",
  dinner: "ערב",
};

async function api(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json().catch(() => ({}));
}

export default function Dashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [gcal, setGcal] = useState<GEventLite[]>([]);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    const data = (await api("/api/state")) as DashboardState;
    setState(data);
    const g = await api("/api/gcal?days=1");
    setGcal(Array.isArray(g.events) ? g.events : []);
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 7000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  const toggleTask = async (id: number) => {
    await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ action: "toggle" }) });
    load();
  };
  const confirmTask = async (id: number) => {
    await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ action: "confirm" }) });
    load();
  };
  const rejectTask = async (id: number) => {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  };
  const confirmEvent = async (id: number) => {
    await api(`/api/events/${id}`, { method: "PATCH" });
    load();
  };
  const rejectEvent = async (id: number) => {
    await api(`/api/events/${id}`, { method: "DELETE" });
    load();
  };
  const toggleGrocery = async (id: number) => {
    await api(`/api/grocery/${id}`, { method: "PATCH" });
    load();
  };
  const deleteGrocery = async (id: number) => {
    await api(`/api/grocery/${id}`, { method: "DELETE" });
    load();
  };
  const addGrocery = async (name: string) => {
    await api("/api/grocery", { method: "POST", body: JSON.stringify({ name }) });
    load();
  };

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        טוען את מרכז המשפחה...
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <TopBar state={state} now={now} />

      <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {state.people.map((p) => (
          <PersonCard key={p.id} person={p} state={state} onToggle={toggleTask} />
        ))}
      </section>

      <GoogleToday events={gcal} today={state.today} />

      <GeneralTasks tasks={state.tasks} onToggle={toggleTask} />

      <FamilyMenu meals={state.meals} />


      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <WeeklyStrip classes={state.classes} people={state.people} weekday={state.weekday} />
        <GroceryTile
          items={state.grocery}
          onToggle={toggleGrocery}
          onDelete={deleteGrocery}
          onAdd={addGrocery}
        />
        <ConfirmPanel
          pending={state.pending}
          pendingEvents={state.pendingEvents}
          people={state.people}
          onConfirm={confirmTask}
          onReject={rejectTask}
          onConfirmEvent={confirmEvent}
          onRejectEvent={rejectEvent}
        />
      </section>

      <section className="mt-4">
        <PhotoInbox media={state.media} pending={state.pending} />
      </section>

      <footer className="mt-6 pb-4 text-center text-xs text-slate-500">
        מרכז המשפחה - POC · מתעדכן אוטומטית · {" "}
        <Link href="/inbox" className="text-sky-400 hover:underline">
          תיבת הודעות ותמונות (הדגמת בינה מלאכותית)
        </Link>
      </footer>
    </main>
  );
}

function Tile({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4 shadow-lg backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

function TopBar({ state, now }: { state: DashboardState; now: Date }) {
  const dateStr = `${HEB_WEEKDAYS[now.getDay()]}, ${now.getDate()} ב${HEB_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return (
    <Tile className="bg-gradient-to-l from-slate-900/70 to-slate-800/40">
      <div className="flex flex-col items-start justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <div className="text-3xl font-bold tracking-tight lg:text-4xl">מרכז המשפחה</div>
          <div className="mt-1 text-slate-300">{dateStr}</div>
        </div>
        <div className="text-left">
          <div className="text-4xl font-bold tabular-nums lg:text-5xl">{timeStr}</div>
          <div className="mt-1 text-slate-300">☀️ 28°C · תל אביב</div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 rounded-xl bg-sky-500/10 px-4 py-3 text-sky-100 ring-1 ring-sky-500/20">
          <span className="ml-2">🤖</span>
          {state.summary}
        </div>
        <Link
          href="/inbox"
          className="shrink-0 rounded-xl bg-sky-600 px-5 py-3 text-center font-medium hover:bg-sky-500"
        >
          ➕ הוסף משימה / תמונה
        </Link>
        <Link
          href="/schedule"
          className="shrink-0 rounded-xl bg-slate-700 px-5 py-3 text-center font-medium hover:bg-slate-600"
        >
          🗓️ לוח עתידי
        </Link>
      </div>
    </Tile>
  );
}

function PersonCard({
  person,
  state,
  onToggle,
}: {
  person: Person;
  state: DashboardState;
  onToggle: (id: number) => void;
}) {
  const c = colorOf(person.color);
  const meals = state.meals.filter((m) => m.person_id === person.id);
  const chores = state.tasks.filter((t) => t.person_id === person.id && t.type === "chore");
  const tasks = state.tasks.filter((t) => t.person_id === person.id && t.type === "task");
  const bring = state.tasks.filter((t) => t.person_id === person.id && t.type === "bring");

  const schedule = [
    ...state.events
      .filter((e) => eventParticipants(e).includes(person.id))
      .map((e) => ({ id: `e${e.id}`, time: e.time, title: e.title, end: e.end_time })),
    ...state.classes
      .filter((cl) => cl.person_id === person.id && cl.weekday === state.weekday)
      .map((cl) => ({ id: `c${cl.id}`, time: cl.time, title: `${cl.name} (חוג)`, end: null as string | null })),
  ].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  const roleLabel = person.role === "kid" ? "ילד/ה" : person.role === "parent" ? "הורה" : "חיית מחמד";

  return (
    <Tile className={`bg-gradient-to-b ${c.glow} to-transparent`}>
      <div className={`-m-4 mb-3 h-1.5 rounded-t-2xl ${c.accent}`} />
      <div className="flex items-center gap-3">
        <div className={`grid h-12 w-12 place-items-center rounded-full bg-slate-800 text-2xl ring-2 ${c.ring}`}>
          {person.emoji}
        </div>
        <div>
          <div className="text-lg font-bold">{person.name}</div>
          <div className="text-xs text-slate-400">{roleLabel}</div>
        </div>
      </div>

      {schedule.length > 0 && (
        <div className="mt-3">
          <SectionTitle>🕐 לוח זמנים היום</SectionTitle>
          <ul className="mt-1 space-y-1">
            {schedule.map((s) => (
              <li key={s.id} className="flex items-baseline gap-2 text-sm">
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums ${c.chip}`}>
                  {s.time ?? "--:--"}
                  {s.end ? `-${s.end}` : ""}
                </span>
                <span className="text-slate-200">{s.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {meals.length > 0 && (
        <div className="mt-3">
          <SectionTitle>🍽 ארוחות היום</SectionTitle>
          <ul className="mt-1 space-y-1 text-sm">
            {(["breakfast", "lunch", "dinner"] as const).map((slot) => {
              const m = meals.find((x) => x.slot === slot);
              if (!m) return null;
              return (
                <li key={slot} className="flex gap-2 text-slate-200">
                  <span className="shrink-0 text-slate-400">{SLOT_LABEL[slot]}:</span>
                  <span>
                    {m.description}
                    {m.pack === 1 && (
                      <span className={`mr-2 rounded-full border px-2 py-0.5 text-[11px] ${c.chip}`}>
                        לארוז 🎒
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(chores.length > 0 || tasks.length > 0) && (
        <div className="mt-3">
          <SectionTitle>✔ מטלות</SectionTitle>
          <ul className="mt-1 space-y-1">
            {[...chores, ...tasks].map((t) => (
              <TaskRow key={t.id} task={t} onToggle={onToggle} />
            ))}
          </ul>
        </div>
      )}

      {bring.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-500/10 p-2 ring-1 ring-amber-500/20">
          <SectionTitle>★ להביא היום</SectionTitle>
          <ul className="mt-1 space-y-1">
            {bring.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={onToggle} />
            ))}
          </ul>
        </div>
      )}
    </Tile>
  );
}

interface GEventLite {
  title: string;
  date: string;
  time: string | null;
  end: string | null;
}

function GoogleToday({ events, today }: { events: GEventLite[]; today: string }) {
  const list = events.filter((e) => e.date === today);
  if (list.length === 0) return null;
  return (
    <section className="mt-4">
      <Tile>
        <SectionTitle>📅 היומן שלי (גוגל)</SectionTitle>
        <ul className="mt-2 space-y-1">
          {list.map((e, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span className="w-16 shrink-0 tabular-nums text-slate-400">{e.time ?? "כל היום"}</span>
              <span className="text-slate-100">{e.title}</span>
            </li>
          ))}
        </ul>
      </Tile>
    </section>
  );
}

function GeneralTasks({
  tasks,
  onToggle,
}: {
  tasks: Task[];
  onToggle: (id: number) => void;
}) {
  const general = tasks.filter((t) => t.person_id == null);
  if (general.length === 0) return null;
  return (
    <section className="mt-4">
      <Tile>
        <SectionTitle>✔️ מטלות משפחתיות (כולם)</SectionTitle>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {general.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} />
          ))}
        </ul>
      </Tile>
    </section>
  );
}

function FamilyMenu({ meals }: { meals: Meal[] }) {
  const family = meals.filter((m) => m.person_id == null);
  if (family.length === 0) return null;
  const slots = [
    ["breakfast", "בוקר"],
    ["lunch", "צהריים"],
    ["dinner", "ערב"],
  ] as const;
  return (
    <section className="mt-4">
      <Tile>
        <SectionTitle>🍽️ תפריט היום (משפחה)</SectionTitle>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {slots.map(([slot, label]) => {
            const items = family.filter((m) => m.slot === slot);
            if (items.length === 0) return null;
            return (
              <div key={slot} className="rounded-lg bg-slate-800/40 p-2">
                <div className="text-xs font-semibold text-slate-400">{label}</div>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-100">
                  {items.map((m) => (
                    <li key={m.id}>{m.description}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Tile>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</div>;
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: (id: number) => void }) {
  return (
    <li>
      <button
        onClick={() => onToggle(task.id)}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-right text-sm hover:bg-slate-800/60"
      >
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
            task.done ? "border-emerald-500 bg-emerald-500/80 text-slate-900" : "border-slate-500"
          }`}
        >
          {task.done ? "✓" : ""}
        </span>
        <span className={task.done ? "text-slate-500 line-through" : "text-slate-100"}>
          {task.title}
          {task.time && <span className="mr-2 text-slate-400">· {task.time}</span>}
        </span>
      </button>
    </li>
  );
}

function WeeklyStrip({
  classes,
  people,
  weekday,
}: {
  classes: ClassItem[];
  people: Person[];
  weekday: number;
}) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const days = [0, 1, 2, 3, 4, 5]; // Sunday..Friday
  return (
    <Tile>
      <SectionTitle>🗓 חוגים ופעילויות השבוע</SectionTitle>
      <div className="mt-2 grid grid-cols-6 gap-1">
        {days.map((d) => {
          const items = classes.filter((c) => c.weekday === d);
          const isToday = d === weekday;
          return (
            <div
              key={d}
              className={`min-h-[92px] rounded-lg p-2 text-center ${
                isToday ? "bg-sky-500/15 ring-1 ring-sky-500/40" : "bg-slate-800/40"
              }`}
            >
              <div className="text-xs font-bold text-slate-300">{HEB_WEEKDAYS_SHORT[d]}</div>
              <div className="mt-1 space-y-1">
                {items.map((c) => {
                  const p = c.person_id ? byId.get(c.person_id) : null;
                  return (
                    <div key={c.id} className="rounded bg-slate-900/70 px-1 py-1 text-[11px] leading-tight">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-slate-400">
                        {p?.emoji} {c.time}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Tile>
  );
}

function GroceryTile({
  items,
  onToggle,
  onDelete,
  onAdd,
}: {
  items: Grocery[];
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onAdd: (name: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  };
  return (
    <Tile>
      <SectionTitle>🛒 רשימת קניות</SectionTitle>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="הוסף פריט..."
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
        />
        <button
          onClick={submit}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500"
        >
          הוסף
        </button>
      </div>
      <ul className="mt-2 max-h-[220px] space-y-1 overflow-y-auto pl-1">
        {items.map((g) => (
          <li key={g.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-800/60">
            <button onClick={() => onToggle(g.id)} className="flex flex-1 items-center gap-2 text-right text-sm">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                  g.checked ? "border-emerald-500 bg-emerald-500/80 text-slate-900" : "border-slate-500"
                }`}
              >
                {g.checked ? "✓" : ""}
              </span>
              <span className={g.checked ? "text-slate-500 line-through" : ""}>
                {g.name}
                {g.quantity && <span className="mr-1 text-slate-400">({g.quantity})</span>}
                {g.source !== "manual" && (
                  <span className="mr-2 rounded-full bg-slate-700/70 px-1.5 py-0.5 text-[10px] text-slate-300">
                    {g.source === "meal" ? "מארוחות" : "מוואטסאפ"}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => onDelete(g.id)}
              className="opacity-0 transition group-hover:opacity-100 text-slate-500 hover:text-rose-400"
              aria-label="מחק"
            >
              ✕
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="p-2 text-sm text-slate-500">הרשימה ריקה</li>}
      </ul>
    </Tile>
  );
}

function ConfirmPanel({
  pending,
  pendingEvents,
  people,
  onConfirm,
  onReject,
  onConfirmEvent,
  onRejectEvent,
}: {
  pending: Task[];
  pendingEvents: EventItem[];
  people: Person[];
  onConfirm: (id: number) => void;
  onReject: (id: number) => void;
  onConfirmEvent: (id: number) => void;
  onRejectEvent: (id: number) => void;
}) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const total = pending.length + pendingEvents.length;

  const Row = ({
    title,
    person,
    badge,
    onOk,
    onNo,
  }: {
    title: string;
    person?: Person | null;
    badge?: string;
    onOk: () => void;
    onNo: () => void;
  }) => (
    <li className="rounded-lg bg-slate-800/50 p-2">
      <div className="text-sm">
        {badge && <span className="ml-1">{badge}</span>}
        {title}
        {person && <span className="mr-2 text-xs text-slate-400">← {person.emoji} {person.name}</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onOk}
          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium hover:bg-emerald-500"
        >
          אישור ✓
        </button>
        <button
          onClick={onNo}
          className="rounded-md bg-slate-700 px-3 py-1 text-xs font-medium hover:bg-rose-600"
        >
          מחיקה ✕
        </button>
      </div>
    </li>
  );

  return (
    <Tile className="ring-1 ring-amber-500/20">
      <SectionTitle>⚠️ דורש אישור (מהבינה המלאכותית)</SectionTitle>
      <ul className="mt-2 space-y-2">
        {pendingEvents.map((e) => (
          <Row
            key={`e${e.id}`}
            title={`${e.time ? e.time + " · " : ""}${e.title}${e.date ? " (" + e.date + ")" : ""}`}
            person={e.person_id ? byId.get(e.person_id) : null}
            badge="🕐"
            onOk={() => onConfirmEvent(e.id)}
            onNo={() => onRejectEvent(e.id)}
          />
        ))}
        {pending.map((t) => (
          <Row
            key={`t${t.id}`}
            title={t.title}
            person={t.person_id ? byId.get(t.person_id) : null}
            onOk={() => onConfirm(t.id)}
            onNo={() => onReject(t.id)}
          />
        ))}
        {total === 0 && (
          <li className="p-2 text-sm text-slate-500">אין פריטים שממתינים לאישור 🎉</li>
        )}
      </ul>
    </Tile>
  );
}

function PhotoInbox({ media, pending }: { media: Media[]; pending: Task[] }) {
  const taskById = new Map(pending.map((t) => [t.id, t]));
  return (
    <Tile>
      <SectionTitle>📷 תמונות והודעות מהמורים</SectionTitle>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {media.map((m) => {
          const task = m.task_id ? taskById.get(m.task_id) : null;
          return (
            <div key={m.id} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/40">
              <div className="grid h-28 place-items-center bg-slate-900/60">
                {m.file_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.file_path} alt={m.caption} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl opacity-60">🖼️</span>
                )}
              </div>
              <div className="p-2">
                <div className="line-clamp-2 text-xs text-slate-300">{m.caption}</div>
                {task && (
                  <div className="mt-1 rounded-md bg-sky-500/15 px-2 py-1 text-[11px] text-sky-200">
                    → {task.title}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {media.length === 0 && (
          <div className="col-span-full p-2 text-sm text-slate-500">אין עדיין תמונות</div>
        )}
      </div>
    </Tile>
  );
}

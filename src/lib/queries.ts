import { store, persist, nextId, nowIso } from "./store";
import { todayStr, weekdayOf, addDays, nextWeekdayDate } from "./date";
import type { Person, Meal, Task, EventItem, DashboardState, TaskType, PlannedItem } from "./types";

export function getState(): DashboardState {
  const today = todayStr();
  const weekday = weekdayOf();

  const people = [...store.people].sort((a, b) => a.sort - b.sort);

  const meals = store.meals.filter(
    (m) => m.date === today || (m.weekday != null && m.weekday === weekday)
  );

  const tasks = store.tasks
    .filter((t) => t.date === today && t.status === "confirmed")
    .sort((a, b) => a.done - b.done || a.id - b.id);

  const pending = store.tasks
    .filter((t) => t.status === "pending")
    .sort((a, b) => b.id - a.id);

  const classes = [...store.classes].sort(
    (a, b) => a.weekday - b.weekday || (a.time ?? "").localeCompare(b.time ?? "")
  );

  const grocery = [...store.grocery].sort((a, b) => a.checked - b.checked || a.id - b.id);

  const media = [...store.media].sort((a, b) => b.id - a.id).slice(0, 12);

  const events = store.events
    .filter((e) => e.date === today && e.status !== "pending")
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  const pendingEvents = store.events
    .filter((e) => e.status === "pending")
    .sort((a, b) => b.id - a.id);

  return {
    today,
    weekday,
    summary: buildSummary(people, meals, tasks),
    people,
    meals,
    tasks,
    pending,
    classes,
    grocery,
    media,
    events,
    pendingEvents,
  };
}

function buildSummary(people: Person[], meals: Meal[], tasks: Task[]): string {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parts: string[] = [];

  for (const p of people.filter((x) => x.role === "kid")) {
    const bring = tasks
      .filter((t) => t.person_id === p.id && t.type === "bring")
      .map((t) => t.title);
    const packMeal = meals.find((m) => m.person_id === p.id && m.pack === 1);
    const bits: string[] = [];
    if (packMeal) bits.push(`אוכל: ${packMeal.description}`);
    if (bring.length) bits.push(`להביא: ${bring.join(", ")}`);
    if (bits.length) parts.push(`${p.name} - ${bits.join("; ")}`);
  }

  const petTasks = tasks.filter(
    (t) => t.person_id != null && byId.get(t.person_id)?.role === "pet" && !t.done
  );
  if (petTasks.length) {
    parts.push(
      `${byId.get(petTasks[0].person_id!)?.name}: ${petTasks
        .map((t) => `${t.title}${t.time ? " " + t.time : ""}`)
        .join(", ")}`
    );
  }

  if (!parts.length) return "בוקר טוב! אין משימות דחופות היום.";
  return "בוקר טוב! " + parts.join(" · ");
}

export function toggleTask(id: number): void {
  const t = store.tasks.find((x) => x.id === id);
  if (t) {
    t.done = t.done ? 0 : 1;
    persist();
  }
}

export function deleteTask(id: number): void {
  store.tasks = store.tasks.filter((x) => x.id !== id);
  persist();
}

export function confirmTask(id: number): void {
  const t = store.tasks.find((x) => x.id === id);
  if (t) {
    t.status = "confirmed";
    persist();
  }
}

export function createTask(input: {
  person_id: number | null;
  title: string;
  type?: TaskType;
  date?: string;
  time?: string | null;
  status?: "confirmed" | "pending";
  source?: string;
}): number {
  const id = nextId();
  store.tasks.push({
    id,
    person_id: input.person_id,
    title: input.title,
    date: input.date ?? todayStr(),
    type: input.type ?? "task",
    time: input.time ?? null,
    done: 0,
    status: input.status ?? "confirmed",
    source: input.source ?? "manual",
    created_at: nowIso(),
  });
  persist();
  return id;
}

export function toggleGrocery(id: number): void {
  const g = store.grocery.find((x) => x.id === id);
  if (g) {
    g.checked = g.checked ? 0 : 1;
    persist();
  }
}

export function deleteGrocery(id: number): void {
  store.grocery = store.grocery.filter((x) => x.id !== id);
  persist();
}

export function addGrocery(name: string, quantity: string | null, source = "manual"): number {
  const id = nextId();
  store.grocery.push({ id, name, quantity, checked: 0, source, created_at: nowIso() });
  persist();
  return id;
}

export function addMeal(input: {
  person_id: number | null;
  slot: string;
  description: string;
  date?: string | null;
  weekday?: number | null;
  pack?: number;
}): number {
  const id = nextId();
  store.meals.push({
    id,
    person_id: input.person_id,
    date: input.date ?? null,
    weekday: input.weekday ?? null,
    slot: input.slot as Meal["slot"],
    description: input.description,
    pack: input.pack ?? 0,
  });
  persist();
  return id;
}

// Central creation used by the inbox commit and the WhatsApp gateway.
export function createPlannedItem(item: PlannedItem, status: "confirmed" | "pending" = "confirmed"): void {
  const person = findPersonByName(item.person_name ?? null);
  const resolveDate = () => {
    if (item.date) return item.date;
    if (item.weekday != null) return nextWeekdayDate(item.weekday);
    return todayStr();
  };
  switch (item.kind) {
    case "event":
      createEvent({
        participants: person ? [person.id] : [],
        title: item.title,
        date: resolveDate(),
        time: item.time ?? null,
        status,
        source: "inbox",
      });
      break;
    case "task":
    case "bring":
      createTask({
        person_id: person?.id ?? null,
        title: item.title,
        type: item.kind,
        date: resolveDate(),
        time: item.time ?? null,
        status,
        source: "inbox",
      });
      break;
    case "grocery":
      addGrocery(item.title, item.quantity ?? null, "inbox");
      break;
    case "meal":
      addMeal({
        person_id: person?.id ?? null,
        slot: (item.slot as string) ?? "lunch",
        description: item.title,
        weekday: item.weekday ?? null,
        date: item.weekday != null ? null : item.date ?? todayStr(),
      });
      break;
  }
}

export function createEvent(input: {
  person_id?: number | null;
  participants?: number[];
  title: string;
  date?: string;
  time?: string | null;
  end_time?: string | null;
  status?: "confirmed" | "pending";
  source?: string;
}): number {
  const id = nextId();
  const participants =
    input.participants ?? (input.person_id != null ? [input.person_id] : []);
  store.events.push({
    id,
    person_id: participants[0] ?? null,
    participants,
    title: input.title,
    date: input.date ?? todayStr(),
    time: input.time ?? null,
    end_time: input.end_time ?? null,
    status: input.status ?? "confirmed",
    source: input.source ?? "manual",
  });
  persist();
  return id;
}

export function setEventParticipants(id: number, participants: number[]): void {
  const e = store.events.find((x) => x.id === id);
  if (e) {
    e.participants = participants;
    e.person_id = participants[0] ?? null;
    persist();
  }
}

export function confirmEvent(id: number): void {
  const e = store.events.find((x) => x.id === id);
  if (e) {
    e.status = "confirmed";
    persist();
  }
}

export function deleteEvent(id: number): void {
  store.events = store.events.filter((x) => x.id !== id);
  persist();
}

export function addMedia(caption: string, filePath: string | null, taskId: number | null): number {
  const id = nextId();
  store.media.push({ id, caption, file_path: filePath, task_id: taskId, created_at: nowIso() });
  persist();
  return id;
}

export function findPersonByName(name: string | null): Person | null {
  if (!name) return null;
  const norm = name.trim();
  return (
    store.people.find((p) => p.name === norm) ??
    store.people.find((p) => p.name.includes(norm) || norm.includes(p.name)) ??
    null
  );
}

export function listPeople(): Person[] {
  return [...store.people].sort((a, b) => a.sort - b.sort);
}

export interface UpcomingResult {
  start: string;
  end: string;
  people: Person[];
  events: EventItem[];
  tasks: Task[];
}

export function getUpcoming(days = 30): UpcomingResult {
  const start = todayStr();
  const end = todayStr(addDays(new Date(), days));

  const events = store.events
    .filter((e) => e.status !== "pending" && e.date >= start && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

  const tasks = store.tasks
    .filter((t) => t.status === "confirmed" && t.date >= start && t.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

  return { start, end, people: listPeople(), events, tasks };
}

import fs from "fs";
import path from "path";
import { seedInto } from "./seed";
import { todayStr } from "./date";
import type { Person, Meal, Task, ClassItem, Grocery, Media, EventItem } from "./types";

export interface MessageRow {
  id: number;
  source: string;
  sender: string | null;
  body: string;
  created_at: string;
}

export interface StoreData {
  _seq: number;
  people: Person[];
  meals: Meal[];
  tasks: Task[];
  classes: ClassItem[];
  grocery: Grocery[];
  media: Media[];
  events: EventItem[];
  messages: MessageRow[];
}

// DATA_DIR lets deployments point storage at a mounted persistent volume.
export const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const dbFile = path.join(dataDir, "family.json");

function emptyStore(): StoreData {
  return {
    _seq: 0,
    people: [],
    meals: [],
    tasks: [],
    classes: [],
    grocery: [],
    media: [],
    events: [],
    messages: [],
  };
}

// Generates each person's timed agenda for today. Idempotent: only runs when
// there are no events for today yet, so it also backfills existing data files.
function ensureEventsForToday(store: StoreData): boolean {
  const today = todayStr();
  if (store.events.some((e) => e.date === today)) return false;

  const find = (needle: string) => store.people.find((p) => p.name.includes(needle));
  const add = (
    person: Person | undefined,
    title: string,
    time: string,
    end_time: string | null = null
  ) => {
    if (!person) return;
    store._seq += 1;
    store.events.push({ id: store._seq, person_id: person.id, date: today, title, time, end_time });
  };

  const maya = find("מאיה");
  const itai = find("איתי");
  const mom = find("אמא");
  const dad = find("אבא");

  add(maya, "בית ספר", "08:00", "13:15");
  add(maya, "חוג העשרה", "14:00");
  add(itai, "בית ספר", "08:00", "13:15");
  add(itai, "שיעור עזר במתמטיקה", "14:30");
  add(mom, "פגישת צוות בעבודה", "10:00");
  add(mom, "איסוף הילדים מהחוגים", "16:30");
  add(dad, "ישיבת בוקר", "09:00");
  add(dad, "אימון בחדר כושר", "19:00");

  return store.events.length > 0;
}

function load(): StoreData {
  try {
    if (fs.existsSync(dbFile)) {
      const parsed = JSON.parse(fs.readFileSync(dbFile, "utf8")) as StoreData;
      const merged = { ...emptyStore(), ...parsed };
      if (ensureEventsForToday(merged)) save(merged);
      return merged;
    }
  } catch (err) {
    console.error("[store] failed to read data file, reseeding:", err);
  }
  const fresh = emptyStore();
  seedInto(fresh);
  ensureEventsForToday(fresh);
  save(fresh);
  return fresh;
}

function save(data: StoreData): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), "utf8");
}

// Reuse a single in-memory store across hot reloads in dev.
const globalForStore = globalThis as unknown as { _store?: StoreData };
export const store: StoreData = globalForStore._store ?? (globalForStore._store = load());

export function persist(): void {
  save(store);
}

export function nextId(): number {
  store._seq += 1;
  return store._seq;
}

export function nowIso(): string {
  return new Date().toISOString();
}

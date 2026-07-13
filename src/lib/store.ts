import fs from "fs";
import path from "path";
import { seedInto } from "./seed";
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
  _seedVersion?: number;
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

function load(): StoreData {
  try {
    if (fs.existsSync(dbFile)) {
      // Always keep existing data - updates must never wipe it.
      const parsed = JSON.parse(fs.readFileSync(dbFile, "utf8")) as StoreData;
      return { ...emptyStore(), ...parsed };
    }
  } catch (err) {
    console.error("[store] failed to read data file:", err);
  }
  // Only seed when there's no data file yet.
  const fresh = emptyStore();
  seedInto(fresh);
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

export type Role = "kid" | "parent" | "pet";
export type MealSlot = "breakfast" | "lunch" | "dinner";
export type TaskType = "chore" | "bring" | "task" | "event";
export type TaskStatus = "confirmed" | "pending";

export interface Person {
  id: number;
  name: string;
  role: Role;
  emoji: string;
  color: string;
  sort: number;
}

export interface Meal {
  id: number;
  person_id: number | null; // null = whole-family menu
  date: string | null; // a specific date, or null when it's a weekly-recurring menu
  weekday: number | null; // 0=Sun..6=Sat for a recurring weekly menu
  slot: MealSlot;
  description: string;
  pack: number;
}

export interface Task {
  id: number;
  person_id: number | null;
  title: string;
  date: string;
  type: TaskType;
  time: string | null;
  done: number;
  status: TaskStatus;
  source: string;
  created_at: string;
}

export interface ClassItem {
  id: number;
  person_id: number | null;
  weekday: number; // 0 = Sunday .. 6 = Saturday
  name: string;
  time: string | null;
}

export interface Grocery {
  id: number;
  name: string;
  quantity: string | null;
  checked: number;
  source: string;
  created_at: string;
}

export interface Media {
  id: number;
  caption: string;
  file_path: string | null;
  task_id: number | null;
  created_at: string;
}

export interface EventItem {
  id: number;
  person_id: number | null; // legacy single owner (kept for back-compat)
  participants?: number[]; // people involved; [] = whole family / general
  date: string;
  title: string;
  time: string | null;
  end_time: string | null;
  status?: TaskStatus; // undefined = confirmed (back-compat with seeded data)
  source?: string;
}

// Participants of an event, tolerant of legacy records that only had person_id.
export function eventParticipants(e: EventItem): number[] {
  if (e.participants && e.participants.length) return e.participants;
  return e.person_id != null ? [e.person_id] : [];
}

export interface EventDraft {
  title: string;
  date: string | null;
  time: string | null;
  person_name: string | null;
}

// A concrete action the extractor proposes; shown in the inbox preview and
// then sent to /api/commit to be created.
export interface PlannedItem {
  kind: "event" | "task" | "bring" | "grocery" | "meal";
  title: string;
  person_name: string | null;
  date: string | null;
  time: string | null;
  weekday?: number | null; // 0=Sun..6=Sat, for weekly items (menu/chores by day)
  slot?: MealSlot | null;
  quantity?: string | null;
}

export interface DashboardState {
  today: string;
  weekday: number;
  summary: string;
  people: Person[];
  meals: Meal[];
  tasks: Task[];
  pending: Task[];
  classes: ClassItem[];
  grocery: Grocery[];
  media: Media[];
  events: EventItem[];
  pendingEvents: EventItem[];
}

import type { StoreData } from "./store";
import { todayStr } from "./date";

// Seeds a realistic Hebrew mock family so the dashboard looks alive on first run.
export function seedInto(store: StoreData): void {
  const today = todayStr();
  let seq = 0;
  const id = () => (seq += 1);
  const nowIso = new Date().toISOString();

  const addPerson = (
    name: string,
    role: "kid" | "parent" | "pet",
    emoji: string,
    color: string,
    sort: number
  ): number => {
    const pid = id();
    store.people.push({ id: pid, name, role, emoji, color, sort });
    return pid;
  };

  const addMeal = (
    person_id: number,
    slot: "breakfast" | "lunch" | "dinner",
    description: string,
    pack: number
  ) => {
    store.meals.push({ id: id(), person_id, date: today, slot, description, pack });
  };

  const addTask = (
    person_id: number | null,
    title: string,
    type: "chore" | "bring" | "task" | "event",
    time: string | null,
    done: number,
    status: "confirmed" | "pending",
    source: string
  ): number => {
    const tid = id();
    store.tasks.push({
      id: tid,
      person_id,
      title,
      date: today,
      type,
      time,
      done,
      status,
      source,
      created_at: nowIso,
    });
    return tid;
  };

  const addClass = (person_id: number, weekday: number, name: string, time: string) => {
    store.classes.push({ id: id(), person_id, weekday, name, time });
  };

  const addGrocery = (name: string, quantity: string | null, checked: number, source: string) => {
    store.grocery.push({ id: id(), name, quantity, checked, source, created_at: nowIso });
  };

  const addMedia = (caption: string, file_path: string | null, task_id: number | null) => {
    store.media.push({ id: id(), caption, file_path, task_id, created_at: nowIso });
  };

  // People
  const maya = addPerson("מאיה", "kid", "👧", "rose", 1);
  const itai = addPerson("איתי", "kid", "👦", "sky", 2);
  const mom = addPerson("אמא (נועה)", "parent", "👩", "violet", 3);
  const dad = addPerson("אבא (דני)", "parent", "👨", "emerald", 4);
  const rex = addPerson("רקס", "pet", "🐕", "amber", 5);

  // Meals for today (kids)
  addMeal(maya, "breakfast", "יוגורט עם פירות וגרנולה", 0);
  addMeal(maya, "lunch", "פסטה ברוטב עגבניות + תפוח", 1);
  addMeal(maya, "dinner", "עוף בתנור עם אורז וסלט", 0);
  addMeal(itai, "breakfast", "חביתה עם לחם מלא", 0);
  addMeal(itai, "lunch", "כריך גבינה צהובה + מלפפון", 1);
  addMeal(itai, "dinner", "עוף בתנור עם אורז וסלט", 0);

  // Chores (kids)
  addTask(maya, "לצחצח שיניים", "chore", null, 1, "confirmed", "seed");
  addTask(maya, "שיעורי בית - חשבון", "chore", null, 0, "confirmed", "seed");
  addTask(maya, "לארוז את התיק לבית הספר", "chore", null, 0, "confirmed", "seed");
  addTask(itai, "שיעורי בית - קריאה", "chore", null, 0, "confirmed", "seed");
  addTask(itai, "לסדר את החדר", "chore", null, 0, "confirmed", "seed");
  addTask(itai, "להאכיל את הדגים", "chore", null, 1, "confirmed", "seed");

  // Bring to school today (kids)
  addTask(maya, "בגדי התעמלות", "bring", null, 0, "confirmed", "seed");
  addTask(maya, "20₪ לקנטינה", "bring", null, 0, "confirmed", "seed");
  addTask(itai, "חלילית", "bring", null, 0, "confirmed", "seed");
  addTask(itai, "סינר לשיעור אמנות", "bring", null, 0, "confirmed", "seed");

  // Parent tasks
  addTask(mom, "לקבוע תור לרופא שיניים", "task", null, 0, "confirmed", "seed");
  addTask(mom, "לקנות מצרכים לשבת", "task", null, 0, "confirmed", "seed");
  addTask(dad, "לשלם על הטיול השנתי - 40₪", "task", null, 0, "confirmed", "seed");
  addTask(dad, "לתקן את האופניים של איתי", "task", null, 0, "confirmed", "seed");

  // Pet tasks (with times)
  addTask(rex, "טיול בוקר", "task", "07:00", 1, "confirmed", "seed");
  addTask(rex, "אוכל לכלב", "task", "18:00", 0, "confirmed", "seed");

  // Weekly classes (weekday: 0=Sunday .. 6=Saturday)
  addClass(maya, 0, "שחייה", "16:00");
  addClass(maya, 2, "פסנתר", "17:00");
  addClass(itai, 1, "קראטה", "16:30");
  addClass(itai, 3, "כדורגל", "17:00");
  addClass(maya, 4, "חוג אמנות", "16:30");

  // Grocery list
  addGrocery("חלב", "2 קרטונים", 0, "manual");
  addGrocery("לחם מלא", null, 0, "manual");
  addGrocery("עוף", '2 ק"ג', 0, "meal");
  addGrocery("אורז", null, 0, "meal");
  addGrocery("ביצים", "תבנית", 1, "meal");
  addGrocery("יוגורט", "6 יחידות", 0, "meal");

  // Photo inbox + pending items that need confirmation
  const trip = addTask(maya, "לחתום ולהחזיר טופס אישור לטיול", "task", null, 0, "pending", "photo");
  addMedia("טופס טיול כיתתי מהמורה", null, trip);
  const costume = addTask(itai, "להכין תחפושת ליום שישי", "task", null, 0, "pending", "photo");
  addMedia("הודעה: יום תחפושות ביום שישי", null, costume);

  // Sample messages log
  store.messages.push({
    id: id(),
    source: "whatsapp",
    sender: "גן ילדים - כיתת מאיה",
    body: "הזכורת: מחר יש להביא בגדי התעמלות ו-20 שקל לקנטינה",
    created_at: nowIso,
  });
  store.messages.push({
    id: id(),
    source: "whatsapp",
    sender: "אמא",
    body: "נגמר לנו החלב, לקנות בסופר",
    created_at: nowIso,
  });

  store._seq = seq;
}

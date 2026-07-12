import type { StoreData } from "./store";

// Seeds the family members only - a clean slate with no mock tasks/meals/etc.
export function seedInto(store: StoreData): void {
  let seq = 0;
  const id = () => (seq += 1);

  const addPerson = (
    name: string,
    role: "kid" | "parent" | "pet",
    emoji: string,
    color: string,
    sort: number
  ): void => {
    store.people.push({ id: id(), name, role, emoji, color, sort });
  };

  addPerson("אבא (שחר)", "parent", "👨", "emerald", 1);
  addPerson("אמא (הילה)", "parent", "👩", "violet", 2);
  addPerson("מאור", "kid", "🧒", "sky", 3);
  addPerson("זיו", "kid", "🧒", "rose", 4);
  addPerson("סהר", "kid", "🧒", "amber", 5);
  addPerson("ג'וי", "pet", "🐾", "slate", 6);

  store._seq = seq;
}

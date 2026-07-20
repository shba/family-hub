import ical from "node-ical";

export interface GEvent {
  title: string;
  date: string; // YYYY-MM-DD (Asia/Jerusalem)
  time: string | null; // HH:MM, null for all-day
  end: string | null;
}

interface Cache {
  at: number;
  url: string;
  events: GEvent[];
}

let cache: Cache | null = null;
const TTL_MS = 10 * 60 * 1000;

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// Reads the user's private Google Calendar ICS feed and returns events in range.
export async function fetchGoogleEvents(days = 90): Promise<GEvent[]> {
  const url = process.env.GOOGLE_ICS_URL?.trim();
  if (!url) return [];

  const now = Date.now();
  if (cache && cache.url === url && now - cache.at < TTL_MS) {
    return filterRange(cache.events, days);
  }

  try {
    const data = await ical.async.fromURL(url);
    const events: GEvent[] = [];
    const horizonStart = new Date(now - 2 * 24 * 3600 * 1000);
    const horizonEnd = new Date(now + 400 * 24 * 3600 * 1000);

    for (const key of Object.keys(data)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ev = (data as any)[key];
      if (!ev || ev.type !== "VEVENT" || !ev.start) continue;

      const allDay = ev.datetype === "date";
      const durationMs =
        ev.end && ev.start ? new Date(ev.end).getTime() - new Date(ev.start).getTime() : 0;

      const pushInstance = (start: Date) => {
        const end = durationMs ? new Date(start.getTime() + durationMs) : null;
        events.push({
          title: String(ev.summary ?? "(ללא כותרת)"),
          date: fmtDate(start),
          time: allDay ? null : fmtTime(start),
          end: allDay || !end ? null : fmtTime(end),
        });
      };

      if (ev.rrule) {
        const dates: Date[] = ev.rrule.between(horizonStart, horizonEnd, true);
        for (const d of dates) pushInstance(new Date(d));
      } else {
        pushInstance(new Date(ev.start));
      }
    }

    cache = { at: now, url, events };
    return filterRange(events, days);
  } catch (err) {
    console.error("[gcal] failed to fetch/parse ICS:", err);
    return cache ? filterRange(cache.events, days) : [];
  }
}

function filterRange(events: GEvent[], days: number): GEvent[] {
  const today = fmtDate(new Date());
  const end = fmtDate(new Date(Date.now() + days * 24 * 3600 * 1000));
  return events
    .filter((e) => e.date >= today && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

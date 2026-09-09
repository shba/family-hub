import ical from "node-ical";

export interface GEvent {
  title: string;
  date: string; // YYYY-MM-DD (Asia/Jerusalem)
  time: string | null; // HH:MM, null for all-day
  end: string | null;
  calendar: string; // which Google calendar it came from
}

interface Source {
  label: string | null; // explicit "Label=url" override
  url: string;
}

const TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

// One entry per calendar so a single unreachable feed can't blank the others.
const cache = new Map<string, { at: number; events: GEvent[] }>();

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

// GOOGLE_ICS_URL holds one or more comma-separated feeds, each optionally
// prefixed with a name:  "משפחה=https://...ics, https://...ics"
function parseSources(raw: string): Source[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      if (/^https?:\/\//i.test(item)) return { label: null, url: item };
      const eq = item.indexOf("=");
      if (eq > 0) return { label: item.slice(0, eq).trim(), url: item.slice(eq + 1).trim() };
      return { label: null, url: item };
    });
}

async function fetchOne(source: Source): Promise<GEvent[]> {
  const now = Date.now();
  const cached = cache.get(source.url);
  if (cached && now - cached.at < TTL_MS) return cached.events;

  try {
    const res = await fetch(source.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    // Google names the feed in the calendar header; use it unless overridden.
    const named = /^X-WR-CALNAME:(.*)$/m.exec(text)?.[1]?.trim();
    const label = source.label || named || "יומן Google";

    const events = parseCalendar(text, label);
    cache.set(source.url, { at: now, events });
    return events;
  } catch (err) {
    console.error(`[gcal] ${source.label ?? source.url}: fetch/parse failed:`, err);
    return cached ? cached.events : []; // stale beats empty
  }
}

function parseCalendar(text: string, calendar: string): GEvent[] {
  const data = ical.parseICS(text);
  const events: GEvent[] = [];
  const now = Date.now();
  const horizonStart = new Date(now - 2 * 24 * 3600 * 1000);
  const horizonEnd = new Date(now + 400 * 24 * 3600 * 1000);

  for (const key of Object.keys(data)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = (data as any)[key];
    if (!ev || ev.type !== "VEVENT" || !ev.start) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushInstance = (start: Date, src: any = ev) => {
      const allDay = src.datetype === "date";
      const durationMs =
        src.end && src.start ? new Date(src.end).getTime() - new Date(src.start).getTime() : 0;
      const end = durationMs ? new Date(start.getTime() + durationMs) : null;
      events.push({
        title: String(src.summary ?? ev.summary ?? "(ללא כותרת)"),
        date: fmtDate(start),
        time: allDay ? null : fmtTime(start),
        end: allDay || !end ? null : fmtTime(end),
        calendar,
      });
    };

    if (ev.rrule) {
      const dates: Date[] = ev.rrule.between(horizonStart, horizonEnd, true);
      for (const d of dates) {
        // node-ical keys deleted (EXDATE) and edited occurrences of a series
        // by the occurrence's UTC date.
        const occKey = d.toISOString().slice(0, 10);
        if (ev.exdate?.[occKey]) continue; // this occurrence was cancelled
        const override = ev.recurrences?.[occKey];
        if (override?.start) pushInstance(new Date(override.start), override);
        else pushInstance(new Date(d));
      }
    } else {
      pushInstance(new Date(ev.start));
    }
  }

  return events;
}

// Reads every configured Google Calendar ICS feed and returns events in range.
export async function fetchGoogleEvents(days = 90): Promise<GEvent[]> {
  const raw = process.env.GOOGLE_ICS_URL?.trim();
  if (!raw) return [];

  const perSource = await Promise.all(parseSources(raw).map(fetchOne));
  return filterRange(perSource.flat(), days);
}

function filterRange(events: GEvent[], days: number): GEvent[] {
  const today = fmtDate(new Date());
  const end = fmtDate(new Date(Date.now() + days * 24 * 3600 * 1000));
  return events
    .filter((e) => e.date >= today && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

import { NextRequest, NextResponse } from "next/server";
import { getCalendarItems } from "@/lib/queries";
import { eventParticipants } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publishes all family events + dated tasks as an iCalendar (ICS) feed so it can
// be subscribed to in Google Calendar (Add calendar -> From URL). Guarded by a
// token query param since the feed URL is fetched without auth headers.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.CALENDAR_TOKEN || process.env.API_TOKEN;
  if (!expected || token !== expected) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const { events, tasks, people } = getCalendarItems();
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Hub//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:מרכז המשפחה",
    "X-WR-TIMEZONE:Asia/Jerusalem",
  ];

  const stamp = icsStamp(new Date());

  for (const e of events) {
    const parts = eventParticipants(e)
      .map((id) => nameById.get(id))
      .filter(Boolean);
    const summary = parts.length ? `${e.title} (${parts.join(", ")})` : e.title;
    lines.push(...vevent(`evt-${e.id}@familyhub`, stamp, e.date, e.time, e.end_time, summary));
  }

  for (const t of tasks) {
    const who = t.person_id ? nameById.get(t.person_id) : null;
    const summary = who ? `${t.title} (${who})` : t.title;
    lines.push(...vevent(`task-${t.id}@familyhub`, stamp, t.date, t.time, null, summary));
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="family-hub.ics"',
    },
  });
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, " ");
}

function ymd(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function addOneDayYmd(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function icsStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(
    d.getUTCMinutes()
  )}${p(d.getUTCSeconds())}Z`;
}

function vevent(
  uid: string,
  stamp: string,
  date: string | null,
  time: string | null,
  endTime: string | null,
  summary: string
): string[] {
  if (!date) return [];
  const out = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(summary)}`];

  if (time) {
    const [h, m] = time.split(":");
    const start = `${ymd(date)}T${(h || "00").padStart(2, "0")}${(m || "00").padStart(2, "0")}00`;
    let end: string;
    if (endTime) {
      const [eh, em] = endTime.split(":");
      end = `${ymd(date)}T${(eh || "00").padStart(2, "0")}${(em || "00").padStart(2, "0")}00`;
    } else {
      const [hh, mm] = time.split(":").map((x) => parseInt(x, 10));
      const endH = String((hh + 1) % 24).padStart(2, "0");
      end = `${ymd(date)}T${endH}${String(mm).padStart(2, "0")}00`;
    }
    // Floating local time (interpreted in the calendar's timezone).
    out.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else {
    out.push(`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${addOneDayYmd(date)}`);
  }

  out.push("END:VEVENT");
  return out;
}

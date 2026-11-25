export type CalEvent = {
  uid: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM local time. Omit for an all-day event. */
  time?: string;
  durationMin?: number;
  title: string;
  description?: string;
  /** Pop up an alert at the start time. */
  alarm?: boolean;
};

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\;").replace(/,/g, "\\,");

/** Lines longer than 75 characters are continued on the next line, which starts with a space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

const compactDate = (d: string) => d.replace(/-/g, "");
const compactTime = (t: string) => `${t.replace(":", "")}00`;

function addMinutes(date: string, time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m + minutes));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
}

/** An iCalendar file. Times are "floating" (no zone), so they show at that clock time wherever your phone is. */
export function buildCalendar(events: CalEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Body IQ//Training plan//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Body IQ training"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@body-iq`, `DTSTAMP:${stamp}`);
    if (e.time) {
      lines.push(`DTSTART:${compactDate(e.date)}T${compactTime(e.time)}`, `DTEND:${addMinutes(e.date, e.time, e.durationMin ?? 60)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.alarm) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "TRIGGER:PT0S", "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** "07:00" style times only. */
export const isClock = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

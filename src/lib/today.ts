import { cookies } from "next/headers";

/** The viewer's timezone, synced from the browser into a `tz` cookie. Falls back to UTC. */
export async function getTimeZone(): Promise<string> {
  const value = (await cookies()).get("tz")?.value;
  if (value) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return value;
    } catch {
      // invalid zone name; fall through
    }
  }
  return "UTC";
}

export function dateInTimeZone(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Today's date (YYYY-MM-DD) in the viewer's timezone. */
export async function getToday(): Promise<string> {
  return dateInTimeZone(await getTimeZone());
}

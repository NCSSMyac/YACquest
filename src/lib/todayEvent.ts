/**
 * "📅 Today: Pickleball at 2:00 PM · Check in" — the event the signed-in person RSVP'd to that happens
 * today (America/New_York) and that they haven't checked in to yet. Pure helpers (unit tested).
 */
export const QUEST_TZ = 'America/New_York';

/** 'YYYY-MM-DD' of an instant, in Eastern time. */
export function nyDayKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: QUEST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** "2:00 PM" (Eastern time, like the reminder email). */
export function fmtEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: QUEST_TZ, hour: 'numeric', minute: '2-digit' });
}

export interface TodayCandidate {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  checkInGraceMinutes: number;
  myRsvp?: boolean;
  checkedIn?: boolean;
}

/** The soonest RSVP'd event that starts today (Eastern) — or is open right now — and isn't checked in or closed. */
export function todayRsvpEvent<E extends TodayCandidate>(events: readonly E[] | null | undefined, now: number): E | null {
  const today = nyDayKey(now);
  const hits = (events ?? []).filter((e) => {
    if (!e.myRsvp || e.checkedIn) return false;
    const start = new Date(e.startsAt).getTime();
    const closes = new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60_000;
    if (now > closes) return false;
    return nyDayKey(start) === today || now >= start;
  });
  hits.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return hits[0] ?? null;
}

/** RSVP reminder title (0024): "⏰ Starts in 1 hour: …", or "in N min" if the event was made less than ~45 min ahead. */
export function reminderTitle(e: { title: string; location: string }, minutesLeft: number): string {
  const when = minutesLeft >= 45 ? '1 hour' : `${Math.max(1, Math.round(minutesLeft))} min`;
  return `⏰ Starts in ${when}: ${e.title} at ${e.location}`;
}

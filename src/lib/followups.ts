/**
 * 0026: automatic follow-up after an event (texts shared by the mock API and the tests; the database
 * builds the same sentences in send_followup_for_event()). Pure helpers.
 */
import { QUEST_TZ, fmtEventTime } from './todayEvent';

/** The automatic run only follows up events whose check-in closed within this many days. Older ones: staff press "Send follow-up now". */
export const FOLLOWUP_LOOKBACK_DAYS = 3;

export interface FollowupEvent {
  id: string;
  title: string;
  campus: string;
  location: string;
  startsAt: string;
  endsAt: string;
  checkInGraceMinutes: number;
}

/** When check-in closes (ends_at + grace), in ms. */
export const checkInClosesAt = (e: Pick<FollowupEvent, 'endsAt' | 'checkInGraceMinutes'>) =>
  new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60_000;

/** Due for the automatic follow-up at `now`: closed, but not more than FOLLOWUP_LOOKBACK_DAYS ago. */
export function followupDue(e: Pick<FollowupEvent, 'endsAt' | 'checkInGraceMinutes'>, now: number): boolean {
  const closes = checkInClosesAt(e);
  return closes <= now && closes > now - FOLLOWUP_LOOKBACK_DAYS * 86_400_000;
}

/** "Sat, Nov 21 at 6:00 PM" (Eastern). */
export function followupWhen(iso: string): string {
  const day = new Date(iso).toLocaleDateString('en-US', { timeZone: QUEST_TZ, weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} at ${fmtEventTime(iso)}`;
}

export const thanksTitle = (title: string) => `Thanks for coming to ${title}! 🐂`;

/**
 * 0030: the in-app survey comes first (`#/survey/<id>` becomes a "Rate this event" button in Notifications);
 * an event's external survey link is still mentioned for the separate "Complete a Feedback Survey" screenshot quest.
 */
export function thanksBody(eventId: string, surveyUrl: string | undefined | null, questTitle: string, points: number, surveyPoints: number): string {
  const inApp = `How was it? Rate it in the app for +${surveyPoints} points (takes a minute): #/survey/${eventId}`;
  return surveyUrl
    ? `${inApp} Or fill out the YAC survey here: ${surveyUrl} It counts as the “${questTitle}” digital quest: send a screenshot of the confirmation in Quests for ${points} points.`
    : inApp;
}

export const missedTitle = (title: string) => `Sorry we missed you at ${title}`;

export function missedBody(next: Pick<FollowupEvent, 'title' | 'startsAt' | 'location'> | null | undefined): string {
  return next
    ? `Hope to see you next time! Next up: ${next.title} — ${followupWhen(next.startsAt)} at ${next.location}. RSVP in Quests.`
    : 'Hope to see you next time! New events show up in Quests.';
}

/** The next event for someone at `campus`: soonest one at their campus or all campuses, else the soonest of any. */
export function nextEventFor<E extends Pick<FollowupEvent, 'id' | 'campus' | 'startsAt'>>(events: readonly E[], campus: string, now: number, excludeId?: string): E | null {
  const upcoming = events
    .filter((e) => e.id !== excludeId && new Date(e.startsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return upcoming.find((e) => e.campus === campus || e.campus === 'all') ?? upcoming[0] ?? null;
}

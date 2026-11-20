/**
 * 0038 announcement safeguards: the weekly cap on all-member announcement emails, the recipient count,
 * and the cancel window. Wording + small pure helpers for Admin → Announce, shared with the demo backend
 * (src/api/mock.ts). The server (supabase/migrations/0038_announcement_safeguards.sql) uses the same words.
 * Unit tested in src/__tests__/announceSafeguards.test.ts.
 */
import type { Announcement, AnnouncementAudience, AnnouncementEmailCap, AnnouncementSendResult, AudienceCount, AudienceEmailReason } from '../types';

/** Defaults of app_config.announce_all_email_weekly_cap / announce_email_hold_minutes. */
export const ANNOUNCE_DEFAULTS = { weeklyCap: 3, holdMinutes: 10 } as const;
/** Allowed ranges (same checks as set_announcement_email_settings). */
export const ANNOUNCE_LIMITS = { weeklyCapMax: 20, holdMinutesMax: 60 } as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The refusal when the week's all-member emails are used up (word for word the server's announce_cap_message). */
export function capReachedMessage(cap: number): string {
  if (cap <= 0) return 'All-member announcement emails are turned off (weekly limit 0). You can still post it in the app, or send the email to one campus.';
  return `${cap} all-member announcement email${cap === 1 ? ' has' : 's have'} already gone out this week (resets Monday). You can still post it in the app, or send the email to one campus.`;
}

/** "2 of 3 all-member emails left this week (resets Monday)". */
export function capLine(c: Pick<AnnouncementEmailCap, 'cap' | 'left'>): string {
  return `${c.left} of ${c.cap} all-member email${c.cap === 1 ? '' : 's'} left this week (resets Monday)`;
}

/** True when an email to everyone can't be sent this week. */
export const capReached = (c: Pick<AnnouncementEmailCap, 'left'> | null | undefined) => !!c && c.left <= 0;

export const EMAIL_REASON_TEXT: Record<AudienceEmailReason, string> = {
  emails_off: 'emails off',
  not_confirmed: 'not confirmed',
  bouncing: 'bouncing',
};

/**
 * Who it reaches: "262 people in the app · 241 by email" (email ticked) or "262 people in the app";
 * one person: "1 person · emailed: yes" / "1 person · emailed: no (emails off)".
 */
export function audienceLine(c: AudienceCount, audience: AnnouncementAudience, sendEmail: boolean): string {
  if (audience === 'user') {
    if (!sendEmail) return '1 person in the app';
    return `1 person · emailed: ${c.email > 0 ? 'yes' : `no${c.emailReason ? ` (${EMAIL_REASON_TEXT[c.emailReason]})` : ''}`}`;
  }
  const inApp = `${plural(c.inApp, 'person', 'people')} in the app`;
  return sendEmail ? `${inApp} · ${c.email} by email` : inApp;
}

/** Whole minutes left until `until` (rounded up, never below 0). */
export function minutesLeft(until: string | undefined, now: Date = new Date()): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / 60_000));
}

/** The cancel window is open for this announcement and the caller may use it. */
export function cancelOpen(a: Pick<Announcement, 'canCancel' | 'cancelledAt' | 'emailHoldUntil' | 'emailsStarted'>, now: Date = new Date()): boolean {
  return !!a.canCancel && !a.cancelledAt && !a.emailsStarted && minutesLeft(a.emailHoldUntil, now) > 0;
}

/** "Cancel · 8 min left". */
export const cancelLabel = (until: string | undefined, now: Date = new Date()) => `Cancel · ${minutesLeft(until, now)} min left`;

/**
 * The status line under an announcement in "Recently sent" (null = nothing to add):
 * "Cancelled by Iesha L." · "Already sending — can’t cancel" · "Emails go out in 8 min" (someone else's, window open).
 */
export function recentStatus(a: Announcement, now: Date = new Date()): string | null {
  if (a.cancelledAt) return `Cancelled by ${a.cancelledByName ?? 'staff'}`;
  const open = minutesLeft(a.emailHoldUntil, now) > 0;
  if (!a.sendEmail || !open) return null;
  if (a.emailsStarted) return 'Already sending — can’t cancel';
  if (!a.canCancel) return `Emails go out in ${minutesLeft(a.emailHoldUntil, now)} min`;
  return null;
}

/** The toast after sending. With a cancel window: "Sent to the app. Emails go out in 10 minutes — you can cancel until then." */
export function sentMessage(r: AnnouncementSendResult): string {
  if (r.emailHoldUntil && r.holdMinutes) return `Sent to the app. Emails go out in ${plural(r.holdMinutes, 'minute', 'minutes')} — you can cancel until then.`;
  return `Sent to ${plural(r.recipients, 'person', 'people')}${r.emailed ? ` · emailed ${r.emailed}` : ''}`;
}

/** The confirm dialog's note about the window. */
export function confirmWindowNote(holdMinutes: number): string {
  return holdMinutes > 0
    ? `Emails wait ${plural(holdMinutes, 'minute', 'minutes')} before they go out. Until then you can cancel it in “Recently sent” (that also removes it from the app).`
    : 'Emails start going out right away.';
}

// ───────────── the week (Monday 00:00 → Sunday 23:59, America/New_York) ─────────────

/** UTC offset of New York at that instant, in minutes (−300 in winter, −240 in summer). */
function nyOffsetMinutes(d: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}

/** Midnight New York time on that calendar date (y, m 1-based, d may overflow). */
function nyMidnight(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const first = new Date(guess.getTime() - nyOffsetMinutes(guess) * 60_000);
  // the offset at midnight itself can differ from the guess (DST changes happen at 2 AM, so one correction is enough)
  return new Date(guess.getTime() - nyOffsetMinutes(first) * 60_000);
}

/** Monday 00:00 New York of the week containing `now` (same as SQL announce_week_start). */
export function weekStartNewYork(now: Date = new Date()): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  return nyMidnight(+p.year, +p.month, +p.day - back);
}

/** The next Monday 00:00 New York (same as SQL announce_week_end; DST-safe). */
export function weekEndNewYork(now: Date = new Date()): Date {
  const start = weekStartNewYork(now);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(start).map((x) => [x.type, x.value]),
  );
  return nyMidnight(+p.year, +p.month, +p.day + 7);
}

/** Counts toward the cap: to everyone, with email, emailed someone, not cancelled, inside this week. */
export function countsTowardCap(a: Pick<Announcement, 'audience' | 'sendEmail' | 'emailCount' | 'cancelledAt' | 'createdAt'>, now: Date = new Date()): boolean {
  const t = new Date(a.createdAt).getTime();
  return a.audience === 'all' && a.sendEmail && a.emailCount > 0 && !a.cancelledAt
    && t >= weekStartNewYork(now).getTime() && t < weekEndNewYork(now).getTime();
}

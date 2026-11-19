/**
 * Email personalization (0032). Every participant email opens with "Hi {first_name}," and
 * announcements can use fill-ins like {first_name} or {points_to_goal}. The database fills them in
 * per recipient when the email is queued (public.email_fill_values / public.email_fill in
 * supabase/migrations/0032_email_personalization_tracking.sql); this file is the same logic for the
 * Announce composer's live preview and the demo backend. Unit tested in
 * src/__tests__/emailPersonalization.test.ts (including the SQL ↔ TS checks).
 */
import { PRIZE, campusName, type CampusId } from '../config';
import { campusPun } from './campusPuns';
import { nextCheckpoint } from './checkpoints';

export type FillInToken =
  | 'first_name'
  | 'name'
  | 'campus'
  | 'campus_pun'
  | 'points'
  | 'points_to_goal'
  | 'next_stop'
  | 'next_event'
  | 'friend_code';

/** The Insert ▾ menu, in order. `hint` shows under the label. */
export const FILL_INS: { token: FillInToken; label: string; hint: string }[] = [
  { token: 'first_name', label: 'First name', hint: 'Ava (or “friend”)' },
  { token: 'name', label: 'Display name', hint: 'Ava B.' },
  { token: 'campus', label: 'Campus', hint: 'Duke / UNC / NC State' },
  { token: 'campus_pun', label: 'Campus pun', hint: 'A rotating line for their campus' },
  { token: 'points', label: 'Points', hint: 'Their points this cycle' },
  { token: 'points_to_goal', label: 'Points to the prize', hint: `Points left to ${PRIZE.goal}` },
  { token: 'next_stop', label: 'Next map stop', hint: 'Camp (100 pts)' },
  { token: 'next_event', label: 'Next event', hint: 'Title + date, or “the next YAC event”' },
  { token: 'friend_code', label: 'Friend code', hint: 'YAC-AB12' },
];

const KNOWN = new Set<string>(FILL_INS.map((f) => f.token));
export const isFillIn = (token: string) => KNOWN.has(token);

/** Same pattern as the SQL: {letters_and_underscores}. */
const TOKEN_RE = /\{([A-Za-z_]+)\}/g;

/** Every {token} in the text that isn't a known fill-in (template leftovers like {event} or typos like {frist_name}). */
export function unknownFillIns(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) if (!KNOWN.has(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Known fill-ins used in the text, in order, without duplicates. */
export function usedFillIns(text: string): FillInToken[] {
  const out: FillInToken[] = [];
  for (const m of text.matchAll(TOKEN_RE)) if (KNOWN.has(m[1]) && !out.includes(m[1] as FillInToken)) out.push(m[1] as FillInToken);
  return out;
}

export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** First word of the display name ("Alice A." → "Alice"); null when there's nothing usable. Mirrors SQL email_first_name(). */
export function firstName(displayName: string | null | undefined): string | null {
  const w = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
  return w ? w : null;
}

/** "Hi Ava," — or "Hi there," without a name. */
export function greetingLine(displayName: string | null | undefined): string {
  const f = firstName(displayName);
  return f ? `Hi ${f},` : 'Hi there,';
}

/** "Camp (100 pts)"; past the goal: "the treasure (you made it!)". Mirrors SQL email_next_stop(). */
export function nextStopFill(points: number, goal: number = PRIZE.goal): string {
  const c = nextCheckpoint(points, goal);
  return c ? `${c.label} (${c.points} pts)` : 'the treasure (you made it!)';
}

/** "Sat, Nov 21" in New York time (SQL: to_char(… at time zone 'America/New_York', 'Dy, Mon FMDD')). */
export function shortEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
}

export interface FillEvent {
  title: string;
  campus: CampusId | 'all';
  startsAt: string;
}

/** The person's next event (their campus or all campuses): "Board Game Night (Sat, Nov 21)". Mirrors SQL email_next_event(). */
export function nextEventFill(events: readonly FillEvent[], campus: CampusId | undefined, now: Date = new Date()): string {
  const t = now.getTime();
  const next = events
    .filter((e) => new Date(e.startsAt).getTime() > t && (e.campus === 'all' || e.campus === campus))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  return next ? `${next.title} (${shortEventDate(next.startsAt)})` : 'the next YAC event';
}

export interface FillPerson {
  displayName?: string;
  campus?: CampusId;
  points?: number;
  friendCode?: string;
}

export interface FillContext {
  goal?: number;
  events?: readonly FillEvent[];
  now?: Date;
  /** Picks the campus pun: the announcement id in the database. */
  seedKey?: string;
}

/** Values for every fill-in for one person. Mirrors SQL email_fill_values(). */
export function fillValues(p: FillPerson, ctx: FillContext = {}): Record<FillInToken, string> {
  const goal = ctx.goal ?? PRIZE.goal;
  const points = Math.max(0, Math.round(p.points ?? 0));
  return {
    first_name: firstName(p.displayName) ?? 'friend',
    name: (p.displayName ?? '').trim() || 'friend',
    campus: p.campus ? campusName(p.campus) : 'your campus',
    campus_pun: campusPun(p.campus, ctx.seedKey ?? ''),
    points: String(points),
    points_to_goal: String(Math.max(0, goal - points)),
    next_stop: nextStopFill(points, goal),
    next_event: nextEventFill(ctx.events ?? [], p.campus, ctx.now),
    friend_code: p.friendCode ?? '',
  };
}

/** Replaces known {tokens}; unknown ones stay as typed. `html: true` escapes the values. Mirrors SQL email_fill(). */
export function renderFillIns(text: string, values: Record<FillInToken, string>, opts: { html?: boolean } = {}): string {
  return text.replace(TOKEN_RE, (whole, key: string) => {
    if (!KNOWN.has(key)) return whole;
    const v = values[key as FillInToken];
    return opts.html ? escapeHtml(v) : v;
  });
}

/** A made-up person for the composer preview when no one is picked. */
export const SAMPLE_PERSON: Required<FillPerson> = { displayName: 'Ava B.', campus: 'duke', points: 120, friendCode: 'YAC-7KQ2' };

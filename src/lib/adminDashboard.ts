/**
 * Pure helpers for the admin dashboard (/admin). Unit tested in src/__tests__/adminDashboard.test.ts.
 */
import type { GlyphName } from '../components/PixelGlyph';

/** "Good morning" / "Good afternoon" / "Good evening" / "Hello, night owl" by local hour (0–23). */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Hello, night owl';
}

/**
 * What to call someone in the greeting: their first word ("Iesha L." → "Iesha"), unless that word is
 * a short all-caps tag like "YAC" (then the whole name, "YAC Helper").
 */
export function greetingName(displayName: string | undefined | null): string {
  const name = (displayName ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return 'adventurer';
  const first = name.split(' ')[0];
  if (first.length <= 3 && first === first.toUpperCase() && /[A-Z]/.test(first) && name.includes(' ')) return name;
  return first;
}

export type TodoItem = { id: string; glyph: GlyphName; count: number; text: string; to: string };

export interface TodoInput {
  isChair: boolean;
  pendingReviews?: number;
  newFeedback?: number;
  /** Prize winners who sent their delivery info and are waiting for their gift card (chairs act on these). */
  prizesToDeliver?: number;
  /** false = no reigning Hero of the Week (chairs crown one). undefined = not loaded yet. */
  hasHero?: boolean;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The "Needs attention" list, most urgent first. Chair-only rows never show to plain admins. Empty = all caught up. */
export function needsAttention(i: TodoInput): TodoItem[] {
  const out: TodoItem[] = [];
  const r = i.pendingReviews ?? 0;
  if (r > 0) out.push({ id: 'review', glyph: 'check', count: r, text: `${plural(r, 'proof', 'proofs')} to review`, to: '/admin/review' });
  const f = i.newFeedback ?? 0;
  if (f > 0) out.push({ id: 'feedback', glyph: 'chat', count: f, text: `new ${plural(f, 'feedback note', 'feedback notes')}`, to: '/admin/feedback' });
  if (i.isChair) {
    const p = i.prizesToDeliver ?? 0;
    if (p > 0) out.push({ id: 'prizes', glyph: 'gift', count: p, text: `${plural(p, 'prize', 'prizes')} ready to deliver`, to: '/admin/prizes' });
    if (i.hasHero === false) out.push({ id: 'hero', glyph: 'crown', count: 1, text: 'Crown this week’s hero', to: '/admin/heroes' });
  }
  return out;
}

export type EventPhase = 'LIVE' | 'Upcoming' | 'Past';

export interface PhaseEvent {
  startsAt: string;
  endsAt: string;
  checkInGraceMinutes: number;
}

/** LIVE from the start until check-in closes (end + grace). */
export function eventPhase(e: PhaseEvent, now: number = Date.now()): EventPhase {
  const s = new Date(e.startsAt).getTime();
  const end = new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60_000;
  return now < s ? 'Upcoming' : now <= end ? 'LIVE' : 'Past';
}

/**
 * The event to feature on the dashboard: the earliest-started LIVE one, else the soonest upcoming one.
 * `othersLive` = how many more are live right now.
 */
export function pickNextEvent<E extends PhaseEvent>(events: readonly E[] | null | undefined, now: number = Date.now()): { event: E; live: boolean; othersLive: number } | null {
  const list = (events ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const live = list.filter((e) => eventPhase(e, now) === 'LIVE');
  if (live.length) return { event: live[0], live: true, othersLive: live.length - 1 };
  const next = list.find((e) => eventPhase(e, now) === 'Upcoming');
  return next ? { event: next, live: false, othersLive: 0 } : null;
}

/** Width (0–100) of a bar for `value` against the biggest value in the set. */
export function barPct(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(4, Math.min(100, Math.round((value / max) * 100)));
}

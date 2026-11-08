/**
 * 0028 Seasonal wardrobe: pure date helpers (America/New_York calendar dates). Unit tested in
 * src/__tests__/seasonalWrapped.test.ts. The server (seasonal_windows, claim_seasonal_items(),
 * equip_look()) is the real gatekeeper; this only drives what the Wardrobe shows.
 */
import { SEASONAL, type SeasonalHoliday, type SeasonalHolidayId } from '../config';
import { COSMETICS, type CosmeticDef } from './cosmetics';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Adds days to a 'YYYY-MM-DD' date (calendar math in UTC so DST never shifts it). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 2nd Monday of October (Indigenous Peoples' Day): 2026 → 2026-10-12, 2027 → 2027-10-11. */
export function secondMondayOfOctober(year: number): string {
  const dow = new Date(Date.UTC(year, 9, 1)).getUTCDay(); // 0 = Sunday … 6 = Saturday
  const firstMonday = 1 + ((8 - dow) % 7);
  return ymd(year, 10, firstMonday + 7);
}

/** 4th Thursday of November (U.S. Thanksgiving): 2026 → 2026-11-26, 2027 → 2027-11-25. */
export function fourthThursdayOfNovember(year: number): string {
  const dow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstThursday = 1 + ((11 - dow) % 7);
  return ymd(year, 11, firstThursday + 21);
}

/** Today's date in New York, 'YYYY-MM-DD'. */
export function nyDate(at: Date | number = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export const holidayById = (id: string): SeasonalHoliday | undefined => SEASONAL.find((h) => h.id === id);

/** The window for a holiday in a year (listed dates first, then its rule), or null. */
export function windowFor(h: SeasonalHoliday, year: number): [string, string] | null {
  if (h.windows[year]) return h.windows[year];
  if (h.rule === 'second_monday_october_pm7') {
    const day = secondMondayOfOctober(year);
    return [addDays(day, -7), addDays(day, 7)];
  }
  return null;
}

/** The window that includes `date` (YYYY-MM-DD), if any. */
export function openWindow(h: SeasonalHoliday, date: string): [string, string] | null {
  const y = Number(date.slice(0, 4));
  for (const year of [y - 1, y, y + 1]) {
    const w = windowFor(h, year);
    if (w && w[0] <= date && date <= w[1]) return w;
  }
  return null;
}

/** The next window that starts after `date`, if one is known. */
export function nextWindow(h: SeasonalHoliday, date: string): [string, string] | null {
  const y = Number(date.slice(0, 4));
  for (const year of [y, y + 1, y + 2]) {
    const w = windowFor(h, year);
    if (w && w[0] > date) return w;
  }
  return null;
}

/** Holidays open on a date (New York), in SEASONAL order. */
export function activeHolidays(at: Date | number = Date.now()): SeasonalHoliday[] {
  const d = nyDate(at);
  return SEASONAL.filter((h) => openWindow(h, d));
}

export const seasonalItems = (holiday?: SeasonalHolidayId | string): CosmeticDef[] =>
  COSMETICS.filter((c) => c.rule.type === 'seasonal' && (!holiday || c.rule.id === holiday));

export const isSeasonal = (id?: string) => !!id && COSMETICS.some((c) => c.id === id && c.rule.type === 'seasonal');

/** Whole days left in a window, counting today (ends today → 1). */
export function daysLeft(endsOn: string, at: Date | number = Date.now()): number {
  const today = nyDate(at);
  const ms = Date.UTC(+endsOn.slice(0, 4), +endsOn.slice(5, 7) - 1, +endsOn.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

/** "Nov 15" for a 'YYYY-MM-DD'. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export type SeasonalState =
  | { kind: 'available'; endsOn: string; daysLeft: number; owned: boolean }
  | { kind: 'owned' }
  | { kind: 'returns'; next: [string, string] | null };

/** What the Wardrobe shows for a holiday: open now ("Limited time!"), owned (yours to keep) or greyed ("Returns next year"). */
export function holidayState(h: SeasonalHoliday, owned: boolean, at: Date | number = Date.now()): SeasonalState {
  const d = nyDate(at);
  const w = openWindow(h, d);
  if (w) return { kind: 'available', endsOn: w[1], daysLeft: daysLeft(w[1], at), owned };
  if (owned) return { kind: 'owned' };
  return { kind: 'returns', next: nextWindow(h, d) };
}

/** "Available until Nov 15 · 8 days left" / "Last day today!" */
export function untilText(endsOn: string, left: number): string {
  if (left <= 1) return 'Last day today!';
  return `Available until ${shortDate(endsOn)} · ${left} days left`;
}

/** "🌽 New limited-time background for Native American Heritage Month — see what it honors" (same text as the server notification). */
export const seasonalNoticeTitle = (h: SeasonalHoliday) => `${h.emoji} New limited-time ${h.noun ?? 'item'} for ${h.name} — see what it honors`;

/** The window used to order the Wardrobe: the open one, else the next one, else the latest listed. */
export function sortWindow(h: SeasonalHoliday, at: Date | number = Date.now()): [string, string] | null {
  const d = nyDate(at);
  return openWindow(h, d) ?? nextWindow(h, d) ?? Object.values(h.windows).sort((a, b) => b[0].localeCompare(a[0]))[0] ?? null;
}

/** Wardrobe order: open now first, then owned, then "Returns next year"; within each, by window start, then name. */
export function seasonalOrder(owns: (h: SeasonalHoliday) => boolean, at: Date | number = Date.now()) {
  const rank = (st: SeasonalState) => (st.kind === 'available' ? 0 : st.kind === 'owned' ? 1 : 2);
  return SEASONAL.map((h) => ({ h, st: holidayState(h, owns(h), at), start: sortWindow(h, at)?.[0] ?? '9999' }))
    .sort((a, b) => rank(a.st) - rank(b.st) || a.start.localeCompare(b.start) || a.h.name.localeCompare(b.h.name));
}

/** Toast after a claim: one line per newly unlocked holiday. */
export function claimToasts(claimed: string[]): string[] {
  const ids = new Set(claimed);
  return SEASONAL.filter((h) => seasonalItems(h.id).some((c) => ids.has(c.id))).map(seasonalNoticeTitle);
}

/** Label for a holiday that isn't open and isn't owned: "Coming soon" when it's later this year, else "Returns next year". */
export function returnsLabel(st: SeasonalState, at: Date | number = Date.now()): string {
  if (st.kind !== 'returns') return '';
  return st.next && st.next[0].slice(0, 4) === nyDate(at).slice(0, 4) ? 'Coming soon' : 'Returns next year';
}

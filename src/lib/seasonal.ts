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

/**
 * "🌽 New limited-time background for Native American Heritage Month — see what it honors" /
 * 0035: "🕎 New limited-time items for Hanukkah — see what they honor" (same text as the server notification).
 */
export const seasonalNoticeTitle = (h: SeasonalHoliday) => {
  const noun = h.noun ?? 'item';
  return `${h.emoji} New limited-time ${noun} for ${h.name} — see what ${noun.endsWith('s') ? 'they honor' : 'it honors'}`;
};

/** The window used to order the Wardrobe: the open one, else the next one, else the latest listed. */
export function sortWindow(h: SeasonalHoliday, at: Date | number = Date.now()): [string, string] | null {
  const d = nyDate(at);
  return openWindow(h, d) ?? nextWindow(h, d) ?? Object.values(h.windows).sort((a, b) => b[0].localeCompare(a[0]))[0] ?? null;
}

/**
 * Wardrobe order: open now first, then owned, then "Returns next year"; within each, by window start, then window
 * end (0036: most winter windows now start Dec 1 together, so the one ending soonest comes first), then name.
 */
export function seasonalOrder(owns: (h: SeasonalHoliday) => boolean, at: Date | number = Date.now()) {
  const rank = (st: SeasonalState) => (st.kind === 'available' ? 0 : st.kind === 'owned' ? 1 : 2);
  return SEASONAL.map((h) => {
    const w = sortWindow(h, at);
    return { h, st: holidayState(h, owns(h), at), start: w?.[0] ?? '9999', end: w?.[1] ?? '9999' };
  }).sort((a, b) => rank(a.st) - rank(b.st) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.h.name.localeCompare(b.h.name));
}

/** Toast after a claim: one line per newly unlocked holiday. */
export function claimToasts(claimed: string[]): string[] {
  const ids = new Set(claimed);
  return SEASONAL.filter((h) => seasonalItems(h.id).some((c) => ids.has(c.id))).map(seasonalNoticeTitle);
}

/**
 * 0036: the toasts the app actually shows. Every winter holiday now opens Dec 1, so the first visit in December
 * unlocks up to 7 holidays at once: more than `max` become one line ("🕎🎄🕯️ New limited-time items for 7 holidays
 * — see what they honor"); the notifications (one per holiday) still list them all.
 */
export function claimToastLines(claimed: string[], max = 2): string[] {
  const ids = new Set(claimed);
  const hs = SEASONAL.filter((h) => seasonalItems(h.id).some((c) => ids.has(c.id)));
  if (hs.length <= max) return hs.map(seasonalNoticeTitle);
  return [`${hs.map((h) => h.emoji).join('')} New limited-time items for ${hs.length} holidays — see what they honor`];
}

/** Days from `from` to `to` (both 'YYYY-MM-DD'). */
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** True when one of the holiday's windows already ended earlier in `date`'s calendar year. */
function endedThisYear(h: SeasonalHoliday, date: string): boolean {
  const y = Number(date.slice(0, 4));
  return [y - 1, y, y + 1].some((yr) => {
    const w = windowFor(h, yr);
    return !!w && w[1] < date && w[1].slice(0, 4) === date.slice(0, 4);
  });
}

/**
 * Label for a holiday that isn't open and isn't owned: "Coming soon" when its next window starts within 100 days,
 * or later this calendar year when this year's window hasn't happened yet; otherwise "Returns next year"
 * ("Returns next winter" for winter holidays). 0036: winter windows start Dec 1, so right after a winter season
 * (e.g. Feb 2027) the next window is in the same calendar year but ~10 months away: that is not "Coming soon".
 * Pass the holiday so the label can tell; without it, the 0035 rule (same year or ≤ 100 days) applies.
 */
export function returnsLabel(st: SeasonalState, at: Date | number = Date.now(), h?: SeasonalHoliday): string {
  if (st.kind !== 'returns') return '';
  const later = h?.season === 'winter' ? 'Returns next winter' : 'Returns next year';
  if (!st.next) return later;
  const today = nyDate(at);
  if (dayDiff(today, st.next[0]) <= 100) return 'Coming soon';
  const sameYear = st.next[0].slice(0, 4) === today.slice(0, 4);
  return sameYear && !(h && endedThisYear(h, today)) ? 'Coming soon' : later;
}

// ───────────── 0035 winter ─────────────

const ZODIAC = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat (also called Sheep or Ram)', 'Monkey', 'Rooster', 'Dog', 'Pig'];

/** Zodiac animal of the lunar year that starts in `year`: 2027 → "Goat (also called Sheep or Ram)", 2028 → "Monkey". */
export const zodiacFor = (year: number) => ZODIAC[(((year - 2020) % 12) + 12) % 12];

/**
 * The year a holiday's open (else next, else latest) window celebrates: the year of its LAST day. 0036: the
 * Lunar New Year window now opens Dec 1, 2026 but celebrates 2027 (Year of the Goat).
 */
export function holidayYear(h: SeasonalHoliday, at: Date | number = Date.now()): number {
  const w = sortWindow(h, at);
  return w ? Number(w[1].slice(0, 4)) : Number(nyDate(at).slice(0, 4));
}

/** About text, with data-driven extras (Lunar New Year: "2027 is the Year of the Goat (also called Sheep or Ram)."). */
export function aboutFor(h: SeasonalHoliday, at: Date | number = Date.now()): string {
  if (!h.zodiac) return h.about;
  const y = holidayYear(h, at);
  return `${h.about} ${y} is the Year of the ${zodiacFor(y)}.`;
}

/**
 * The year on the New Year's Party Hat: the year being welcomed. During a New Year's window (0036: Dec 1 – Jan 7)
 * it is the window's last year (2026–27 window → 2027); otherwise in December → next year, else this year.
 */
export function newYearHatYear(at: Date | number = Date.now()): number {
  const d = nyDate(at);
  const h = holidayById('new_year');
  const w = h && openWindow(h, d);
  if (w) return Number(w[1].slice(0, 4));
  const y = Number(d.slice(0, 4));
  return d.slice(5) >= '12-01' ? y + 1 : y;
}

/** "Winter 2026–27" for a winter holiday (from its open / next window), else ''. */
export function seasonLabel(h: SeasonalHoliday, at: Date | number = Date.now()): string {
  if (h.season !== 'winter') return '';
  const w = sortWindow(h, at);
  if (!w) return '';
  const y = Number(w[0].slice(0, 4));
  const start = Number(w[0].slice(5, 7)) >= 7 ? y : y - 1;
  return `Winter ${start}–${String(start + 1).slice(2)}`;
}

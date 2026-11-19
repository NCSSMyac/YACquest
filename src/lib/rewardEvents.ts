/**
 * 0033 "Brew & Quest" — special limited reward events. Pure helpers (unit tested in
 * src/__tests__/brewAndQuest.test.ts): outfit sets, the admin preset, secret words, countdown text,
 * Coffee Pass validity, the reveal's auto-continue timer, and the small device-side memory that keeps
 * a pass on screen if the network drops right after check-in.
 *
 * The server (supabase/migrations/0033_brew_and_quest.sql) is the real gatekeeper: it hands out pass
 * numbers, keeps the secret word staff-only and decides who owns the outfit.
 */
import { CAMPUSES, type CampusId } from '../config';
import type { CoffeePass, EventReward, YacEvent } from '../types';
import type { EventForm } from './duplicateEvent';

// ───────────── Outfit sets ─────────────

export interface OutfitSet {
  id: string;
  name: string;
  /** Wardrobe ribbon: "LIMITED EDITION · Brew & Quest 2026" */
  edition: string;
  /** Cosmetic ids (src/lib/cosmetics.ts), hat → accessory → background. */
  items: string[];
  about: string;
}

export const OUTFIT_SETS: OutfitSet[] = [
  {
    id: 'latte_night_scholar',
    name: 'Latte Night Scholar',
    edition: 'Brew & Quest 2026',
    items: ['cozy_beanie', 'latte_aplus', 'moonlit_nook'],
    about:
      'Earned by meeting YAC at Brew & Quest, our exam-season coffee tab at NC State, UNC and Duke. Fuel up, study smart, and good luck on finals!',
  },
];

export const outfitSetById = (id?: string) => OUTFIT_SETS.find((s) => s.id === id) ?? OUTFIT_SETS[0];
export const outfitSetOfItem = (itemId: string) => OUTFIT_SETS.find((s) => s.items.includes(itemId));

// ───────────── Admin form: defaults + "Brew & Quest preset" ─────────────

export const DEFAULT_REWARD_ITEM = 'free coffee';
export const DEFAULT_REWARD_MESSAGE = 'First quest: meet us at {venue}! The first {limit} people to meet us get {item} on us ☕';
export const PASS_MINUTES = 30;

export interface BrewPreset {
  id: string;
  label: string;
  campus: CampusId;
  venue: string;
  /** Calendar date (America/New_York). Times aren't known yet: the admin fills them in. */
  date: string;
  limit: number;
}

/** The three exam-season Brew & Quest events (Duke's café isn't picked yet → "TBD"). */
export const BREW_PRESETS: BrewPreset[] = [
  { id: 'ncsu', label: 'NC State · Cup of Joe · Dec 2', campus: 'ncsu', venue: 'Cup of Joe', date: '2026-12-02', limit: 10 },
  { id: 'unc', label: 'UNC Chapel Hill · Epilogue · Dec 3', campus: 'unc', venue: 'Epilogue', date: '2026-12-03', limit: 30 },
  { id: 'duke', label: 'Duke · venue TBD · Dec 5', campus: 'duke', venue: 'TBD', date: '2026-12-05', limit: 6 },
];

/** "Brew & Quest @ Cup of Joe" (Duke while the venue is unknown: "Brew & Quest @ Duke"). */
export function presetTitle(p: Pick<BrewPreset, 'venue' | 'campus'>): string {
  const where = !p.venue.trim() || p.venue.trim().toUpperCase() === 'TBD' ? CAMPUSES.find((c) => c.id === p.campus)?.name ?? 'campus' : p.venue.trim();
  return `Brew & Quest @ ${where}`;
}

const SECRET_WORDS = ['MOCHA', 'LATTE', 'CHAI', 'BREW', 'BEAN', 'FOAM', 'CREMA', 'COCOA', 'HONEY', 'MAPLE', 'TOFFEE', 'CHURRO'];
/** A friendly word for the café to check, like "MOCHA-42". */
export function genSecretWord(rand: () => number = Math.random): string {
  return `${SECRET_WORDS[Math.floor(rand() * SECRET_WORDS.length) % SECRET_WORDS.length]}-${10 + (Math.floor(rand() * 90) % 90)}`;
}

/** Admin → Events → "☕ Brew & Quest preset": fills the form for one campus. Times are unknown: the admin adds them. */
export function applyPreset(f: EventForm, p: BrewPreset): EventForm {
  return {
    ...f,
    title: presetTitle(p),
    campus: p.campus,
    kind: 'active',
    location: p.venue,
    start: '',
    end: '',
    reward: { itemLabel: DEFAULT_REWARD_ITEM, limit: String(p.limit), venue: p.venue, secretWord: f.reward?.secretWord || genSecretWord(), outfitSet: OUTFIT_SETS[0].id, message: DEFAULT_REWARD_MESSAGE },
  };
}

/** Same rules as the server (set_event_reward): null = OK, else the first problem. */
export function rewardInputError(r: { itemLabel: string; limit: number; venue: string; secretWord: string; message: string }): string | null {
  if (!Number.isInteger(r.limit) || r.limit < 1 || r.limit > 500) return 'Limit: a number from 1 to 500.';
  if (r.itemLabel.trim().length > 40) return 'Free item: at most 40 characters.';
  if (r.venue.trim().length > 80) return 'Venue: at most 80 characters.';
  const w = r.secretWord.trim();
  if (w && (w.length < 3 || w.length > 30)) return 'Secret word: 3 to 30 characters.';
  if (!r.message.trim() || r.message.trim().length > 300) return 'Countdown message: 1 to 300 characters.';
  return null;
}

// ───────────── Countdown banner text ─────────────

/** "free coffee" → "coffee" (so "get coffee on us" reads naturally). */
export const shortItem = (item: string) => item.trim().replace(/^free\s+/i, '') || item.trim();

/** Fills {venue} {limit} {item} in the countdown message. */
export function fillMessage(template: string, r: Pick<EventReward, 'venue' | 'limit' | 'itemLabel'>): string {
  return template
    .replace(/\{venue\}/g, r.venue.trim() || 'TBD')
    .replace(/\{limit\}/g, String(r.limit))
    .replace(/\{item\}/g, shortItem(r.itemLabel));
}

/** "Brew & Quest @ Cup of Joe" → "Brew & Quest" */
export const rewardEventName = (title: string) => title.split(/\s+@\s+/)[0].trim() || title;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Before the start: "1d 3h 12m" · "3h 12m" · "12m 05s" · "45s". */
export function fmtStartsIn(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${pad2(sec)}s`;
  return `${sec}s`;
}

/** During: "1:23:45" (h:mm:ss). */
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

export type RewardPhase = 'before' | 'live' | 'over';

export interface Countdown {
  phase: RewardPhase;
  /** The big line. */
  headline: string;
  /** The filled message (shown under the headline before the start). */
  message: string;
  /** "1d 3h 12m" before, "1:23:45" during, '' after. */
  clock: string;
}

/**
 * Banner text for a special event at `now`:
 *  before: "☕ Brew & Quest starts in 1d 3h 12m" + the message
 *  during: "☕ First quest: meet us at Cup of Joe! The first 10 people to meet us get coffee on us · 1:23:45 left"
 * Never mentions how many passes are left.
 */
export function countdown(e: Pick<YacEvent, 'title' | 'startsAt' | 'endsAt'> & { reward: EventReward }, now: number): Countdown {
  const start = new Date(e.startsAt).getTime();
  const end = new Date(e.endsAt).getTime();
  const message = fillMessage(e.reward.message, e.reward);
  if (now < start) {
    const clock = fmtStartsIn(start - now);
    return { phase: 'before', headline: `☕ ${rewardEventName(e.title)} starts in ${clock}`, message, clock };
  }
  if (now < end) {
    const clock = fmtLeft(end - now);
    const plain = message.replace(/\s*☕\s*$/u, '');
    return { phase: 'live', headline: `☕ ${plain} · ${clock} left`, message: plain, clock };
  }
  return { phase: 'over', headline: '', message, clock: '' };
}

type BannerEvent = Pick<YacEvent, 'id' | 'title' | 'campus' | 'startsAt' | 'endsAt'> & { reward?: EventReward; checkedIn?: boolean };

/**
 * Special events to show a banner for: upcoming or live, not yet checked in. Every campus is shown;
 * the person's own campus (and all-campus events) first, then live before upcoming, then soonest.
 */
export function rewardBanners<E extends BannerEvent>(events: readonly E[] | null | undefined, campus: CampusId | undefined, now: number): (E & { reward: EventReward })[] {
  const list = (events ?? []).filter((e): e is E & { reward: EventReward } => !!e.reward && !e.checkedIn && now < new Date(e.endsAt).getTime());
  const own = (e: E) => (e.campus === campus || e.campus === 'all' ? 0 : 1);
  const live = (e: E) => (now >= new Date(e.startsAt).getTime() ? 0 : 1);
  return list.sort((a, b) => own(a) - own(b) || live(a) - live(b) || a.startsAt.localeCompare(b.startsAt));
}

// ───────────── Coffee Pass ─────────────

export type PassState = 'valid' | 'used' | 'expired';

export function passState(p: Pick<CoffeePass, 'validUntil' | 'usedAt'>, now: number): PassState {
  if (p.usedAt) return 'used';
  return now < new Date(p.validUntil).getTime() ? 'valid' : 'expired';
}

/** validUntil for a check-in time (30 minutes later). */
export const passValidUntil = (checkedInAt: string | Date) => new Date(new Date(checkedInAt).getTime() + PASS_MINUTES * 60_000).toISOString();

/** The pass to offer from Home ("☕ Your Coffee Pass"): newest one still inside its 30 minutes. */
export function homePass(passes: readonly CoffeePass[] | null | undefined, now: number): CoffeePass | null {
  return (passes ?? []).filter((p) => now < new Date(p.validUntil).getTime()).sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))[0] ?? null;
}

export const campusColor = (c: CampusId | 'all') => CAMPUSES.find((x) => x.id === c)?.color ?? '#0b2a5b';

// ───────────── Reveal: "Continue (8)" ─────────────

export const REVEAL_CONTINUE_SECONDS = 8;

/** Whole seconds left on the Continue button (8 → 0); 0 = continue now. */
export function continueLeft(startedAt: number, now: number, total = REVEAL_CONTINUE_SECONDS): number {
  return Math.max(0, Math.min(total, Math.ceil(total - (now - startedAt) / 1000)));
}

/** 1 → 0 as the button drains. */
export function continueFraction(startedAt: number, now: number, total = REVEAL_CONTINUE_SECONDS): number {
  return Math.max(0, Math.min(1, 1 - (now - startedAt) / (total * 1000)));
}

/** "+20 points · new outfit (3 pieces)" (+ "+ Early Bird ☕ badge" for pass holders). */
export function rewardLines(points: number, items: number, earlyBird: boolean): string[] {
  const lines = [`+${points} points · new outfit (${items} ${items === 1 ? 'piece' : 'pieces'})`];
  if (earlyBird) lines.push('+ Early Bird ☕ badge');
  return lines;
}

// ───────────── Device memory (works offline right after check-in) ─────────────

const passKey = (userId: string) => `yacquest-coffee-pass:${userId}`;
const newKey = (userId: string) => `yacquest-new-outfit:${userId}`;
const memory = new Map<string, string>();

function read(store: 'session' | 'local', key: string): string | null {
  try {
    const s = store === 'session' ? sessionStorage : localStorage;
    return s.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
function write(store: 'session' | 'local', key: string, value: string | null) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    const s = store === 'session' ? sessionStorage : localStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* private mode: the in-memory copy still works for this visit */
  }
}

/** Keep the pass for this browser session (sessionStorage + memory). */
export function rememberPass(userId: string, pass: CoffeePass) {
  const others = rememberedPasses(userId).filter((p) => p.eventId !== pass.eventId);
  write('session', passKey(userId), JSON.stringify([pass, ...others].slice(0, 5)));
}

export function rememberedPasses(userId: string): CoffeePass[] {
  try {
    const list = JSON.parse(read('session', passKey(userId)) ?? '[]');
    return Array.isArray(list) ? (list as CoffeePass[]).filter((p) => p && p.eventId && p.validUntil) : [];
  } catch {
    return [];
  }
}

/** Server passes win; a remembered one fills in the secret word if the server copy has none yet (offline). */
export function mergePasses(server: readonly CoffeePass[] | null | undefined, local: readonly CoffeePass[]): CoffeePass[] {
  const out = new Map<string, CoffeePass>();
  for (const p of local) out.set(p.eventId, p);
  for (const p of server ?? []) {
    const l = out.get(p.eventId);
    out.set(p.eventId, { ...p, secretWord: p.secretWord ?? (p.usedAt ? undefined : l?.secretWord), usedAt: p.usedAt ?? l?.usedAt, usedBy: p.usedBy ?? l?.usedBy });
  }
  return [...out.values()].sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt));
}

/** "NEW" alert fallback when the server can't tell (offline / before 0033): item ids on this device. */
export function rememberNewOutfit(userId: string, items: string[]) {
  const cur = localNewOutfit(userId);
  write('local', newKey(userId), JSON.stringify([...new Set([...cur, ...items])]));
}
export function localNewOutfit(userId: string): string[] {
  try {
    const list = JSON.parse(read('local', newKey(userId)) ?? '[]');
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}
export function clearNewOutfit(userId: string) {
  write('local', newKey(userId), null);
}

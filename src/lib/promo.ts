/**
 * 0034 promo helpers (pure; unit tested in src/__tests__/quickstartPromo.test.ts):
 * mystery outfit teaser, live campus scoreboard, bring-a-friend moment, Instagram recap card text,
 * speech-bubble lines and the Finals Study Break quest window + cheer lines.
 */
import { CAMPUSES, CAMPUS_THANKS, CAPS, PROMO, QUEST_WINDOWS, TIER_POINTS, campusName, type CampusId } from '../config';
import { signupLink } from './friends';
import { nyDate } from './seasonal';
import { yakPun } from './yakPuns';
import { OUTFIT_SETS, campaignLabels, isCoffee, myCampusEvents, pluralItem, rewardEventName } from './rewardEvents';
import type { EventRecap, EventReward, RewardScoreboard, RewardTeaser, YacEvent } from '../types';

const DAY = 86_400_000;

// ───────────── Mystery outfit teaser ─────────────

type TeaserEvent = Pick<YacEvent, 'id' | 'title' | 'campus' | 'startsAt' | 'endsAt'> & { reward?: EventReward; checkedIn?: boolean; myRsvp?: boolean };

export interface HomeTeaser {
  outfitSet: string;
  /** "Brew & Quest" */
  name: string;
  emoji: string;
  startsAt: string;
  /** The event to RSVP to: the soonest at my campus (or all-campus) that hasn't started. */
  rsvp?: TeaserEvent;
}

/** Items of an outfit set (OUTFIT_SETS). */
export const setItems = (outfitSet: string) => OUTFIT_SETS.find((s) => s.id === outfitSet)?.items ?? [];

/**
 * Home: the next special series whose next event at my campus (or an all-campus one) starts within
 * PROMO.teaserDays (or is live), unless the player already owns the whole outfit. Other campuses' events
 * are never teased (no campus set → every campus counts).
 */
export function homeTeaser(events: readonly TeaserEvent[] | null | undefined, owned: Iterable<string>, campus: CampusId | undefined, now: number): HomeTeaser | null {
  const have = new Set(owned);
  const open = myCampusEvents(events, campus).filter((e) => e.reward && new Date(e.endsAt).getTime() > now);
  const sets = [...new Set(open.map((e) => e.reward!.outfitSet))];
  const cands = sets
    .map((set) => {
      const evs = open.filter((e) => e.reward!.outfitSet === set).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return { set, evs, first: evs[0] };
    })
    .filter(({ set, first }) => {
      const items = setItems(set);
      if (items.length && items.every((i) => have.has(i))) return false;
      return new Date(first.startsAt).getTime() - now <= PROMO.teaserDays * DAY;
    })
    .sort((a, b) => a.first.startsAt.localeCompare(b.first.startsAt));
  const c = cands[0];
  if (!c) return null;
  const notStarted = c.evs.filter((e) => new Date(e.startsAt).getTime() > now);
  const rsvp = notStarted[0];
  return { outfitSet: c.set, name: rewardEventName(c.first.title), emoji: c.first.reward!.emoji ?? campaignLabels(c.set).emoji, startsAt: c.first.startsAt, rsvp };
}

/** Login / Sign-up: the first anon teaser that starts within the window. */
export function publicTeaser(list: readonly RewardTeaser[] | null | undefined, now: number): RewardTeaser | null {
  return (list ?? []).filter((t) => new Date(t.startsAt).getTime() - now <= PROMO.teaserDays * DAY).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
}

/** "Dec 2" (New York). */
export const shortNyDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });

/** "starts Dec 2" / "starts tomorrow" / "starts today" / "is on now". */
export function startsLabel(iso: string, now: number): string {
  const day = nyDate(new Date(iso));
  const today = nyDate(now);
  if (new Date(iso).getTime() <= now) return 'is on now';
  if (day === today) return 'starts today';
  if (day === nyDate(now + DAY)) return 'starts tomorrow';
  return `starts ${shortNyDate(iso)}`;
}

// ───────────── Live campus scoreboard ─────────────

export interface ScoreRow {
  campus: CampusId;
  name: string;
  color: string;
  count: number;
  /** Bar width 0–100 (of the leader; at least 4 so an empty campus still shows a sliver). */
  pct: number;
}

/** Highest first (ties: Duke, UNC, NC State order), with bar widths. */
export function scoreboardRows(sb: Pick<RewardScoreboard, 'campuses'>): ScoreRow[] {
  const max = Math.max(1, ...sb.campuses.map((c) => c.count));
  const order = (id: CampusId) => CAMPUSES.findIndex((c) => c.id === id);
  return [...sb.campuses]
    .sort((a, b) => b.count - a.count || order(a.campus) - order(b.campus))
    .map((c) => ({ campus: c.campus, name: campusName(c.campus), color: CAMPUSES.find((x) => x.id === c.campus)?.color ?? '#0b2a5b', count: c.count, pct: Math.max(4, Math.round((100 * c.count) / max)) }));
}

/** "UNC 24 · NC State 11 · Duke 7" */
export const scoreboardLine = (sb: Pick<RewardScoreboard, 'campuses'>) => scoreboardRows(sb).map((r) => `${r.name} ${r.count}`).join(' · ');

/** Same window as reward_scoreboard(): 3 days before the first event → 1 day after the last. */
export function seriesWindowOpen(firstStart: string, lastEnd: string, now: number): boolean {
  return now >= new Date(firstStart).getTime() - PROMO.scoreboardDaysBefore * DAY && now <= new Date(lastEnd).getTime() + PROMO.scoreboardDaysAfter * DAY;
}

// ───────────── Bring-a-friend ─────────────

/** Hidden once all friend bonuses are used (3/3). Unknown (offline) → show. */
export const canBringFriend = (used: number | null | undefined) => used == null || used < CAPS.referralsPerCycle;

export function bringFriendText(code: string, base?: string): string {
  return `Come check in with me at YAC! Sign up for YACquest with my code ${code} and we both get +${TIER_POINTS[1]} points when you check in: ${signupLink(code, base)}`;
}

// ───────────── Instagram recap card ─────────────

export interface RecapModel {
  title: string;
  /** "38 adventurers met us at Cup of Joe ☕" */
  headline: string;
  /** "10 free coffees given" (reward events) */
  given?: string;
  dateLine: string;
  thanks: string;
  campus: CampusId | 'all';
  colors: string[];
  emoji: string;
}

export type RecapFormat = 'feed' | 'story';
/** Instagram feed (4:5) and story (9:16). */
export const RECAP_SIZE: Record<RecapFormat, { w: number; h: number }> = { feed: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 } };

export function recapModel(r: EventRecap): RecapModel {
  const emoji = r.reward?.emoji ?? (/coffee|brew|latte|caf[eé]/i.test(r.title) ? '☕' : '✨');
  const who = r.attendees === 1 ? '1 adventurer' : `${r.attendees} adventurers`;
  const where = r.venue?.trim() && r.venue.trim().toUpperCase() !== 'TBD' ? r.venue.trim() : r.campus === 'all' ? 'the Triangle' : campusName(r.campus);
  const colors = r.campus === 'all' ? CAMPUSES.map((c) => c.color) : [CAMPUSES.find((c) => c.id === r.campus)?.color ?? '#0b2a5b'];
  return {
    title: r.title,
    headline: `${who} met us at ${where} ${emoji}`,
    given: r.reward && r.reward.given > 0 ? `${pluralItem(r.reward.itemLabel, r.reward.given)} given` : undefined,
    dateLine: new Date(r.startsAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' }),
    thanks: CAMPUS_THANKS[r.campus] ?? CAMPUS_THANKS.all,
    campus: r.campus,
    colors,
    emoji,
  };
}

// ───────────── Speech bubble ─────────────

export const COFFEE_LINES: readonly string[] = [
  'Caffeinated and finals-ready!',
  'One more chapter… then another latte.',
  'Bean there, aced that!',
  'Study break? Don’t mind if I brew.',
  'Espresso yourself!',
  'A latte love for YAC!',
  'Brew-tiful day for a quest.',
  'Powered by foam and friendship.',
  'Finals? I’ve bean preparing.',
  'Sip, sip, hooray!',
];

/** A short line for the character: coffee lines while wearing a coffee outfit, yak puns otherwise. */
export function speechLine(coffee: boolean, seed: number): string {
  if (coffee) return COFFEE_LINES[Math.abs(Math.floor(seed)) % COFFEE_LINES.length];
  return yakPun(seed);
}

/** Wearing any piece of a coffee set? */
export const wearsCoffee = (look: { hat?: string; accessory?: string; background?: string } | undefined) =>
  !!look && OUTFIT_SETS.some((s) => isCoffee({ outfitSet: s.id }) && [look.hat, look.accessory].some((i) => !!i && s.items.includes(i)));

/** Home avatar taps: speak on the 1st tap, then every 3rd (so it stays a little surprise). */
export const speaksOnTap = (tapCount: number) => tapCount === 1 || (tapCount > 1 && tapCount % 3 === 0);

// ───────────── Finals Study Break (seasonal quest) ─────────────

/** True when the quest has no window, or today (New York) is inside one. */
export function questOpen(activityId: string, at: Date | number = Date.now()): boolean {
  const windows = QUEST_WINDOWS[activityId];
  if (!windows?.length) return true;
  const d = nyDate(at);
  return windows.some(([a, b]) => a <= d && d <= b);
}

export const isSeasonalQuest = (activityId: string) => !!QUEST_WINDOWS[activityId]?.length;

/** The window open now, if any: "until Dec 18". */
export function questWindowEnd(activityId: string, at: Date | number = Date.now()): string | null {
  const d = nyDate(at);
  return QUEST_WINDOWS[activityId]?.find(([a, b]) => a <= d && d <= b)?.[1] ?? null;
}

export const finalsSeason = (at: Date | number = Date.now()) => questOpen('finals_study_break', at) && isSeasonalQuest('finals_study_break');

export const FINALS_CHEERS: readonly string[] = [
  '📚 Finals season: you’ve got this! Hydrate, sleep, repeat.',
  '📚 Deep breath. One page at a time.',
  '📚 Study break reminder: stretch, snack, sparkle.',
  '📚 You’re smarter than this exam thinks. Go get it!',
  '📚 Flashcards today, freedom soon. Hang in there!',
  '📚 Proud of you for showing up. Finals don’t stand a chance.',
];

/** One cheer line per New York day during finals season (null outside it). */
export function finalsCheer(at: Date | number = Date.now()): string | null {
  if (!finalsSeason(at)) return null;
  const d = nyDate(at);
  const n = Number(d.slice(8, 10)) + Number(d.slice(5, 7)) * 31;
  return FINALS_CHEERS[n % FINALS_CHEERS.length];
}

/** Item noun for copy like "free coffee" → "coffee". */
export const itemNoun = (label: string) => label.trim().replace(/^free\s+/i, '') || label.trim();


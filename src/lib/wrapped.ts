/**
 * 0028 YACquest Wrapped: pure helpers (availability, the YAC personality, slide text). Unit tested in
 * src/__tests__/seasonalWrapped.test.ts. Data comes from my_wrapped() (participants: ranks; staff: staff stats,
 * never in percentiles). The share image is drawn by src/lib/wrappedCard.ts (lazy-loaded).
 */
import { CYCLE, WRAPPED, campusName, type CampusId } from '../config';
import type { Role, WrappedData, YacEvent } from '../types';
import { badgeById } from './badges';
import { kindInfo } from './eventKinds';
import { monthName } from './format';
import { yakPun } from './yakPuns';

const DAY = 86_400_000;

/** When Wrapped opens for participants, and the wrap-up window (Home banner, admin End-of-year card). */
export function wrappedWindow(now: number = Date.now(), opensAt: string = WRAPPED.opensAt, end: string = CYCLE.end) {
  const open = Date.parse(opensAt);
  const close = Date.parse(end) + WRAPPED.wrapUpDays * DAY;
  return { open: now >= open, wrapUp: now >= open && now < close, opensAt: open, wrapUpEndsAt: close };
}

/**
 * Can this person open Wrapped right now? Participants and admins once it opens; YACquest Chairs any time
 * (preview); everyone in the browser demo when WRAPPED.mockAlwaysOpen is on. The server checks again.
 */
export function canOpenWrapped(role: Role | undefined, now: number = Date.now(), opts: { mock?: boolean; mockAlwaysOpen?: boolean } = {}): boolean {
  if (!role) return false;
  if (opts.mock && (opts.mockAlwaysOpen ?? WRAPPED.mockAlwaysOpen)) return true;
  return role === 'chair' || wrappedWindow(now).open;
}

export interface Personality {
  id: 'fresh_start' | 'connector' | 'explorer' | 'digital_dynamo' | 'event_regular' | 'storyteller' | 'all_rounder' | 'council_pillar';
  title: string;
  blurb: string;
}

/** "Your YAC personality", from the mix of how someone earned points (first rule that fits wins). */
export function personality(d: Pick<WrappedData, 'role' | 'mix' | 'friendsBrought' | 'earnedBadgeIds' | 'eventsAttended'>): Personality {
  if (d.role !== 'participant') return { id: 'council_pillar', title: 'The Council Pillar', blurb: 'You kept YACquest running so everyone else could quest. Thank you!' };
  const m = d.mix;
  const total = Object.values(m).reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return { id: 'fresh_start', title: 'The Fresh Start', blurb: 'Every legend starts somewhere. Your quest is just beginning!' };
  const share = (n: number) => n / total;
  if (d.friendsBrought >= 2 || share(m.referral) >= 0.3) return { id: 'connector', title: 'The Connector', blurb: 'You brought people together. The herd is bigger because of you.' };
  if (d.earnedBadgeIds.includes('explorer')) return { id: 'explorer', title: 'The Explorer', blurb: 'Duke, UNC, NC State: you quested across campuses.' };
  if (share(m.digital) >= 0.4) return { id: 'digital_dynamo', title: 'The Digital Dynamo', blurb: 'Likes, shares and screenshots: you kept YAC buzzing online.' };
  if (share(m.event) >= 0.5 && d.eventsAttended >= 2) return { id: 'event_regular', title: 'The Event Regular', blurb: 'If there was a YAC event, you were there.' };
  if (share(m.photos) >= 0.3) return { id: 'storyteller', title: 'The Storyteller', blurb: 'Your photos told the story of the year.' };
  return { id: 'all_rounder', title: 'The All-Rounder', blurb: 'A little of everything: the true YACquest spirit.' };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const campusText = (c: CampusId | 'all' | null) => (c === 'all' ? 'Cross-campus events' : c ? campusName(c) : null);
export const kindText = (k: YacEvent['kind'] | null) => (k ? kindInfo(k).label : null);

export interface Slide {
  id: 'intro' | 'points' | 'events' | 'badges' | 'streak' | 'rank' | 'staff' | 'personality' | 'share';
  eyebrow: string;
  big?: string;
  label?: string;
  lines: string[];
  /** Badge icon to show (rarest badge). */
  badgeId?: string;
}

/** The story, in order (7 for participants and staff + the share slide = 8). */
export function wrappedSlides(d: WrappedData): Slide[] {
  const staff = d.role !== 'participant';
  const slides: Slide[] = [
    { id: 'intro', eyebrow: d.cycleName.replace(/ Pilot$/, ''), big: 'YACquest Wrapped', lines: [`Hey ${d.displayName}! Let’s look back at your year of questing.`] },
    {
      id: 'points',
      eyebrow: 'This year you earned',
      big: d.points.toLocaleString(),
      label: d.points === 1 ? 'point' : 'points',
      lines: d.bestMonth ? [`Your best month: ${monthName(d.bestMonth.month)} (+${d.bestMonth.points})`] : ['Your first points are waiting at the next event!'],
    },
    {
      id: 'events',
      eyebrow: 'You showed up to',
      big: String(d.eventsAttended),
      label: d.eventsAttended === 1 ? 'event' : 'events',
      lines: [
        ...(campusText(d.favoriteCampus) ? [`Favorite campus: ${campusText(d.favoriteCampus)}`] : []),
        ...(kindText(d.favoriteKind) ? [`Mostly: ${kindText(d.favoriteKind)}`] : []),
        ...(d.eventsAttended === 0 ? ['Next year, come say hi at an event!'] : []),
      ],
    },
    {
      id: 'badges',
      eyebrow: 'Badges collected',
      big: `${d.badgesEarned}/${d.badgeTotal}`,
      label: 'badges',
      badgeId: d.rarestBadge?.id,
      lines: d.rarestBadge
        ? [`Your rarest: ${badgeById(d.rarestBadge.id)?.name ?? d.rarestBadge.id}`, `Only ${d.rarestBadge.pct}% of players have it!`]
        : staff && d.staff
          ? [`Plus ${plural(d.staff.councilBadges, 'Council badge')}`]
          : ['Badges are waiting for you next year!'],
    },
    {
      id: 'streak',
      eyebrow: 'Your quest highlights',
      lines: [
        d.bestStreak > 0 ? `🔥 Longest streak: ${plural(d.bestStreak, 'month')} in a row` : '🔥 Check in two months in a row to start a streak',
        d.friendsBrought > 0 ? `🤝 Friends you brought: ${d.friendsBrought}` : '🤝 Bring a friend next year: you both get points',
        ...(d.monthWins > 0 ? [`⭐ Adventurer of the Month ${d.monthWins > 1 ? `×${d.monthWins}` : 'winner'}`] : []),
      ],
    },
  ];
  if (staff && d.staff) {
    slides.push({
      id: 'staff',
      eyebrow: 'Behind the scenes',
      big: String(d.staff.reviews),
      label: d.staff.reviews === 1 ? 'proof reviewed' : 'proofs reviewed',
      lines: [
        `📅 ${plural(d.staff.eventsHosted, 'event')} created${d.staff.checkinsAtHosted ? ` · ${d.staff.checkinsAtHosted} check-ins` : ''}`,
        `📣 ${plural(d.staff.announcements, 'announcement')} sent`,
        d.staff.heroCrowns > 0 ? `🦸 Hero of the Week ×${d.staff.heroCrowns}` : '🦸 Thanks for being on the Council!',
      ],
    });
  } else {
    slides.push({
      id: 'rank',
      eyebrow: 'Out of every adventurer',
      big: `Top ${d.topPctOverall ?? 100}%`,
      label: d.rankOverall ? `Rank ${d.rankOverall} of ${d.participants}` : '',
      lines: [`#${d.rankCampus ?? '-'} at ${campusName(d.campus)} (top ${d.topPctCampus ?? 100}%)`],
    });
  }
  const p = personality(d);
  slides.push({ id: 'personality', eyebrow: 'Your YAC personality', big: p.title, lines: [p.blurb] });
  slides.push({ id: 'share', eyebrow: 'That’s a wrap!', big: 'Share your year', lines: [`“${wrappedPun(d)}”`] });
  return slides;
}

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
export const wrappedPun = (d: Pick<WrappedData, 'handle' | 'displayName'>) => yakPun(hash(`wrapped:${d.handle || d.displayName}`));

/** Tiles on the share image (participants: rank; staff: staff stats). */
export function wrappedTiles(d: WrappedData): { value: string; label: string }[] {
  const tiles = [
    { value: d.points.toLocaleString(), label: 'POINTS' },
    { value: String(d.eventsAttended), label: d.eventsAttended === 1 ? 'EVENT' : 'EVENTS' },
    { value: `${d.badgesEarned}/${d.badgeTotal}`, label: 'BADGES' },
    { value: `${d.bestStreak} ${d.bestStreak === 1 ? 'MO' : 'MOS'}`, label: 'BEST STREAK' },
  ];
  if (d.role !== 'participant' && d.staff) {
    tiles.push({ value: String(d.staff.reviews), label: 'REVIEWS' }, { value: String(d.staff.eventsHosted), label: 'EVENTS HOSTED' });
  } else {
    // (Silkscreen's "%" and "#" don't read well at this size, so the percent goes in the label.)
    tiles.push({ value: String(d.friendsBrought), label: d.friendsBrought === 1 ? 'FRIEND BROUGHT' : 'FRIENDS BROUGHT' }, { value: String(d.rankOverall ?? '-'), label: `RANK · TOP ${d.topPctOverall ?? 100}%` });
  }
  return tiles;
}

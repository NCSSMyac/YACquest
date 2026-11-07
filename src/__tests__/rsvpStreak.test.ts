import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/mock';
import { CYCLE, TIER_POINTS } from '../config';
import { BADGES } from '../lib/badges';
import { BADGE_ART } from '../components/cosmetics/badgeArt';
import { cardModel } from '../lib/questCard';
import type { QuestRecap } from '../types';

// 0022: event RSVPs, monthly check-in streaks (Hot Streak badge), "My Quest Card" recap.
const { load, setSession, addLedger, streakFor, pointsOf } = api.__test;
const userBy = (handle: string) => load().users.find((u) => u.handle === handle)!;
const asUser = (handle: string) => {
  const u = userBy(handle);
  setSession(u.id);
  return u;
};
const eventBy = (title: string) => load().events.find((e) => e.title === title)!;

beforeEach(async () => {
  await api.resetDemoData();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('event RSVPs', () => {
  it('toggles on and off with a going count, idempotently, and no points', async () => {
    const me = asUser('yak001');
    const ev = eventBy('Mentorship Circle');
    const pts = pointsOf(me.id);
    let row = (await api.listEvents('upcoming')).find((e) => e.id === ev.id)!;
    expect(row).toMatchObject({ goingCount: 12, myRsvp: false });
    expect(await api.setRsvp(ev.id, true)).toEqual({ going: true, goingCount: 13 });
    expect(await api.setRsvp(ev.id, true)).toEqual({ going: true, goingCount: 13 });
    row = (await api.listEvents('upcoming')).find((e) => e.id === ev.id)!;
    expect(row).toMatchObject({ goingCount: 13, myRsvp: true });
    expect(await api.setRsvp(ev.id, false)).toEqual({ going: false, goingCount: 12 });
    expect(pointsOf(me.id)).toBe(pts);
  });

  it('closes when the event starts', async () => {
    asUser('yak001');
    const started = eventBy('Study Break Social');
    await expect(api.setRsvp(started.id, true)).rejects.toMatchObject({ code: 'closed' });
    await expect(api.setRsvp(eventBy('Kickoff Mixer').id, false)).rejects.toMatchObject({ code: 'closed' });
    await expect(api.setRsvp('evt_nope', true)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('staff can RSVP too', async () => {
    asUser('iesha');
    expect((await api.setRsvp(eventBy('Winter Service Day').id, true)).goingCount).toBe(28);
  });

  it("who's going is staff-only and shows who came", async () => {
    const ev = eventBy('Mentorship Circle');
    asUser('yak001');
    await api.setRsvp(ev.id, true);
    await expect(api.adminEventRsvps(ev.id)).rejects.toMatchObject({ code: 'forbidden' });
    asUser('admin');
    const rows = await api.adminEventRsvps(ev.id);
    expect(rows.length).toBe(13);
    expect(rows.find((r) => r.handle === 'yak001')).toMatchObject({ campus: 'duke', checkedIn: false, email: 'yak001@example.edu' });
    expect(rows.map((r) => r.rsvpAt)).toEqual([...rows.map((r) => r.rsvpAt)].sort());
    const kickoff = await api.adminEventRsvps(eventBy('Kickoff Mixer').id);
    expect(kickoff.filter((r) => r.checkedIn).map((r) => r.handle)).toEqual(['yak001']);
    const list = await api.adminListEvents();
    expect(list.find((e) => e.title === 'Kickoff Mixer')).toMatchObject({ goingCount: 16, rsvpCame: 1 });
    expect(list.find((e) => e.title === 'Mentorship Circle')).toMatchObject({ goingCount: 13, rsvpCame: 0 });
    await expect(api.adminEventRsvps('evt_nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lists upcoming events in the next 7 days with RSVP counts in the weekly email', async () => {
    asUser('iesha');
    const rep = await api.weeklyReportPreview();
    // 0024 seed: the demo player's Pickleball Meetup (in ~50 min) comes first.
    expect(rep.text).toMatch(/📅 NEXT 7 DAYS \(RSVPs\): Pickleball Meetup \([A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}\) · 1 going; Mentorship Circle \([A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}\) · 12 going/);
    expect(rep.text).not.toContain('Winter Service Day');
    expect(rep.text.indexOf('NEXT 7 DAYS')).toBeLessThan(rep.text.indexOf('THIS WEEK'));
    expect(rep.html).toContain('Next 7 days (RSVPs):</b> <b>Pickleball Meetup</b>');
    expect(rep.html).toContain('<b>Mentorship Circle</b>');
  });
});

describe('monthly check-in streaks', () => {
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  };
  const checkIn = (userId: string, iso: string) =>
    addLedger({ userId, amount: TIER_POINTS[2], source: 'checkin', activityId: 'home_event', refId: `evt_${iso}`, reason: 'test' }, new Date(iso).toISOString());
  const fresh = (handle: string) => {
    const u = userBy(handle);
    load().ledger = load().ledger.filter((l) => !(l.userId === u.id && l.source === 'checkin'));
    return u;
  };

  it('counts Eastern calendar months; this month not yet still counts through last month', () => {
    const u = fresh('alum010');
    at('2027-02-10T12:00:00-05:00');
    expect(streakFor(u.id)).toEqual({ current: 0, best: 0, checkedInThisMonth: false });
    checkIn(u.id, '2026-10-20T19:00:00-04:00');
    checkIn(u.id, '2026-11-05T19:00:00-05:00');
    checkIn(u.id, '2026-12-31T23:30:00-05:00'); // Jan 1 in UTC, December in New York
    expect(streakFor(u.id)).toEqual({ current: 0, best: 3, checkedInThisMonth: false }); // January missed
    checkIn(u.id, '2027-01-15T19:00:00-05:00');
    expect(streakFor(u.id)).toEqual({ current: 4, best: 4, checkedInThisMonth: false }); // keep it going this month
    checkIn(u.id, '2027-02-02T19:00:00-05:00');
    checkIn(u.id, '2027-02-09T19:00:00-05:00');
    expect(streakFor(u.id)).toEqual({ current: 5, best: 5, checkedInThisMonth: true });
  });

  it('a gap resets the current streak', () => {
    const u = fresh('alum011');
    at('2027-01-03T12:00:00-05:00');
    checkIn(u.id, '2026-09-20T19:00:00-04:00');
    checkIn(u.id, '2026-11-05T19:00:00-05:00');
    checkIn(u.id, '2026-12-05T19:00:00-05:00');
    expect(streakFor(u.id)).toEqual({ current: 2, best: 2, checkedInThisMonth: false });
    at('2027-03-01T12:00:00-05:00');
    expect(streakFor(u.id)).toEqual({ current: 0, best: 2, checkedInThisMonth: false });
  });

  it('ignores non-check-in points', () => {
    const u = fresh('alum012');
    at('2027-01-03T12:00:00-05:00');
    addLedger({ userId: u.id, amount: 20, source: 'manual', reason: 'not a check-in' });
    expect(streakFor(u.id).best).toBe(0);
  });

  it('awards Hot Streak at 3 months in a row (progress = best streak)', async () => {
    const u = fresh('alum013');
    setSession(u.id);
    at('2027-01-20T12:00:00-05:00');
    checkIn(u.id, '2026-11-05T19:00:00-05:00');
    checkIn(u.id, '2026-12-05T19:00:00-05:00');
    let hot = (await api.myBadges()).find((b) => b.id === 'hot_streak')!;
    expect(hot).toEqual({ id: 'hot_streak', earned: false, progress: 2, goal: 3 });
    checkIn(u.id, '2027-01-05T19:00:00-05:00');
    hot = (await api.myBadges()).find((b) => b.id === 'hot_streak')!;
    expect(hot).toEqual({ id: 'hot_streak', earned: true, progress: 3, goal: 3 });
    expect(await api.myStreak()).toEqual({ current: 3, best: 3, checkedInThisMonth: true });
  });

  it('has 16 participant badges with flame art', () => {
    expect(BADGES.length).toBe(16);
    expect(BADGES[15]).toMatchObject({ id: 'hot_streak', name: 'Hot Streak' });
    expect(BADGE_ART.hot_streak.symbol.length).toBe(10);
  });

  it('gives the demo player a 2-month streak on the dashboard', async () => {
    asUser('yak001');
    const d = await api.getDashboard();
    expect(d.streak.current).toBe(2);
    expect(d.streak.best).toBe(2);
  });
});

describe('quest card recap', () => {
  it('returns the caller’s own stats (participant: ranks, no Council info)', async () => {
    const me = asUser('yak001');
    expect(api.myRecap.length).toBe(0); // no way to ask for someone else's
    const r = await api.myRecap();
    const d = await api.getDashboard();
    const badges = await api.myBadges();
    expect(r).toMatchObject({
      handle: 'yak001', displayName: me.displayName, campus: 'duke', role: 'participant', avatar: me.avatar,
      points: d.points, rankOverall: d.rankOverall, rankCampus: d.rankCampus, participants: d.participants,
      eventsAttended: 2, bestStreak: 2, currentStreak: 2, badgeTotal: 16, monthWins: 0, cycleEndsAt: CYCLE.end,
    });
    expect(r.earnedBadgeIds).toEqual(badges.filter((b) => b.earned).map((b) => b.id));
    expect(r.badgesEarned).toBe(r.earnedBadgeIds.length);
    expect(r.campusParticipants).toBe(90);
    expect(r.councilBadges).toBeUndefined();
  });

  it('staff cards show Council badges and no rank', async () => {
    asUser('admin');
    const r = await api.myRecap();
    expect(r.role).toBe('admin');
    expect(r.rankOverall).toBeUndefined();
    expect(r.rankCampus).toBeUndefined();
    expect(typeof r.councilBadges).toBe('number');
    const m = cardModel(r);
    expect(m.tiles.map((t) => t.label)).toContain('COUNCIL BADGES');
    expect(m.tiles.some((t) => t.label.startsWith('RANK'))).toBe(false);
  });

  it('works for a brand-new player with 0 points', async () => {
    setSession(null);
    await api.signup({ handle: 'fresh_yak', displayName: 'Fresh Yak', email: 'fresh@example.com', password: 'password1', campus: 'unc', avatar: 'dragon', acceptedRules: true });
    setSession(userBy('fresh_yak').id);
    const r = await api.myRecap();
    expect(r).toMatchObject({ points: 0, badgesEarned: 0, eventsAttended: 0, bestStreak: 0, currentStreak: 0, earnedBadgeIds: [] });
    expect(r.rankOverall).toBeGreaterThan(1);
    const m = cardModel(r);
    expect(m.beginning).toBe('Your quest is just beginning!');
    expect(m.badgeIds).toEqual([]);
    expect(m.tiles.map((t) => t.label)).toEqual(['POINTS', 'BADGES', 'EVENTS', 'BEST STREAK', 'RANK AT UNC', 'RANK OVERALL']);
  });

  it('card model: dates, footer, up to 6 badges, year-end title after the cycle', () => {
    const base: QuestRecap = {
      displayName: 'Ava B.', handle: 'ava', campus: 'duke', role: 'participant', avatar: 'yak', points: 210, badgesEarned: 8, badgeTotal: 16,
      earnedBadgeIds: ['first_checkin', 'regular', 'explorer', 'big_moment', 'seasons', 'digital', 'voice', 'hot_streak'], eventsAttended: 6,
      currentStreak: 3, bestStreak: 4, monthWins: 2, rankOverall: 3, rankCampus: 1, participants: 300, campusParticipants: 90, cycleName: CYCLE.name, cycleEndsAt: CYCLE.end,
    };
    const m = cardModel(base, new Date('2027-01-10T12:00:00Z'));
    expect(m.subtitle).toBe('MY QUEST CARD');
    expect(m.badgeIds).toHaveLength(6);
    expect(m.badgeLine).toBe('+2 MORE');
    expect(m.monthWinsLine).toBe('ADVENTURER OF THE MONTH x2');
    expect(m.tiles.map((t) => t.value)).toEqual(['210', '8/16', '6', '4 MOS', '1', '3']);
    expect(m.dates).toBe('Nov 8, 2026 – May 1, 2027');
    expect(m.footer).toBe('ncssmyac.github.io/YACquest  ·  @ncssmyoungalumni');
    expect(m.beginning).toBeUndefined();
    expect(cardModel(base, new Date('2027-05-10T12:00:00Z')).subtitle).toBe('2026–27 YEAR-END RECAP');
  });
});

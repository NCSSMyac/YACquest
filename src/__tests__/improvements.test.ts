import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api/mock';
import { PRIZE, TIER_POINTS } from '../config';
import { CHECKPOINTS, nextCheckpoint, nextStopText } from '../lib/checkpoints';
import { duplicateForm, editForm, toLocalInput } from '../lib/duplicateEvent';
import { isNewAdventurer, starterTips } from '../lib/starterTips';
import { fmtEventTime, nyDayKey, reminderTitle, todayRsvpEvent } from '../lib/todayEvent';
import type { YacEvent } from '../types';

const { load, setSession, queueEventReminders } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const userId = (handle: string) => load().users.find((u) => u.handle === handle)!.id;

describe('next treasure-map stop (Home points line)', () => {
  it('uses the same checkpoints as the map', () => {
    expect(nextCheckpoint(0)).toEqual(CHECKPOINTS[0]);
    expect(nextCheckpoint(PRIZE.goal - 1)?.label).toBe('the treasure');
    expect(nextCheckpoint(PRIZE.goal)).toBeUndefined();
  });
  it('says how many points to the next stop', () => {
    expect(nextStopText(0)).toBe('50 more points to Trailhead 🥾');
    expect(nextStopText(235)).toBe('15 more points to Summit 🏔');
    expect(nextStopText(PRIZE.goal - 1)).toBe('1 more point to the treasure 💰');
  });
  it('at or past the goal: treasure reached + prize status', () => {
    expect(nextStopText(PRIZE.goal, { claimSpot: 2 })).toBe('You reached the treasure! Prize spot #2 is yours 🏆');
    expect(nextStopText(PRIZE.goal + 40, { prizesLeft: 0 })).toBe('You reached the treasure! All prize spots are taken.');
    expect(nextStopText(PRIZE.goal + 5, { prizesLeft: 1 })).toBe('You reached the treasure! 💰');
  });
});

describe('starter tips (empty states)', () => {
  it('only for people with no points and no activity', () => {
    expect(isNewAdventurer({ points: 0, recentLedger: [], recentSubmissions: [] })).toBe(true);
    expect(isNewAdventurer({ points: 5, recentLedger: [{}], recentSubmissions: [] })).toBe(false);
    expect(isNewAdventurer({ points: 0, recentLedger: [], recentSubmissions: [{}] })).toBe(false); // proof waiting for review
    expect(isNewAdventurer({ points: 0, recentLedger: [{}, {}], recentSubmissions: [] })).toBe(false); // +x then −x
    expect(isNewAdventurer(null)).toBe(false);
  });
  it('uses the config values', () => {
    const t = starterTips('https://example.com').map((x) => x.text).join(' | ');
    expect(t).toContain(`@ncssmyoungalumni for your first ${TIER_POINTS[3]} points`);
    expect(t).toContain(`you both get ${TIER_POINTS[1]} when they come to an event`);
  });
  it('a brand-new sign-up is new; a check-in ends it', async () => {
    await api.resetDemoData();
    await api.signup({ handle: 'newbie', displayName: 'Newbie', email: 'newbie@example.edu', password: 'password123', campus: 'unc', avatar: 'yak', acceptedRules: true });
    expect(isNewAdventurer(await api.getDashboard())).toBe(true);
    const live = load().events.find((e) => e.title === 'Career Panel: First Jobs')!;
    await api.checkIn(live.id, 'PANEL');
    expect(isNewAdventurer(await api.getDashboard())).toBe(false);
  });
});

describe('event-today chip', () => {
  // Sun Nov 8 2026, 9:00 AM Eastern (14:00 UTC)
  const NOW = Date.parse('2026-11-08T14:00:00Z');
  const ev = (id: string, startsAt: string, extra: Partial<{ myRsvp: boolean; checkedIn: boolean }> = {}) => ({
    id, title: id, startsAt, endsAt: new Date(Date.parse(startsAt) + 2 * 3600_000).toISOString(), checkInGraceMinutes: 60, myRsvp: true, checkedIn: false, ...extra,
  });
  it('Eastern-time day + time', () => {
    expect(nyDayKey(Date.parse('2026-11-09T03:00:00Z'))).toBe('2026-11-08'); // 10 PM Eastern
    expect(fmtEventTime('2026-11-08T19:00:00Z')).toBe('2:00 PM');
  });
  it('picks today’s soonest RSVP’d event that isn’t checked in', () => {
    const list = [
      ev('tomorrow', '2026-11-09T19:00:00Z'),
      ev('late', '2026-11-08T23:00:00Z'),
      ev('pickleball', '2026-11-08T19:00:00Z'),
      ev('not-going', '2026-11-08T16:00:00Z', { myRsvp: false }),
      ev('done', '2026-11-08T15:00:00Z', { checkedIn: true }),
    ];
    expect(todayRsvpEvent(list, NOW)?.id).toBe('pickleball');
    expect(todayRsvpEvent([ev('tonight-11pm-ET', '2026-11-09T04:00:00Z')], NOW)?.id).toBe('tonight-11pm-ET');
    expect(todayRsvpEvent([ev('tomorrow', '2026-11-09T19:00:00Z')], NOW)).toBeNull();
    // closed (ended + grace) → gone
    expect(todayRsvpEvent([ev('morning', '2026-11-08T10:00:00Z')], NOW)).toBeNull();
    expect(todayRsvpEvent(null, NOW)).toBeNull();
  });
});

describe('duplicate event prefill', () => {
  const e: YacEvent = {
    id: 'evt_1', title: 'Pickleball', campus: 'duke', crossCampus: false, kind: 'active', location: 'Wilson Courts',
    startsAt: '2026-11-08T19:00:00Z', endsAt: '2026-11-08T21:30:00Z', checkInGraceMinutes: 45, password: 'YAK-1234', activityId: 'home_event', attendeeCount: 12,
  };
  it('same details, one week later, same length, fresh password', () => {
    const f = duplicateForm(e, 'GOLD-9999');
    const orig = editForm(e);
    expect({ ...f, start: '', end: '', password: '' }).toEqual({ ...orig, start: '', end: '', password: '' });
    expect(f.password).toBe('GOLD-9999');
    expect(f.password).not.toBe(e.password);
    const start = new Date(f.start);
    const was = new Date(orig.start);
    // same wall-clock time, 7 calendar days later
    expect(f.start.slice(11)).toBe(orig.start.slice(11));
    expect(Math.round((start.getTime() - was.getTime()) / 86_400_000)).toBe(7);
    expect(new Date(f.end).getTime() - start.getTime()).toBe(150 * 60_000);
    expect(f.grace).toBe(45);
    expect(f.kind).toBe('active');
    expect(f.campus).toBe('duke');
  });
  it('datetime-local format', () => {
    expect(toLocalInput('2026-11-08T19:05:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe('RSVP reminders (mock mirror of queue_event_reminders)', () => {
  const T = (s: string) => new Date(s).toISOString();
  beforeEach(async () => {
    await api.resetDemoData();
  });
  function addEvent(title: string, startsAt: string, kind: YacEvent['kind'] = 'active') {
    const d = load();
    const e: YacEvent = { id: `evt_test_${title}`, title, campus: 'duke', crossCampus: false, kind, location: 'Wilson Courts', startsAt: T(startsAt), endsAt: T(new Date(Date.parse(startsAt) + 2 * 3600_000).toISOString()), checkInGraceMinutes: 60, password: 'DINK', activityId: kind === 'high_impact' ? 'cross_campus_event' : 'home_event', attendeeCount: 0 };
    d.events.push(e);
    return e;
  }
  it('queues once per RSVP inside the window, skips checked-in people, never twice', () => {
    const e = addEvent('Pickleball', '2030-03-14T18:00:00Z'); // 2:00 PM Eastern
    const d = load();
    const [a, b, c] = ['alum001', 'alum002', 'alum003'].map(userId);
    const chair = userId('iesha');
    d.users.find((u) => u.id === b)!.emailOptIn = false;
    for (const u of [a, b, c, chair]) d.rsvps.push({ eventId: e.id, userId: u, createdAt: T('2030-03-10T12:00:00Z') });
    d.ledger.push({ id: 'led_ci', userId: c, amount: 20, source: 'checkin', activityId: 'home_event', refId: e.id, reason: 'Checked in', createdAt: T('2030-03-14T17:40:00Z') });
    const outBefore = d.outbox.length;

    expect(queueEventReminders(Date.parse('2030-03-14T16:00:00Z'))).toBe(0); // 2 h ahead: too early
    expect(queueEventReminders(Date.parse('2030-03-14T17:00:00Z'))).toBe(3); // a, b, chair (staff included); not c
    expect(queueEventReminders(Date.parse('2030-03-14T17:00:00Z'))).toBe(0);
    expect(queueEventReminders(Date.parse('2030-03-14T17:10:00Z'))).toBe(0);

    const mine = load().notifications.filter((n) => n.kind === 'event_reminder' && n.userId === a);
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('⏰ Starts in 1 hour: Pickleball at Wilson Courts');
    expect(mine[0].body).toBe(`Pickleball starts at 2:00 PM at Wilson Courts. Check in at the event to earn ${TIER_POINTS[2]} points.`);
    expect(load().notifications.some((n) => n.kind === 'event_reminder' && n.userId === c)).toBe(false);
    const mails = load().outbox.slice(outBefore).filter((r) => r.kind === 'event_reminder');
    expect(mails.map((m) => m.toEmails[0]).sort()).toEqual([load().users.find((u) => u.id === a)!.email, 'iesha.landis.yac@ncssm.edu'].sort());
    expect(mails[0].subject).toBe('Reminder: Pickleball starts at 2:00 PM');
    expect(mails[0].text).toContain(`Check in at the event to earn ${TIER_POINTS[2]} points.`);
    expect(mails[0].text.toLowerCase()).not.toContain('yak');
  });
  it('started or deleted events get nothing', async () => {
    const started = addEvent('Started', '2030-03-14T16:30:00Z');
    const gone = addEvent('Gone', '2030-03-14T17:30:00Z');
    const a = userId('alum001');
    load().rsvps.push({ eventId: started.id, userId: a, createdAt: T('2030-03-10T12:00:00Z') }, { eventId: gone.id, userId: a, createdAt: T('2030-03-10T12:00:00Z') });
    asUser('iesha');
    await api.deleteEvent(gone.id);
    expect(queueEventReminders(Date.parse('2030-03-14T17:00:00Z'))).toBe(0);
  });
  it('short notice says "in N min"', () => {
    expect(reminderTitle({ title: 'Trivia', location: 'Pit' }, 20)).toBe('⏰ Starts in 20 min: Trivia at Pit');
    expect(reminderTitle({ title: 'Trivia', location: 'Pit' }, 64)).toBe('⏰ Starts in 1 hour: Trivia at Pit');
  });
});

describe('quick game-win award (Who came)', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });
  it('staff only, needs a check-in, once per event, logged + notified', async () => {
    const ev = load().events.find((e) => e.title === 'Study Break Social')!;
    asUser('yak001');
    await api.checkIn(ev.id, 'BLUEDEVIL');
    const yak = userId('yak001');
    await expect(api.awardGameWin(ev.id, yak)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.adminEventGameWins(ev.id)).rejects.toMatchObject({ code: 'forbidden' });

    asUser('iesha');
    await expect(api.awardGameWin(ev.id, userId('alum001'))).rejects.toMatchObject({ code: 'not_checked_in' });
    await expect(api.awardGameWin('nope', yak)).rejects.toMatchObject({ code: 'not_found' });
    const before = api.__test.pointsOf(yak);
    expect(await api.awardGameWin(ev.id, yak, '')).toEqual({ points: TIER_POINTS[2] });
    expect(api.__test.pointsOf(yak)).toBe(before + TIER_POINTS[2]);
    await expect(api.awardGameWin(ev.id, yak, 'again')).rejects.toMatchObject({ code: 'duplicate' });
    expect(await api.adminEventGameWins(ev.id)).toEqual([yak]);

    const row = load().ledger.filter((l) => l.userId === yak && l.activityId === 'game_win' && l.refId === ev.id);
    expect(row).toHaveLength(1);
    expect(row[0].reason).toBe('Win a Game or Competition: Won a game at Study Break Social');
    expect(load().actions[load().actions.length - 1]).toMatchObject({ action: 'points_added', actorName: 'Iesha L.', targetName: 'Yak001' });
    expect(load().notifications.find((n) => n.userId === yak)?.body).toBe('Won a game at Study Break Social');
  });
});

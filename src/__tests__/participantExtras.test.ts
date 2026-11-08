import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/mock';
import { CAPS, PRIZE, TIER_POINTS } from '../config';
import { FOLLOWUP_LOOKBACK_DAYS, followupDue, followupWhen, missedBody, missedTitle, nextEventFor, thanksBody, thanksTitle } from '../lib/followups';
import { codeFromQuery, friendStatus, shareText, signupLink, SIGNUP_URL } from '../lib/friends';
import { linkParts } from '../lib/linkify';
import { prizeLine, shouldAutoShowTour, tierExamples, tourSteps } from '../lib/tour';
import { surveyUrlError } from '../lib/validate';

const { load, setSession, queueEventFollowups } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const userBy = (handle: string) => load().users.find((u) => u.handle === handle)!;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);
const H = 3_600_000;
const D = 24 * H;

// ───────────────────────────── pure helpers ─────────────────────────────

describe('survey link validation (same rule as clean_survey_url)', () => {
  it('accepts http(s) web addresses, or nothing', () => {
    expect(surveyUrlError('')).toBeNull();
    expect(surveyUrlError('   ')).toBeNull();
    expect(surveyUrlError(undefined)).toBeNull();
    expect(surveyUrlError('https://forms.gle/AbC123')).toBeNull();
    expect(surveyUrlError('  https://docs.google.com/forms/d/e/x/viewform?usp=sf  ')).toBeNull();
    expect(surveyUrlError('HTTP://Example.org:8080/s#top')).toBeNull();
  });
  it('refuses anything else', () => {
    for (const bad of ['javascript:alert(1)', 'ftp://forms.example.com/x', 'forms.gle/abc', 'https://forms.gle/a b', 'https://localhost', 'mailto:x@y.org', 'data:text/html,hi']) {
      expect(surveyUrlError(bad), bad).toMatch(/https:\/\//);
    }
    expect(surveyUrlError('https://x.co/' + 'a'.repeat(500))).toMatch(/too long/);
  });
});

describe('follow-up texts', () => {
  it('thanks: with and without a survey link, naming the Feedback Survey quest', () => {
    expect(thanksTitle('Spring Social')).toBe('Thanks for coming to Spring Social! 🐂');
    // 0030: the in-app survey link first, then the external survey for the screenshot quest.
    expect(thanksBody('evt_1', 'https://forms.gle/abc123', 'Complete a Feedback Survey', 5, 5)).toBe(
      'How was it? Rate it in the app for +5 points (takes a minute): #/survey/evt_1 Or fill out the YAC survey here: https://forms.gle/abc123 It counts as the “Complete a Feedback Survey” digital quest: send a screenshot of the confirmation in Quests for 5 points.',
    );
    expect(thanksBody('evt_1', undefined, 'Complete a Feedback Survey', 5, 5)).toBe('How was it? Rate it in the app for +5 points (takes a minute): #/survey/evt_1');
  });
  it('missed you: the next event in Eastern time, or a generic line', () => {
    expect(missedTitle('Spring Social')).toBe('Sorry we missed you at Spring Social');
    expect(followupWhen('2030-04-05T22:00:00Z')).toBe('Fri, Apr 5 at 6:00 PM');
    expect(missedBody({ title: 'Panel Night', startsAt: '2030-04-05T22:00:00Z', location: 'Gerrard Hall' })).toBe(
      'Hope to see you next time! Next up: Panel Night — Fri, Apr 5 at 6:00 PM at Gerrard Hall. RSVP in Quests.',
    );
    expect(missedBody(null)).toBe('Hope to see you next time! New events show up in Quests.');
  });
  it('next event: your campus or all campuses first, else any', () => {
    const now = Date.parse('2030-04-04T12:00:00Z');
    const evs = [
      { id: 'a', campus: 'unc', startsAt: '2030-04-05T22:00:00Z' },
      { id: 'b', campus: 'all', startsAt: '2030-04-25T22:00:00Z' },
      { id: 'c', campus: 'duke', startsAt: '2030-04-01T22:00:00Z' }, // already happened
    ];
    expect(nextEventFor(evs, 'unc', now)?.id).toBe('a');
    expect(nextEventFor(evs, 'ncsu', now)?.id).toBe('b');
    expect(nextEventFor(evs, 'unc', now, 'a')?.id).toBe('b');
    expect(nextEventFor([evs[0]], 'duke', now)?.id).toBe('a');
    expect(nextEventFor([evs[2]], 'duke', now)).toBeNull();
  });
  it('due once the check-in window closes, for the last 3 days only', () => {
    const e = { endsAt: '2030-04-05T00:00:00Z', checkInGraceMinutes: 60 };
    const closes = Date.parse('2030-04-05T01:00:00Z');
    expect(followupDue(e, closes - 1)).toBe(false);
    expect(followupDue(e, closes)).toBe(true);
    expect(followupDue(e, closes + (FOLLOWUP_LOOKBACK_DAYS * D - 1))).toBe(true);
    expect(followupDue(e, closes + FOLLOWUP_LOOKBACK_DAYS * D)).toBe(false);
  });
  it('links in notification bodies', () => {
    expect(linkParts('Survey: https://forms.gle/abc123. Thanks!')).toEqual([
      { text: 'Survey: ' },
      { text: 'https://forms.gle/abc123', href: 'https://forms.gle/abc123' },
      { text: '. Thanks!' },
    ]);
    expect(linkParts('no links here')).toEqual([{ text: 'no links here' }]);
    expect(linkParts('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }]);
  });
});

describe('welcome tour helpers', () => {
  it('shows automatically only when not done yet', () => {
    expect(shouldAutoShowTour({ tourDoneAt: null }, false)).toBe(true);
    expect(shouldAutoShowTour({ tourDoneAt: '2026-11-06T12:00:00Z' }, false)).toBe(false);
    expect(shouldAutoShowTour({ tourDoneAt: null }, true)).toBe(false); // this device already finished it
    expect(shouldAutoShowTour({}, false)).toBe(true); // server without 0026 → device fallback
    expect(shouldAutoShowTour({}, true)).toBe(false);
    expect(shouldAutoShowTour(null, false)).toBe(false);
  });
  it('4 steps, plus the Admin tab for staff; numbers from config', () => {
    expect(tourSteps(false).map((s) => s.id)).toEqual(['points', 'checkin', 'badges', 'prizes']);
    expect(tourSteps(true).map((s) => s.id)).toEqual(['points', 'checkin', 'badges', 'prizes', 'admin']);
    expect(tierExamples().map((t) => t.points)).toEqual([TIER_POINTS[1], TIER_POINTS[2], TIER_POINTS[3]]);
    expect(tierExamples().every((t) => t.examples.length === 2)).toBe(true);
    expect(prizeLine()).toBe(`The first ${PRIZE.count} people to reach ${PRIZE.goal} points each win a ${PRIZE.name}.`);
  });
});

describe('friend links', () => {
  it('signup link with ?code= prefill, and share text', () => {
    expect(SIGNUP_URL).toBe('https://ncssmyac.github.io/YACquest/#/signup');
    expect(signupLink('YAC-7Q2K')).toBe('https://ncssmyac.github.io/YACquest/#/signup?code=YAC-7Q2K');
    expect(shareText('YAC-7Q2K')).toContain('YAC-7Q2K');
    expect(shareText('YAC-7Q2K')).toContain('https://ncssmyac.github.io/YACquest/#/signup?code=YAC-7Q2K');
    expect(shareText('YAC-7Q2K')).toContain(`+${TIER_POINTS[1]}`);
  });
  it('?code= is only used when it looks like a friend code', () => {
    expect(codeFromQuery('yac-7q2k')).toBe('YAC-7Q2K');
    expect(codeFromQuery(' YAC-ABCD ')).toBe('YAC-ABCD');
    expect(codeFromQuery('YAC-ABCDE')).toBe('');
    expect(codeFromQuery('<script>')).toBe('');
    expect(codeFromQuery(null)).toBe('');
  });
  it('status chip', () => {
    expect(friendStatus({ came: true, bonus: true })).toBe(`✓ Came to an event (+${TIER_POINTS[1]} for you)`);
    expect(friendStatus({ came: true, bonus: false })).toBe('✓ Came to an event');
    expect(friendStatus({ came: false, bonus: false })).toBe('Hasn’t checked in yet');
  });
});

// ───────────────────────────── mock API (fixed dates) ─────────────────────────────

describe('automatic event follow-ups (mock, fixed dates)', () => {
  // Thu Apr 4 2030, noon Eastern
  const NOON = Date.parse('2030-04-04T12:00:00-04:00');
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOON);
    await api.resetDemoData();
    // Flush the demo's own live events (they close by ~5 PM) so only the test event is due at 8:30 PM.
    queueEventFollowups(Date.parse('2030-04-04T17:30:00-04:00'));
  });
  afterEach(() => vi.useRealTimers());

  async function setup() {
    asUser('iesha');
    const ev = await api.createEvent({
      title: 'Spring Social', campus: 'duke', crossCampus: false, kind: 'active', location: 'Duke Gardens',
      startsAt: '2030-04-04T18:00:00-04:00', endsAt: '2030-04-04T20:00:00-04:00', checkInGraceMinutes: 30, password: 'SPRING',
      surveyUrl: '  https://forms.gle/abc123  ',
    });
    const next = await api.createEvent({
      title: 'Panel Night', campus: 'unc', crossCampus: false, kind: 'active', location: 'Gerrard Hall',
      startsAt: '2030-04-10T18:00:00-04:00', endsAt: '2030-04-10T20:00:00-04:00', checkInGraceMinutes: 30, password: 'PANEL1',
    });
    const d = load();
    const crowd = d.users.filter((u) => u.role === 'participant' && u.handle.startsWith('alum'));
    const [came1, came2, noShow, noShowNoMail] = [crowd[10], crowd[11], crowd.find((u) => u.campus === 'unc' && u !== crowd[10] && u !== crowd[11])!, crowd[13]];
    noShowNoMail.emailOptIn = false;
    for (const u of [came1, came2]) d.ledger.push({ id: `led_t${u.id}`, userId: u.id, amount: 20, source: 'checkin', activityId: 'home_event', refId: ev.id, reason: 'Checked in', createdAt: ev.startsAt });
    for (const u of [came1, noShow, noShowNoMail]) d.rsvps.push({ eventId: ev.id, userId: u.id, createdAt: '2030-04-01T12:00:00Z' });
    return { ev, next, came1, came2, noShow, noShowNoMail };
  }

  it('stores the survey link trimmed; refuses a bad one', async () => {
    const { ev } = await setup();
    expect(load().events.find((e) => e.id === ev.id)!.surveyUrl).toBe('https://forms.gle/abc123');
    expect(await code(api.createEvent({ ...ev, title: 'Bad', password: 'BADBAD', surveyUrl: 'javascript:alert(1)' }))).toBe('surveyUrl');
    expect(await code(api.updateEvent(ev.id, { ...ev, password: 'SPRING', surveyUrl: 'ftp://x.example.com' }))).toBe('surveyUrl');
    await api.updateEvent(ev.id, { ...ev, password: 'SPRING', surveyUrl: '' });
    expect(load().events.find((e) => e.id === ev.id)!.surveyUrl).toBeUndefined();
  });

  it('runs once per event, after check-in closes, to the right people', async () => {
    const { ev, came1, came2, noShow, noShowNoMail } = await setup();
    expect(queueEventFollowups(Date.parse('2030-04-04T20:20:00-04:00'))).toBe(0); // grace not over
    expect(queueEventFollowups(Date.parse('2030-04-04T20:40:00-04:00'))).toBe(1);
    expect(queueEventFollowups(Date.parse('2030-04-04T20:50:00-04:00'))).toBe(0);
    const d = load();
    const mine = (u: { id: string }) => d.notifications.filter((n) => n.userId === u.id && n.kind === 'event_followup' && n.title.includes('Spring Social'));
    for (const u of [came1, came2]) {
      expect(mine(u).map((n) => n.title)).toEqual(['Thanks for coming to Spring Social! 🐂']);
      expect(mine(u)[0].body).toBe(thanksBody(ev.id, 'https://forms.gle/abc123', 'Complete a Feedback Survey', TIER_POINTS[3], TIER_POINTS[3]));
    }
    expect(mine(noShow).map((n) => n.title)).toEqual(['Sorry we missed you at Spring Social']);
    expect(mine(noShow)[0].body).toContain('Next up: Panel Night'); // UNC player → the UNC event
    expect(mine(noShowNoMail)).toHaveLength(1);
    // came1 RSVP'd AND came → only the thanks
    expect(mine(came1)).toHaveLength(1);
    const mails = d.outbox.filter((r) => r.kind === 'event_followup' && r.dedupeKey.startsWith(`followup:${ev.id}:`));
    expect(mails.map((r) => r.toEmails[0]).sort()).toEqual([came1.email, came2.email, noShow.email].sort());
    expect(d.followups![ev.id]).toMatchObject({ attended: 2, missed: 2, emailed: 3 });
    expect(d.followups![ev.id].sentBy).toBeUndefined();
    // staff see it, and can't send it again
    asUser('admin');
    const row = (await api.adminListEvents()).find((e) => e.id === ev.id)!;
    expect(row.followup).toMatchObject({ automatic: true, attended: 2, missed: 2 });
    expect(row.surveyUrl).toBe('https://forms.gle/abc123');
    expect(await code(api.sendEventFollowupNow(ev.id))).toBe('already_sent');
    expect(load().actions.some((a) => a.action === 'event_followup_sent' && a.actorName === '' && a.details.title === 'Spring Social')).toBe(true);
  });

  it('older events wait for a staff member; participants can’t send', async () => {
    const { ev } = await setup();
    vi.setSystemTime(Date.parse('2030-04-09T12:00:00-04:00')); // 5 days later
    expect(queueEventFollowups()).toBe(0);
    expect(load().followups?.[ev.id]).toBeUndefined();
    asUser('yak001');
    expect(await code(api.sendEventFollowupNow(ev.id))).toBe('forbidden');
    asUser('admin');
    const r = await api.sendEventFollowupNow(ev.id);
    expect(r).toMatchObject({ automatic: false, sentByName: 'YAC Helper', attended: 2, missed: 2 });
    expect(await code(api.sendEventFollowupNow(ev.id))).toBe('already_sent');
    const future = load().events.find((e) => e.title === 'Panel Night')!;
    expect(await code(api.sendEventFollowupNow(future.id))).toBe('not_ended');
  });
});

describe('welcome tour flag (mock)', () => {
  beforeEach(() => api.resetDemoData());
  it('new players start without it; set once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.parse('2030-01-01T09:00:00Z'));
      const { user } = await api.signup({ handle: 'newbie', displayName: 'Newbie', email: 'newbie@example.edu', password: 'password123', campus: 'unc', avatar: 'yak', acceptedRules: true });
      expect(user!.tourDoneAt).toBeNull();
      await api.markTourDone();
      expect(userBy('newbie').tourDoneAt).toBe('2030-01-01T09:00:00.000Z');
      vi.setSystemTime(Date.parse('2030-02-01T09:00:00Z'));
      await api.markTourDone();
      expect(userBy('newbie').tourDoneAt).toBe('2030-01-01T09:00:00.000Z');
      expect(userBy('yak001').tourDoneAt).toBeTruthy(); // seeded players aren't shown the tour
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('event photo wall privacy (mock)', () => {
  beforeEach(() => api.resetDemoData());
  const picnic = () => load().events.find((e) => e.title === 'Fall Welcome Picnic')!;

  it('only approved + shared + not opted out + not hidden', async () => {
    asUser('yak001');
    const ev = picnic();
    const photos = await api.eventPhotos(ev.id);
    expect(photos).toHaveLength(2); // the seed's third photo is approved but not shared
    expect(photos.every((p) => !p.mine)).toBe(true);
    expect(await api.eventPhotoCounts()).toEqual({ [ev.id]: 2 });
    // a pending photo, even if shared, never shows
    const someone = load().users.find((u) => u.handle === 'alum200')!;
    load().submissions.push({ id: 'sub_pending', userId: someone.id, activityId: 'event_photos', eventId: ev.id, imageUrl: 'data:image/png;base64,x', note: '', status: 'pending', createdAt: new Date().toISOString(), shareOnWall: true });
    load().submissions.push({ id: 'sub_rejected', userId: someone.id, activityId: 'event_photos', eventId: ev.id, imageUrl: 'data:image/png;base64,x', note: '', status: 'rejected', createdAt: new Date().toISOString(), shareOnWall: true });
    expect(await api.eventPhotos(ev.id)).toHaveLength(2);
    // the owner opts out globally → all of theirs disappear
    const owner = load().users.find((u) => u.id === load().submissions.find((s) => s.id === photos[0].id)!.userId)!;
    asUser(owner.handle);
    await api.setPhotoWallOptOut(true);
    asUser('yak001');
    expect((await api.eventPhotos(ev.id)).map((p) => p.id)).toEqual([photos[1].id]);
    // staff hide one (logged); participants can't
    expect(await code(api.hideEventPhoto(photos[1].id))).toBe('forbidden');
    asUser('iesha');
    await api.hideEventPhoto(photos[1].id);
    expect(await api.eventPhotos(ev.id)).toEqual([]);
    expect(load().actions.some((a) => a.action === 'photo_hidden' && a.actorName === 'Iesha L.' && a.details.title === 'Fall Welcome Picnic')).toBe(true);
  });

  it('upload checkbox: off by default, shown after approval, event photos only', async () => {
    asUser('yak001');
    const ev = picnic();
    const img = 'data:image/png;base64,iVBORw0KGgo=';
    const s = await api.submitProof({ activityId: 'event_photos', eventId: ev.id, imageDataUrl: img, note: '', shareOnWall: true });
    expect(s.shareOnWall).toBe(true);
    expect((await api.eventPhotos(ev.id)).some((p) => p.mine)).toBe(false); // pending
    asUser('iesha');
    await api.reviewSubmission(s.id, 'approved');
    asUser('alum150');
    const mineNow = (await api.eventPhotos(ev.id)).find((p) => p.id === s.id)!;
    expect(mineNow).toMatchObject({ displayName: 'Yak001', campus: 'duke', mine: false });
    asUser('yak001');
    expect((await api.eventPhotos(ev.id)).find((p) => p.id === s.id)!.mine).toBe(true);
    // default off; non-photos never share
    asUser('alum120');
    const shot = await api.submitProof({ activityId: 'survey', imageDataUrl: img, note: '', shareOnWall: true });
    expect(shot.shareOnWall).toBe(false);
  });
});

describe('my friends (mock)', () => {
  beforeEach(() => api.resetDemoData());
  it('only people who used my code, safe fields only', async () => {
    asUser('yak001');
    const list = await api.myFriends();
    expect(list).toHaveLength(2);
    expect(list.filter((f) => f.came && f.bonus)).toHaveLength(1);
    expect(list.filter((f) => !f.came && !f.bonus)).toHaveLength(1);
    for (const f of list) expect(Object.keys(f).sort()).toEqual(['avatar', 'bonus', 'came', 'campus', 'displayName', 'joinedAt', 'look']);
    expect(JSON.stringify(list)).not.toMatch(/@example\.edu|usr_|YAC-/);
    // the dashboard's X/3 agrees
    expect((await api.getDashboard()).referralsUsed).toBe(1);
    expect(CAPS.referralsPerCycle).toBe(3);
    // someone else's referral never shows up here
    const other = userBy('alum050');
    userBy('alum051').referredBy = other.id;
    expect(await api.myFriends()).toHaveLength(2);
    asUser('alum050');
    expect((await api.myFriends()).map((f) => f.displayName)).toEqual([userBy('alum051').displayName]);
  });
});

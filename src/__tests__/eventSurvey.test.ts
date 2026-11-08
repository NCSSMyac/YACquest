import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/mock';
import { CAPS, TIER_POINTS } from '../config';
import { ACTIVITIES, activityById } from '../lib/activities';
import { RATING_LABELS, SURVEY_POINTS, averageOf, canRate, cleanSurveyText, ratingLabel, surveyClosesAt, surveyError, surveyPath, surveyWindowOpen } from '../lib/eventSurvey';
import { thanksBody } from '../lib/followups';
import { linkParts } from '../lib/linkify';
import { surveyCsv } from '../screens/admin/SurveyResults';

const { load, setSession, queueEventFollowups, pointsOf } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);

// ───────────────────────────── pure helpers ─────────────────────────────

describe('event survey rules (pure)', () => {
  it('is a Tier 3 activity worth TIER_POINTS[3], outside the digital limit', () => {
    const a = activityById('event_survey')!;
    expect(a).toMatchObject({ tier: 3, title: 'Event feedback survey', method: 'event_survey' });
    expect(SURVEY_POINTS).toBe(TIER_POINTS[3]);
    expect(a.limitLabel).toMatch(/not part of the digital limit/);
    // the external screenshot survey quest is unchanged
    expect(activityById('survey')).toMatchObject({ tier: 3, title: 'Complete a Feedback Survey', method: 'screenshot', limitLabel: `Digital: ${CAPS.digitalPerWeek} per week` });
    expect(ACTIVITIES.filter((x) => x.id === 'event_survey')).toHaveLength(1);
  });

  it('window: from check-in until exactly 14 days after the end', () => {
    const end = '2030-06-01T21:00:00-04:00';
    expect(surveyClosesAt(end)).toBe(Date.parse('2030-06-15T21:00:00-04:00'));
    expect(surveyWindowOpen(end, Date.parse('2030-06-01T19:30:00-04:00'))).toBe(true);
    expect(surveyWindowOpen(end, Date.parse('2030-06-15T21:00:00-04:00'))).toBe(true);
    expect(surveyWindowOpen(end, Date.parse('2030-06-15T21:00:01-04:00'))).toBe(false);
    const now = Date.parse('2030-06-05T12:00:00Z');
    expect(canRate({ endsAt: end, checkedIn: true, surveyDone: false }, now)).toBe(true);
    expect(canRate({ endsAt: end, checkedIn: false, surveyDone: false }, now)).toBe(false);
    expect(canRate({ endsAt: end, checkedIn: true, surveyDone: true }, now)).toBe(false);
    expect(canRate({ endsAt: end, checkedIn: true }, now)).toBe(false); // server without 0030
  });

  it('required fields and length limits, with friendly messages', () => {
    expect(surveyError({ rating: null, favorite: 'x' })).toEqual({ code: 'rating', message: 'Pick 1 to 5 stars.' });
    expect(surveyError({ rating: 6, favorite: 'x' })?.code).toBe('rating');
    expect(surveyError({ rating: 2.5, favorite: 'x' })?.code).toBe('rating');
    expect(surveyError({ rating: 4, favorite: '   ' })).toEqual({ code: 'favorite', message: 'Tell us your favorite part (a few words is plenty).' });
    expect(surveyError({ rating: 4, favorite: 'a'.repeat(301) })?.message).toBe('Keep your favorite part to 300 characters.');
    expect(surveyError({ rating: 4, favorite: '  ' + 'a'.repeat(300) + '  ' })).toBeNull(); // trimmed first
    expect(surveyError({ rating: 4, favorite: 'ok', leastFavorite: 'b'.repeat(301) })?.code).toBe('least_favorite');
    expect(surveyError({ rating: 4, favorite: 'ok', comments: 'c'.repeat(1001) })?.code).toBe('comments');
    expect(surveyError({ rating: 5, favorite: 'ok', leastFavorite: '', comments: 'c'.repeat(1000) })).toBeNull();
    expect(cleanSurveyText('  hi\u0007 there\nfriend  ')).toBe('hi there\nfriend');
  });

  it('labels, averages and the in-app link', () => {
    expect(RATING_LABELS).toEqual(['Meh', 'Okay', 'Good', 'Great', 'Legendary!']);
    expect(ratingLabel(4.4)).toBe('Great');
    expect(ratingLabel(4.6)).toBe('Legendary!');
    expect(averageOf([0, 0, 1, 1, 2])).toBe(4.3); // 17 / 4 = 4.25 → 4.3, like round(avg, 1) on the server
    expect(averageOf([0, 0, 0, 0, 0])).toBeNull();
    expect(surveyPath('evt_9')).toBe('/survey/evt_9');
    expect(linkParts('Rate it (takes a minute): #/survey/evt_9 Or fill out https://forms.gle/x.')).toEqual([
      { text: 'Rate it (takes a minute): ' },
      { text: '#/survey/evt_9', to: '/survey/evt_9' },
      { text: ' Or fill out ' },
      { text: 'https://forms.gle/x', href: 'https://forms.gle/x' },
      { text: '.' },
    ]);
  });
});

// ───────────────────────────── mock API (fixed dates) ─────────────────────────────

describe('in-app event survey (mock, fixed dates)', () => {
  // Thu Apr 4 2030, noon Eastern
  const NOON = Date.parse('2030-04-04T12:00:00-04:00');
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOON);
    await api.resetDemoData();
    queueEventFollowups(Date.parse('2030-04-04T17:30:00-04:00')); // flush the demo's own live events
  });
  afterEach(() => vi.useRealTimers());

  async function setup() {
    asUser('iesha');
    const ev = await api.createEvent({
      title: 'Spring Social', campus: 'duke', crossCampus: false, kind: 'active', location: 'Duke Gardens',
      startsAt: '2030-04-04T18:00:00-04:00', endsAt: '2030-04-04T20:00:00-04:00', checkInGraceMinutes: 30, password: 'SPRING',
      surveyUrl: 'https://forms.gle/abc123',
    });
    const d = load();
    const crowd = d.users.filter((u) => u.role === 'participant' && u.handle.startsWith('alum'));
    const [ana, ben, cat, outsider] = [crowd[20], crowd[21], crowd[22], crowd[23]];
    for (const u of [ana, ben, cat]) d.ledger.push({ id: `led_s${u.id}`, userId: u.id, amount: 20, source: 'checkin', activityId: 'home_event', refId: ev.id, reason: 'Checked in', createdAt: '2030-04-04T18:10:00-04:00' });
    return { ev, ana, ben, cat, outsider };
  }

  it('only people who checked in; open from check-in (even before the event ends)', async () => {
    const { ev, ana, outsider } = await setup();
    vi.setSystemTime(Date.parse('2030-04-04T18:30:00-04:00')); // during the event
    setSession(outsider.id);
    expect(await code(api.submitEventSurvey({ eventId: ev.id, rating: 5, favorite: 'Stars' }))).toBe('not_attended');
    expect(await api.mySurveyStatus(ev.id)).toMatchObject({ checkedIn: false, open: false, done: false });
    setSession(ana.id);
    expect(await api.mySurveyStatus(ev.id)).toMatchObject({ checkedIn: true, open: true, done: false, points: TIER_POINTS[3], closesAt: '2030-04-19T00:00:00.000Z' });
    expect(await code(api.submitEventSurvey({ eventId: ev.id, rating: 5, favorite: 'Stars' }))).toBe('ok');
    expect(await code(api.submitEventSurvey({ eventId: 'evt_nope', rating: 5, favorite: 'Stars' }))).toBe('not_found');
  });

  it('closes 14 days after the event ends', async () => {
    const { ev, ana, ben } = await setup();
    vi.setSystemTime(Date.parse('2030-04-18T20:00:00-04:00')); // exactly 14 days after the end
    setSession(ana.id);
    expect(await code(api.submitEventSurvey({ eventId: ev.id, rating: 4, favorite: 'Gardens' }))).toBe('ok');
    vi.setSystemTime(Date.parse('2030-04-18T20:00:01-04:00'));
    setSession(ben.id);
    expect((await api.mySurveyStatus(ev.id)).open).toBe(false);
    expect(await code(api.submitEventSurvey({ eventId: ev.id, rating: 4, favorite: 'Gardens' }))).toBe('closed');
  });

  it('required fields + length limits; nothing saved when refused', async () => {
    const { ev, ana } = await setup();
    setSession(ana.id);
    const base = { eventId: ev.id, rating: 4, favorite: 'Gardens' };
    expect(await code(api.submitEventSurvey({ ...base, rating: 0 }))).toBe('rating');
    expect(await code(api.submitEventSurvey({ ...base, favorite: '  ' }))).toBe('favorite');
    expect(await code(api.submitEventSurvey({ ...base, favorite: 'x'.repeat(301) }))).toBe('favorite');
    expect(await code(api.submitEventSurvey({ ...base, leastFavorite: 'x'.repeat(301) }))).toBe('least_favorite');
    expect(await code(api.submitEventSurvey({ ...base, comments: 'x'.repeat(1001) }))).toBe('comments');
    expect(load().surveys ?? []).toHaveLength(4); // only the 4 seeded Kickoff answers
    expect(load().ledger.filter((l) => l.userId === ana.id && l.source === 'survey')).toHaveLength(0);
  });

  it('awards +5 once (ledger ref = event id), and never touches the digital cap', async () => {
    const { ev, ana } = await setup();
    setSession(ana.id);
    expect(await api.canSubmit('poll')).toBeNull();
    const before = pointsOf(ana.id);
    expect(await api.submitEventSurvey({ eventId: ev.id, rating: 5, favorite: '  The lanterns!  ', leastFavorite: 'Mosquitoes', comments: 'More of these\nplease' })).toEqual({ points: TIER_POINTS[3] });
    expect(pointsOf(ana.id)).toBe(before + TIER_POINTS[3]);
    const rows = load().ledger.filter((l) => l.userId === ana.id && l.source === 'survey');
    expect(rows).toEqual([expect.objectContaining({ amount: TIER_POINTS[3], activityId: 'event_survey', refId: ev.id, reason: 'Event feedback survey: Spring Social' })]);
    expect(load().surveys!.find((s) => s.userId === ana.id)).toMatchObject({ favorite: 'The lanterns!', comments: 'More of these\nplease', anonymous: false });
    // once only
    expect(await code(api.submitEventSurvey({ eventId: ev.id, rating: 1, favorite: 'Again' }))).toBe('duplicate');
    expect(load().ledger.filter((l) => l.userId === ana.id && l.source === 'survey')).toHaveLength(1);
    expect((await api.mySurveyStatus(ev.id))).toMatchObject({ done: true, open: false });
    // the weekly digital quest is still available, and using it doesn't block the survey (and vice versa)
    expect(await api.canSubmit('poll')).toBeNull();
    // listEvents: "✓ Survey done" on the past card
    vi.setSystemTime(Date.parse('2030-04-05T12:00:00-04:00'));
    const past = (await api.listEvents('past')).find((e) => e.id === ev.id)!;
    expect(past).toMatchObject({ checkedIn: true, surveyDone: true });
  });

  it('a digital quest this week doesn’t block the survey', async () => {
    const { ev, ben } = await setup();
    setSession(ben.id);
    await api.submitProof({ activityId: 'poll', imageDataUrl: 'data:image/png;base64,AAAA', note: '' });
    expect(await api.canSubmit('repost')).toMatch(/Digital quests are limited/);
    expect(await code(api.submitEventSurvey({ eventId: ev.id, rating: 3, favorite: 'Music' }))).toBe('ok');
  });

  it('anonymous answers: still earn points, but staff never see the name', async () => {
    const { ev, ana, ben, cat } = await setup();
    setSession(ana.id);
    await api.submitEventSurvey({ eventId: ev.id, rating: 5, favorite: 'Lanterns' });
    setSession(ben.id);
    await api.submitEventSurvey({ eventId: ev.id, rating: 3, favorite: 'Snacks', leastFavorite: 'Lines', comments: 'More tables', anonymous: true });
    expect(load().ledger.some((l) => l.userId === ben.id && l.source === 'survey')).toBe(true);
    setSession(cat.id);
    expect(await code(api.adminEventSurvey(ev.id))).toBe('forbidden'); // participants can't see results
    asUser('admin');
    const r = await api.adminEventSurvey(ev.id);
    expect(r).toMatchObject({ responses: 2, average: 4, distribution: [0, 0, 1, 0, 1] });
    const anon = r.rows.find((x) => x.anonymous)!;
    expect(anon).toEqual({ name: null, anonymous: true, rating: 3, favorite: 'Snacks', leastFavorite: 'Lines', comments: 'More tables', createdAt: expect.any(String) });
    expect(JSON.stringify(r)).not.toContain(ben.displayName);
    expect(JSON.stringify(r)).not.toContain(ben.id);
    expect(r.rows.find((x) => !x.anonymous)).toMatchObject({ name: ana.displayName, campus: ana.campus });
    // CSV: anonymous rows have no name or campus
    const csv = surveyCsv(r).split('\r\n');
    expect(csv[0]).toBe('rating,favorite_part,least_favorite_part,suggestions_comments,name,campus,anonymous,submitted');
    expect(csv.find((l) => l.startsWith('3,'))).toMatch(/^3,Snacks,Lines,More tables,,,yes,/);
    // Admin → Events card count + average
    const card = (await api.adminListEvents()).find((e) => e.id === ev.id)!;
    expect(card).toMatchObject({ surveyCount: 2, surveyAverage: 4 });
  });

  it('stats: survey points as their own source + per-event ratings; weekly email line', async () => {
    const { ev, ana, ben } = await setup();
    setSession(ana.id);
    await api.submitEventSurvey({ eventId: ev.id, rating: 5, favorite: 'Lanterns' });
    setSession(ben.id);
    await api.submitEventSurvey({ eventId: ev.id, rating: 4, favorite: 'Snacks', anonymous: true });
    asUser('iesha');
    vi.setSystemTime(Date.parse('2030-04-05T09:00:00-04:00')); // started events only
    const s = await api.adminStats();
    expect(s.sources.survey).toBeGreaterThanOrEqual(2 * TIER_POINTS[3]);
    expect(s.ratings!.find((x) => x.id === ev.id)).toMatchObject({ title: 'Spring Social', responses: 2, average: 4.5 });
    const kick = load().events.find((e) => e.title === 'Kickoff Mixer')!;
    expect(s.ratings!.find((x) => x.id === kick.id)).toMatchObject({ responses: 4, average: 4.3 }); // seeded demo answers
    const rep = await api.weeklyReportPreview();
    expect(rep.text).toContain('📝 EVENT SURVEYS THIS WEEK: 2 new responses · average 4.5★');
    expect(rep.html).toContain('Event surveys this week:</b> 2 new responses · average <b>4.5★</b>');
  });

  it('the automatic follow-up links the in-app survey (note + email) and keeps the external survey', async () => {
    const { ev, ana } = await setup();
    load().users.find((u) => u.id === ana.id)!.emailOptIn = true;
    expect(queueEventFollowups(Date.parse('2030-04-04T20:40:00-04:00'))).toBe(1);
    const d = load();
    const note = d.notifications.find((n) => n.userId === ana.id && n.kind === 'event_followup' && n.title === 'Thanks for coming to Spring Social! 🐂')!;
    expect(note.body).toBe(thanksBody(ev.id, 'https://forms.gle/abc123', 'Complete a Feedback Survey', TIER_POINTS[3], SURVEY_POINTS));
    expect(note.body).toContain(`#/survey/${ev.id}`);
    expect(note.body).toContain('Or fill out the YAC survey here: https://forms.gle/abc123');
    const mail = d.outbox.find((r) => r.dedupeKey === `followup:${ev.id}:${ana.id}`)!;
    expect(mail.text).toContain(`https://ncssmyac.github.io/YACquest/#/survey/${ev.id}`);
    expect(mail.text).toContain('Or fill out the YAC survey here: https://forms.gle/abc123');
    expect(mail.html).toContain(`href="https://ncssmyac.github.io/YACquest/#/survey/${ev.id}"`);
  });
});

describe('demo seed (mock)', () => {
  beforeEach(() => api.resetDemoData());
  it('yak001 can rate the Kickoff Mixer; four regulars already did (one anonymously)', async () => {
    asUser('yak001');
    const kick = (await api.listEvents('past')).find((e) => e.title === 'Kickoff Mixer')!;
    expect(kick).toMatchObject({ checkedIn: true, surveyDone: false });
    expect(canRate(kick, Date.now())).toBe(true);
    expect((await api.mySurveyStatus(kick.id)).open).toBe(true);
    const picnic = (await api.listEvents('past')).find((e) => e.title === 'Fall Welcome Picnic')!;
    expect(canRate(picnic, Date.now())).toBe(false); // over 14 days ago
    const s = load().surveys!.filter((x) => x.eventId === kick.id);
    expect(s).toHaveLength(4);
    expect(s.filter((x) => x.anonymous)).toHaveLength(1);
    // the seeded follow-up note links the survey
    expect(load().notifications.some((n) => n.kind === 'event_followup' && n.body.includes(`#/survey/${kick.id}`))).toBe(true);
  });
});

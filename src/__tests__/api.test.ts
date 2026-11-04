import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api';
import { PRIZE, TIER_POINTS } from '../config';

// Runs in Node: there's no localStorage, so the mock API keeps data in memory.
const { load, setSession, pointsOf } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);

beforeEach(async () => {
  await api.resetDemoData();
});

describe('seed data', () => {
  it('has about 300 participants across three campuses', () => {
    const participants = load().users.filter((u) => u.role === 'participant');
    expect(participants.length).toBe(300);
    expect(new Set(participants.map((u) => u.campus)).size).toBe(3);
  });
  it('starts with all prize spots open', async () => {
    expect((await api.prizeStatus()).remaining).toBe(PRIZE.count);
  });
});

describe('event check-in', () => {
  it('rejects a wrong password and awards home-campus points once', async () => {
    asUser('yak001');
    const live = load().events.find((e) => e.title === 'Study Break Social')!;
    await expect(api.checkIn(live.id, 'nope')).rejects.toMatchObject({ code: 'wrong_password' });
    const res = await api.checkIn(live.id, 'bluedevil');
    expect(res.points).toBe(TIER_POINTS[2]);
    await expect(api.checkIn(live.id, 'bluedevil')).rejects.toMatchObject({ code: 'duplicate' });
  });
  it('gives Tier 1 only for official cross-campus events', async () => {
    asUser('yak001'); // Duke
    const unc = load().events.find((e) => e.title === 'Career Panel: First Jobs')!;
    expect((await api.checkIn(unc.id, 'PANEL')).points).toBe(TIER_POINTS[2]);
    const all = load().events.find((e) => e.title === 'Triangle Trivia Showdown')!;
    expect((await api.checkIn(all.id, 'TRIANGLE')).points).toBe(TIER_POINTS[1]);
  });
  it('refuses expired events', async () => {
    asUser('yak001');
    const old = load().events.find((e) => e.title === 'Trivia Night')!;
    await expect(api.checkIn(old.id, 'TARHEEL')).rejects.toMatchObject({ code: 'expired' });
  });
});

describe('anti-farming caps', () => {
  it('allows only one digital quest per week', async () => {
    asUser('yak001');
    const img = 'data:image/png;base64,AAAA';
    await api.submitProof({ activityId: 'poll', imageDataUrl: img, note: '' });
    await expect(api.submitProof({ activityId: 'survey', imageDataUrl: img, note: '' })).rejects.toMatchObject({ code: 'limit' });
  });
  it('rejects non-image uploads', async () => {
    asUser('yak001');
    await expect(api.submitProof({ activityId: 'poll', imageDataUrl: 'data:text/plain;base64,AA', note: '' })).rejects.toMatchObject({ code: 'file_type' });
  });
});

describe('admin permissions', () => {
  it('campus leads cannot adjust another campus', async () => {
    asUser('lead.unc');
    const duke = load().users.find((u) => u.handle === 'yak001')!;
    await expect(api.adjustPoints(duke.id, 10, 'test')).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('requires a reason to reject', async () => {
    asUser('admin');
    const pending = (await api.reviewQueue())[0];
    await expect(api.reviewSubmission(pending.id, 'rejected', '')).rejects.toMatchObject({ code: 'reason' });
  });
});

describe('prize race', () => {
  it('gives spots in order and stops at PRIZE.count', async () => {
    asUser('admin');
    const people = load().users.filter((u) => u.role === 'participant').slice(0, PRIZE.count + 2);
    for (const u of people) await api.adjustPoints(u.id, Math.min(500, PRIZE.goal - pointsOf(u.id) + 5), 'test boost');
    for (const u of people) if (pointsOf(u.id) < PRIZE.goal) await api.adjustPoints(u.id, PRIZE.goal - pointsOf(u.id), 'top up');
    const status = await api.prizeStatus();
    expect(status.remaining).toBe(0);
    expect(status.claims.map((c) => c.spot)).toEqual(Array.from({ length: PRIZE.count }, (_, i) => i + 1));
    expect(status.claims.map((c) => c.userId)).toEqual(people.slice(0, PRIZE.count).map((u) => u.id));
  });
});

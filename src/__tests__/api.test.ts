import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api/mock';
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
  it('admins can adjust any campus', async () => {
    asUser('admin');
    for (const campus of ['duke', 'unc', 'ncsu'] as const) {
      const u = load().users.find((x) => x.role === 'participant' && x.campus === campus)!;
      const before = pointsOf(u.id);
      await api.adjustPoints(u.id, 10, 'test');
      expect(pointsOf(u.id)).toBe(before + 10);
    }
  });
  it('participants cannot adjust points', async () => {
    asUser('yak001');
    const other = load().users.find((u) => u.handle === 'alum001')!;
    await expect(api.adjustPoints(other.id, 10, 'test')).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('requires a reason to reject', async () => {
    asUser('admin');
    const pending = (await api.reviewQueue())[0];
    await expect(api.reviewSubmission(pending.id, 'rejected', '')).rejects.toMatchObject({ code: 'reason' });
  });
});

const boostTo = async (id: string, target: number) => {
  while (pointsOf(id) < target) await api.adjustPoints(id, Math.min(500, target - pointsOf(id)), 'boost');
};

describe('prize race', () => {
  it('gives spots in order and stops at PRIZE.count', async () => {
    asUser('admin');
    const people = load().users.filter((u) => u.role === 'participant').slice(0, PRIZE.count + 2);
    for (const u of people) await boostTo(u.id, PRIZE.goal);
    const status = await api.prizeStatus();
    expect(status.remaining).toBe(0);
    expect(status.claims.map((c) => c.spot)).toEqual(Array.from({ length: PRIZE.count }, (_, i) => i + 1));
    expect(status.claims.map((c) => c.userId)).toEqual(people.slice(0, PRIZE.count).map((u) => u.id));
  });
  it('revokes a spot when points are removed and refills it with the next qualifier', async () => {
    asUser('admin');
    const people = load().users.filter((u) => u.role === 'participant').slice(0, PRIZE.count + 1);
    for (const u of people) await boostTo(u.id, PRIZE.goal);
    await api.adjustPoints(people[1].id, -50, 'correction');
    const status = await api.prizeStatus();
    expect(status.remaining).toBe(0);
    const spot2 = status.claims.find((c) => c.spot === 2)!;
    expect(spot2.userId).toBe(people[PRIZE.count].id);
    expect(status.claims.some((c) => c.userId === people[1].id)).toBe(false);
    asUser('iesha');
    const all = await api.listClaims();
    const revoked = all.find((c) => c.status === 'revoked')!;
    expect(revoked.userId).toBe(people[1].id);
    expect(revoked.revokeReason).toMatch(/fell below/);
    expect(all[all.length - 1].status).toBe('revoked');
  });
});

describe('team roles', () => {
  it('lists admins and chairs for a chair only', async () => {
    asUser('admin');
    await expect(api.listTeam()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    const team = await api.listTeam();
    expect(team.map((m) => m.handle).sort()).toEqual(['admin', 'iesha', 'jacob']);
  });
  it('lets a chair grant and remove admin, but not touch a chair or make a third chair', async () => {
    asUser('iesha');
    const yak = load().users.find((u) => u.handle === 'yak001')!;
    const jacob = load().users.find((u) => u.handle === 'jacob')!;
    await api.setRole(yak.id, 'admin');
    expect(load().users.find((u) => u.id === yak.id)!.role).toBe('admin');
    await api.setRole(yak.id, 'participant');
    expect(load().users.find((u) => u.id === yak.id)!.role).toBe('participant');
    await expect(api.setRole(jacob.id, 'participant')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.setRole(yak.id, 'chair' as never)).rejects.toMatchObject({ code: 'chair_limit' });
    await expect(api.transferChair(jacob.id)).rejects.toMatchObject({ code: 'chair_limit' });
  });
  it('transfer swaps roles', async () => {
    asUser('iesha');
    const helper = load().users.find((u) => u.handle === 'admin')!;
    await api.transferChair(helper.id);
    const users = load().users;
    expect(users.find((u) => u.handle === 'iesha')!.role).toBe('admin');
    expect(users.find((u) => u.handle === 'admin')!.role).toBe('chair');
    expect(users.filter((u) => u.role === 'chair').length).toBe(2);
    await expect(api.listTeam()).rejects.toMatchObject({ code: 'forbidden' });
  });
});

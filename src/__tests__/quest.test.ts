import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api/mock';
import { PRIZE, TIER_POINTS } from '../config';
import { BADGES } from '../lib/badges';
import { COSMETICS } from '../lib/cosmetics';
import { composeLayers } from '../components/cosmetics/compose';
import { BADGE_ART, badgeGrid } from '../components/cosmetics/badgeArt';
import { ACCESSORY_ART, HAT_ART } from '../components/cosmetics/art';
import { backgroundGrid } from '../components/cosmetics/backgrounds';

const { load, setSession, addLedger } = api.__test;
const userBy = (handle: string) => load().users.find((u) => u.handle === handle)!;
const asUser = (handle: string) => {
  const u = userBy(handle);
  setSession(u.id);
  return u;
};
const earned = async () => new Set((await api.myBadges()).filter((b) => b.earned).map((b) => b.id));

beforeEach(async () => {
  await api.resetDemoData();
});

describe('badges', () => {
  it('returns all 16 badges in display order with progress', async () => {
    asUser('yak001');
    const list = await api.myBadges();
    expect(list.map((b) => b.id)).toEqual(BADGES.map((b) => b.id));
    for (const b of list) expect(b.progress).toBeLessThanOrEqual(b.goal);
  });

  it('seeds the demo player with a few badges', async () => {
    asUser('yak001');
    const got = await earned();
    expect(got).toEqual(new Set(['first_checkin', 'champion', 'voice']));
    const digital = (await api.myBadges()).find((b) => b.id === 'digital')!;
    expect(digital).toMatchObject({ earned: false, progress: 2, goal: 3 });
  });

  it('counts check-ins, campuses and high-impact events', async () => {
    asUser('yak001');
    const live = load().events;
    await api.checkIn(live.find((e) => e.title === 'Study Break Social')!.id, 'BLUEDEVIL');
    await api.checkIn(live.find((e) => e.title === 'Career Panel: First Jobs')!.id, 'PANEL');
    let explorer = (await api.myBadges()).find((b) => b.id === 'explorer')!;
    expect(explorer.progress).toBe(2); // Duke (kickoff + study break) + UNC
    expect((await earned()).has('big_moment')).toBe(false);
    await api.checkIn(live.find((e) => e.title === 'Pack Game Watch')!.id, 'WOLFPACK');
    await api.checkIn(live.find((e) => e.title === 'Triangle Trivia Showdown')!.id, 'TRIANGLE');
    const got = await earned();
    expect(got.has('explorer')).toBe(true);
    expect(got.has('big_moment')).toBe(true);
    const regular = (await api.myBadges()).find((b) => b.id === 'regular')!;
    expect(regular).toMatchObject({ earned: true, progress: 5, goal: 5 });
  });

  it('uses points for Halfway There and Quest Legend', async () => {
    const u = asUser('yak001');
    addLedger({ userId: u.id, amount: Math.ceil(PRIZE.goal / 2), source: 'manual', reason: 'test' });
    let got = await earned();
    expect(got.has('halfway')).toBe(true);
    expect(got.has('legend')).toBe(false);
    addLedger({ userId: u.id, amount: PRIZE.goal, source: 'manual', reason: 'test' });
    got = await earned();
    expect(got.has('legend')).toBe(true);
  });

  it('describes the point badges with the 350 goal', () => {
    expect(PRIZE.goal).toBe(350);
    expect(BADGES.find((b) => b.id === 'halfway')!.how).toContain('175');
    expect(BADGES.find((b) => b.id === 'legend')!.how).toContain('350');
  });

  it('awards Voice of the Herd for a prize idea', async () => {
    asUser('alum010');
    expect((await earned()).has('voice')).toBe(false);
    await api.suggestPrize('Board game night prizes');
    expect((await earned()).has('voice')).toBe(true);
  });
});

describe('unlocks', () => {
  it('follows the cosmetics rules', async () => {
    const u = asUser('yak001');
    let unlocks = new Set(await api.myUnlocks());
    expect(unlocks.has('meadow')).toBe(true); // free
    expect(unlocks.has('campus')).toBe(true); // free
    expect(unlocks.has('party_hat')).toBe(true); // First Steps
    expect(unlocks.has('medal')).toBe(true); // Champion
    expect(unlocks.has('sunset')).toBe(true); // 50 points
    expect(unlocks.has('flower_crown')).toBe(false); // 100 points
    expect(unlocks.has('crown')).toBe(false);
    addLedger({ userId: u.id, amount: TIER_POINTS[1], source: 'manual', reason: 'test' });
    addLedger({ userId: u.id, amount: TIER_POINTS[1], source: 'manual', reason: 'test' });
    unlocks = new Set(await api.myUnlocks());
    expect(unlocks.has('flower_crown')).toBe(true);
    expect(unlocks.has('gold_chain')).toBe(false);
  });

  it('unlocks Sparkle Aura at 300 points', async () => {
    const u = asUser('yak001');
    expect(COSMETICS.find((c) => c.id === 'sparkles')!.rule).toEqual({ type: 'points', min: 300 });
    const have = load().ledger.filter((l) => l.userId === u.id).reduce((n, l) => n + l.amount, 0);
    addLedger({ userId: u.id, amount: 299 - have, source: 'manual', reason: 'test' });
    expect((await api.myUnlocks()).includes('sparkles')).toBe(false);
    addLedger({ userId: u.id, amount: 1, source: 'manual', reason: 'test' });
    expect((await api.myUnlocks()).includes('sparkles')).toBe(true);
  });

  it('unlocks Rainbow at 6 badges', async () => {
    const u = asUser('yak001');
    expect((await api.myUnlocks()).includes('rainbow')).toBe(false);
    // 3 seeded badges + Halfway + Big Moment + Giver = 6
    addLedger({ userId: u.id, amount: 400, source: 'manual', reason: 'test' });
    await api.checkIn(load().events.find((e) => e.title === 'Triangle Trivia Showdown')!.id, 'TRIANGLE');
    load().submissions.push({ id: 'sub_gift', userId: u.id, activityId: 'annual_fund', imageUrl: '', note: '', status: 'approved', createdAt: new Date().toISOString() });
    expect((await api.myUnlocks()).includes('rainbow')).toBe(true);
  });
});

describe('equipLook', () => {
  it('saves an unlocked look on the user and the leaderboard', async () => {
    const u = asUser('yak001');
    const saved = await api.equipLook({ hat: 'party_hat', accessory: 'medal', background: 'sunset' });
    expect(saved.look).toEqual({ hat: 'party_hat', accessory: 'medal', background: 'sunset' });
    expect(userBy('yak001').look).toEqual(saved.look);
    const row = (await api.myRank())!;
    expect(row.userId).toBe(u.id);
    expect(row.look).toEqual(saved.look);
  });

  it('clears slots that are empty', async () => {
    asUser('yak001');
    await api.equipLook({ hat: 'party_hat' });
    expect((await api.equipLook({ hat: '' })).look).toBeUndefined();
  });

  it('rejects locked items with code locked', async () => {
    asUser('yak001');
    await expect(api.equipLook({ hat: 'crown' })).rejects.toMatchObject({ code: 'locked' });
    await expect(api.equipLook({ background: 'treasure' })).rejects.toMatchObject({ code: 'locked' });
  });

  it('rejects unknown items or the wrong slot with code look', async () => {
    asUser('yak001');
    await expect(api.equipLook({ hat: 'banana' })).rejects.toMatchObject({ code: 'look' });
    await expect(api.equipLook({ hat: 'meadow' })).rejects.toMatchObject({ code: 'look' });
    await expect(api.equipLook({ accessory: 'party_hat' })).rejects.toMatchObject({ code: 'look' });
  });
});

describe('leaderboard looks', () => {
  it('carries each player’s look on leaderboard rows', async () => {
    asUser('yak001');
    const rows = await api.leaderboard(50);
    for (const r of rows) expect(r.look).toEqual(load().users.find((u) => u.id === r.userId)!.look);
    expect(rows.some((r) => r.look?.hat || r.look?.background)).toBe(true);
  });
});

describe('Adventurer of the Month', () => {
  /** An ISO time `hours` into the America/New_York calendar month `k` months from now (EST/EDT-safe: day 10+). */
  const keyOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).format(new Date(iso));
  const inMonth = (k: number, hours = 0) => {
    const [y, m] = keyOf(new Date().toISOString()).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + k, 10, 12 + hours)).toISOString();
  };
  const fresh = () => {
    asUser('yak001');
    load().ledger = [];
    return { a: userBy('alum001'), b: userBy('alum002'), c: userBy('alum003') };
  };

  it('shows last month’s winner (final) over this month’s leader', async () => {
    const { a, b } = fresh();
    addLedger({ userId: a.id, amount: 30, source: 'manual', reason: 'last month' }, inMonth(-1));
    addLedger({ userId: b.id, amount: 500, source: 'manual', reason: 'this month' }, inMonth(0, -1));
    const s = (await api.monthlyShoutout())!;
    expect(s).toMatchObject({ userId: a.id, pointsThisMonth: 30, final: true, month: keyOf(inMonth(-1)) });
    expect(s.look).toEqual(a.look);
    expect(s).not.toHaveProperty('pointsThisWeek');
  });

  it('falls back to the current month’s leader when last month had no points', async () => {
    const { a, b } = fresh();
    addLedger({ userId: a.id, amount: 400, source: 'manual', reason: 'two months ago' }, inMonth(-2));
    addLedger({ userId: b.id, amount: 20, source: 'manual', reason: 'now' });
    const s = (await api.monthlyShoutout())!;
    expect(s).toMatchObject({ userId: b.id, pointsThisMonth: 20, final: false, month: keyOf(new Date().toISOString()) });
  });

  it('counts positive points of participants only; ties go to whoever got there first', async () => {
    const { a, b, c } = fresh();
    const admin = userBy('admin');
    addLedger({ userId: admin.id, amount: 999, source: 'manual', reason: 'admin' }, inMonth(-1));
    addLedger({ userId: a.id, amount: 40, source: 'manual', reason: 'x' }, inMonth(-1, 5)); // reaches 40 later
    addLedger({ userId: b.id, amount: 25, source: 'manual', reason: 'x' }, inMonth(-1, 1));
    addLedger({ userId: b.id, amount: 15, source: 'manual', reason: 'x' }, inMonth(-1, 3)); // reaches 40 first
    addLedger({ userId: c.id, amount: 45, source: 'manual', reason: 'x' }, inMonth(-1, 2));
    addLedger({ userId: c.id, amount: -20, source: 'manual', reason: 'fix' }, inMonth(-1, 4)); // corrections don't count…
    expect((await api.monthlyShoutout())?.userId).toBe(c.id); // …so c's 45 positive wins
    load().ledger = load().ledger.filter((l) => l.userId !== c.id);
    expect((await api.monthlyShoutout())?.userId).toBe(b.id);
  });

  it('returns null when nobody earned points this month or last', async () => {
    fresh();
    expect(await api.monthlyShoutout()).toBeNull();
  });

  it('awards the Adventurer of the Month badge only to a completed month’s winner', async () => {
    const { a, b } = fresh();
    addLedger({ userId: a.id, amount: 50, source: 'manual', reason: 'two months ago' }, inMonth(-2));
    addLedger({ userId: b.id, amount: 80, source: 'manual', reason: 'this month' });
    const star = (id: string) => api.__test.badgesFor(id).find((x) => x.id === 'monthly_star')!;
    expect(star(a.id)).toMatchObject({ earned: true, progress: 1, goal: 1 });
    expect(star(b.id)).toMatchObject({ earned: false, progress: 0, goal: 1 }); // leading now isn't enough
    asUser(b.handle);
    expect((await earned()).has('monthly_star')).toBe(false);
  });
});

describe('art', () => {
  it('has art for every cosmetic and badge', () => {
    for (const c of COSMETICS) {
      if (c.slot === 'hat') expect(HAT_ART[c.id]).toBeTruthy();
      if (c.slot === 'accessory' && c.id !== 'sparkles') expect(ACCESSORY_ART[c.id]).toBeTruthy();
      if (c.slot === 'background') expect(backgroundGrid(c.id)?.length).toBe(36);
    }
    for (const b of BADGES) {
      expect(BADGE_ART[b.id]).toBeTruthy();
      expect(badgeGrid(b.id).every((r) => r.length === 16)).toBe(true);
    }
  });
  it('layers background → character → accessory → hat', () => {
    const layers = composeLayers('knight', { hat: 'crown', accessory: 'medal', background: 'castle' });
    expect(layers).toHaveLength(4);
    expect(layers[0].grid).toBe(backgroundGrid('castle'));
    expect(layers[3].grid).toBe(HAT_ART.crown.grid);
  });
});

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
  it('returns all 14 badges in display order with progress', async () => {
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

describe('weekly shout-out', () => {
  it('picks the participant who gained the most points in the last 7 days', async () => {
    asUser('yak001');
    const target = userBy('alum042');
    addLedger({ userId: target.id, amount: 500, source: 'manual', reason: 'big week' });
    const s = (await api.weeklyShoutout())!;
    expect(s.userId).toBe(target.id);
    expect(s.pointsThisWeek).toBeGreaterThanOrEqual(500);
    expect(s.look).toEqual(target.look);
  });

  it('ignores negative corrections and old points', async () => {
    asUser('yak001');
    const d = load();
    const a = userBy('alum001');
    const b = userBy('alum002');
    d.ledger = d.ledger.filter(() => false);
    addLedger({ userId: a.id, amount: 30, source: 'manual', reason: 'x' });
    addLedger({ userId: a.id, amount: -25, source: 'manual', reason: 'fix' });
    addLedger({ userId: b.id, amount: 20, source: 'manual', reason: 'x' });
    addLedger({ userId: b.id, amount: 400, source: 'manual', reason: 'old' }, new Date(Date.now() - 10 * 86_400_000).toISOString());
    expect((await api.weeklyShoutout())?.userId).toBe(a.id); // 30 positive beats 20
  });

  it('returns null when nobody earned points this week', async () => {
    asUser('yak001');
    load().ledger = [];
    expect(await api.weeklyShoutout()).toBeNull();
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

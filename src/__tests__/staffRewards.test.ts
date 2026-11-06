/** STAFF-ONLY rewards (0020) in the mock backend: Hero of the Week, Council wardrobe + badges, Golden Yak. */
import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api/mock';
import { BADGES } from '../lib/badges';
import { COSMETICS } from '../lib/cosmetics';
import { HERO_ITEMS, STAFF_BADGES, STAFF_COSMETICS } from '../lib/staffRewards';
import { AVATAR_IDS, GRIDS } from '../components/Sprite';
import { composeLayers } from '../components/cosmetics/compose';
import { STAFF_ACCESSORY_ART, STAFF_BADGE_ART, STAFF_HAT_ART } from '../components/cosmetics/staffArt';
import { backgroundGrid } from '../components/cosmetics/backgrounds';

const { load, setSession } = api.__test;
const userBy = (handle: string) => load().users.find((u) => u.handle === handle)!;
const asUser = (handle: string) => {
  const u = userBy(handle);
  setSession(u.id);
  return u;
};
const STAFF_IDS = new Set([...STAFF_COSMETICS.map((c) => c.id), ...STAFF_BADGES.map((b) => b.id)]);
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code;
  }
};

beforeEach(async () => {
  await api.resetDemoData();
});

describe('staff-only data never reaches participants', () => {
  it('participants get no staff items, badges or character from any call', async () => {
    asUser('yak001');
    expect(await api.myStaffRewards()).toBeNull();
    expect((await api.myBadges()).some((b) => STAFF_IDS.has(b.id))).toBe(false);
    expect((await api.myUnlocks()).some((id) => STAFF_IDS.has(id))).toBe(false);
    expect(await code(api.heroBoard())).toBe('forbidden');
    expect(await code(api.crownHero(userBy('admin').id))).toBe('forbidden');
    expect(await code(api.clearHero())).toBe('forbidden');
    expect(await code(api.grantStaffReward(userBy('admin').id, 'royal_scepter'))).toBe('forbidden');
  });

  it('participants can’t equip staff items or the Golden Yak', async () => {
    asUser('yak001');
    expect(await code(api.equipLook({ background: 'council_chamber' }))).toBe('look');
    expect(await code(api.equipLook({ hat: 'hero_crown' }))).toBe('look');
    expect(await code(api.updateProfile({ avatar: 'golden_yak' }))).toBe('avatar');
    expect(userBy('yak001').avatar).toBe('yak');
  });

  it('keeps staff items out of the participant catalogues and pickers', () => {
    expect(COSMETICS.some((c) => STAFF_IDS.has(c.id))).toBe(false);
    expect(BADGES.some((b) => STAFF_IDS.has(b.id))).toBe(false);
    expect(AVATAR_IDS).not.toContain('golden_yak');
  });

  it('leaderboards never include staff (so never a staff look)', async () => {
    asUser('iesha');
    await api.crownHero(userBy('admin').id, 'test');
    asUser('admin');
    await api.equipLook({ hat: 'hero_crown', accessory: 'hero_cape', background: 'hall_of_heroes' });
    asUser('yak001');
    const rows = await api.leaderboard(1000);
    expect(rows.some((r) => r.userId === userBy('admin').id)).toBe(false);
    expect(rows.some((r) => [r.look?.hat, r.look?.accessory, r.look?.background].some((id) => id && STAFF_IDS.has(id)))).toBe(false);
    const s = await api.monthlyShoutout();
    expect(s && userBy('admin').id === s.userId).toBe(false);
  });
});

describe('Hero of the Week', () => {
  it('admins can see the board but only chairs crown, clear or grant', async () => {
    asUser('admin');
    const b = await api.heroBoard();
    expect(b.current).toBeNull();
    expect(b.history.map((h) => h.displayName)).toEqual(['Jacob R.']);
    expect(b.team.map((t) => t.handle).sort()).toEqual(['admin', 'iesha', 'jacob']);
    expect(await code(api.crownHero(userBy('admin').id))).toBe('forbidden');
    expect(await code(api.clearHero())).toBe('forbidden');
    expect(await code(api.grantStaffReward(userBy('admin').id, 'council_mvp'))).toBe('forbidden');
  });

  it('chair crowns; perks move to the new hero and come off the old one; count increments', async () => {
    const chair = asUser('iesha');
    expect(await code(api.crownHero(userBy('yak001').id))).toBe('not_staff');
    expect(await code(api.crownHero(userBy('admin').id, 'x'.repeat(121)))).toBe('note');
    await api.crownHero(userBy('admin').id, 'ran the pickleball check-in table');
    let b = await api.heroBoard();
    expect(b.current).toMatchObject({ displayName: 'YAC Helper', note: 'ran the pickleball check-in table', crownedByName: chair.displayName });
    expect(load().actions.slice(-1)[0]).toMatchObject({ action: 'hero_crowned', targetName: 'YAC Helper' });

    asUser('admin');
    let mine = (await api.myStaffRewards())!;
    expect(mine.isHero).toBe(true);
    expect(mine.heroCount).toBe(1);
    for (const id of HERO_ITEMS) expect(mine.unlocks).toContain(id);
    await api.equipLook({ hat: 'hero_crown', accessory: 'hero_cape', background: 'hall_of_heroes' });
    expect((await api.notifications()).some((n) => n.kind === 'hero_crowned' && n.title === 'You’re Hero of the Week!')).toBe(true);

    asUser('iesha');
    await api.crownHero(userBy('jacob').id);
    expect(userBy('admin').look).toBeUndefined();
    asUser('admin');
    mine = (await api.myStaffRewards())!;
    expect(mine.isHero).toBe(false);
    expect(await code(api.equipLook({ hat: 'hero_crown' }))).toBe('locked');

    asUser('iesha');
    await api.crownHero(userBy('admin').id, 'again');
    b = await api.heroBoard();
    expect(b.team.find((t) => t.handle === 'admin')!.heroCount).toBe(2);
    expect(b.team.find((t) => t.handle === 'jacob')!.heroCount).toBe(2); // seeded reign + this one
    expect(b.history.map((h) => h.displayName)).toEqual(['YAC Helper', 'Jacob R.', 'YAC Helper', 'Jacob R.']);
    await api.clearHero();
    expect((await api.heroBoard()).current).toBeNull();
    expect(await code(api.clearHero())).toBe('not_found');
    asUser('admin');
    const hero = (await api.myStaffRewards())!.badges.find((x) => x.id === 'hero_week')!;
    expect(hero).toMatchObject({ earned: true, progress: 2 });
  });
});

describe('Council wardrobe + badges', () => {
  it('seeds Gatekeeper progress for the demo admin and unlocks at the thresholds', async () => {
    const admin = asUser('admin');
    let mine = (await api.myStaffRewards())!;
    expect(mine.badges.map((b) => b.id)).toEqual(STAFF_BADGES.map((b) => b.id));
    expect(mine.badges.find((b) => b.id === 'gatekeeper')).toMatchObject({ earned: false, progress: 18, goal: 25 });
    expect(mine.unlocks).toEqual(['council_chamber']);

    // 7 more reviews → 25
    const pending = load().submissions.filter((s) => s.status === 'pending').slice(0, 7);
    for (const s of pending) await api.reviewSubmission(s.id, 'approved');
    mine = (await api.myStaffRewards())!;
    expect(mine.badges.find((b) => b.id === 'gatekeeper')).toMatchObject({ earned: true, progress: 25 });
    expect(mine.unlocks).toContain('gatekeeper_monocle');

    // 5 announcements → Town Crier + Herald's Horn
    for (let i = 0; i < 4; i++) await api.sendAnnouncement({ title: `Note ${i}`, body: 'hi', audience: 'user', userId: userBy('yak001').id, sendEmail: false });
    expect((await api.myStaffRewards())!.unlocks).not.toContain('heralds_horn');
    await api.sendAnnouncement({ title: 'Note 5', body: 'hi', audience: 'user', userId: userBy('yak001').id, sendEmail: false });
    mine = (await api.myStaffRewards())!;
    expect(mine.unlocks).toContain('heralds_horn');
    expect(mine.badges.find((b) => b.id === 'town_crier')!.earned).toBe(true);

    // 3 events with 5+ check-ins → Event Host + top hat (an event with 4 doesn't count)
    const base = { campus: 'duke' as const, crossCampus: false, kind: 'active' as const, location: 'Quad', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), checkInGraceMinutes: 60, password: 'HOST' };
    for (let i = 0; i < 3; i++) await api.createEvent({ ...base, title: `Hosted ${i}` });
    const mineEvents = load().events.filter((e) => load().eventCreators[e.id] === admin.id);
    mineEvents.forEach((e, i) => (e.attendeeCount = i === 2 ? 4 : 5));
    expect((await api.myStaffRewards())!.badges.find((b) => b.id === 'event_host')).toMatchObject({ earned: false, progress: 2 });
    mineEvents[2].attendeeCount = 5;
    mine = (await api.myStaffRewards())!;
    expect(mine.unlocks).toContain('host_top_hat');
    expect(mine.badges.find((b) => b.id === 'council_legend')).toMatchObject({ earned: false, progress: 3 });
    expect(mine.legendary).toBe(false);

    // + hero once → Council Legend → Golden Yak
    asUser('iesha');
    await api.crownHero(admin.id);
    asUser('admin');
    mine = (await api.myStaffRewards())!;
    expect(mine.badges.find((b) => b.id === 'council_legend')!.earned).toBe(true);
    expect(mine.legendary).toBe(true);
    const u = await api.updateProfile({ avatar: 'golden_yak' });
    expect(u.avatar).toBe('golden_yak');
  });

  it('chair grants items and Council MVP (Golden Yak), logged and notified', async () => {
    asUser('iesha');
    const jacob = userBy('jacob');
    expect(await code(api.grantStaffReward(userBy('yak001').id, 'royal_scepter'))).toBe('not_staff');
    expect(await code(api.grantStaffReward(jacob.id, 'sparkles'))).toBe('reward');
    await api.grantStaffReward(jacob.id, 'royal_scepter');
    expect(await code(api.grantStaffReward(jacob.id, 'royal_scepter'))).toBe('already');
    await api.grantStaffReward(jacob.id, 'council_mvp');
    expect(load().actions.slice(-1)[0]).toMatchObject({ action: 'staff_reward_granted', targetName: 'Jacob R.', details: { reward: 'council_mvp' } });
    asUser('jacob');
    const mine = (await api.myStaffRewards())!;
    expect(mine.legendary).toBe(true);
    expect(mine.unlocks).toContain('royal_scepter');
    expect((await api.equipLook({ accessory: 'royal_scepter' })).look).toEqual({ accessory: 'royal_scepter' });
    expect((await api.updateProfile({ avatar: 'golden_yak' })).avatar).toBe('golden_yak');
    expect((await api.notifications()).some((n) => n.kind === 'staff_reward' && n.title.includes('Golden Yak'))).toBe(true);
  });

  it('going back to participant unequips staff looks + Golden Yak but keeps the history', async () => {
    asUser('iesha');
    const helper = userBy('admin');
    await api.grantStaffReward(helper.id, 'council_mvp');
    await api.grantStaffReward(helper.id, 'starlit_throne');
    await api.crownHero(helper.id);
    asUser('admin');
    await api.updateProfile({ avatar: 'golden_yak' });
    await api.equipLook({ hat: 'hero_crown', accessory: 'hero_cape', background: 'starlit_throne' });
    asUser('iesha');
    await api.setRole(helper.id, 'participant');
    const after = userBy('admin');
    expect(after.avatar).toBe('ranger');
    expect(after.look).toBeUndefined();
    expect((await api.heroBoard()).current).toBeNull();
    asUser('admin');
    expect(await api.myStaffRewards()).toBeNull();
    expect(await code(api.equipLook({ background: 'starlit_throne' }))).toBe('look');
    expect(await code(api.updateProfile({ avatar: 'golden_yak' }))).toBe('avatar');
    asUser('iesha');
    await api.setRole(helper.id, 'admin');
    asUser('admin');
    const back = (await api.myStaffRewards())!;
    expect(back.legendary).toBe(true);
    expect(back.unlocks).toContain('starlit_throne');
    expect(back.heroCount).toBe(1);
  });
});

describe('staff art', () => {
  it('has art for every staff item, badge and the Golden Yak', () => {
    for (const c of STAFF_COSMETICS) {
      if (c.slot === 'background') expect(backgroundGrid(c.id)).toHaveLength(36);
      else expect(STAFF_HAT_ART[c.id] ?? STAFF_ACCESSORY_ART[c.id]).toBeTruthy();
    }
    for (const b of STAFF_BADGES) expect(STAFF_BADGE_ART[b.id]?.symbol).toHaveLength(10);
    expect(GRIDS.golden_yak).toHaveLength(32);
    for (const row of GRIDS.golden_yak) expect(row).toHaveLength(32);
    const layers = composeLayers('golden_yak', { hat: 'hero_crown', accessory: 'gatekeeper_monocle', background: 'hall_of_heroes' });
    expect(layers).toHaveLength(4);
  });
});

describe('hero pop-up', () => {
  it('turns the staff-only hero notification into a big celebration', async () => {
    const { notificationToCelebration } = await import('../lib/popups');
    const c = notificationToCelebration({ kind: 'hero_crowned', title: 'You’re Hero of the Week!', body: 'ran the pickleball check-in table' });
    expect(c).toMatchObject({ title: 'You’re Hero of the Week!', subtitle: 'ran the pickleball check-in table', size: 'big' });
  });
});

describe('Council team board (0021)', () => {
  it('participants are refused', async () => {
    asUser('yak001');
    expect(await code(api.councilBoard())).toBe('forbidden');
  });

  it('admins can read it: hero first, then chairs, then admins; badges, items, legendary', async () => {
    asUser('iesha');
    await api.crownHero(userBy('admin').id, 'test');
    await api.grantStaffReward(userBy('jacob').id, 'council_mvp');
    await api.grantStaffReward(userBy('jacob').id, 'royal_scepter');
    asUser('admin');
    const board = await api.councilBoard();
    expect(board.map((m) => m.handle)).toEqual(['admin', 'iesha', 'jacob']);
    const helper = board[0];
    expect(helper).toMatchObject({ isHero: true, heroCount: 1, role: 'admin', legendary: false, unlockCount: 4 }); // chamber + 3 hero perks
    expect(helper.badges.map((b) => b.id)).toEqual(STAFF_BADGES.map((b) => b.id));
    expect(helper.badges.find((b) => b.id === 'gatekeeper')).toMatchObject({ earned: false, progress: 18, goal: 25 });
    expect(helper.badges.find((b) => b.id === 'hero_week')).toMatchObject({ earned: true, progress: 1 });
    const jacob = board.find((m) => m.handle === 'jacob')!;
    expect(jacob).toMatchObject({ legendary: true, isHero: false, heroCount: 1, unlockCount: 2 });
    expect(board.some((m) => m.handle === 'yak001')).toBe(false);
  });
});

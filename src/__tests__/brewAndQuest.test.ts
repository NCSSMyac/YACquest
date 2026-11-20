import { describe, expect, it } from 'vitest';
import * as api from '../api/mock';
import { TIER_POINTS } from '../config';
import { BADGES, SPECIAL_BADGES, badgeById } from '../lib/badges';
import { COSMETICS } from '../lib/cosmetics';
import { duplicateForm, editForm } from '../lib/duplicateEvent';
import {
  BREW_PRESETS, DEFAULT_REWARD_MESSAGE, applyPreset, OUTFIT_SETS, continueFraction, continueLeft, countdown, fillMessage, fmtLeft, fmtStartsIn, genSecretWord,
  homePass, mergePasses, passState, passValidUntil, presetTitle, rewardBanners, rewardInputError, rewardLines, shortItem,
} from '../lib/rewardEvents';
import type { CoffeePass, YacEvent } from '../types';

const { load, setSession } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);
const MIN = 60_000;
const H = 60 * MIN;

const reward = { itemLabel: 'free coffee', limit: 10, venue: 'Cup of Joe', outfitSet: 'latte_night_scholar', message: DEFAULT_REWARD_MESSAGE };
const ev = { title: 'Brew & Quest @ Cup of Joe', startsAt: '2026-12-02T19:00:00Z', endsAt: '2026-12-02T21:00:00Z', reward };

// ───────────────────────────── pure helpers (fixed dates) ─────────────────────────────

describe('countdown banner text', () => {
  it('before the start: "☕ Brew & Quest starts in 1d 3h 12m" + the message', () => {
    const now = Date.parse('2026-12-01T15:48:00Z'); // 1 d 3 h 12 m before 19:00Z next day
    const c = countdown(ev, now);
    expect(c.phase).toBe('before');
    expect(c.headline).toBe('☕ Brew & Quest starts in 1d 3h 12m');
    expect(c.message).toBe('First quest: meet us at Cup of Joe! The first 10 people to meet us get coffee on us ☕');
  });
  it('during: message · h:mm:ss left (no count of passes left, ever)', () => {
    const now = Date.parse('2026-12-02T19:36:15Z');
    const c = countdown(ev, now);
    expect(c.phase).toBe('live');
    expect(c.headline).toBe('☕ First quest: meet us at Cup of Joe! The first 10 people to meet us get coffee on us · 1:23:45 left');
    expect(c.headline).not.toMatch(/left:|remaining|sold out/i);
  });
  it('after the end: over (no banner)', () => {
    expect(countdown(ev, Date.parse('2026-12-02T21:00:00Z')).phase).toBe('over');
  });
  it('formats', () => {
    expect(fmtStartsIn(3 * H + 12 * MIN)).toBe('3h 12m');
    expect(fmtStartsIn(12 * MIN + 5000)).toBe('12m 05s');
    expect(fmtStartsIn(45_000)).toBe('45s');
    expect(fmtLeft(H + 23 * MIN + 45_000)).toBe('1:23:45');
    expect(fmtLeft(-5)).toBe('0:00:00');
    expect(shortItem('free coffee')).toBe('coffee');
    expect(shortItem('Free hot cocoa')).toBe('hot cocoa');
    expect(fillMessage('{venue}/{limit}/{item}', { venue: '', limit: 6, itemLabel: 'free coffee' })).toBe('TBD/6/coffee');
  });
  it('banners: my campus (+ all-campus) only, live first, then soonest; checked-in / over hidden', () => {
    const now = Date.parse('2026-12-02T19:30:00Z');
    const mk = (id: string, campus: YacEvent['campus'], startsAt: string, endsAt: string, extra: object = {}) => ({ id, title: id, campus, startsAt, endsAt, reward, ...extra });
    const list = [
      mk('unc', 'unc', '2026-12-03T19:00:00Z', '2026-12-03T21:00:00Z'),
      mk('ncsu-live', 'ncsu', '2026-12-02T19:00:00Z', '2026-12-02T21:00:00Z'),
      mk('duke', 'duke', '2026-12-05T19:00:00Z', '2026-12-05T21:00:00Z'),
      mk('done', 'duke', '2026-12-01T19:00:00Z', '2026-12-01T21:00:00Z'),
      mk('mine-already', 'duke', '2026-12-02T19:00:00Z', '2026-12-02T21:00:00Z', { checkedIn: true }),
      { id: 'plain', title: 'Plain', campus: 'duke' as const, startsAt: '2026-12-02T19:00:00Z', endsAt: '2026-12-02T21:00:00Z' },
    ];
    expect(rewardBanners(list, 'duke', now).map((e) => e.id)).toEqual(['duke']);
    expect(rewardBanners(list, 'ncsu', now).map((e) => e.id)).toEqual(['ncsu-live']);
    expect(rewardBanners(list, undefined, now).map((e) => e.id)).toEqual(['ncsu-live', 'unc', 'duke']);
  });
});

describe('Coffee Pass + reveal helpers', () => {
  const pass: CoffeePass = { eventId: 'e', eventTitle: 'B&Q', campus: 'ncsu', passNo: 7, limit: 30, venue: 'Cup of Joe', item: 'free coffee', secretWord: 'MOCHA-42', checkedInAt: '2026-12-02T19:15:00Z', validUntil: passValidUntil('2026-12-02T19:15:00Z') };
  it('valid for exactly 30 minutes after check-in, then expired; used wins', () => {
    expect(pass.validUntil).toBe('2026-12-02T19:45:00.000Z');
    expect(passState(pass, Date.parse('2026-12-02T19:44:59Z'))).toBe('valid');
    expect(passState(pass, Date.parse('2026-12-02T19:45:00Z'))).toBe('expired');
    expect(passState({ ...pass, usedAt: '2026-12-02T19:31:00Z' }, Date.parse('2026-12-02T19:32:00Z'))).toBe('used');
    expect(homePass([pass], Date.parse('2026-12-02T19:40:00Z'))?.passNo).toBe(7);
    expect(homePass([pass], Date.parse('2026-12-02T19:50:00Z'))).toBeNull();
  });
  it('offline: a remembered pass fills in the secret word the server copy lacks', () => {
    const merged = mergePasses([{ ...pass, secretWord: undefined }], [pass]);
    expect(merged[0].secretWord).toBe('MOCHA-42');
    expect(mergePasses([{ ...pass, secretWord: undefined, usedAt: '2026-12-02T19:31:00Z' }], [pass])[0].secretWord).toBeUndefined();
  });
  it('"Continue (8)" drains to 0 and auto-continues', () => {
    const t0 = Date.parse('2026-12-02T19:15:00Z');
    expect(continueLeft(t0, t0)).toBe(8);
    expect(continueLeft(t0, t0 - 500)).toBe(8); // not started yet
    expect(continueLeft(t0, t0 + 1)).toBe(8);
    expect(continueLeft(t0, t0 + 1000)).toBe(7);
    expect(continueLeft(t0, t0 + 7_999)).toBe(1);
    expect(continueLeft(t0, t0 + 8_000)).toBe(0);
    expect(continueLeft(t0, t0 + 60_000)).toBe(0);
    expect(continueFraction(t0, t0 + 4_000)).toBeCloseTo(0.5);
    expect(rewardLines(20, 3, true)).toEqual(['+20 points · new outfit (3 pieces)', '+ Early Bird ☕ badge']);
    expect(rewardLines(20, 3, false)).toEqual(['+20 points · new outfit (3 pieces)']);
    expect(rewardLines(20, 3, false, true)).toEqual(['+20 points · outfit already in your wardrobe']);
  });
});

describe('admin setup helpers', () => {
  it('Brew & Quest preset: 3 campus events, dates fixed, times left for the admin', () => {
    expect(BREW_PRESETS.map((p) => [p.campus, p.venue, p.date, p.limit])).toEqual([
      ['ncsu', 'Cup of Joe', '2026-12-02', 10], ['unc', 'Epilogue', '2026-12-03', 30], ['duke', 'Mad Hatter’s Café', '2026-12-05', 6],
    ]);
    expect(presetTitle(BREW_PRESETS[0])).toBe('Brew & Quest @ Cup of Joe');
    expect(presetTitle(BREW_PRESETS[2])).toBe('Brew & Quest @ Mad Hatter’s Café');
    expect(presetTitle({ venue: 'TBD', campus: 'duke' })).toBe('Brew & Quest @ Duke');
    const f = applyPreset({ title: '', campus: 'duke', kind: 'high_impact', location: '', start: '2026-11-20T18:00', end: '2026-11-20T20:00', grace: 60, password: 'YAK-1', surveyUrl: '', reward: null }, BREW_PRESETS[1]);
    expect(f).toMatchObject({ title: 'Brew & Quest @ Epilogue', campus: 'unc', kind: 'active', location: 'Epilogue', start: '', end: '' });
    expect(f.reward).toMatchObject({ itemLabel: 'free coffee', limit: '30', venue: 'Epilogue', outfitSet: 'latte_night_scholar' });
    expect(f.reward!.secretWord).toMatch(/^[A-Z]+-\d{2}$/);
  });
  it('secret words look like MOCHA-42; validation mirrors the server', () => {
    for (let i = 0; i < 50; i++) expect(genSecretWord()).toMatch(/^[A-Z]+-[1-9]\d$/);
    expect(genSecretWord(() => 0)).toBe('MOCHA-10');
    const ok = { itemLabel: 'free coffee', limit: 30, venue: 'Epilogue', secretWord: '', message: 'x' };
    expect(rewardInputError(ok)).toBeNull();
    expect(rewardInputError({ ...ok, limit: 0 })).toMatch(/Limit/);
    expect(rewardInputError({ ...ok, secretWord: 'AB' })).toMatch(/Secret/);
    expect(rewardInputError({ ...ok, message: ' ' })).toMatch(/message/);
  });
  it('duplicating a special event keeps the setup but never the old secret word', () => {
    const e: YacEvent = { id: 'x', title: 'B&Q', campus: 'unc', crossCampus: false, kind: 'active', location: 'Epilogue', startsAt: '2026-12-03T19:00:00Z', endsAt: '2026-12-03T21:00:00Z', checkInGraceMinutes: 30, password: 'P-1', activityId: 'home_event', attendeeCount: 0, reward: { ...reward, secretWord: 'MOCHA-42', issued: 3, used: 1 } };
    expect(editForm(e).reward?.secretWord).toBe('MOCHA-42');
    expect(duplicateForm(e, 'P-2').reward).toMatchObject({ secretWord: '', limit: '10', venue: 'Cup of Joe' });
  });
  it('Latte Night Scholar: 3 event-only pieces; Early Bird is special (16 core badges unchanged)', () => {
    expect(OUTFIT_SETS[0].items).toEqual(['cozy_beanie', 'latte_aplus', 'moonlit_nook']);
    expect(COSMETICS.filter((c) => c.rule.type === 'event').map((c) => c.slot)).toEqual(['hat', 'accessory', 'background']);
    expect(BADGES).toHaveLength(16);
    expect(SPECIAL_BADGES.map((b) => b.id)).toEqual(['early_bird']);
    expect(badgeById('early_bird')?.how).toBe('One of the first to meet us at a Brew & Quest — coffee was on us!');
  });
});

// ───────────────────────────── mock API (mirrors 0033) ─────────────────────────────

describe('Brew & Quest check-ins (mock API)', () => {
  const live = (title: string, limit: number) => ({
    title, campus: 'ncsu' as const, crossCampus: false, kind: 'active' as const, location: 'Cup of Joe',
    startsAt: new Date(Date.now() - 10 * MIN).toISOString(), endsAt: new Date(Date.now() + 2 * H).toISOString(), checkInGraceMinutes: 30,
    password: 'BREWTEST', reward: { ...reward, limit, secretWord: 'mocha-42' },
  });

  it('first N participants get passes in order; staff never; one per person across events; outfit for all', async () => {
    // people with no pass from the demo seed yet
    const fresh = load().users.filter((u) => u.role === 'participant' && u.handle.startsWith('alum') && !(load().rewardPasses ?? []).some((p) => p.userId === u.id) && !(load().eventUnlocks ?? []).some((x) => x.userId === u.id)).map((u) => u.handle);
    const [p1, p2, p3, p4, p5] = fresh;
    asUser('iesha');
    const a = await api.createEvent(live('Brew & Quest Test A', 2));
    const b = await api.createEvent(live('Brew & Quest Test B', 5));
    const adminView = (await api.adminListEvents()).find((e) => e.id === a.id)!;
    expect(adminView.reward).toMatchObject({ secretWord: 'MOCHA-42', issued: 0, limit: 2 });

    // staff first: points + outfit, no pass
    const staff = await api.checkIn(a.id, 'brewtest');
    expect(staff.points).toBe(TIER_POINTS[2]);
    expect(staff.reward?.items).toEqual(['cozy_beanie', 'latte_aplus', 'moonlit_nook']);
    expect(staff.reward?.pass).toBeUndefined();

    // participants never see the secret word or counts in the event list
    asUser(p1);
    const seen = (await api.listEvents('upcoming')).find((e) => e.id === a.id)!;
    expect(seen.reward).toEqual({ itemLabel: 'free coffee', limit: 2, venue: 'Cup of Joe', outfitSet: 'latte_night_scholar', message: DEFAULT_REWARD_MESSAGE, emoji: '☕', passName: 'Coffee Pass', campaignName: 'Brew & Quest 2026' });
    expect(JSON.stringify(seen)).not.toMatch(/MOCHA|issued/);
    expect(await code(api.adminEventPasses(a.id))).toBe('forbidden');

    const r1 = await api.checkIn(a.id, 'BREWTEST');
    expect(r1.reward?.pass).toMatchObject({ passNo: 1, limit: 2, venue: 'Cup of Joe', item: 'free coffee', secretWord: 'MOCHA-42' });
    expect(Date.parse(r1.reward!.pass!.validUntil) - Date.parse(r1.reward!.pass!.checkedInAt)).toBe(30 * MIN);
    expect(r1.reward?.badge).toBe('early_bird');
    expect(r1.reward?.alreadyOwned).toBeUndefined();
    expect((await api.myBadges()).find((x) => x.id === 'early_bird')?.earned).toBe(true);

    asUser(p2);
    expect((await api.checkIn(a.id, 'brewtest')).reward?.pass?.passNo).toBe(2);

    asUser(p3);
    const late = await api.checkIn(a.id, 'brewtest');
    expect(late.points).toBe(TIER_POINTS[2]);
    expect(late.reward?.pass).toBeUndefined();
    expect(late.reward?.badge).toBeUndefined();
    expect(JSON.stringify(late)).not.toMatch(/MOCHA|limit|issued|sold/i);
    expect(await api.myUnlocks()).toEqual(expect.arrayContaining(['cozy_beanie', 'latte_aplus', 'moonlit_nook']));
    expect((await api.myBadges()).find((x) => x.id === 'early_bird')?.earned).toBe(false);
    await api.equipLook({ hat: 'cozy_beanie', accessory: 'latte_aplus', background: 'moonlit_nook' });
    expect((await api.myEventRewards()).unseen).toHaveLength(3);
    expect(await api.markEventUnlocksSeen()).toBe(3);
    expect((await api.myEventRewards()).unseen).toHaveLength(0);

    // one free item per person across ALL Brew & Quest events
    asUser(p1);
    const again = await api.checkIn(b.id, 'brewtest');
    expect(again.reward?.pass).toBeUndefined();
    expect(again.reward?.items).toHaveLength(3);
    expect(again.reward?.alreadyOwned).toBe(true); // reveal says "already in your wardrobe", not NEW OUTFIT
    asUser(p4);
    expect((await api.checkIn(b.id, 'brewtest')).reward?.pass?.passNo).toBe(1);

    // never obtainable otherwise
    asUser(p5);
    expect(await code(api.equipLook({ hat: 'cozy_beanie' }))).toBe('locked');

    // self + staff mark used; staff list in pass order
    asUser(p1);
    expect((await api.markPassUsed(a.id)).usedBy).toBe('self');
    expect((await api.myEventRewards()).passes[0]).toMatchObject({ passNo: 1, usedBy: 'self' });
    expect((await api.myEventRewards()).passes[0].secretWord).toBeUndefined();
    asUser(p3);
    expect(await code(api.markPassUsed(a.id))).toBe('not_found');
    asUser('iesha');
    await api.adminMarkPassUsed(a.id, load().users.find((u) => u.handle === p2)!.id);
    const door = await api.adminEventPasses(a.id);
    expect(door).toMatchObject({ limit: 2, issued: 2, used: 2, secretWord: 'MOCHA-42' });
    expect(door.passes.map((p) => [p.passNo, p.displayName, p.usedBy])).toEqual([
      [1, load().users.find((u) => u.handle === p1)!.displayName, 'self'],
      [2, load().users.find((u) => u.handle === p2)!.displayName, 'staff'],
    ]);
    await api.adminMarkPassUsed(a.id, load().users.find((u) => u.handle === p2)!.id, false);
    expect((await api.adminEventPasses(a.id)).used).toBe(1);
    expect(await code(api.updateEvent(a.id, { ...live('Brew & Quest Test A', 2), reward: null }))).toBe('has_passes');
    expect(await code(api.updateEvent(a.id, { ...live('Brew & Quest Test A', 1) }))).toBe('limit');

    // expiry (fixed date): a 2:15 PM pass can't be marked after 2:45 PM
    asUser(p4);
    load().rewardPasses!.find((p) => p.eventId === b.id)!.createdAt = '2025-12-02T19:15:00.000Z';
    expect(await code(api.markPassUsed(b.id))).toBe('expired');
    expect((await api.myEventRewards()).passes[0]).toMatchObject({ validUntil: '2025-12-02T19:45:00.000Z' });
    expect((await api.myEventRewards()).passes[0].secretWord).toBeUndefined();
  });

  it('normal events are unchanged (no reward)', async () => {
    asUser('alum006');
    const plain = load().events.find((e) => e.title === 'Pack Game Watch')!;
    const r = await api.checkIn(plain.id, plain.password!);
    expect(r.reward).toBeUndefined();
  });
});

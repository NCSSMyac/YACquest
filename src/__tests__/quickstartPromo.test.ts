/**
 * 0034: quick start sign-ups (the app's own email confirmation), mystery teaser, bring-a-friend, campus
 * scoreboard, recap card, Finals Study Break, reusable campaigns, Wardrobe → Collection.
 * Pure helpers use fixed dates; the mock API mirrors 0034_quickstart_promo_collection.sql (the database
 * tests in supabase/tests/tests.sql cover the real thing).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/mock';
import { CAMPUS_THANKS, CAPS, PRIZE, QUEST_WINDOWS } from '../config';
import { collectionGroups, collectionProgress, COLLECTIBLE_IDS } from '../lib/collection';
import {
  COFFEE_LINES, FINALS_CHEERS, bringFriendText, canBringFriend, finalsCheer, finalsSeason, homeTeaser, isSeasonalQuest, publicTeaser, questOpen,
  questWindowEnd, recapModel, scoreboardLine, scoreboardRows, seriesWindowOpen, speaksOnTap, speechLine, startsLabel, wearsCoffee,
} from '../lib/promo';
import { VERIFY_BAR_TEXT, isVerified, markVerifyBarAlerted, maskEmail, resetVerifyBarAlerted, showVerifyBar, tokenFromQuery, verifyBarRole, verifyBarText } from '../lib/quickstart';
import { DEFAULT_CAMPAIGN, campaignInputError, campaignLabels, campaignSlug, countdown, isCoffee, passLabels, pluralItem } from '../lib/rewardEvents';
import { hexToRgba, campaignColorGlow } from '../components/reward/glow';
import { lookCardModel } from '../lib/lookCard';
import type { EventRecap, RewardCampaign } from '../types';

const { load, setSession, addLedger, pointsOf } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);
const D = 86_400_000;

const signup = (handle: string, extra: Partial<Parameters<typeof api.signup>[0]> = {}) =>
  api.signup({ handle, displayName: `${handle[0].toUpperCase()}${handle.slice(1)} Q`, email: `${handle}@example.com`, password: 'password1', campus: 'unc', avatar: 'yak', acceptedRules: true, ...extra });
const tokenFor = (email: string) => {
  const m = (load().messages ?? []).filter((x) => x.kind === 'verify_email' && x.email === email).slice(-1)[0];
  return m?.text.match(/#\/verify\?t=([0-9a-f]+)/)?.[1] ?? '';
};

beforeEach(async () => {
  await api.resetDemoData();
});
afterEach(() => {
  vi.useRealTimers();
});

// ───────────────────────────── quick start: pure ─────────────────────────────

describe('quick start helpers', () => {
  it('isVerified: 0034 servers use emailVerifiedAt; older ones the Supabase flag', () => {
    expect(isVerified({ emailVerifiedAt: null, emailVerified: true })).toBe(false);
    expect(isVerified({ emailVerifiedAt: '2026-11-01T00:00:00Z' })).toBe(true);
    expect(isVerified({ emailVerified: false })).toBe(false);
    expect(isVerified({})).toBe(true); // seeded / older accounts
  });
  it('red bar: only for unconfirmed people, never on the Coffee Pass', () => {
    const un = { emailVerifiedAt: null };
    expect(showVerifyBar(un, '/', null, 'k1')).toBe(true);
    expect(showVerifyBar(un, '/admin/events', null, 'k1')).toBe(true);
    expect(showVerifyBar(un, '/coffee-pass', null, 'k1')).toBe(false);
    expect(showVerifyBar({ emailVerifiedAt: '2026-11-11T00:00:00Z' }, '/', null, 'k1')).toBe(false);
    expect(showVerifyBar(null, '/', null, 'k1')).toBe(false);
    expect(showVerifyBar({ emailVerified: true }, '/', null, 'k1')).toBe(false); // server without 0034
  });
  it('red bar: × hides it for this page view only (back on the next navigation; a reload resets the state)', () => {
    const un = { emailVerifiedAt: null };
    expect(showVerifyBar(un, '/earn', 'k1', 'k1')).toBe(false); // dismissed on this page view
    expect(showVerifyBar(un, '/ranks', 'k1', 'k2')).toBe(true); // navigated: new location key
    expect(showVerifyBar(un, '/earn', 'k1', 'k3')).toBe(true); // back to the same path is a new view too
    expect(showVerifyBar(un, '/earn', null, 'k1')).toBe(true); // reload: dismissal state is gone
  });
  it('red bar text: "(day N)" from day 3', () => {
    const created = '2026-11-10T12:00:00Z';
    expect(verifyBarText({ createdAt: created }, Date.parse('2026-11-12T12:00:00Z'))).toBe(VERIFY_BAR_TEXT);
    expect(verifyBarText({ createdAt: created }, Date.parse('2026-11-13T11:59:00Z'))).toBe(VERIFY_BAR_TEXT);
    expect(verifyBarText({ createdAt: created }, Date.parse('2026-11-13T12:00:00Z'))).toBe(`${VERIFY_BAR_TEXT} (day 3)`);
    expect(verifyBarText({ createdAt: created }, Date.parse('2026-11-20T12:00:00Z'))).toMatch(/\(day 10\)$/);
    expect(VERIFY_BAR_TEXT).toBe('⚠️ Confirm your email to keep your points & prize spot. Check your Spam/Promotions folder for an email from YACquest.');
  });
  it('red bar role: alert the first time, then status', () => {
    resetVerifyBarAlerted();
    expect(verifyBarRole()).toBe('alert');
    markVerifyBarAlerted();
    expect(verifyBarRole()).toBe('status');
    resetVerifyBarAlerted();
  });
  it('token from #/verify?t= and masked email', () => {
    expect(tokenFromQuery(' ABCDEF0123456789abcdef0123456789 ')).toBe('abcdef0123456789abcdef0123456789');
    expect(tokenFromQuery('<script>')).toBe('');
    expect(tokenFromQuery(null)).toBe('');
    expect(maskEmail('quinn@gmail.com')).toBe('q•••@gmail.com');
  });
});

// ───────────────────────────── quick start: mock API ─────────────────────────────

describe('verification token flow (mock API)', () => {
  it('sign-up logs straight in, unverified, with a personalized confirmation email (priority 1, 7 days)', async () => {
    const r = await signup('quinn');
    expect(r.needsEmailConfirmation).toBe(false);
    expect(r.user?.emailVerifiedAt).toBeNull();
    expect((await api.currentUser())?.handle).toBe('quinn');
    const m = (load().messages ?? []).find((x) => x.kind === 'verify_email' && x.email === 'quinn@example.com')!;
    expect(m.subject).toBe('Confirm your YACquest email');
    expect(m.subject).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(m.text.startsWith('Hi Quinn,')).toBe(true);
    expect(m.priority).toBe(1);
    expect(new Date(m.sendBefore!).getTime() - new Date(m.createdAt).getTime()).toBe(7 * D);
  });
  it('the token alone verifies (logged out), single use; bad and expired links explain themselves', async () => {
    await signup('robin');
    const t = tokenFor('robin@example.com');
    expect(t).toMatch(/^[0-9a-f]{48}$/);
    setSession(null);
    expect(await code(api.verifyEmail('nothex!'))).toBe('invalid');
    expect(await code(api.verifyEmail('ab'.repeat(24)))).toBe('invalid');
    expect(await api.verifyEmail(t)).toEqual({ status: 'verified' });
    expect(await code(api.verifyEmail(t))).toBe('used');
    const u = load().users.find((x) => x.handle === 'robin')!;
    expect(isVerified(u)).toBe(true);
    expect(load().notifications.some((n) => n.userId === u.id && n.title === 'Email confirmed ✓')).toBe(true);

    await signup('sky');
    const t2 = tokenFor('sky@example.com');
    load().verifyTokens!.find((x) => x.token === t2)!.expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(await code(api.verifyEmail(t2))).toBe('expired');
  });
  it('resend: 3 per hour, then rate_limit; nothing to do once verified', async () => {
    await signup('remy');
    for (let i = 0; i < 3; i++) expect((await api.resendVerification()).resendsLeft).toBe(2 - i);
    expect(await code(api.resendVerification())).toBe('rate_limit');
    expect((load().messages ?? []).filter((x) => x.kind === 'verify_email' && x.email === 'remy@example.com')).toHaveLength(4);
    for (const x of load().verifyTokens!) x.createdAt = new Date(Date.now() - 61 * 60_000).toISOString();
    expect(await code(api.resendVerification())).toBe('ok');
    await api.verifyEmail(tokenFor('remy@example.com'));
    expect(await code(api.resendVerification())).toBe('already_verified');
  });
  it('emails: participant emails skip unverified people (in-app still); the confirmation email never does', async () => {
    await signup('nova', { emailOptIn: false });
    const nova = load().users.find((x) => x.handle === 'nova')!;
    expect((load().messages ?? []).find((x) => x.kind === 'verify_email' && x.email === 'nova@example.com')?.status).toBe('pending');
    nova.emailOptIn = true;
    asUser('admin');
    await api.sendAnnouncement({ title: 'Hello there', body: 'Hi!', audience: 'user', userId: nova.id, sendEmail: true });
    expect((load().messages ?? []).find((x) => x.kind === 'announcement' && x.email === 'nova@example.com')?.status).toBe('skipped_unverified');
    expect(load().notifications.some((n) => n.userId === nova.id && n.title === 'Hello there')).toBe(true);
  });
  it('staff roles need a confirmed email (set_role + transfer_chair)', async () => {
    await signup('kit');
    const kit = load().users.find((x) => x.handle === 'kit')!;
    asUser('iesha');
    expect(await code(api.setRole(kit.id, 'admin'))).toBe('not_verified');
    expect(await code(api.setRole(kit.id, 'chair'))).toBe('not_verified');
    expect(await code(api.transferChair(kit.id))).toBe('not_verified');
    expect((await api.listTeam()).every((m) => m.emailVerified)).toBe(true);
    setSession(null);
    await api.verifyEmail(tokenFor('kit@example.com'));
    asUser('iesha');
    expect(await code(api.setRole(kit.id, 'admin'))).toBe('ok');
  });
  it('prize race skips unverified people; on verify they get an open spot with their real crossing time', async () => {
    await signup('ada');
    const ada = load().users.find((x) => x.handle === 'ada')!;
    const bob = load().users.find((x) => x.role === 'participant' && x.handle.startsWith('alum') && isVerified(x))!;
    addLedger({ userId: ada.id, amount: PRIZE.goal, source: 'manual', reason: 'test: Ada crosses first' }, '2027-03-01T15:00:00.000Z');
    expect(load().claims.some((c) => c.userId === ada.id)).toBe(false);
    expect(load().notifications.filter((n) => n.userId === ada.id && n.title === 'Confirm your email to claim a prize spot')).toHaveLength(1);
    addLedger({ userId: bob.id, amount: PRIZE.goal - pointsOf(bob.id), source: 'manual', reason: 'test: Bob crosses later' }, '2027-03-02T15:00:00.000Z');
    expect(load().claims.find((c) => c.userId === bob.id && c.status !== 'revoked')?.spot).toBe(1);
    setSession(null);
    await api.verifyEmail(tokenFor('ada@example.com'));
    const c = load().claims.find((x) => x.userId === ada.id && x.status !== 'revoked')!;
    expect(c.spot).toBe(2);
    expect(c.qualifiedAt).toBe('2027-03-01T15:00:00.000Z');
  });
});

// ───────────────────────────── mystery teaser ─────────────────────────────

describe('mystery outfit teaser', () => {
  const reward = { itemLabel: 'free coffee', limit: 10, venue: 'Cup of Joe', outfitSet: 'latte_night_scholar', message: 'x', emoji: '☕' };
  const evs = [
    { id: 'ncsu', title: 'Brew & Quest @ Cup of Joe', campus: 'ncsu' as const, startsAt: '2026-12-02T19:00:00Z', endsAt: '2026-12-02T21:00:00Z', reward },
    { id: 'unc', title: 'Brew & Quest @ Epilogue', campus: 'unc' as const, startsAt: '2026-12-03T19:00:00Z', endsAt: '2026-12-03T21:00:00Z', reward },
    { id: 'plain', title: 'Trivia', campus: 'unc' as const, startsAt: '2026-11-25T19:00:00Z', endsAt: '2026-11-25T21:00:00Z' },
  ];
  it('shows within 14 days of the series, RSVP to my campus first', () => {
    const t = homeTeaser(evs, [], 'unc', Date.parse('2026-11-20T12:00:00Z'))!;
    expect(t).toMatchObject({ outfitSet: 'latte_night_scholar', name: 'Brew & Quest', emoji: '☕' });
    expect(t.rsvp?.id).toBe('unc');
    expect(homeTeaser(evs, [], 'duke', Date.parse('2026-11-20T12:00:00Z'))!.rsvp?.id).toBe('ncsu');
  });
  it('hidden more than 14 days before, after the series, and once I own the whole outfit', () => {
    expect(homeTeaser(evs, [], 'unc', Date.parse('2026-11-17T18:00:00Z'))).toBeNull();
    expect(homeTeaser(evs, [], 'unc', Date.parse('2026-12-04T00:00:00Z'))).toBeNull();
    expect(homeTeaser(evs, ['cozy_beanie', 'latte_aplus'], 'unc', Date.parse('2026-11-20T12:00:00Z'))).not.toBeNull();
    expect(homeTeaser(evs, ['cozy_beanie', 'latte_aplus', 'moonlit_nook'], 'unc', Date.parse('2026-11-20T12:00:00Z'))).toBeNull();
  });
  it('public (Login / Sign-up) teaser + "starts" labels', () => {
    const list = [{ outfitSet: 'latte_night_scholar', name: 'Brew & Quest', emoji: '☕', startsAt: '2026-12-02T19:00:00Z', events: [] }];
    expect(publicTeaser(list, Date.parse('2026-11-20T00:00:00Z'))?.name).toBe('Brew & Quest');
    expect(publicTeaser(list, Date.parse('2026-11-01T00:00:00Z'))).toBeNull();
    expect(startsLabel('2026-12-02T19:00:00Z', Date.parse('2026-11-20T12:00:00Z'))).toBe('starts Dec 2');
    expect(startsLabel('2026-12-02T19:00:00Z', Date.parse('2026-12-01T17:00:00Z'))).toBe('starts tomorrow');
    expect(startsLabel('2026-12-02T19:00:00Z', Date.parse('2026-12-02T15:00:00Z'))).toBe('starts today');
  });
  it('mock reward_teaser: logged out OK, no venue / secret / counts', async () => {
    setSession(null);
    const t = await api.rewardTeaser();
    expect(t[0]).toMatchObject({ outfitSet: 'latte_night_scholar', name: 'Brew & Quest', emoji: '☕' });
    expect(JSON.stringify(t)).not.toMatch(/MOCHA|Cup of Joe|Study Café|limit/);
  });
});

// ───────────────────────────── bring a friend ─────────────────────────────

describe('bring-a-friend moment', () => {
  it('hidden once all friend bonuses are used', () => {
    expect(canBringFriend(0)).toBe(true);
    expect(canBringFriend(CAPS.referralsPerCycle - 1)).toBe(true);
    expect(canBringFriend(CAPS.referralsPerCycle)).toBe(false);
    expect(canBringFriend(null)).toBe(true); // unknown (offline) → show
  });
  it('share text carries the sign-up link with the code', () => {
    const t = bringFriendText('YAC-7Q2K', 'https://ncssmyac.github.io/YACquest/#/signup');
    expect(t).toContain('https://ncssmyac.github.io/YACquest/#/signup?code=YAC-7Q2K');
    expect(t).toContain('+35');
  });
});

// ───────────────────────────── scoreboard ─────────────────────────────

describe('live campus scoreboard', () => {
  it('rows: highest first with campus colors and bar widths; the one-line text', () => {
    const sb = { campuses: [{ campus: 'duke' as const, count: 7 }, { campus: 'unc' as const, count: 24 }, { campus: 'ncsu' as const, count: 11 }] };
    expect(scoreboardLine(sb)).toBe('UNC 24 · NC State 11 · Duke 7');
    const rows = scoreboardRows(sb);
    expect(rows.map((r) => [r.campus, r.color, r.pct])).toEqual([['unc', '#7bafd4', 100], ['ncsu', '#cc0000', 46], ['duke', '#00539b', 29]]);
    expect(scoreboardRows({ campuses: [{ campus: 'duke', count: 0 }] })[0].pct).toBe(4);
  });
  it('series window: 3 days before the first event → 1 day after the last', () => {
    const first = '2026-12-02T19:00:00Z';
    const last = '2026-12-05T21:00:00Z';
    expect(seriesWindowOpen(first, last, Date.parse('2026-11-29T18:59:00Z'))).toBe(false);
    expect(seriesWindowOpen(first, last, Date.parse('2026-11-29T19:00:00Z'))).toBe(true);
    expect(seriesWindowOpen(first, last, Date.parse('2026-12-06T21:00:00Z'))).toBe(true);
    expect(seriesWindowOpen(first, last, Date.parse('2026-12-06T21:01:00Z'))).toBe(false);
  });
  it('mock reward_scoreboard counts participants only', async () => {
    asUser('yak001');
    const before = await api.rewardScoreboard();
    expect(before?.name).toBe('Brew & Quest');
    const total = (s: typeof before) => s!.campuses.reduce((n, c) => n + c.count, 0);
    const live = load().events.find((e) => e.title === 'Brew & Quest @ The Study Café')!;
    asUser('admin');
    await api.checkIn(live.id, 'brew');
    asUser('yak001');
    expect(total(await api.rewardScoreboard())).toBe(total(before)); // staff don't count
    await api.checkIn(live.id, 'brew');
    const after = (await api.rewardScoreboard())!;
    expect(total(after)).toBe(total(before) + 1);
    expect(after.campuses.find((c) => c.campus === 'duke')!.count).toBe(before!.campuses.find((c) => c.campus === 'duke')!.count + 1);
  });
});

// ───────────────────────────── recap card ─────────────────────────────

describe('Instagram recap card', () => {
  const recap: EventRecap = {
    eventId: 'e1', title: 'Brew & Quest @ Cup of Joe', location: 'Cup of Joe', venue: 'Cup of Joe', campus: 'ncsu', startsAt: '2026-12-02T19:00:00Z', endsAt: '2026-12-02T21:00:00Z',
    attendees: 38, reward: { itemLabel: 'free coffee', limit: 10, outfitSet: 'latte_night_scholar', given: 10, passName: 'Coffee Pass', emoji: '☕' }, characters: [],
  };
  it('headline, free items given, campus thank-you and colors', () => {
    const m = recapModel(recap);
    expect(m.headline).toBe('38 adventurers met us at Cup of Joe ☕');
    expect(m.given).toBe('10 free coffees given');
    expect(m.thanks).toBe('Thank you, Wolfpack!');
    expect(m.colors).toEqual(['#cc0000']);
    expect(m.dateLine).toBe('Wednesday, December 2');
  });
  it('thank-you per campus; all campuses = Triangle (three stripes)', () => {
    expect(recapModel({ ...recap, campus: 'duke' }).thanks).toBe(CAMPUS_THANKS.duke);
    expect(recapModel({ ...recap, campus: 'unc' }).thanks).toBe('Thank you, Tar Heels!');
    expect(recapModel({ ...recap, campus: 'duke' }).thanks).toBe('Thank you, Blue Devils!');
    const all = recapModel({ ...recap, campus: 'all', venue: 'TBD', reward: undefined, attendees: 1 });
    expect(all.thanks).toBe('Thank you, Triangle!');
    expect(all.colors).toHaveLength(3);
    expect(all.headline).toBe('1 adventurer met us at the Triangle ☕');
    expect(all.given).toBeUndefined();
  });
  it('mock admin_event_recap: staff only, characters (max 12) and never names', async () => {
    asUser('yak001');
    const past = load().events.find((e) => e.title === 'Brew & Quest @ Epilogue')!;
    expect(await code(api.adminEventRecap(past.id))).toBe('forbidden');
    asUser('admin');
    const r = await api.adminEventRecap(past.id);
    expect(r.attendees).toBeGreaterThanOrEqual(12);
    expect(r.characters.length).toBe(12);
    expect(r.reward?.given).toBeGreaterThan(0);
    expect(Object.keys(r.characters[0]).sort()).toEqual(['avatar', 'look']);
    const names = load().users.map((u) => u.displayName);
    expect(names.some((n) => JSON.stringify(r).includes(`"${n}"`))).toBe(false);
  });
});

// ───────────────────────────── finals quest ─────────────────────────────

describe('Finals Study Break quest', () => {
  it('window: Dec 1–18, 2026 and Apr 20 – May 1, 2027 (New York days)', () => {
    expect(QUEST_WINDOWS.finals_study_break).toEqual([['2026-12-01', '2026-12-18'], ['2027-04-20', '2027-05-01']]);
    expect(questOpen('finals_study_break', Date.parse('2026-12-01T05:30:00Z'))).toBe(true); // 12:30 AM in New York
    expect(questOpen('finals_study_break', Date.parse('2026-12-01T04:30:00Z'))).toBe(false); // still Nov 30 in New York
    expect(questOpen('finals_study_break', Date.parse('2026-12-19T04:30:00Z'))).toBe(true); // Dec 18, 11:30 PM
    expect(questOpen('finals_study_break', Date.parse('2026-12-19T05:30:00Z'))).toBe(false);
    expect(questOpen('finals_study_break', Date.parse('2027-04-25T12:00:00Z'))).toBe(true);
    expect(questOpen('finals_study_break', Date.parse('2027-05-02T12:00:00Z'))).toBe(false);
    expect(questOpen('repost', Date.parse('2027-07-04T12:00:00Z'))).toBe(true);
    expect(isSeasonalQuest('finals_study_break') && !isSeasonalQuest('repost')).toBe(true);
    expect(questWindowEnd('finals_study_break', Date.parse('2026-12-05T12:00:00Z'))).toBe('2026-12-18');
  });
  it('Home cheer line only during finals season', () => {
    expect(finalsSeason(Date.parse('2026-12-10T15:00:00Z'))).toBe(true);
    expect(FINALS_CHEERS).toContain(finalsCheer(Date.parse('2026-12-10T15:00:00Z')));
    expect(finalsCheer(Date.parse('2026-11-20T15:00:00Z'))).toBeNull();
  });
  it('mock: closed outside the window; inside it counts toward the weekly digital limit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    asUser('alum150');
    vi.setSystemTime(new Date('2026-11-20T15:00:00Z'));
    expect(await api.canSubmit('finals_study_break')).toMatch(/only open during finals season/);
    vi.setSystemTime(new Date('2026-12-08T15:00:00Z'));
    const me = load().users.find((u) => u.handle === 'alum150')!;
    load().submissions = load().submissions.filter((s) => s.userId !== me.id);
    expect(await api.canSubmit('finals_study_break')).toBeNull();
    load().submissions.push({ id: 'sub_test', userId: me.id, activityId: 'repost', imageUrl: 'x', note: '', status: 'pending', createdAt: new Date().toISOString() });
    expect(await api.canSubmit('finals_study_break')).toBe(`Digital quests are limited to ${CAPS.digitalPerWeek} per week. Come back Monday!`);
  });
});

// ───────────────────────────── campaigns + labels ─────────────────────────────

describe('reusable campaigns', () => {
  const snack: RewardCampaign = { id: 'snack_attack_2027', name: 'Snack Attack 2027', itemLabel: 'free snack', passName: 'Snack Pass', emoji: '🍪', outfitSet: 'snack_set', message: 'x' };
  it('labels: the campaign, else Brew & Quest defaults (Coffee Pass ☕)', () => {
    expect(campaignLabels('latte_night_scholar', [])).toMatchObject({ passName: 'Coffee Pass', emoji: '☕', name: 'Brew & Quest 2026' });
    expect(campaignLabels('snack_set', [snack])).toMatchObject({ passName: 'Snack Pass', emoji: '🍪', itemLabel: 'free snack' });
    expect(passLabels(undefined)).toEqual({ passName: 'Coffee Pass', emoji: '☕' });
    expect(passLabels({ passName: 'Snack Pass', emoji: '🍪' })).toEqual({ passName: 'Snack Pass', emoji: '🍪' });
  });
  it('countdown uses the campaign emoji', () => {
    const ev = { title: 'Snack Attack @ Quad', startsAt: '2027-03-02T19:00:00Z', endsAt: '2027-03-02T21:00:00Z', reward: { itemLabel: 'free snack', limit: 20, venue: 'Quad', outfitSet: 'snack_set', message: 'Grab {item} at {venue} 🍪', emoji: '🍪' } };
    expect(countdown(ev, Date.parse('2027-03-02T18:00:00Z')).headline).toBe('🍪 Snack Attack starts in 1h 0m');
    expect(countdown(ev, Date.parse('2027-03-02T20:00:00Z')).headline).toBe('🍪 Grab snack at Quad · 1:00:00 left');
  });
  it('plurals for the recap and door mode', () => {
    expect(pluralItem('free coffee', 10)).toBe('10 free coffees');
    expect(pluralItem('free coffee', 1)).toBe('1 free coffee');
    expect(pluralItem('free snack', 3)).toBe('3 free snacks');
    expect(pluralItem('free merch', 5)).toBe('5 free merch');
    expect(pluralItem('free hot cocoa', 2)).toBe('2 free hot cocoas');
  });
  it('editor checks: one campaign per outfit set; slug like the server', () => {
    expect(campaignSlug('Brew & Quest 2026')).toBe('brew_quest_2026');
    expect(campaignInputError({ ...DEFAULT_CAMPAIGN, name: 'Brew Again' }, [DEFAULT_CAMPAIGN], 'brew_again')).toMatch(/already belongs to “Brew & Quest 2026”/);
    expect(campaignInputError({ ...DEFAULT_CAMPAIGN }, [DEFAULT_CAMPAIGN], DEFAULT_CAMPAIGN.id)).toBeNull();
    expect(campaignInputError({ ...DEFAULT_CAMPAIGN, name: 'x' }, [])).toMatch(/2 to 60/);
    expect(campaignInputError({ ...DEFAULT_CAMPAIGN, outfitSet: 'nope' }, [])).toMatch(/outfit/);
  });
  it('mock: participants can’t save; staff edit; in-use campaigns can’t be deleted; passes carry the labels', async () => {
    asUser('yak001');
    expect(await code(api.saveRewardCampaign({ ...DEFAULT_CAMPAIGN, name: 'Hacked' }))).toBe('forbidden');
    asUser('admin');
    const c = await api.saveRewardCampaign({ ...DEFAULT_CAMPAIGN, id: DEFAULT_CAMPAIGN.id, passName: 'Latte Pass' });
    expect(c.passName).toBe('Latte Pass');
    expect(await code(api.deleteRewardCampaign(DEFAULT_CAMPAIGN.id))).toBe('in_use');
    const live = load().events.find((e) => e.title === 'Brew & Quest @ The Study Café')!;
    const fresh = load().users.find((u) => u.role === 'participant' && u.campus === 'duke' && !(load().rewardPasses ?? []).some((p) => p.userId === u.id) && !(load().eventUnlocks ?? []).some((x) => x.userId === u.id))!;
    setSession(fresh.id);
    const r = await api.checkIn(live.id, 'brew');
    expect(r.reward?.pass).toMatchObject({ passName: 'Latte Pass', emoji: '☕', outfitSet: 'latte_night_scholar' });
    expect((await api.listEvents('upcoming')).find((e) => e.id === live.id)?.reward?.passName).toBe('Latte Pass');
  });
  it('coffee theme detection (beans, ding, steam) and campus glow colors', () => {
    expect(isCoffee({ outfitSet: 'latte_night_scholar' })).toBe(true);
    expect(isCoffee({ emoji: '🍪', outfitSet: 'snack_set', itemLabel: 'free snack' })).toBe(false);
    expect(hexToRgba('#cc0000', 0.5)).toBe('rgba(204, 0, 0, 0.5)');
    expect((campaignColorGlow('unc') as Record<string, string>)['--rr-campus']).toBe('#7bafd4');
    expect((campaignColorGlow('duke') as Record<string, string>)['--rr-campus']).toBe('#00539b');
  });
});

// ───────────────────────────── speech bubble + share my look ─────────────────────────────

describe('speech bubble + share my new look', () => {
  it('about ten coffee lines; yak puns otherwise; speaks on the 1st tap then every 3rd', () => {
    expect(COFFEE_LINES.length).toBeGreaterThanOrEqual(10);
    expect(COFFEE_LINES).toContain('Bean there, aced that!');
    expect(COFFEE_LINES).toContain(speechLine(true, 12345));
    expect(COFFEE_LINES).not.toContain(speechLine(false, 3));
    expect([1, 2, 3, 4, 5, 6].map(speaksOnTap)).toEqual([true, false, true, false, false, true]);
    expect(wearsCoffee({ accessory: 'latte_aplus' })).toBe(true);
    expect(wearsCoffee({ background: 'moonlit_nook' })).toBe(false);
    expect(wearsCoffee({ hat: 'party_hat' })).toBe(false);
  });
  it('story card text', () => {
    const m = lookCardModel({ displayName: 'Quinn Q', handle: 'quinnq', campus: 'unc', avatar: 'yak', look: {}, setName: 'Latte Night Scholar', edition: 'Brew & Quest 2026', eventName: 'Brew & Quest', emoji: '☕' });
    expect(m.shareText).toBe('I unlocked Latte Night Scholar at Brew & Quest ☕');
    expect(m.ribbon).toBe('LIMITED EDITION · BREW & QUEST 2026');
    expect(m.campusLine).toBe('UNC adventurer');
    expect(m.footer).toContain('@ncssmyoungalumni');
  });
});

// ───────────────────────────── Wardrobe → Collection ─────────────────────────────

describe('Wardrobe → Collection', () => {
  const at = Date.parse('2026-11-18T17:00:00Z');
  it('groups event outfits first, then seasonal holidays (open now first), with availability', () => {
    const g = collectionGroups(new Set(), [], at);
    expect(g[0]).toMatchObject({ kind: 'event', title: 'Brew & Quest 2026 — Latte Night Scholar', availability: 'Event exclusive', owned: 0, total: 3, emoji: '☕' });
    const titles = g.filter((x) => x.kind === 'seasonal').map((x) => x.title);
    expect(titles.slice(0, 3).sort()).toEqual(['Diwali', 'Native American Heritage Month', 'Thanksgiving']);
    expect(g.find((x) => x.title === 'Diwali')?.availability).toBe('Available until Nov 30');
    expect(g.find((x) => x.title === 'Día de los Muertos')?.availability).toBe('Returns next year');
    expect(titles).toContain('Indigenous Peoples’ Day');
  });
  it('progress counter + owned states', () => {
    const have = new Set(['cozy_beanie', 'latte_aplus', 'moonlit_nook', 'diya', 'cempasuchil_crown']);
    const g = collectionGroups(have, [], at);
    expect(g[0]).toMatchObject({ owned: 3, availability: 'Yours to keep', state: 'owned' });
    expect(g.find((x) => x.title === 'Día de los Muertos')).toMatchObject({ owned: 1, availability: 'Yours to keep' });
    const p = collectionProgress(g);
    expect(p).toEqual({ got: 5, total: COLLECTIBLE_IDS.length });
  });
  it('campaign names come from the server list', () => {
    const g = collectionGroups(new Set(), [{ ...DEFAULT_CAMPAIGN, name: 'Brew & Quest Fall' }], at);
    expect(g[0].title).toBe('Brew & Quest Fall — Latte Night Scholar');
  });
});

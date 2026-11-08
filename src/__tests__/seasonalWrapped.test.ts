import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/mock';
import { CYCLE, SEASONAL, WRAPPED } from '../config';
import { COSMETICS } from '../lib/cosmetics';
import {
  activeHolidays, claimToasts, daysLeft, fourthThursdayOfNovember, holidayById, holidayState, nyDate,
  secondMondayOfOctober, seasonalItems, seasonalOrder, untilText, windowFor,
} from '../lib/seasonal';
import { canOpenWrapped, personality, wrappedSlides, wrappedTiles, wrappedWindow } from '../lib/wrapped';
import { wrappedCardModel } from '../lib/wrappedCard';
import { ACCESSORY_ART, HAT_ART } from '../components/cosmetics/art';
import { backgroundGrid } from '../components/cosmetics/backgrounds';
import { composeLayers, paletteFor } from '../components/cosmetics/compose';
import type { WrappedData } from '../types';

const { load, setSession, addLedger, queueWrappedNotifications, claimSeasonalFor } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);
const at = (iso: string) => vi.setSystemTime(Date.parse(iso));
const MIGRATION_0028 = readFileSync(new URL('../../supabase/migrations/0028_pace_wrapped_seasonal.sql', import.meta.url), 'utf8');
const MIGRATION_0031 = readFileSync(new URL('../../supabase/migrations/0031_seasonal_november.sql', import.meta.url), 'utf8');
const MIGRATION = MIGRATION_0028 + '\n' + MIGRATION_0031;
/** The windows the database ends up with after every migration ran in order: the last upsert per (holiday, year) wins. */
function sqlWindows(): Map<string, [string, string]> {
  const m = new Map<string, [string, string]>();
  for (const sql of [MIGRATION_0028, MIGRATION_0031])
    for (const r of sql.matchAll(/\('([a-z_]+)',\s+(\d{4}), '(\d{4}-\d\d-\d\d)', '(\d{4}-\d\d-\d\d)'\)/g)) m.set(`${r[1]}/${r[2]}`, [r[3], r[4]]);
  return m;
}

// ───────────────────────────── seasonal: dates ─────────────────────────────

describe('seasonal dates', () => {
  it('2nd Monday of October (Indigenous Peoples’ Day), any year', () => {
    expect(secondMondayOfOctober(2026)).toBe('2026-10-12');
    expect(secondMondayOfOctober(2027)).toBe('2027-10-11');
    expect(secondMondayOfOctober(2028)).toBe('2028-10-09'); // Oct 1 is a Sunday
    expect(secondMondayOfOctober(2029)).toBe('2029-10-08'); // Oct 1 is a Monday
    expect(secondMondayOfOctober(2030)).toBe('2030-10-14');
  });
  it('4th Thursday of November (Thanksgiving)', () => {
    expect(fourthThursdayOfNovember(2026)).toBe('2026-11-26');
    expect(fourthThursdayOfNovember(2027)).toBe('2027-11-25');
  });
  it('windows: listed years first, the 2nd-Monday rule for other years', () => {
    const ipd = holidayById('indigenous_peoples_day')!;
    expect(windowFor(ipd, 2026)).toEqual(['2026-10-05', '2026-10-19']);
    expect(windowFor(ipd, 2028)).toEqual(['2028-10-02', '2028-10-16']);
    expect(windowFor(holidayById('diwali')!, 2028)).toBeNull(); // must be added (and verified) each year
  });
  it('0031: Diwali, Thanksgiving and Native American Heritage Month are open all of November', () => {
    for (const id of ['diwali', 'thanksgiving', 'heritage_month'])
      expect(windowFor(holidayById(id)!, 2026), id).toEqual(['2026-11-01', '2026-11-30']);
    expect(windowFor(holidayById('diwali')!, 2027)).toEqual(['2027-10-22', '2027-11-30']); // Diwali Oct 29, 2027 + all of November
    expect(windowFor(holidayById('thanksgiving')!, 2027)).toEqual(['2027-11-01', '2027-11-30']);
    expect(windowFor(holidayById('heritage_month')!, 2027)).toEqual(['2027-11-01', '2027-11-30']);
    // unchanged
    expect(windowFor(holidayById('dia_de_muertos')!, 2026)).toEqual(['2026-10-25', '2026-11-09']);
    expect(windowFor(holidayById('indigenous_peoples_day')!, 2027)).toEqual(['2027-10-04', '2027-10-18']);
    const ids = (iso: string) => activeHolidays(Date.parse(iso)).map((h) => h.id).sort();
    expect(ids('2026-10-31T12:00:00-04:00')).toEqual(['dia_de_muertos']);
    expect(ids('2026-11-01T00:30:00-04:00')).toEqual(['dia_de_muertos', 'diwali', 'heritage_month', 'thanksgiving']);
    expect(ids('2026-11-20T12:00:00-05:00')).toEqual(['diwali', 'heritage_month', 'thanksgiving']);
    expect(ids('2026-12-01T03:00:00Z')).toEqual(['diwali', 'heritage_month', 'thanksgiving']); // 10 PM Nov 30 in New York
    expect(ids('2026-12-01T12:00:00-05:00')).toEqual([]);
    expect(ids('2027-10-22T12:00:00-04:00')).toEqual(['diwali']);
    expect(ids('2027-11-30T12:00:00-05:00')).toEqual(['diwali', 'heritage_month', 'thanksgiving']);
    // countdown follows the window
    expect(untilText('2026-11-30', daysLeft('2026-11-30', Date.parse('2026-11-20T12:00:00-05:00')))).toBe('Available until Nov 30 · 11 days left');
  });
  it('which holidays are open (New York calendar date)', () => {
    const ids = (iso: string) => activeHolidays(Date.parse(iso)).map((h) => h.id);
    expect(ids('2026-11-05T12:00:00-05:00')).toEqual(['dia_de_muertos', 'diwali', 'thanksgiving', 'heritage_month']);
    expect(nyDate(Date.parse('2026-11-16T03:00:00Z'))).toBe('2026-11-15'); // 10 PM in New York
    expect(ids('2026-12-15T12:00:00-05:00')).toEqual([]);
    expect(ids('2027-10-11T12:00:00-04:00')).toEqual(['indigenous_peoples_day']);
  });
  it('the database seeds the same windows as SEASONAL in config.ts (0028 + 0031, last upsert wins)', () => {
    const sql = sqlWindows();
    for (const h of SEASONAL)
      for (const [year, w] of Object.entries(h.windows))
        if (h.rule !== 'second_monday_october_pm7') expect(sql.get(`${h.id}/${year}`), `${h.id} ${year}`).toEqual(w);
    // …and nothing in SQL that the app doesn't know about
    for (const key of sql.keys()) {
      const [id, year] = key.split('/');
      expect(holidayById(id)?.windows[Number(year)], key).toBeTruthy();
    }
    expect(MIGRATION_0031).toContain("('three_sisters', 'background', 'Three Sisters Garden', 'seasonal', 'heritage_month', 108)");
    for (const h of SEASONAL)
      for (const [year, [from, to]] of Object.entries(h.windows)) {
        if (h.rule === 'second_monday_october_pm7') {
          expect(windowFor(h, Number(year))).toEqual([from, to]);
          expect(MIGRATION).toContain(`('${h.id}', ${year}, public.second_monday_of_october(${year}) - 7, public.second_monday_of_october(${year}) + 7)`);
        }
      }
  });
  it('every seasonal item has art and a holiday; descriptions are filled in', () => {
    const items = COSMETICS.filter((c) => c.rule.type === 'seasonal');
    expect(items.map((c) => c.id).sort()).toEqual(['autumn_harvest', 'cempasuchil_crown', 'diya', 'harvest_scarf', 'land_of_longleaf', 'papel_picado', 'rangoli_diyas', 'three_sisters']);
    for (const c of items) {
      if (c.slot === 'hat') expect(HAT_ART[c.id]).toBeTruthy();
      if (c.slot === 'accessory') expect(ACCESSORY_ART[c.id]).toBeTruthy();
      if (c.slot === 'background') expect(backgroundGrid(c.id)?.every((r) => r.length === 36)).toBe(true);
      expect(MIGRATION).toContain(`('${c.id}',`);
    }
    expect(seasonalItems('indigenous_peoples_day').map((c) => c.slot)).toEqual(['background']); // no wearable item
    expect(seasonalItems('heritage_month').map((c) => [c.id, c.slot, c.name])).toEqual([['three_sisters', 'background', 'Three Sisters Garden']]); // never a costume
    const nahm = holidayById('heritage_month')!;
    expect(nahm.name).toBe('Native American Heritage Month');
    expect(nahm.about).toContain('Since 1970, Native people have gathered in Plymouth, Massachusetts on Thanksgiving Day for a National Day of Mourning.');
    expect(nahm.about).toContain('This background celebrates that knowledge; it isn’t a costume.');
    expect(nahm.links).toEqual([
      { label: 'Learn about North Carolina’s tribes', url: 'https://ncadmin.nc.gov/divisions/american-indian-affairs' },
      { label: 'Whose land are you on?', url: 'https://native-land.ca/' },
    ]);
    expect(claimToasts(['three_sisters'])).toEqual(['🌽 New limited-time background for Native American Heritage Month — see what it honors']);
    // the art: 36×36 and only known palette colors
    const ts = backgroundGrid('three_sisters')!;
    expect(ts.length).toBe(36);
    const pal = paletteFor();
    for (const row of ts) for (const ch of row) expect(pal[ch], ch).toBeTruthy();
    for (const h of SEASONAL) expect(h.about.length).toBeGreaterThan(80);
    expect(holidayById('indigenous_peoples_day')!.learnMore!.url).toBe('https://ncadmin.nc.gov/divisions/american-indian-affairs');
    // the Diya sits beside the character
    const layers = composeLayers('yak', { accessory: 'diya' });
    expect(layers[1].grid).toBe(ACCESSORY_ART.diya.grid);
  });
  it('what the Wardrobe shows: Limited time / yours to keep / Returns next year', () => {
    const diwali = holidayById('diwali')!;
    const nov8 = Date.parse('2026-11-08T12:00:00-05:00');
    expect(holidayState(diwali, false, nov8)).toEqual({ kind: 'available', endsOn: '2026-11-30', daysLeft: 23, owned: false });
    expect(untilText('2026-11-15', 8)).toBe('Available until Nov 15 · 8 days left');
    expect(untilText('2026-11-15', 1)).toBe('Last day today!');
    expect(daysLeft('2026-11-15', Date.parse('2026-11-15T23:00:00-05:00'))).toBe(1);
    const dec = Date.parse('2026-12-15T12:00:00-05:00');
    expect(holidayState(diwali, true, dec)).toEqual({ kind: 'owned' });
    expect(holidayState(diwali, false, dec)).toEqual({ kind: 'returns', next: ['2027-10-22', '2027-11-30'] });
    expect(claimToasts(['diya', 'rangoli_diyas'])).toEqual(['🪔 New limited-time item for Diwali — see what it honors']);
  });
});

describe('0031 Wardrobe order (fixed dates)', () => {
  it('open now first, then owned, then returns; each by window start then name', () => {
    const nov20 = Date.parse('2026-11-20T12:00:00-05:00');
    const owned = new Set(['dia_de_muertos']);
    expect(seasonalOrder((h) => owned.has(h.id), nov20).map((g) => [g.h.id, g.st.kind])).toEqual([
      ['diwali', 'available'], ['heritage_month', 'available'], ['thanksgiving', 'available'],
      ['dia_de_muertos', 'owned'],
      ['indigenous_peoples_day', 'returns'],
    ]);
    // Oct 2027: Indigenous Peoples' Day (Oct 4) before Diwali (Oct 22) before Día de los Muertos (Oct 25)
    const oct25 = Date.parse('2027-10-25T12:00:00-04:00');
    expect(seasonalOrder(() => false, oct25).filter((g) => g.st.kind === 'available').map((g) => g.h.id)).toEqual(['diwali', 'dia_de_muertos']);
    expect(seasonalOrder(() => false, Date.parse('2027-10-11T12:00:00-04:00'))[0].h.id).toBe('indigenous_peoples_day');
  });
});

// ───────────────────────────── seasonal: mock API (fixed dates) ─────────────────────────────

describe('seasonal unlocks persist; equip rules (mock, fixed dates)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-11-05T12:00:00-05:00');
    await api.resetDemoData();
  });
  afterEach(() => vi.useRealTimers());

  it('claiming during the window gives every open item once, with one notification per holiday', async () => {
    asUser('yak001');
    const me = load().users.find((u) => u.handle === 'yak001')!;
    const r = await api.claimSeasonalItems();
    expect(r.claimed).toEqual(['autumn_harvest', 'cempasuchil_crown', 'diya', 'harvest_scarf', 'papel_picado', 'rangoli_diyas', 'three_sisters']);
    expect(r.active.map((a) => a.holiday)).toEqual(['dia_de_muertos', 'diwali', 'thanksgiving', 'heritage_month']);
    expect((await api.claimSeasonalItems()).claimed).toEqual([]);
    const notes = load().notifications.filter((n) => n.userId === me.id && n.kind === 'seasonal').map((n) => n.title);
    expect(notes.sort()).toEqual([
      '🌼 New limited-time item for Día de los Muertos — see what it honors',
      '🌽 New limited-time background for Native American Heritage Month — see what it honors',
      '🍂 New limited-time item for Thanksgiving — see what it honors',
      '🪔 New limited-time item for Diwali — see what it honors',
    ].sort());
  });

  it('owned items can be worn after the window; unowned ones outside their window are locked', async () => {
    asUser('yak001');
    await api.claimSeasonalItems();
    at('2026-12-15T12:00:00-05:00');
    expect(await api.myUnlocks()).toEqual(expect.arrayContaining(['cempasuchil_crown', 'papel_picado', 'diya', 'rangoli_diyas']));
    const u = await api.equipLook({ hat: 'cempasuchil_crown', accessory: 'diya', background: 'papel_picado' });
    expect(u.look).toEqual({ hat: 'cempasuchil_crown', accessory: 'diya', background: 'papel_picado' });
    expect(await code(api.equipLook({ background: 'land_of_longleaf' }))).toBe('locked');
    asUser('alum002'); // never opened the app in a window
    expect(await code(api.equipLook({ accessory: 'harvest_scarf' }))).toBe('locked');
    expect(await code(api.equipLook({ hat: 'papel_picado' }))).toBe('look');
  });

  it('staff get them too, and equipping during a window claims first', async () => {
    at('2026-11-20T12:00:00-05:00'); // Diwali + Thanksgiving + Heritage Month windows
    asUser('iesha');
    const u = await api.equipLook({ accessory: 'harvest_scarf', background: 'autumn_harvest' });
    expect(u.look).toEqual({ accessory: 'harvest_scarf', background: 'autumn_harvest' });
    expect(claimSeasonalFor(u.id, Date.parse('2026-11-21T12:00:00-05:00'))).toEqual([]);
  });

  it('0031: Three Sisters Garden is claimed in November, kept forever, and wearable by everyone who opened the app', async () => {
    at('2026-11-20T12:00:00-05:00');
    asUser('yak001');
    const me = load().users.find((u) => u.handle === 'yak001')!;
    const r = await api.claimSeasonalItems();
    expect(r.claimed).toEqual(['autumn_harvest', 'diya', 'harvest_scarf', 'rangoli_diyas', 'three_sisters']);
    expect(r.active).toEqual([
      { holiday: 'diwali', endsOn: '2026-11-30' }, { holiday: 'thanksgiving', endsOn: '2026-11-30' }, { holiday: 'heritage_month', endsOn: '2026-11-30' },
    ]);
    expect(load().notifications.filter((n) => n.userId === me.id && n.kind === 'seasonal').map((n) => n.title))
      .toContain('🌽 New limited-time background for Native American Heritage Month — see what it honors');
    at('2027-03-01T12:00:00-05:00');
    expect(await api.myUnlocks()).toContain('three_sisters');
    expect((await api.equipLook({ background: 'three_sisters' })).look).toEqual({ background: 'three_sisters' });
    // someone who never opened the app in November can't wear it
    asUser('alum002');
    expect(await code(api.equipLook({ background: 'three_sisters' }))).toBe('locked');
  });

  it('missed the window → still locked next time', async () => {
    at('2026-12-01T12:00:00-05:00');
    asUser('yak001');
    expect((await api.claimSeasonalItems()).claimed).toEqual([]);
    expect(await code(api.equipLook({ accessory: 'harvest_scarf' }))).toBe('locked');
  });
});

// ───────────────────────────── Wrapped ─────────────────────────────

const base: WrappedData = {
  cycleName: '2026–27 Pilot', cycleEndsAt: CYCLE.end, opensAt: WRAPPED.opensAt, preview: false,
  displayName: 'Jade G.', handle: 'jade', campus: 'duke', role: 'participant', avatar: 'yak',
  points: 215, eventsAttended: 5, favoriteCampus: 'duke', favoriteKind: 'active', bestMonth: { month: '2027-02', points: 85 },
  badgesEarned: 7, badgeTotal: 16, earnedBadgeIds: ['first_checkin', 'regular', 'recruiter'], rarestBadge: { id: 'recruiter', pct: 4, holders: 12 },
  bestStreak: 3, friendsBrought: 1, monthWins: 1,
  mix: { event: 120, digital: 20, photos: 35, quests: 0, referral: 35, staff: 5 },
  rankOverall: 6, rankCampus: 2, participants: 300, campusParticipants: 90, topPctOverall: 2, topPctCampus: 3,
};

describe('Wrapped availability', () => {
  it('opens one week before the quest ends; the wrap-up lasts until 14 days after the end', () => {
    expect(WRAPPED.opensAt).toBe('2027-04-24T00:00:00-04:00');
    // same rule as the database's wrapped_opens_at(): midnight New York, 7 days before the last day
    expect(Date.parse(CYCLE.end) - Date.parse(WRAPPED.opensAt)).toBe((7 * 24 + 23) * 3_600_000 + 59 * 60_000 + 59_000);
    expect(wrappedWindow(Date.parse('2027-04-23T23:59:00-04:00')).open).toBe(false);
    expect(wrappedWindow(Date.parse('2027-04-24T00:00:00-04:00'))).toMatchObject({ open: true, wrapUp: true });
    expect(wrappedWindow(Date.parse('2027-05-15T23:59:00-04:00')).wrapUp).toBe(true);
    expect(wrappedWindow(Date.parse('2027-05-16T00:00:00-04:00'))).toMatchObject({ open: true, wrapUp: false });
  });
  it('participants wait; YACquest Chairs can preview; the demo flag opens it for testing', () => {
    const nov = Date.parse('2026-11-20T12:00:00-05:00');
    expect(canOpenWrapped('participant', nov)).toBe(false);
    expect(canOpenWrapped('admin', nov)).toBe(false);
    expect(canOpenWrapped('chair', nov)).toBe(true);
    expect(canOpenWrapped('participant', nov, { mock: true, mockAlwaysOpen: true })).toBe(true);
    expect(canOpenWrapped('participant', nov, { mock: false, mockAlwaysOpen: true })).toBe(false);
    expect(canOpenWrapped('participant', Date.parse('2027-04-25T09:00:00-04:00'))).toBe(true);
    expect(canOpenWrapped(undefined, Date.parse('2027-04-25T09:00:00-04:00'))).toBe(false);
  });
});

describe('Wrapped story, personality and share card (pure)', () => {
  it('personality from the points mix', () => {
    expect(personality(base).title).toBe('The Event Regular');
    expect(personality({ ...base, friendsBrought: 2 }).title).toBe('The Connector');
    expect(personality({ ...base, earnedBadgeIds: ['explorer'] }).title).toBe('The Explorer');
    expect(personality({ ...base, mix: { event: 20, digital: 60, photos: 0, quests: 0, referral: 0, staff: 0 } }).title).toBe('The Digital Dynamo');
    expect(personality({ ...base, mix: { event: 20, digital: 10, photos: 70, quests: 0, referral: 0, staff: 0 } }).title).toBe('The Storyteller');
    expect(personality({ ...base, mix: { event: 0, digital: 0, photos: 0, quests: 0, referral: 0, staff: 0 } }).title).toBe('The Fresh Start');
    expect(personality({ ...base, mix: { event: 40, digital: 30, photos: 20, quests: 20, referral: 0, staff: 0 } }).title).toBe('The All-Rounder');
    expect(personality({ ...base, role: 'admin' }).title).toBe('The Council Pillar');
  });
  it('8 slides; participants see their rank, staff see staff stats (never a rank)', () => {
    const s = wrappedSlides(base);
    expect(s.map((x) => x.id)).toEqual(['intro', 'points', 'events', 'badges', 'streak', 'rank', 'personality', 'share']);
    expect(s[1]).toMatchObject({ big: '215', label: 'points', lines: ['Your best month: February (+85)'] });
    expect(s[2].lines).toEqual(['Favorite campus: Duke', 'Mostly: Active Participation']);
    expect(s[3].lines).toEqual(['Your rarest: Recruiter', 'Only 4% of players have it!']);
    expect(s[4].lines).toEqual(['🔥 Longest streak: 3 months in a row', '🤝 Friends you brought: 1', '⭐ Adventurer of the Month winner']);
    expect(s[5]).toMatchObject({ big: 'Top 2%', label: 'Rank 6 of 300', lines: ['#2 at Duke (top 3%)'] });
    const staff = wrappedSlides({ ...base, role: 'chair', rankOverall: undefined, topPctOverall: undefined, rarestBadge: undefined,
      staff: { reviews: 41, eventsHosted: 3, checkinsAtHosted: 57, announcements: 6, heroCrowns: 2, councilBadges: 3, councilBadgeIds: [] } });
    expect(staff.map((x) => x.id)).toEqual(['intro', 'points', 'events', 'badges', 'streak', 'staff', 'personality', 'share']);
    expect(staff[5]).toMatchObject({ big: '41', label: 'proofs reviewed', lines: ['📅 3 events created · 57 check-ins', '📣 6 announcements sent', '🦸 Hero of the Week ×2'] });
    expect(JSON.stringify(staff)).not.toMatch(/Top \d+%/);
  });
  it('share card: participant tiles show the rank, staff tiles show staff work', () => {
    expect(wrappedTiles(base).map((t) => `${t.value} ${t.label}`)).toEqual(['215 POINTS', '5 EVENTS', '7/16 BADGES', '3 MOS BEST STREAK', '1 FRIEND BROUGHT', '6 RANK · TOP 2%']);
    const m = wrappedCardModel(base);
    expect(m.subtitle).toBe('MY YACQUEST WRAPPED · 2026–27');
    expect(m.personality).toBe('THE EVENT REGULAR');
    expect(m.highlights).toEqual(['BEST MONTH: FEBRUARY (+85)', 'RAREST BADGE: RECRUITER (4%)']);
    const staff = wrappedCardModel({ ...base, role: 'admin', staff: { reviews: 41, eventsHosted: 3, checkinsAtHosted: 57, announcements: 6, heroCrowns: 0, councilBadges: 3, councilBadgeIds: [] } });
    expect(staff.tiles.map((t) => t.label)).toEqual(['POINTS', 'EVENTS', 'BADGES', 'BEST STREAK', 'REVIEWS', 'EVENTS HOSTED']);
    expect(staff.campusLine).toBe('YAC Council · Duke');
  });
});

describe('Wrapped data + gating (mock, fixed dates)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2027-04-25T10:00:00-04:00');
    await api.resetDemoData();
  });
  afterEach(() => vi.useRealTimers());

  it('participants: not before it opens; chairs preview', async () => {
    at('2027-03-01T10:00:00-05:00');
    asUser('yak001');
    expect(await code(api.myWrapped())).toBe('not_open');
    asUser('iesha');
    expect((await api.myWrapped()).preview).toBe(true);
    at('2027-04-24T00:00:01-04:00');
    asUser('yak001');
    expect((await api.myWrapped()).preview).toBe(false);
  });

  it('stats are right; staff never appear in percentiles', async () => {
    const d = load();
    // a seeded player with no activity yet, so every number below comes from this test
    const me = d.users.find((u) => u.role === 'participant' && u.handle.startsWith('alum') && !d.ledger.some((l) => l.userId === u.id))!;
    const ev = (id: string, campus: 'duke' | 'unc', kind: 'active' | 'high_impact', day: string) => {
      d.events.push({ id, title: id, campus, crossCampus: false, kind, location: 'X', startsAt: `${day}T18:00:00-05:00`, endsAt: `${day}T20:00:00-05:00`, checkInGraceMinutes: 60, activityId: 'home_event', attendeeCount: 1 });
      addLedger({ userId: me.id, amount: kind === 'active' ? 20 : 35, source: 'checkin', activityId: 'home_event', refId: id, reason: 'Checked in' }, `${day}T18:30:00-05:00`);
    };
    ev('w-e1', 'duke', 'active', '2027-01-09');
    ev('w-e2', 'unc', 'high_impact', '2027-02-06');
    ev('w-e3', 'duke', 'active', '2027-02-20');
    addLedger({ userId: me.id, amount: 35, source: 'referral', activityId: 'bring_new_alum', refId: 'friend-1', reason: 'Brought a friend' }, '2027-02-21T12:00:00-05:00');
    // a staff member with a huge score must not push anyone down
    const chair = d.users.find((u) => u.handle === 'iesha')!;
    addLedger({ userId: chair.id, amount: 5000, source: 'manual', reason: 'Staff test' }, '2027-02-01T12:00:00-05:00');

    asUser(me.handle);
    const w = await api.myWrapped();
    const parts = d.users.filter((u) => u.role === 'participant');
    const points = d.ledger.filter((l) => l.userId === me.id).reduce((n, l) => n + l.amount, 0);
    expect(points).toBe(110);
    expect(w.points).toBe(110);
    expect(w.eventsAttended).toBe(3);
    expect(w.bestMonth).toEqual({ month: '2027-02', points: 90 });
    expect(w.bestStreak).toBe(2);
    expect(w.favoriteCampus).toBe('duke');
    expect(w.favoriteKind).toBe('active');
    expect(w.friendsBrought).toBe(1);
    expect(w.mix.event).toBe(75);
    expect(w.mix.referral).toBe(35);
    expect(w.participants).toBe(parts.length);
    const above = parts.filter((u) => api.__test.pointsOf(u.id) > points).length;
    expect(w.rankOverall).toBe(above + 1);
    expect(w.topPctOverall).toBe(Math.max(1, Math.ceil((100 * (above + 1)) / parts.length)));
    if (w.rarestBadge) {
      expect(w.earnedBadgeIds).toContain(w.rarestBadge.id);
      const holders = parts.filter((u) => api.__test.badgesFor(u.id).some((b) => b.id === w.rarestBadge!.id && b.earned)).length;
      expect(w.rarestBadge.holders).toBe(holders);
      expect(w.rarestBadge.pct).toBe(Math.max(1, Math.ceil((100 * holders) / parts.length)));
    }
    // the top participant is still #1 (the chair's 5000 points don't count)
    const best = parts.map((u) => ({ u, p: api.__test.pointsOf(u.id) })).sort((a, b) => b.p - a.p)[0];
    asUser(best.u.handle);
    expect((await api.myWrapped()).rankOverall).toBe(1);
    // staff version
    asUser('iesha');
    const s = await api.myWrapped();
    expect(s.staff).toBeDefined();
    expect(s.rankOverall).toBeUndefined();
    expect(s.topPctOverall).toBeUndefined();
    expect(s.rarestBadge).toBeUndefined();
  }, 30_000);

  it('"Your YACquest Wrapped is here!" goes out once per cycle, only in the wrap-up window', async () => {
    const d = load();
    d.wrappedSends = {};
    const before = d.notifications.filter((n) => n.kind === 'wrapped').length;
    expect(before).toBe(0);
    expect(queueWrappedNotifications(Date.parse('2027-04-23T23:59:00-04:00'))).toBe(0);
    expect(queueWrappedNotifications(Date.parse('2027-05-16T00:00:00-04:00'))).toBe(0);
    const n = queueWrappedNotifications(Date.parse('2027-04-24T00:10:00-04:00'));
    expect(n).toBe(d.users.length);
    expect(queueWrappedNotifications(Date.parse('2027-04-24T00:20:00-04:00'))).toBe(0);
    expect(queueWrappedNotifications(Date.parse('2027-05-02T12:00:00-04:00'))).toBe(0);
    const yak = d.users.find((u) => u.handle === 'yak001')!;
    const mine = d.notifications.filter((n) => n.kind === 'wrapped' && n.userId === yak.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('Your YACquest Wrapped is here! 🎁');
    expect(mine[0].body).toMatch(/^Your 2026–27 Pilot in YACquest: \d+ points? · \d+ events? · \d+ badges?\./);
    const mails = d.outbox.filter((o) => o.kind === 'wrapped');
    expect(mails.length).toBe(d.users.filter((u) => u.emailOptIn && u.email).length);
    expect(mails[0].text).toContain('#/wrapped');
  }, 30_000);

  it('end-of-year checklist permissions', async () => {
    asUser('yak001');
    expect(await code(api.eoyChecklist())).toBe('forbidden');
    expect(await code(api.setEoyItem('ledger_backup', true))).toBe('forbidden');
    asUser('admin');
    await api.setEoyItem('ledger_backup', true);
    expect((await api.eoyChecklist()).items.find((i) => i.id === 'ledger_backup')).toMatchObject({ done: true, doneBy: 'YAC Helper' });
    expect(await code(api.setEoyItem('reset', true))).toBe('forbidden');
    expect(await code(api.setEoyItem('wrapped_sent', true))).toBe('auto');
    asUser('iesha');
    expect(await code(api.setEoyItem('reset', true))).toBe('too_early');
    at('2027-05-03T10:00:00-04:00');
    await api.setEoyItem('reset', true);
    const c = await api.eoyChecklist();
    expect(c.items.find((i) => i.id === 'reset')?.done).toBe(true);
    expect(c.cycleEnded).toBe(true);
    expect(load().actions.filter((a) => a.action === 'eoy_item_checked')).toHaveLength(2);
  });
});

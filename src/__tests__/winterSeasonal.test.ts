/**
 * 0035 winter seasonal wardrobe: Hanukkah, Christmas, Kwanzaa, Winter Solstice, New Year's, Three Kings Day,
 * Lunar New Year. Fixed dates only. The mock API mirrors 0035_winter_seasonal.sql + 0036_winter_windows_kwanzaa.sql
 * (0036: wider windows from Dec 1, three Kwanzaa accessories).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/mock';
import { SEASONAL } from '../config';
import { COSMETICS } from '../lib/cosmetics';
import { collectionGroups, collectionProgress, COLLECTIBLE_IDS } from '../lib/collection';
import {
  aboutFor, activeHolidays, claimToasts, holidayById, holidayState, newYearHatYear, returnsLabel, seasonLabel, seasonalItems,
  seasonalNoticeTitle, windowFor, zodiacFor,
} from '../lib/seasonal';
import { ACCESSORY_ART, HAT_ART } from '../components/cosmetics/art';
import { backgroundGrid, backgroundVec } from '../components/cosmetics/backgrounds';
import { composeLayers, paletteFor } from '../components/cosmetics/compose';
import { newYearHatArt } from '../components/cosmetics/winterArt';
import { digitPaths, newYearHat } from '../components/cosmetics/winterVec';

const { load, setSession } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);
const at = (iso: string) => vi.setSystemTime(Date.parse(iso));
const SQL = readFileSync(new URL('../../supabase/migrations/0035_winter_seasonal.sql', import.meta.url), 'utf8');
const SQL36 = readFileSync(new URL('../../supabase/migrations/0036_winter_windows_kwanzaa.sql', import.meta.url), 'utf8');
const windowRows = (sql: string) => [...sql.matchAll(/\('([a-z_]+)',\s+(\d{4}), '(\d{4}-\d\d-\d\d)', '(\d{4}-\d\d-\d\d)'\)/g)].map((r) => [r[1], Number(r[2]), r[3], r[4]] as [string, number, string, string]);

const WINTER = ['hanukkah', 'christmas', 'kwanzaa', 'winter_solstice', 'new_year', 'three_kings_day', 'lunar_new_year'];
const WINTER_ITEMS: Record<string, [string, string, string][]> = {
  hanukkah: [['festival_of_lights', 'background', 'Festival of Lights'], ['dreidel', 'accessory', 'Dreidel']],
  christmas: [['snowy_pine', 'background', 'Snowy Pine & Lights'], ['holiday_hat', 'hat', 'Cozy Holiday Hat'], ['candy_cane', 'accessory', 'Candy Cane']],
  kwanzaa: [
    ['kinara_glow', 'background', 'Kinara Glow'], ['kikombe_cha_umoja', 'accessory', 'Kikombe cha Umoja (Unity Cup)'], ['zawadi', 'accessory', 'Zawadi (Gift)'],
    ['kwanzaa_scarf', 'accessory', 'Red, Black & Green Scarf'],
  ],
  winter_solstice: [['longest_night', 'background', 'Longest Night'], ['starlight_lantern', 'accessory', 'Starlight Lantern']],
  new_year: [['new_year_hat', 'hat', 'New Year’s Party Hat'], ['party_popper', 'accessory', 'Party Popper'], ['midnight_fireworks', 'background', 'Midnight Fireworks']],
  three_kings_day: [['rosca_de_reyes', 'background', 'Rosca de Reyes']],
  lunar_new_year: [['lanterns_fireworks', 'background', 'Lanterns & Fireworks'], ['red_envelope', 'accessory', 'Red Envelope']],
};
const ids = (iso: string) => activeHolidays(Date.parse(iso)).map((h) => h.id);

describe('0036 winter windows (config ↔ SQL)', () => {
  it('windows as listed, 2026–27 and 2027–28 (same month/day pattern)', () => {
    const w = (id: string, y: number) => windowFor(holidayById(id)!, y);
    expect(w('hanukkah', 2026)).toEqual(['2026-11-30', '2026-12-31']);
    expect(w('hanukkah', 2027)).toEqual(['2027-11-30', '2027-12-31']);
    expect(w('christmas', 2026)).toEqual(['2026-12-01', '2026-12-31']);
    expect(w('christmas', 2027)).toEqual(['2027-12-01', '2027-12-31']);
    expect(w('kwanzaa', 2026)).toEqual(['2026-12-01', '2027-01-08']);
    expect(w('kwanzaa', 2027)).toEqual(['2027-12-01', '2028-01-08']);
    expect(w('winter_solstice', 2026)).toEqual(['2026-12-01', '2026-12-31']);
    expect(w('winter_solstice', 2027)).toEqual(['2027-12-01', '2027-12-31']);
    expect(w('new_year', 2026)).toEqual(['2026-12-01', '2027-01-07']);
    expect(w('new_year', 2027)).toEqual(['2027-12-01', '2028-01-07']);
    expect(w('three_kings_day', 2027)).toEqual(['2026-12-01', '2027-01-13']);
    expect(w('three_kings_day', 2028)).toEqual(['2027-12-01', '2028-01-13']);
    expect(w('lunar_new_year', 2027)).toEqual(['2026-12-01', '2027-02-20']);
    expect(w('lunar_new_year', 2028)).toEqual(['2027-12-01', '2028-02-20']); // end date stays Feb 20
    expect(w('lunar_new_year', 2029)).toBeNull(); // must be added (and verified) each year
  });
  it('0036 upserts exactly the config windows for every winter holiday, on the same keys as 0035', () => {
    const rows = windowRows(SQL36);
    const fromConfig = SEASONAL.filter((h) => WINTER.includes(h.id)).flatMap((h) => Object.entries(h.windows).map(([y, [a, b]]) => [h.id, Number(y), a, b]));
    expect(rows.sort()).toEqual(fromConfig.sort());
    expect(rows.length).toBe(14);
    // same (holiday, year) keys as 0035, so the upsert replaces every 0035 date (nothing left over)
    expect(windowRows(SQL).map((r) => `${r[0]}/${r[1]}`).sort()).toEqual(rows.map((r) => `${r[0]}/${r[1]}`).sort());
    expect(SQL36).toContain('on conflict (holiday, year) do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on');
    // holidays + emojis (0035) + Kwanzaa's noun (0036)
    for (const h of SEASONAL.filter((x) => WINTER.includes(x.id))) expect(SQL, h.id).toContain(`('${h.id}',`);
    expect(SQL).toContain("('hanukkah',        'Hanukkah',        '🕎', 6,  'items')");
    expect(SQL).toContain("('lunar_new_year',  'Lunar New Year',  '🧧', 12, 'items')");
    expect(SQL36).toContain("update public.seasonal_holidays set item_noun = 'items' where id = 'kwanzaa';");
  });
  it('overlapping windows open together (New York dates)', () => {
    const all = ['hanukkah', 'christmas', 'kwanzaa', 'winter_solstice', 'new_year', 'three_kings_day', 'lunar_new_year'];
    expect(ids('2026-11-29T12:00:00-05:00')).toEqual(['diwali', 'thanksgiving', 'heritage_month']);
    expect(ids('2026-11-30T12:00:00-05:00')).toEqual(['diwali', 'thanksgiving', 'heritage_month', 'hanukkah']);
    expect(ids('2026-12-01T05:00:00Z')).toEqual(all); // midnight Dec 1 New York
    expect(ids('2026-12-01T04:30:00Z')).toEqual(['diwali', 'thanksgiving', 'heritage_month', 'hanukkah']); // 11:30 PM Nov 30
    expect(ids('2026-12-27T12:00:00-05:00')).toEqual(all);
    expect(ids('2026-12-31T23:30:00-05:00')).toEqual(all);
    expect(ids('2027-01-01T12:00:00-05:00')).toEqual(['kwanzaa', 'new_year', 'three_kings_day', 'lunar_new_year']);
    expect(ids('2027-01-08T12:00:00-05:00')).toEqual(['kwanzaa', 'three_kings_day', 'lunar_new_year']);
    expect(ids('2027-01-09T12:00:00-05:00')).toEqual(['three_kings_day', 'lunar_new_year']);
    expect(ids('2027-01-14T12:00:00-05:00')).toEqual(['lunar_new_year']);
    expect(ids('2027-02-20T23:30:00-05:00')).toEqual(['lunar_new_year']);
    expect(ids('2027-02-21T12:00:00-05:00')).toEqual([]);
    expect(ids('2027-11-30T12:00:00-05:00')).toEqual(['diwali', 'thanksgiving', 'heritage_month', 'hanukkah']);
    expect(ids('2027-12-27T12:00:00-05:00')).toEqual(all);
    expect(ids('2028-01-26T12:00:00-05:00')).toEqual(['lunar_new_year']);
    expect(ids('2028-02-21T12:00:00-05:00')).toEqual([]);
  });
});

describe('0035 winter items, art and text', () => {
  it('items per holiday mirror the SQL; backgrounds and held objects only', () => {
    const esc = (t: string) => t.replace(/[()]/g, '\\$&');
    for (const id of WINTER) {
      expect(seasonalItems(id).map((c) => [c.id, c.slot, c.name]), id).toEqual(WINTER_ITEMS[id]);
      for (const [cid, slot, name] of WINTER_ITEMS[id]) expect(SQL + SQL36).toMatch(new RegExp(`\\('${cid}',\\s+'${slot}',\\s+'${esc(name)}',\\s+'seasonal', '${id}',\\s+\\d+\\)`));
    }
    expect(COSMETICS.filter((c) => c.rule.type === 'seasonal').length).toBe(25);
    // Kwanzaa: the background + three everyday objects (no hats); Three Kings Day is a background only
    expect(seasonalItems('kwanzaa').map((c) => c.slot)).toEqual(['background', 'accessory', 'accessory', 'accessory']);
    expect(seasonalItems('three_kings_day').every((c) => c.slot === 'background')).toBe(true);
  });
  it('every piece is vector art and renders on every character', () => {
    const pal = paletteFor();
    for (const [cid, slot] of Object.values(WINTER_ITEMS).flat()) {
      if (slot === 'background') {
        expect(backgroundVec(cid), cid).toBeTruthy();
        const g = backgroundGrid(cid)!;
        expect(g.length).toBe(36);
        for (const row of g) {
          expect(row.length).toBe(36);
          for (const ch of row) expect(pal[ch], ch).toBeTruthy();
        }
      } else {
        const art = slot === 'hat' ? HAT_ART[cid] : ACCESSORY_ART[cid];
        expect(art?.vec, cid).toBeTruthy();
        if (slot === 'accessory') expect(ACCESSORY_ART[cid].anchor).toBe(cid === 'kwanzaa_scarf' ? 'neck' : 'side'); // the scarf is worn
      }
      for (const ch of ['yak', 'unicorn', 'dragon', 'knight', 'mage', 'ranger', 'golden_yak'] as const) {
        const layers = composeLayers(ch, { [slot]: cid });
        expect(layers.some((l) => l.vec), `${ch} ${cid}`).toBe(true);
      }
    }
    // a hat's drawn top (its art starts this far below the layer's y) stays inside the frame (FRAME.y = -4) on every character
    const inkTop: Record<string, number> = { holiday_hat: 1.9, new_year_hat: 0.1 };
    for (const hat of ['holiday_hat', 'new_year_hat'])
      for (const ch of ['yak', 'unicorn', 'dragon', 'knight', 'mage', 'ranger', 'golden_yak'] as const) {
        const l = composeLayers(ch, { hat }).find((x) => x.vec)!;
        expect(l.y + inkTop[hat], `${ch} ${hat}`).toBeGreaterThanOrEqual(-4);
      }
  });
  it('About text: what each holiday honors', () => {
    const about = (id: string) => holidayById(id)!.about;
    expect(about('hanukkah')).toContain('the ninth is the shamash, the helper candle used to light the others');
    expect(about('hanukkah')).toContain('latkes and sufganiyot (jelly doughnuts)');
    expect(about('christmas')).toContain('by Christians as the birth of Jesus');
    expect(about('kwanzaa')).toContain('created in 1966 by Dr. Maulana Karenga');
    expect(about('kwanzaa')).toContain('unity, self-determination, collective work and responsibility, cooperative economics, purpose, creativity and faith');
    expect(about('kwanzaa')).toMatch(/Its colors are red, black and green\.$/);
    expect(about('three_kings_day')).toContain('Rosca de Reyes');
    expect(about('three_kings_day')).toMatch(/\(and grass for the camels\) the night before for gifts\.$/);
    expect(about('winter_solstice')).toContain('longest night of the year');
    expect(about('new_year')).toContain('Here’s to your best quest year yet.');
    expect(about('lunar_new_year')).toContain('Seollal in Korea, and Tết in Vietnam');
    for (const id of WINTER) expect(holidayById(id)!.season).toBe('winter');
  });
  it('notification titles (same text as the server)', () => {
    const t = (id: string) => seasonalNoticeTitle(holidayById(id)!);
    expect(t('hanukkah')).toBe('🕎 New limited-time items for Hanukkah — see what they honor');
    expect(t('christmas')).toBe('🎄 New limited-time items for Christmas — see what they honor');
    expect(t('kwanzaa')).toBe('🕯️ New limited-time items for Kwanzaa — see what they honor'); // 0036: several items now
    expect(t('winter_solstice')).toBe('✨ New limited-time items for Winter Solstice — see what they honor');
    expect(t('new_year')).toBe('🎆 New limited-time items for New Year’s — see what they honor');
    expect(t('three_kings_day')).toBe('⭐ New limited-time background for Three Kings Day — see what it honors');
    expect(t('lunar_new_year')).toBe('🧧 New limited-time items for Lunar New Year — see what they honor');
    expect(t('diwali')).toBe('🪔 New limited-time item for Diwali — see what it honors'); // unchanged
    expect(claimToasts(['dreidel', 'kinara_glow'])).toEqual([t('hanukkah'), t('kwanzaa')]);
    expect(SQL).toContain("case when right(v_noun, 1) = 's' then 'they honor' else 'it honors' end");
  });
});

describe('0035 zodiac + New Year hat year (fixed dates)', () => {
  it('zodiac per year', () => {
    expect(zodiacFor(2026)).toBe('Horse');
    expect(zodiacFor(2027)).toBe('Goat (also called Sheep or Ram)');
    expect(zodiacFor(2028)).toBe('Monkey');
    expect(zodiacFor(2029)).toBe('Rooster');
    expect(zodiacFor(2020)).toBe('Rat');
    expect(zodiacFor(2019)).toBe('Pig');
    const lny = holidayById('lunar_new_year')!;
    expect(aboutFor(lny, Date.parse('2026-12-01T12:00:00-05:00'))).toMatch(/ 2027 is the Year of the Goat \(also called Sheep or Ram\)\.$/);
    expect(aboutFor(lny, Date.parse('2027-02-06T12:00:00-05:00'))).toMatch(/ 2027 is the Year of the Goat \(also called Sheep or Ram\)\.$/);
    expect(aboutFor(lny, Date.parse('2027-03-01T12:00:00-05:00'))).toMatch(/ 2028 is the Year of the Monkey\.$/);
    expect(aboutFor(holidayById('kwanzaa')!)).toBe(holidayById('kwanzaa')!.about); // no extras elsewhere
  });
  it('the party hat shows the year being welcomed', () => {
    expect(newYearHatYear(Date.parse('2026-12-26T00:30:00-05:00'))).toBe(2027);
    expect(newYearHatYear(Date.parse('2027-01-07T23:00:00-05:00'))).toBe(2027);
    expect(newYearHatYear(Date.parse('2027-12-26T12:00:00-05:00'))).toBe(2028);
    expect(newYearHatYear(Date.parse('2027-06-01T12:00:00-04:00'))).toBe(2027);
    expect(newYearHatYear(Date.parse('2026-12-25T23:00:00-05:00'))).toBe(2027); // 0036: the window opens Dec 1
    expect(newYearHatYear(Date.parse('2026-12-01T00:30:00-05:00'))).toBe(2027);
    expect(newYearHatYear(Date.parse('2026-11-30T23:30:00-05:00'))).toBe(2026);
    expect(newYearHatYear(Date.parse('2028-12-15T12:00:00-05:00'))).toBe(2029); // no window listed yet: December still welcomes next year
    expect(newYearHatYear(Date.parse('2027-01-01T04:00:00Z'))).toBe(2027); // 11 PM Dec 31 in New York: window open → 2027
  });
  it('hat art carries the digits of that year', () => {
    const digitsOf = (y: number) => digitPaths(String(y), 0, 0, 1, 0.3);
    expect(digitsOf(2027)).not.toEqual(digitsOf(2028));
    const has = (y: number) => {
      const d = newYearHat(y).shapes.map((s) => s.d);
      const tw = 4 * 1.22 + 3 * 0.36;
      return digitPaths(String(y), 6.5 - tw / 2, 8.5 + 0.62, 1.22, 0.36).every((p) => d.includes(p));
    };
    expect(has(2027)).toBe(true);
    expect(has(2028)).toBe(true);
    expect(newYearHatArt(Date.parse('2026-12-31T12:00:00-05:00')).vec).toEqual(newYearHat(2027));
    expect(newYearHatArt(Date.parse('2027-12-31T12:00:00-05:00')).vec).toEqual(newYearHat(2028));
  });
});

describe('0035 unlocks persist; equip rules (mock, fixed dates)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-12-27T12:00:00-05:00');
    await api.resetDemoData();
  });
  afterEach(() => vi.useRealTimers());

  it('Dec 27: every winter holiday is open (0036), one notification per holiday', async () => {
    asUser('yak001');
    const me = load().users.find((u) => u.handle === 'yak001')!;
    const r = await api.claimSeasonalItems();
    expect(r.claimed).toEqual(['candy_cane', 'dreidel', 'festival_of_lights', 'holiday_hat', 'kikombe_cha_umoja', 'kinara_glow', 'kwanzaa_scarf', 'lanterns_fireworks', 'longest_night',
      'midnight_fireworks', 'new_year_hat', 'party_popper', 'red_envelope', 'rosca_de_reyes', 'snowy_pine', 'starlight_lantern', 'zawadi']);
    expect(r.active.map((a) => a.holiday)).toEqual(WINTER);
    expect(r.active.find((a) => a.holiday === 'kwanzaa')!.endsOn).toBe('2027-01-08');
    expect((await api.claimSeasonalItems()).claimed).toEqual([]);
    expect(load().notifications.filter((n) => n.userId === me.id && n.kind === 'seasonal').map((n) => n.title).sort()).toEqual([
      '🕎 New limited-time items for Hanukkah — see what they honor',
      '🎄 New limited-time items for Christmas — see what they honor',
      '🎆 New limited-time items for New Year’s — see what they honor',
      '🕯️ New limited-time items for Kwanzaa — see what they honor',
      '✨ New limited-time items for Winter Solstice — see what they honor',
      '⭐ New limited-time background for Three Kings Day — see what it honors',
      '🧧 New limited-time items for Lunar New Year — see what they honor',
    ].sort());
  });

  it('owned winter items stay wearable all year; missed ones are locked', async () => {
    asUser('yak001');
    await api.claimSeasonalItems();
    at('2027-07-04T12:00:00-04:00');
    const u = await api.equipLook({ hat: 'new_year_hat', accessory: 'party_popper', background: 'midnight_fireworks' });
    expect(u.look).toEqual({ hat: 'new_year_hat', accessory: 'party_popper', background: 'midnight_fireworks' });
    expect((await api.equipLook({ accessory: 'dreidel', background: 'rosca_de_reyes' })).look).toEqual({ accessory: 'dreidel', background: 'rosca_de_reyes' }); // 0036: all claimed Dec 27
    expect(await code(api.equipLook({ hat: 'candy_cane' }))).toBe('look'); // wrong slot
    asUser('alum002'); // never opened the app in winter
    expect(await code(api.equipLook({ hat: 'holiday_hat' }))).toBe('locked');
    expect(await code(api.equipLook({ accessory: 'dreidel' }))).toBe('locked');
    expect(await code(api.equipLook({ background: 'rosca_de_reyes' }))).toBe('locked');
  });

  it('staff get them too; equipping during a window claims first; late arrivals still get what is open', async () => {
    asUser('iesha');
    const u = await api.equipLook({ hat: 'holiday_hat', accessory: 'candy_cane', background: 'snowy_pine' });
    expect(u.look).toEqual({ hat: 'holiday_hat', accessory: 'candy_cane', background: 'snowy_pine' });
    at('2027-01-06T12:00:00-05:00');
    asUser('yak001');
    expect((await api.claimSeasonalItems()).claimed).toEqual([
      'kikombe_cha_umoja', 'kinara_glow', 'kwanzaa_scarf', 'lanterns_fireworks', 'midnight_fireworks', 'new_year_hat', 'party_popper', 'red_envelope', 'rosca_de_reyes', 'zawadi',
    ]);
    at('2027-02-06T12:00:00-05:00');
    expect((await api.claimSeasonalItems()).claimed).toEqual([]); // Lunar New Year was already open in January
    expect((await api.equipLook({ accessory: 'red_envelope', background: 'lanterns_fireworks' })).look).toEqual({ accessory: 'red_envelope', background: 'lanterns_fireworks' });
  });
});

describe('0036 Collection (fixed dates)', () => {
  it('winter groups, availability, season label, progress', () => {
    const dec27 = Date.parse('2026-12-27T12:00:00-05:00');
    const have = new Set(['candy_cane', 'holiday_hat', 'snowy_pine', 'kinara_glow', 'dreidel']);
    const g = collectionGroups(have, [], dec27);
    const seasonal = g.filter((x) => x.kind === 'seasonal');
    // open now, the ones ending soonest first
    expect(seasonal.slice(0, 7).map((x) => [x.title, x.availability, x.owned, x.total, x.season])).toEqual([
      ['Hanukkah', 'Available until Dec 31', 1, 2, 'Winter 2026–27'],
      ['Christmas', 'Available until Dec 31', 3, 3, 'Winter 2026–27'],
      ['Winter Solstice', 'Available until Dec 31', 0, 2, 'Winter 2026–27'],
      ['New Year’s', 'Available until Jan 7', 0, 3, 'Winter 2026–27'],
      ['Kwanzaa', 'Available until Jan 8', 1, 4, 'Winter 2026–27'],
      ['Three Kings Day', 'Available until Jan 13', 0, 1, 'Winter 2026–27'],
      ['Lunar New Year', 'Available until Feb 20', 0, 2, 'Winter 2026–27'],
    ]);
    expect(seasonal.slice(0, 7).every((x) => x.state === 'available')).toBe(true);
    expect(g.find((x) => x.title === 'Kwanzaa')!.items.map((c) => c.id)).toEqual(['kinara_glow', 'kikombe_cha_umoja', 'zawadi', 'kwanzaa_scarf']);
    expect(g.find((x) => x.title === 'Lunar New Year')!.about).toContain('2027 is the Year of the Goat (also called Sheep or Ram).');
    expect(g.find((x) => x.title === 'Diwali')!.season).toBeUndefined();
    expect(collectionProgress(g)).toEqual({ got: 5, total: 28 });
    expect(COLLECTIBLE_IDS.length).toBe(28); // 3 Latte Night Scholar + 25 seasonal
    expect(seasonLabel(holidayById('lunar_new_year')!, Date.parse('2027-03-01T12:00:00-05:00'))).toBe('Winter 2027–28');
  });
  it('"Coming soon" vs "Returns next winter" around the new windows', () => {
    const tkd = holidayById('three_kings_day')!;
    const lny = holidayById('lunar_new_year')!;
    const label = (h: typeof tkd, iso: string) => { const t = Date.parse(iso); return returnsLabel(holidayState(h, false, t), t, h); };
    expect(label(tkd, '2026-11-19T12:00:00-05:00')).toBe('Coming soon'); // opens Dec 1
    expect(label(lny, '2026-11-30T23:30:00-05:00')).toBe('Coming soon');
    // right after the season the next window is in the same calendar year but ~10 months away
    expect(label(tkd, '2027-01-14T12:00:00-05:00')).toBe('Returns next winter');
    expect(label(lny, '2027-02-21T12:00:00-05:00')).toBe('Returns next winter');
    expect(label(tkd, '2027-08-01T12:00:00-04:00')).toBe('Returns next winter');
    expect(label(tkd, '2027-09-05T12:00:00-04:00')).toBe('Coming soon'); // within 100 days of Dec 1
    // without the holiday the 0035 rule applies (kept for callers that only have the state)
    const feb = Date.parse('2027-02-21T12:00:00-05:00');
    expect(returnsLabel(holidayState(lny, false, feb), feb)).toBe('Coming soon');
    // autumn holidays unchanged
    const diwali = holidayById('diwali')!;
    expect(label(diwali, '2026-12-15T12:00:00-05:00')).toBe('Returns next year');
    expect(label(diwali, '2027-05-01T12:00:00-04:00')).toBe('Coming soon');
    // the Collection shows the same wording
    const g = collectionGroups(new Set(), [], feb);
    expect(g.find((x) => x.title === 'Three Kings Day')).toMatchObject({ availability: 'Returns next winter', state: 'returns', season: 'Winter 2027–28' });
    expect(g.find((x) => x.title === 'Diwali')).toMatchObject({ availability: 'Arrives Oct 22' }); // later this year, unchanged
    expect(collectionGroups(new Set(), [], Date.parse('2026-12-15T12:00:00-05:00')).find((x) => x.title === 'Diwali')).toMatchObject({ availability: 'Returns next year' });
    const nov19 = collectionGroups(new Set(), [], Date.parse('2026-11-19T12:00:00-05:00'));
    expect(nov19.find((x) => x.title === 'Kwanzaa')).toMatchObject({ availability: 'Arrives Dec 1', state: 'returns' });
    expect(nov19.find((x) => x.title === 'Hanukkah')).toMatchObject({ availability: 'Arrives Nov 30' });
  });
});

/**
 * 0036: Kwanzaa accessories (Kikombe cha Umoja, Zawadi, Red, Black & Green Scarf), the Rosca de Reyes peek,
 * and no disclaimer lines in user-facing About text. Fixed dates only. The mock mirrors 0036_winter_windows_kwanzaa.sql.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/mock';
import { SEASONAL } from '../config';
import { OUTFIT_SETS } from '../lib/rewardEvents';
import { aboutFor, claimToastLines, claimToasts, holidayById, seasonalItems, seasonalNoticeTitle } from '../lib/seasonal';
import { ACCESSORY_ART } from '../components/cosmetics/art';
import { backgroundVec } from '../components/cosmetics/backgrounds';
import { composeLayers } from '../components/cosmetics/compose';
import { GRIDS } from '../components/Sprite';

const { load, setSession } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);
const at = (iso: string) => vi.setSystemTime(Date.parse(iso));
const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);
const SQL36 = readFileSync(new URL('0036_winter_windows_kwanzaa.sql', MIGRATIONS), 'utf8');
const KWANZAA_ACC = ['kikombe_cha_umoja', 'zawadi', 'kwanzaa_scarf'];
const CHARS = ['yak', 'golden_yak', 'unicorn', 'dragon', 'knight', 'mage', 'ranger'] as const;

describe('0036 Kwanzaa accessories', () => {
  it('three accessories in the Kwanzaa group, mirrored in SQL, with art for every character', () => {
    expect(seasonalItems('kwanzaa').map((c) => [c.id, c.slot, c.name])).toEqual([
      ['kinara_glow', 'background', 'Kinara Glow'],
      ['kikombe_cha_umoja', 'accessory', 'Kikombe cha Umoja (Unity Cup)'],
      ['zawadi', 'accessory', 'Zawadi (Gift)'],
      ['kwanzaa_scarf', 'accessory', 'Red, Black & Green Scarf'],
    ]);
    expect(SQL36).toContain("('kikombe_cha_umoja', 'accessory', 'Kikombe cha Umoja (Unity Cup)', 'seasonal', 'kwanzaa', 123)");
    expect(SQL36).toContain("('zawadi',            'accessory', 'Zawadi (Gift)',                 'seasonal', 'kwanzaa', 124)");
    expect(SQL36).toContain("('kwanzaa_scarf',     'accessory', 'Red, Black & Green Scarf',      'seasonal', 'kwanzaa', 125)");
    expect(SQL36).toMatch(/on conflict \(id\) do update/);
    expect(ACCESSORY_ART.kikombe_cha_umoja.anchor).toBe('side');
    expect(ACCESSORY_ART.zawadi.anchor).toBe('side');
    expect(ACCESSORY_ART.kwanzaa_scarf.anchor).toBe('neck');
    for (const id of KWANZAA_ACC) {
      const vec = ACCESSORY_ART[id].vec!;
      expect(vec.shapes.length, id).toBeGreaterThan(10);
      for (const ch of CHARS) {
        const l = composeLayers(ch, { accessory: id, background: 'kinara_glow' });
        expect(l[0].vec, `${ch} bg`).toBe(backgroundVec('kinara_glow'));
        const acc = l.find((x) => x.vec === vec)!;
        expect(acc, `${ch} ${id}`).toBeTruthy();
        // stays inside the 36×36 frame (x −2…34, y −4…32)
        expect(acc.x, `${ch} ${id}`).toBeGreaterThanOrEqual(-2);
        expect(acc.x + vec.w, `${ch} ${id}`).toBeLessThanOrEqual(34);
        expect(acc.y + vec.h, `${ch} ${id}`).toBeLessThanOrEqual(32);
      }
    }
    // the colors are there: red, black and green on the scarf and the gift ribbon
    for (const id of ['kwanzaa_scarf', 'zawadi']) {
      const fills = new Set(ACCESSORY_ART[id].vec!.shapes.flatMap((s) => [s.fill, s.stroke]));
      for (const c of ['#c8372d', '#1b1b1b', '#2f8f4e']) expect(fills.has(c), `${id} ${c}`).toBe(true);
    }
  });

  it('About: a short line per item under the Kwanzaa group; plural notification', () => {
    const k = holidayById('kwanzaa')!;
    expect(Object.keys(k.itemAbout!)).toEqual(KWANZAA_ACC);
    expect(k.itemAbout!.kikombe_cha_umoja).toContain('unity cup');
    expect(k.itemAbout!.kikombe_cha_umoja).toContain('ancestors');
    expect(k.itemAbout!.zawadi).toContain('often handmade or educational');
    expect(k.itemAbout!.kwanzaa_scarf).toContain('red for the struggle, black for the people, and green for the future and hope');
    for (const t of Object.values(k.itemAbout!)) expect(t.length).toBeLessThan(200);
    expect(k.noun).toBe('items');
    expect(seasonalNoticeTitle(k)).toBe('🕯️ New limited-time items for Kwanzaa — see what they honor');
    expect(claimToasts(['zawadi'])).toEqual(['🕯️ New limited-time items for Kwanzaa — see what they honor']);
    // Dec 1: up to 7 holidays at once → one toast line (the notifications still list every holiday)
    expect(claimToastLines(['zawadi'])).toEqual(['🕯️ New limited-time items for Kwanzaa — see what they honor']);
    expect(claimToastLines(['dreidel', 'zawadi'])).toEqual(claimToasts(['dreidel', 'zawadi']));
    expect(claimToastLines(['dreidel', 'candy_cane', 'zawadi', 'rosca_de_reyes', 'red_envelope', 'party_popper', 'longest_night'])).toEqual([
      '🕎🎄🕯️✨🎆⭐🧧 New limited-time items for 7 holidays — see what they honor',
    ]);
  });
});

describe('0036 Kwanzaa items: unlock, persist, equip (mock, fixed dates)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-11-19T12:00:00-05:00');
    await api.resetDemoData();
  });
  afterEach(() => vi.useRealTimers());

  it('locked before Dec 1; claimed on Dec 1 with the background; one Kwanzaa notification', async () => {
    asUser('yak001');
    expect(await code(api.equipLook({ accessory: 'zawadi' }))).toBe('locked');
    expect((await api.claimSeasonalItems()).claimed).toEqual([]);
    at('2026-12-01T00:05:00-05:00');
    const r = await api.claimSeasonalItems();
    for (const id of ['kinara_glow', ...KWANZAA_ACC]) expect(r.claimed).toContain(id);
    expect(r.active.find((a) => a.holiday === 'kwanzaa')).toEqual({ holiday: 'kwanzaa', endsOn: '2027-01-08' });
    const me = load().users.find((u) => u.handle === 'yak001')!;
    expect(load().notifications.filter((n) => n.userId === me.id && n.kind === 'seasonal' && n.title.includes('Kwanzaa')).map((n) => n.title)).toEqual([
      '🕯️ New limited-time items for Kwanzaa — see what they honor',
    ]);
  });

  it('owned forever: wearable with the Kinara background after the window; missed → locked', async () => {
    at('2026-12-27T12:00:00-05:00');
    asUser('yak001');
    await api.claimSeasonalItems();
    for (const acc of KWANZAA_ACC) expect((await api.equipLook({ accessory: acc, background: 'kinara_glow' })).look).toEqual({ accessory: acc, background: 'kinara_glow' });
    at('2027-06-01T12:00:00-04:00');
    expect(await api.myUnlocks()).toEqual(expect.arrayContaining(KWANZAA_ACC));
    expect((await api.equipLook({ hat: 'holiday_hat', accessory: 'kwanzaa_scarf' })).look).toEqual({ hat: 'holiday_hat', accessory: 'kwanzaa_scarf' });
    expect(await code(api.equipLook({ hat: 'zawadi' }))).toBe('look'); // wrong slot
    asUser('alum002'); // never opened the app in winter
    for (const acc of KWANZAA_ACC) expect(await code(api.equipLook({ accessory: acc }))).toBe('locked');
  });

  it('last day Jan 8 (New York); Jan 9 is too late', async () => {
    at('2027-01-09T04:30:00Z'); // 11:30 PM Jan 8 in New York
    asUser('yak001');
    expect((await api.claimSeasonalItems()).claimed).toEqual(expect.arrayContaining(KWANZAA_ACC));
    at('2027-01-09T12:00:00-05:00');
    asUser('alum002');
    expect((await api.claimSeasonalItems()).claimed.filter((id) => KWANZAA_ACC.includes(id))).toEqual([]);
    expect(await code(api.equipLook({ accessory: 'kikombe_cha_umoja' }))).toBe('locked');
  });
});

describe('0036 Rosca de Reyes peeks out beside every character', () => {
  it('the ring’s hole sits where no character is drawn (bottom-right), the mugs bottom-left', () => {
    const vec = backgroundVec('rosca_de_reyes')!;
    // the ring's hole: the cream ellipse inside the bread (frame units; background origin = FRAME)
    const hole = vec.shapes.find((s) => s.fill === '#f6efe2' && s.stroke && /A2\.5 1\.05/.test(s.d))!;
    expect(hole).toBeTruthy();
    const cx = Number(hole.d.match(/^M([\d.]+),([\d.]+)/)![1]) + 2.5; // M(cx − rx, cy)
    const cy = Number(hole.d.match(/^M([\d.]+),([\d.]+)/)![2]);
    for (const ch of CHARS) {
      const g = GRIDS[ch];
      // the column right of the hole's center, on the hole's row, is empty for every character (bg x → char x − 2, y − 4)
      const row = g[Math.round(cy) - 4] ?? '';
      const col = Math.floor(cx) - 2;
      expect(row[col] ?? '.', ch).toBe('.');
    }
  });
});

describe('0036 no disclaimer lines in user-facing About text', () => {
  const DISCLAIMER = /costume|isn[’']t a |is not a |not a (spooky )?costume/i;
  it('seasonal About, item lines, links, notifications, event outfits', () => {
    for (const h of SEASONAL) {
      expect(h.about, h.id).not.toMatch(/costume/i);
      expect(aboutFor(h, Date.parse('2026-12-27T12:00:00-05:00')), h.id).not.toMatch(DISCLAIMER);
      for (const t of Object.values(h.itemAbout ?? {})) expect(t, h.id).not.toMatch(DISCLAIMER);
      expect(seasonalNoticeTitle(h)).not.toMatch(/costume/i);
    }
    for (const set of OUTFIT_SETS) expect(set.about, set.id).not.toMatch(/costume/i);
    // the text that was there before keeps reading naturally
    expect(holidayById('dia_de_muertos')!.about).toMatch(/and papel picado\. This flower crown honors the tradition\.$/);
    expect(holidayById('heritage_month')!.about).toMatch(/practiced by many Native nations for generations\.$/);
  });
  it('no SQL string (notifications, names) says "costume" (comments may describe the design rule)', () => {
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))) {
      const code = readFileSync(new URL(f, MIGRATIONS), 'utf8').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
      for (const lit of code.match(/'(?:[^']|'')*'/g) ?? []) expect(lit, f).not.toMatch(/costume/i);
    }
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { YAK_PUNS, randomYakPun, yakPun, yakPunOfTheDay, yakPunOfTheWeek } from '../lib/yakPuns';

/** The text[] literal inside public.yak_pun() in 0015, unescaped ('' → '). */
function sqlPuns(): string[] {
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/0015_yak_puns.sql'), 'utf8');
  const fn = sql.slice(sql.indexOf('create or replace function public.yak_pun(p_seed int)'));
  const body = fn.match(/array\[([\s\S]*?)\]::text\[\]/);
  if (!body) throw new Error('yak_pun array literal not found');
  return [...body[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

describe('yak puns', () => {
  it('TS list and SQL list (0015) are identical, same order', () => {
    expect(sqlPuns()).toEqual([...YAK_PUNS]);
  });

  it('about 40 short, unique puns', () => {
    expect(YAK_PUNS.length).toBeGreaterThanOrEqual(35);
    expect(new Set(YAK_PUNS).size).toBe(YAK_PUNS.length);
    for (const p of YAK_PUNS) {
      expect(p.length).toBeLessThanOrEqual(60);
      expect(p).toMatch(/yak|herd|fur|hair/i);
    }
  });

  it('yakPun(seed) matches SQL: list[|seed| mod n]', () => {
    expect(yakPun(0)).toBe(YAK_PUNS[0]);
    expect(yakPun(YAK_PUNS.length)).toBe(YAK_PUNS[0]);
    expect(yakPun(-5)).toBe(YAK_PUNS[5]);
    expect(yakPun(202645)).toBe('That was yak-tually amazing.'); // same as the DB test
  });

  it('pun of the day: same all day in New York, changes the next day', () => {
    // Nov 5 2026 in New York runs 05:00Z Nov 5 → 04:59Z Nov 6 (EST, UTC-5)
    const morning = yakPunOfTheDay(new Date('2026-11-05T05:00:00Z'));
    expect(yakPunOfTheDay(new Date('2026-11-05T17:00:00Z'))).toBe(morning);
    expect(yakPunOfTheDay(new Date('2026-11-06T04:59:00Z'))).toBe(morning); // still Nov 5 in NY
    const next = yakPunOfTheDay(new Date('2026-11-06T05:00:00Z'));
    expect(next).not.toBe(morning);
    // consecutive days walk through the list in order
    expect(YAK_PUNS.indexOf(next)).toBe((YAK_PUNS.indexOf(morning) + 1) % YAK_PUNS.length);
    // seed = days since 1970-01-01 of the NY date
    expect(morning).toBe(yakPun(Date.UTC(2026, 10, 5) / 86_400_000));
  });

  it('every day for 40 days shows a different pun', () => {
    const seen = new Set<string>();
    for (let i = 0; i < YAK_PUNS.length; i++) seen.add(yakPunOfTheDay(new Date(Date.UTC(2026, 0, 1, 17) + i * 86_400_000)));
    expect(seen.size).toBe(YAK_PUNS.length);
  });

  it('pun of the week is seeded by the NY ISO week (YYYYWW, like SQL IYYYIW)', () => {
    expect(yakPunOfTheWeek(new Date('2026-11-05T12:00:00Z'))).toBe(yakPun(202645)); // Thu, ISO week 45
    expect(yakPunOfTheWeek(new Date('2026-11-02T12:00:00Z'))).toBe(yakPun(202645)); // Mon, same week
    expect(yakPunOfTheWeek(new Date('2026-11-09T04:59:00Z'))).toBe(yakPun(202645)); // still Sun Nov 8 in NY
    expect(yakPunOfTheWeek(new Date('2026-11-09T05:00:00Z'))).toBe(yakPun(202646));
    expect(yakPunOfTheWeek(new Date('2027-01-01T17:00:00Z'))).toBe(yakPun(202653)); // Fri Jan 1 2027 = 2026-W53
    expect(yakPunOfTheWeek(new Date('2025-12-29T17:00:00Z'))).toBe(yakPun(202601)); // Mon Dec 29 2025 = 2026-W01
  });

  it('randomYakPun returns a pun from the list', () => {
    for (let i = 0; i < 20; i++) expect(YAK_PUNS).toContain(randomYakPun());
  });
});

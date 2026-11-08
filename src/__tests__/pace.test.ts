import { describe, expect, it } from 'vitest';
import { PACE_DEFAULTS, mondayOf, paceChart, projectPace } from '../lib/pace';
import type { PaceData } from '../types';

// Fixed data, fixed "now" (never today's date).
const NOW = Date.parse('2027-01-03T00:00:00-05:00'); // Sun Jan 3, 2027: 8 weeks after the Nov 8 start

function data(players: PaceData['players'], weeklyTotals = [0, 0, 0, 40, 60, 0, 80, 50]): PaceData {
  return {
    generatedAt: new Date(NOW).toISOString(),
    goal: 350,
    prizeCount: 4,
    cycle: { name: '2026–27 Pilot', startsAt: '2026-10-15T00:00:00-04:00', endsAt: '2027-05-01T23:59:59-04:00' },
    weeks: ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'],
    weeklyTotals,
    players,
    top: players.filter((p) => p.points > 0).map((p) => ({ ...p, cumulative: [0, 0, 0, 0, 10, 20, 30, p.points] })),
  };
}

const PLAYERS: PaceData['players'] = [
  { id: 'a', name: 'Ava', campus: 'duke', points: 200, firstAt: '2026-11-08T00:00:00-05:00' }, // 8 weeks → 25/wk
  { id: 'e', name: 'Eli', campus: 'unc', points: 180, firstAt: '2026-10-20T12:00:00-04:00' }, // before the start → counted from Nov 8: 22.5/wk
  { id: 'b', name: 'Ben', campus: 'ncsu', points: 100, firstAt: '2026-11-22T00:00:00-05:00' }, // 6 weeks → 16.7/wk
  { id: 'c', name: 'Cal', campus: 'duke', points: 10, firstAt: '2026-12-31T12:00:00-05:00' }, // < 1 week → counted as 1 week
  { id: 'd', name: 'Dee', campus: 'unc', points: 0, firstAt: null },
];

describe('pace projection (fixed data)', () => {
  it('rate per week since first points (or the season start), projected with 80% and 100% of it', () => {
    const r = projectPace(data(PLAYERS), NOW);
    const by = Object.fromEntries(r.players.map((p) => [p.id, p]));
    const weeksLeft = (Date.parse('2027-05-01T23:59:59-04:00') - NOW) / (7 * 86_400_000);
    expect(r.weeksLeft).toBeCloseTo(weeksLeft, 6);
    expect(by.a.rate).toBeCloseTo(25, 6);
    expect(by.e.rate).toBeCloseTo(22.5, 6); // not 180 / 10.7 weeks: the season started Nov 8
    expect(by.b.rate).toBeCloseTo(100 / 6, 6);
    expect(by.c.rate).toBeCloseTo(10, 6); // at least one week
    expect(by.d.rate).toBe(0);
    expect(by.a.conservative).toBeCloseTo(200 + 25 * 0.8 * weeksLeft, 6);
    expect(by.a.optimistic).toBeCloseTo(200 + 25 * weeksLeft, 6);
    expect(by.b.conservative).toBeLessThan(350);
    expect(by.b.optimistic).toBeGreaterThanOrEqual(350);
  });

  it('finishers range, past halfway, first to the goal and advice', () => {
    const r = projectPace(data(PLAYERS), NOW);
    expect(r.enoughData).toBe(true);
    expect(r.activeWeeks).toBe(4);
    expect(r.finishers).toEqual({ low: 2, high: 3 });
    expect(r.halfway).toBe(175);
    expect(r.pastHalfway).toBe(2);
    expect(r.alreadyAtGoal).toBe(0);
    // Ava needs 150 more at 20/wk (80% of 25) → 7.5 weeks → Feb 24, 2027 at noon Eastern
    expect(r.firstCross).toEqual({ name: 'Ava', at: new Date(Date.parse('2027-02-24T12:00:00-05:00')).toISOString(), already: false });
    expect(r.advice).toEqual({ kind: 'ok', text: 'On track: about 2–3 people would reach 350 for 4 prizes.' });
    expect(r.players.map((p) => p.id)).toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('“Check back after a couple of weeks of events” before 2 weeks with any points', () => {
    const r = projectPace(data(PLAYERS, [0, 0, 0, 0, 0, 0, 0, 90]), NOW);
    expect(r.enoughData).toBe(false);
    expect(r.advice).toEqual({ kind: 'early', text: 'Check back after a couple of weeks of events.' });
  });

  it('also “check back” during the first two weeks of the season, however busy', () => {
    const early = projectPace(data(PLAYERS), Date.parse('2026-11-20T12:00:00-05:00')); // 12 days after Nov 8
    expect(early.enoughData).toBe(false);
    expect(early.advice.kind).toBe('early');
    expect(projectPace(data(PLAYERS), Date.parse('2026-11-22T12:00:00-05:00')).enoughData).toBe(true);
  });

  it('fewer than 2 finishers: "watch" before Feb 1, "Consider lowering the goal" (with the docs link) from Feb 1', () => {
    const slow: PaceData['players'] = [{ id: 's', name: 'Sam', campus: 'duke', points: 60, firstAt: '2026-11-08T00:00:00-05:00' }];
    expect(projectPace(data(slow), NOW).advice.kind).toBe('watch');
    const feb = projectPace(data(slow), Date.parse('2027-02-01T09:00:00-05:00'));
    expect(feb.advice).toEqual({ kind: 'lower', text: 'Consider lowering the goal: even at full pace, fewer than 2 people would reach 350.', link: true });
    expect(projectPace(data(slow), Date.parse('2027-01-31T23:00:00-05:00')).advice.kind).toBe('watch');
  });

  it('more than 8 conservative finishers → "Goal may be too easy"', () => {
    const fast = Array.from({ length: 9 }, (_, i) => ({ id: `f${i}`, name: `Fast ${i}`, campus: 'duke' as const, points: 300, firstAt: '2026-11-08T00:00:00-05:00' }));
    const r = projectPace(data(fast), NOW);
    expect(r.finishers.low).toBe(9);
    expect(r.advice.kind).toBe('easy');
    expect(r.advice.text).toBe('Goal may be too easy: even at 80% pace, 9 people would reach 350 for 4 prizes.');
  });

  it('someone already at the goal', () => {
    const r = projectPace(data([{ id: 'w', name: 'Win', campus: 'unc', points: 360, firstAt: '2026-11-08T00:00:00-05:00' }, ...PLAYERS]), NOW);
    expect(r.alreadyAtGoal).toBe(1);
    expect(r.firstCross).toEqual({ name: 'Win', at: null, already: true });
  });

  it('nobody crosses before the end at the conservative pace → no date', () => {
    const r = projectPace(data([{ id: 's', name: 'Sam', campus: 'duke', points: 60, firstAt: '2026-11-08T00:00:00-05:00' }]), NOW);
    expect(r.firstCross).toBeNull();
  });
});

describe('pace chart', () => {
  it('starts at the week the season started and runs to the last week of the quest', () => {
    expect(mondayOf('2026-11-08T00:00:00-05:00')).toBe('2026-11-02'); // Nov 8, 2026 is a Sunday
    expect(mondayOf('2027-05-01T23:59:59-04:00')).toBe('2027-04-26');
    const c = paceChart(data(PLAYERS), PACE_DEFAULTS);
    expect(c.weeks[0]).toBe('2026-11-02');
    expect(c.weeks[c.weeks.length - 1]).toBe('2027-04-26');
    expect(c.weeks).toHaveLength(26);
    expect(c.elapsed).toBe(5); // Nov 2 … Nov 30 in the data
    expect(c.lines[0].values).toEqual([0, 10, 20, 30, 200]);
  });
});

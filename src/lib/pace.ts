/**
 * 0028 Pace tracker: projects how many participants reach PRIZE.goal by CYCLE.end at their current pace.
 * Pure (unit tested in src/__tests__/pace.test.ts); the data comes from admin_pace() (participants only).
 *
 * Method: each player's pace = points ÷ weeks since their first points this cycle (or since the season
 * started on CYCLE.displayStart, whichever is later; at least 1 week). Projected = points now + pace × weeks
 * left. Conservative keeps PACE.dampening (80%) of that pace, optimistic keeps 100%.
 */
import { CYCLE, PACE, PRIZE } from '../config';
import type { PaceData } from '../types';

const WEEK = 7 * 86_400_000;

export const PACE_METHOD =
  'We take each player’s points per week since their first points (or since the season started), assume they keep 80–100% of that pace until the quest ends, and count who would reach the goal.';

export interface PaceOptions {
  dampening: number;
  minWeeks: number;
  checkFrom: string;
  tooFew: number;
  tooMany: number;
  displayStart: string;
  end: string;
}

export const PACE_DEFAULTS: PaceOptions = { ...PACE, displayStart: CYCLE.displayStart, end: CYCLE.end };

export interface PlayerProjection {
  id: string;
  name: string;
  points: number;
  /** Points per week. */
  rate: number;
  conservative: number;
  optimistic: number;
  /** When they'd cross the goal at the conservative pace (before the end), ISO; null = not before the end. */
  crossAt: string | null;
}

export type PaceAdvice = 'early' | 'lower' | 'watch' | 'easy' | 'ok';

export interface PaceResult {
  enoughData: boolean;
  /** Weeks this cycle in which anyone earned points. */
  activeWeeks: number;
  weeksLeft: number;
  goal: number;
  halfway: number;
  finishers: { low: number; high: number };
  alreadyAtGoal: number;
  pastHalfway: number;
  /** The first person projected to cross the goal (conservative pace), or someone who already did. */
  firstCross: { name: string; at: string | null; already: boolean } | null;
  advice: { kind: PaceAdvice; text: string; link?: boolean };
  players: PlayerProjection[];
}

export function projectPace(data: PaceData, now: number, opts: PaceOptions = PACE_DEFAULTS): PaceResult {
  const goal = data.goal || PRIZE.goal;
  const halfway = Math.ceil(goal / 2);
  const start = Date.parse(opts.displayStart);
  const end = Date.parse(opts.end);
  const weeksLeft = Math.max(0, (end - now) / WEEK);
  const activeWeeks = data.weeklyTotals.filter((v) => v > 0).length;

  const players: PlayerProjection[] = data.players.map((p) => {
    const pts = Math.max(0, p.points);
    const from = Math.max(start, p.firstAt ? Date.parse(p.firstAt) : start);
    const weeks = Math.max(1, (now - from) / WEEK);
    const rate = pts / weeks;
    const conservative = pts + rate * opts.dampening * weeksLeft;
    const optimistic = pts + rate * weeksLeft;
    let crossAt: string | null = null;
    if (pts < goal && rate > 0) {
      const at = now + ((goal - pts) / (rate * opts.dampening)) * WEEK;
      if (at <= end) crossAt = new Date(at).toISOString();
    }
    return { id: p.id, name: p.name, points: pts, rate, conservative, optimistic, crossAt };
  });
  players.sort((a, b) => b.optimistic - a.optimistic || b.points - a.points || a.name.localeCompare(b.name));

  const already = players.filter((p) => p.points >= goal);
  const low = players.filter((p) => p.conservative >= goal).length;
  const high = players.filter((p) => p.optimistic >= goal).length;
  const next = players.filter((p) => p.crossAt).sort((a, b) => a.crossAt!.localeCompare(b.crossAt!))[0];
  const firstCross = already.length
    ? { name: already[0].name, at: null, already: true }
    : next
      ? { name: next.name, at: next.crossAt, already: false }
      : null;

  // at least `minWeeks` weeks with points AND that many weeks since the season started (before it, every pace is inflated)
  const enoughData = activeWeeks >= opts.minWeeks && (now - start) / WEEK >= opts.minWeeks;
  const count = high === low ? `${low}` : `${low}–${high}`;
  let advice: PaceResult['advice'];
  if (!enoughData) advice = { kind: 'early', text: 'Check back after a couple of weeks of events.' };
  else if (high < opts.tooFew)
    advice = now >= Date.parse(opts.checkFrom)
      ? { kind: 'lower', text: `Consider lowering the goal: even at full pace, fewer than ${opts.tooFew} people would reach ${goal}.`, link: true }
      : { kind: 'watch', text: `On track for fewer than ${opts.tooFew} finishers. Look again at the Feb 1 mid-year check.` };
  else if (low > opts.tooMany)
    advice = { kind: 'easy', text: `Goal may be too easy: even at 80% pace, ${low} people would reach ${goal} for ${data.prizeCount || PRIZE.count} prizes.`, link: true };
  else advice = { kind: 'ok', text: `On track: about ${count} ${high === 1 ? 'person' : 'people'} would reach ${goal} for ${data.prizeCount || PRIZE.count} prizes.` };

  return {
    enoughData,
    activeWeeks,
    weeksLeft,
    goal,
    halfway,
    finishers: { low, high },
    alreadyAtGoal: already.length,
    pastHalfway: players.filter((p) => p.points >= halfway).length,
    firstCross,
    advice,
    players,
  };
}

/** Chart data: weeks from the week the season started (earlier weeks fold into it) through the cycle's last week. */
export function paceChart(data: PaceData, opts: Pick<PaceOptions, 'displayStart' | 'end'> = PACE_DEFAULTS) {
  const startWeek = mondayOf(opts.displayStart);
  let first = data.weeks.findIndex((w) => w >= startWeek);
  if (first < 0) first = Math.max(0, data.weeks.length - 1);
  const weeks = data.weeks.slice(first);
  const endWeek = mondayOf(opts.end);
  const allWeeks = [...weeks];
  while (allWeeks.length && allWeeks[allWeeks.length - 1] < endWeek) allWeeks.push(addWeek(allWeeks[allWeeks.length - 1]));
  if (!allWeeks.length) allWeeks.push(startWeek);
  return {
    weeks: allWeeks,
    /** How many of `weeks` have happened (lines stop here). */
    elapsed: weeks.length,
    lines: data.top.map((t) => ({ id: t.id, name: t.name, values: t.cumulative.slice(first) })),
  };
}

/** Monday ('YYYY-MM-DD') of the New York week containing an ISO time. */
export function mondayOf(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = (d.getDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - day));
  return m.toISOString().slice(0, 10);
}

function addWeek(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
}

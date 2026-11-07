/**
 * Treasure-map checkpoints (drawn by src/components/TreasureMap.tsx) and Home's one-line
 * "how close am I" text. Pure, so it's easy to unit test.
 */
import { PRIZE } from '../config';

export interface Checkpoint {
  points: number;
  label: string;
}

export const CHECKPOINTS: Checkpoint[] = [
  { points: 50, label: 'Trailhead' },
  { points: 100, label: 'Camp' },
  { points: Math.ceil(PRIZE.goal / 2), label: 'Halfway' },
  // About ¾ of the goal, rounded down to a multiple of 25 (350 → 250).
  { points: Math.floor((PRIZE.goal * 0.75) / 25) * 25, label: 'Summit' },
];

/** Checkpoints (plus the treasure itself) passed when going from `prev` to `now` points. */
export function checkpointsCrossed(prev: number, now: number, goal: number = PRIZE.goal): Checkpoint[] {
  const all = [...CHECKPOINTS, { points: goal, label: 'Treasure' }];
  return all.filter((c) => prev < c.points && now >= c.points);
}

export function nextCheckpoint(points: number, goal: number = PRIZE.goal): Checkpoint | undefined {
  return [...CHECKPOINTS, { points: goal, label: 'the treasure' }].find((c) => points < c.points);
}

const ICONS: Record<string, string> = { Trailhead: '🥾', Camp: '⛺', Halfway: '🚩', Summit: '🏔', 'the treasure': '💰' };

/**
 * Home → Your points: one short line. "15 more points to Summit 🏔" before the goal;
 * at/after the goal, "You reached the treasure!" plus the prize status.
 */
export function nextStopText(
  points: number,
  opts: { goal?: number; claimSpot?: number; prizesLeft?: number } = {},
): string {
  const goal = opts.goal ?? PRIZE.goal;
  const next = nextCheckpoint(points, goal);
  if (next) {
    const n = next.points - points;
    return `${n} more ${n === 1 ? 'point' : 'points'} to ${next.label} ${ICONS[next.label] ?? '🚩'}`;
  }
  if (opts.claimSpot) return `You reached the treasure! Prize spot #${opts.claimSpot} is yours 🏆`;
  if (opts.prizesLeft === 0) return 'You reached the treasure! All prize spots are taken.';
  return 'You reached the treasure! 💰';
}

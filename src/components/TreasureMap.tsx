/**
 * Pixel treasure map: a dotted path snaking from START to the prize chest, with
 * checkpoint flags along the way and the player's character standing at their points.
 */
import { PRIZE } from '../config';
import type { AvatarId, Look } from '../types';
import { Avatar } from './Avatar';
import { Sprite } from './Sprite';

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

// Map coordinates (viewBox 320 × 176). A board-game snake: bottom row → right bend → middle row → left bend → top row.
const W = 320;
const H = 176;
const PATH: [number, number][] = [
  [26, 150],
  [278, 150],
  [298, 136],
  [298, 108],
  [278, 94],
  [44, 94],
  [24, 80],
  [24, 52],
  [44, 38],
  [262, 38],
];

const SEGS = PATH.slice(1).map((p, i) => {
  const a = PATH[i];
  return { a, b: p, len: Math.hypot(p[0] - a[0], p[1] - a[1]) };
});
const TOTAL = SEGS.reduce((s, x) => s + x.len, 0);

/** Point on the path at fraction t (0 = START, 1 = chest). Clamped. */
export function pointAt(t: number): [number, number] {
  let d = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * TOTAL;
  for (const s of SEGS) {
    if (d <= s.len) {
      const k = s.len ? d / s.len : 0;
      return [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k];
    }
    d -= s.len;
  }
  return PATH[PATH.length - 1];
}

/** The path from START up to fraction t, as polyline points. */
function pathUpTo(t: number): string {
  const end = pointAt(t);
  let d = Math.min(1, Math.max(0, t)) * TOTAL;
  const pts: [number, number][] = [PATH[0]];
  for (const s of SEGS) {
    if (d <= s.len) break;
    pts.push(s.b);
    d -= s.len;
  }
  pts.push(end);
  return pts.map((p) => p.join(',')).join(' ');
}

const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

export function TreasureMap({ points, avatar, look, goal = PRIZE.goal }: { points: number; avatar: AvatarId; look?: Look; goal?: number }) {
  const clamped = Math.max(0, Math.min(points, goal));
  const t = clamped / goal;
  const [px, py] = pointAt(t);
  const next = nextCheckpoint(points, goal);
  const label = `Treasure map: ${points} of ${goal} points, ${next ? `next checkpoint ${next.label} at ${next.points}` : 'treasure reached!'}`;
  const [cx, cy] = PATH[PATH.length - 1];

  return (
    <div className="tmap" role="img" aria-label={label}>
      <svg className="tmap-svg" viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden preserveAspectRatio="none">
        {/* little terrain doodles */}
        <g className="tmap-doodle">
          <rect x="150" y="116" width="6" height="4" />
          <rect x="146" y="120" width="14" height="4" />
          <rect x="226" y="60" width="4" height="4" />
          <rect x="222" y="64" width="12" height="4" />
          <rect x="70" y="118" width="10" height="2" />
          <rect x="120" y="62" width="10" height="2" />
          <rect x="190" y="12" width="12" height="2" />
        </g>
        <polyline className="tmap-path" points={PATH.map((p) => p.join(',')).join(' ')} />
        {t > 0 && <polyline className="tmap-path done" points={pathUpTo(t)} />}
        {/* START tile */}
        <rect x={PATH[0][0] - 6} y={PATH[0][1] - 6} width="12" height="12" className="tmap-start" />
        {CHECKPOINTS.map((c) => {
          const [x, y] = pointAt(c.points / goal);
          const lit = points >= c.points;
          return (
            <g key={c.points} className={lit ? 'tmap-flag lit' : 'tmap-flag'}>
              <rect x={x - 5} y={y - 5} width="10" height="10" className="base" />
              <rect x={x - 1} y={y - 20} width="2" height="16" className="pole" />
              <rect x={x + 1} y={y - 20} width="9" height="7" className="cloth" />
            </g>
          );
        })}
        {/* X marks the spot */}
        <g className="tmap-x">
          <rect x={cx + 8} y={cy - 2} width="4" height="4" />
          <rect x={cx + 4} y={cy - 6} width="4" height="4" />
          <rect x={cx + 12} y={cy - 6} width="4" height="4" />
          <rect x={cx + 4} y={cy + 2} width="4" height="4" />
          <rect x={cx + 12} y={cy + 2} width="4" height="4" />
        </g>
      </svg>

      <span className="tmap-label start" style={pct(PATH[0][0], PATH[0][1] + 10)}>START</span>
      {CHECKPOINTS.map((c) => {
        const [x, y] = pointAt(c.points / goal);
        return (
          <span key={c.points} className={`tmap-label ${points >= c.points ? 'lit' : ''}`} style={pct(x, y + 8)}>
            {c.label} · {c.points}
          </span>
        );
      })}
      <span className="tmap-chest" style={pct(cx + 10, cy)}>
        <Sprite id="chest" size={34} title={`Treasure at ${goal} points`} />
      </span>
      <span className="tmap-goal" style={pct(cx + 10, cy + 13)}>{goal}</span>
      <span className="tmap-player" style={pct(px, py)}>
        <Avatar id={avatar} look={look} size={28} className="bob" />
      </span>
      <span className="tmap-count">{clamped} / {goal}</span>
    </div>
  );
}

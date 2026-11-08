/**
 * 0028 Pace tracker (staff): the compact "Pace" card on the Admin dashboard and the fuller section on
 * Admin → Stats (chart of the top 10 vs the goal, projections table). Data: admin_pace(); projection:
 * src/lib/pace.ts (pure, unit tested). Participants only.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { CYCLE, DOCS_URL, PACE } from '../../config';
import { Card } from '../../components/Blocks';
import { ErrorText, Loading } from '../../components/ui';
import { axis } from '../../lib/adminTools';
import { fmtDate } from '../../lib/format';
import { PACE_METHOD, paceChart, projectPace, type PaceResult } from '../../lib/pace';
import { useAsync } from '../../lib/useAsync';
import type { PaceData } from '../../types';

const DOCS_LINK = `${DOCS_URL}/POINTS.md#check-ins-during-the-year`;
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function usePace() {
  const q = useAsync(() => api.adminPace(), [], { live: true });
  const result = q.data ? projectPace(q.data, Date.now()) : null;
  return { ...q, result };
}

function Advice({ r }: { r: PaceResult }) {
  const tone = r.advice.kind === 'lower' || r.advice.kind === 'easy' ? 'pending' : r.advice.kind === 'ok' ? 'approved' : 'neutral';
  return (
    <p className={`pace-advice ${tone}`}>
      <span>{r.advice.text}</span>
      {r.advice.link && (
        <a href={DOCS_LINK} target="_blank" rel="noopener noreferrer" className="dash-link">How to change the goal<span className="sr-only"> (opens in a new tab)</span> ↗</a>
      )}
    </p>
  );
}

function HowCalculated() {
  return (
    <details className="pace-how">
      <summary>How this is calculated</summary>
      <ul>
        <li>For each participant: points so far ÷ weeks since their first points this cycle (or since the season started on {fmtDate(CYCLE.displayStart)}, whichever is later; at least 1 week).</li>
        <li>Projected total = points now + that weekly pace × weeks left until {fmtDate(CYCLE.end)}.</li>
        <li><b>Conservative</b> keeps {Math.round(PACE.dampening * 100)}% of the pace (people slow down); <b>optimistic</b> keeps 100%. The range counts who reaches the goal in each.</li>
        <li>“First to the goal” uses the conservative pace. Staff are never counted.</li>
        <li>Advice: if even the optimistic count is under {PACE.tooFew} from Feb 1 (the mid-year check), consider lowering the goal; if even the conservative count is over {PACE.tooMany}, the goal may be too easy.</li>
        <li>Until there are {PACE.minWeeks} weeks of points (and the season is {PACE.minWeeks} weeks old) the card just says to check back: early paces are wildly high.</li>
        <li>Projections are a rough guide: one big event or a quiet month changes them a lot.</li>
      </ul>
    </details>
  );
}

function firstCrossText(r: PaceResult): string {
  if (!r.firstCross) return `Nobody before ${fmtDate(CYCLE.end)}`;
  if (r.firstCross.already) return `Reached! (${r.firstCross.name})`;
  return `~${shortDay(r.firstCross.at!)} (${r.firstCross.name})`;
}

/** Admin dashboard card. */
export function PaceCard() {
  const { result: r, error, data } = usePace();
  const action = <Link to="/admin/stats#pace" className="dash-link">Details ›</Link>;
  if (!data || !r)
    return (
      <Card glyph="chart" title="Pace" action={action}>
        {error ? <ErrorText error={error} /> : <Loading lines={2} />}
      </Card>
    );
  return (
    <Card glyph="chart" title="Pace" action={action} className="pace-card">
      {!r.enoughData ? (
        <p className="pace-early">Check back after a couple of weeks of events.</p>
      ) : (
        <>
          <div className="pace-head">
            <b className="pace-big">{r.finishers.low === r.finishers.high ? r.finishers.low : `${r.finishers.low}–${r.finishers.high}`}</b>
            <span>projected to reach {r.goal} by {fmtDate(CYCLE.end)} <span className="muted">({data.prizeCount} prizes)</span></span>
          </div>
          <ul className="pace-facts">
            <li><span>Past halfway ({r.halfway})</span><b>{r.pastHalfway}</b></li>
            <li><span>First to {r.goal}</span><b>{firstCrossText(r)}</b></li>
          </ul>
          <Advice r={r} />
        </>
      )}
      <p className="muted pace-method">{PACE_METHOD}</p>
      <HowCalculated />
    </Card>
  );
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(220, Math.floor(el.getBoundingClientRect().width)));
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Cumulative points of the top 10 vs the goal line, one point per week; the leader's conservative projection dashed. */
function PaceChart({ data, r }: { data: PaceData; r: PaceResult }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const c = paceChart(data);
  const H = 210;
  const pad = { l: 34, r: 10, t: 12, b: 26 };
  const leader = r.players.find((p) => p.id === c.lines[0]?.id);
  const maxVal = Math.max(r.goal, ...c.lines.flatMap((l) => l.values), leader ? Math.min(leader.conservative, r.goal * 1.4) : 0);
  const ax = axis(maxVal, 4);
  const iw = w - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = Math.max(2, c.weeks.length);
  const x = (i: number) => pad.l + (iw * i) / (n - 1);
  const y = (v: number) => pad.t + ih - (Math.max(0, v) / ax.max) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
  const lastI = c.elapsed - 1;
  const summary = c.lines.length
    ? `Top ${c.lines.length} players' points by week. Leader ${c.lines[0].name} has ${c.lines[0].values[lastI] ?? 0} of ${r.goal}.`
    : 'No points yet.';
  return (
    <div ref={ref} className="chart pace-chart">
      <svg width={w} height={H} role="img" aria-label={summary}>
        {ax.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {c.weeks.map((wk, i) => (i % every === 0 ? <text key={wk} x={x(i)} y={H - 8} className="axis small" textAnchor="middle">{fmtDate(wk)}</text> : null))}
        <line x1={pad.l} x2={w - pad.r} y1={y(r.goal)} y2={y(r.goal)} className="pace-goal" />
        <text x={w - pad.r} y={y(r.goal) - 5} className="axis pace-goal-lbl" textAnchor="end">Goal {r.goal}</text>
        {lastI >= 0 && lastI < n - 1 && <line x1={x(lastI)} x2={x(lastI)} y1={pad.t} y2={pad.t + ih} className="pace-now" />}
        {c.lines.slice().reverse().map((l, ri) => {
          const isLead = ri === c.lines.length - 1;
          const pts = l.values.slice(0, c.elapsed).map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return <polyline key={l.id} points={pts} className={isLead ? 'pace-line lead' : 'pace-line'} />;
        })}
        {leader && lastI >= 0 && lastI < n - 1 && (
          <line x1={x(lastI)} y1={y(leader.points)} x2={x(n - 1)} y2={y(Math.min(leader.conservative, ax.max))} className="pace-proj" />
        )}
        <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="base" />
      </svg>
      <div className="legend pace-legend" aria-hidden="true">
        <span><i className="sw pace-sw-lead" /> Leader</span>
        <span><i className="sw pace-sw" /> Rest of the top 10</span>
        <span><i className="sw pace-sw-goal" /> Goal</span>
        <span><i className="sw pace-sw-proj" /> Leader at 80% pace</span>
      </div>
    </div>
  );
}

/** Admin → Stats section. */
export function PaceSection() {
  const { result: r, error, data } = usePace();
  if (!data || !r)
    return (
      <Card glyph="chart" title="Pace to the prize" id="pace">
        {error ? <ErrorText error={error} /> : <Loading lines={4} />}
      </Card>
    );
  const top = r.players.slice(0, 10);
  return (
    <Card glyph="chart" title="Pace to the prize" id="pace" className="pace-section">
      <p className="muted pace-method">{PACE_METHOD}</p>
      {!r.enoughData ? (
        <p className="pace-early">Check back after a couple of weeks of events.</p>
      ) : (
        <>
          <ul className="pace-kpis">
            <li><b>{r.finishers.low === r.finishers.high ? r.finishers.low : `${r.finishers.low}–${r.finishers.high}`}</b><span>projected finishers</span></li>
            <li><b>{r.pastHalfway}</b><span>past halfway ({r.halfway})</span></li>
            <li><b>{r.firstCross ? (r.firstCross.already ? 'Reached' : shortDay(r.firstCross.at!)) : '—'}</b><span>first to {r.goal}{r.firstCross ? ` · ${r.firstCross.name}` : ''}</span></li>
            <li><b>{Math.ceil(r.weeksLeft)}</b><span>weeks left</span></li>
          </ul>
          <Advice r={r} />
          <PaceChart data={data} r={r} />
          <table className="stats-table pace-table">
            <caption className="sr-only">Top 10 projections</caption>
            <thead>
              <tr><th scope="col">Player</th><th scope="col">Now</th><th scope="col">Pts / wk</th><th scope="col">Projected</th></tr>
            </thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.name}</th>
                  <td>{p.points}</td>
                  <td>{p.rate.toFixed(1)}</td>
                  <td className={p.conservative >= r.goal ? 'pace-hit' : undefined}>{Math.round(p.conservative)}–{Math.round(p.optimistic)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <HowCalculated />
    </Card>
  );
}

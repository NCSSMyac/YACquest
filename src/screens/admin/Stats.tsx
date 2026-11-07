/**
 * Admin → Stats (staff, lazy-loaded): dashboard cards with small hand-rolled SVG charts, all from one
 * admin_stats() call (0025; participants only — staff are never counted). Every card has a CSV button;
 * YACquest Chairs also get the full participants export. Helpers: src/lib/adminTools.ts, src/lib/csv.ts.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as api from '../../api';
import { CAMPUSES, campusName, type CampusId } from '../../config';
import { Card } from '../../components/Blocks';
import { BadgeIcon } from '../../components/BadgeIcon';
import { PixelGlyph, type GlyphName } from '../../components/PixelGlyph';
import { ErrorText, Loading, useToast } from '../../components/ui';
import { axis, niceMax, pctOf } from '../../lib/adminTools';
import { badgeById } from '../../lib/badges';
import { csvDateTime, csvFilename, downloadCsv, toCsv, type CsvValue } from '../../lib/csv';
import { fmtCycleRange, fmtDate } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import type { AdminStats } from '../../types';
import { useAdminContext } from './AdminLayout';
import './stats.css';

const EVENTS_SHOWN = 8;

/** Width of an element, kept up to date (charts draw in real pixels so text never stretches). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(200, Math.floor(el.getBoundingClientRect().width)));
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function CsvButton({ name, headers, rows }: { name: string; headers: string[]; rows: CsvValue[][] }) {
  return (
    <button type="button" className="btn small ghost stats-csv" onClick={() => downloadCsv(csvFilename(name), toCsv(headers, rows))} aria-label={`Export ${name.replace(/-/g, ' ')} as CSV`}>
      ⬇ CSV
    </button>
  );
}

export default function Stats() {
  const { isChair } = useAdminContext();
  const s = useAsync(() => api.adminStats(), []);
  if (!s.data) return s.error ? <ErrorText error={s.error} /> : <Loading lines={6} />;
  const d = s.data;
  return (
    <div className="stack stats">
      <p className="muted stats-intro">
        {d.cycle.name} · {fmtCycleRange(d.cycle.startsAt, d.cycle.endsAt)} · participants only (staff never counted).
        <button type="button" className="dash-more stats-refresh" onClick={() => void s.reload()}>Refresh</button>
      </p>
      <Kpis d={d} />
      <div className="stats-cols">
        <div className="stack">
          <SignupsCard d={d} />
          <AttendanceCard d={d} />
          <CampusCard d={d} />
        </div>
        <div className="stack">
          <ProgressCard d={d} />
          <SourcesCard d={d} />
          <BadgesCard d={d} />
          <ExportsCard isChair={isChair} />
        </div>
      </div>
    </div>
  );
}

function Kpis({ d }: { d: AdminStats }) {
  const tiles: [GlyphName, number, string][] = [
    ['people', d.totals.participants, 'Participants'],
    ['bolt', d.totals.active30, 'Active (30 days)'],
    ['calendar', d.totals.checkins, 'Check-ins'],
    ['coin', d.totals.points, 'Points earned'],
  ];
  return (
    <section className="kpi-grid stats-kpis" aria-label="This cycle at a glance">
      {tiles.map(([g, n, l]) => (
        <div key={l} className="panel kpi">
          <PixelGlyph name={g} size={22} />
          <div className="kpi-num">{n.toLocaleString()}</div>
          <div className="kpi-lbl">{l}</div>
        </div>
      ))}
    </section>
  );
}

// ───────────── Sign-ups per week (bars + running total line) ─────────────
function SignupsCard({ d }: { d: AdminStats }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const data = d.signupsByWeek;
  const total = data.reduce((n, x) => n + x.count, 0);
  const H = 170;
  const pad = { l: 30, r: 8, t: 10, b: 26 };
  const ax = axis(Math.max(1, ...data.map((x) => x.count)), 4);
  const max = ax.max;
  const iw = w - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = Math.max(1, data.length);
  const slot = iw / n;
  const bw = Math.max(4, Math.min(34, slot * 0.66));
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 48))));
  const csv = (
    <CsvButton name="signups-by-week" headers={['week_of', 'signups']} rows={data.map((x) => [x.week, x.count])} />
  );
  return (
    <Card glyph="userplus" title="Sign-ups" action={csv}>
      <p className="stats-lede"><b>{total}</b> new this cycle{d.signupsBefore ? ` · ${d.signupsBefore} joined before it started` : ''}</p>
      <div ref={ref} className="chart">
        {data.length === 0 ? (
          <p className="muted">The cycle hasn’t started yet.</p>
        ) : (
          <svg width={w} height={H} role="img" aria-label={`Sign-ups per week: ${data.map((x) => `${fmtDate(x.week)} ${x.count}`).join(', ')}`}>
            {ax.ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="grid" />
                <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">{t}</text>
              </g>
            ))}
            {data.map((x, i) => {
              const cx = pad.l + slot * i + slot / 2;
              return (
                <g key={x.week}>
                  <rect x={cx - bw / 2} y={y(x.count)} width={bw} height={Math.max(0, pad.t + ih - y(x.count))} className="bar blue">
                    <title>{`Week of ${fmtDate(x.week)}: ${x.count}`}</title>
                  </rect>
                  {x.count > 0 && bw >= 14 && <text x={cx} y={y(x.count) - 3} className="val" textAnchor="middle">{x.count}</text>}
                  {i % every === 0 && <text x={cx} y={H - 8} className="axis" textAnchor="middle">{fmtDate(x.week)}</text>}
                </g>
              );
            })}
            <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="base" />
          </svg>
        )}
      </div>
      <p className="muted stats-foot">Weeks start Monday.</p>
    </Card>
  );
}

// ───────────── Attendance per event (going vs came) ─────────────
function AttendanceCard({ d }: { d: AdminStats }) {
  const [all, setAll] = useState(false);
  const newest = d.events.slice().reverse();
  const shown = all ? newest : newest.slice(0, EVENTS_SHOWN);
  const max = niceMax(Math.max(1, ...d.events.flatMap((e) => [e.going, e.came])));
  const csv = (
    <CsvButton
      name="attendance-by-event"
      headers={['event', 'date', 'campus', 'going', 'came']}
      rows={d.events.map((e) => [e.title, csvDateTime(e.startsAt), e.campus === 'all' ? 'All campuses' : campusName(e.campus), e.going, e.came])}
    />
  );
  return (
    <Card glyph="calendar" title="Attendance" action={csv}>
      <div className="legend" aria-hidden="true">
        <span><i className="sw going" /> Going (RSVP)</span>
        <span><i className="sw came" /> Came</span>
      </div>
      {newest.length === 0 ? (
        <p className="muted">No events have started this cycle yet.</p>
      ) : (
        <ul className="att-list">
          {shown.map((e) => (
            <li key={e.id}>
              <div className="att-head">
                <span className="att-title">{e.title}</span>
                <span className="att-date">{fmtDate(e.startsAt)}</span>
              </div>
              <div className="att-bars" role="img" aria-label={`${e.title}: ${e.going} going, ${e.came} came`}>
                <span className="att-row"><span className="att-bar going" style={{ width: `${(e.going / max) * 100}%` }} /><b>{e.going}</b></span>
                <span className="att-row"><span className="att-bar came" style={{ width: `${(e.came / max) * 100}%` }} /><b>{e.came}</b></span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {newest.length > EVENTS_SHOWN && (
        <button type="button" className="dash-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${newest.length} events`}
        </button>
      )}
    </Card>
  );
}

// ───────────── Campus breakdown ─────────────
function CampusCard({ d }: { d: AdminStats }) {
  const color = (id: CampusId) => CAMPUSES.find((c) => c.id === id)?.color ?? 'var(--navy-800)';
  const max = Math.max(0, ...d.campuses.map((c) => c.perMember));
  const csv = (
    <CsvButton
      name="campus-breakdown"
      headers={['campus', 'members', 'active_30_days', 'points', 'points_per_member']}
      rows={d.campuses.map((c) => [campusName(c.campus), c.members, c.active, c.points, c.perMember])}
    />
  );
  return (
    <Card glyph="trophy" title="Campuses" action={csv}>
      <table className="stats-table">
        <thead>
          <tr><th scope="col">Campus</th><th scope="col">Members</th><th scope="col">Active</th><th scope="col">Pts / member</th></tr>
        </thead>
        <tbody>
          {d.campuses.map((c) => (
            <tr key={c.campus}>
              <th scope="row" className={`cup-${c.campus}`}>{campusName(c.campus)}</th>
              <td>{c.members}</td>
              <td>{c.active}<small className="stats-pct">{pctOf(c.active, c.members)}%</small></td>
              <td>
                <span className="pm-cell">
                  <span className="pm-bar"><span style={{ width: `${max > 0 ? Math.max(4, (c.perMember / max) * 100) : 0}%`, background: color(c.campus) }} /></span>
                  <b>{c.perMember}</b>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted stats-foot">Active = earned points in the last 30 days.</p>
    </Card>
  );
}

// ───────────── Progress toward the prize ─────────────
function ProgressCard({ d }: { d: AdminStats }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const dist = d.distribution;
  const H = 160;
  const pad = { l: 30, r: 6, t: 14, b: 40 };
  const ax = axis(Math.max(1, ...dist.map((x) => x.count)), 3);
  const max = ax.max;
  const iw = w - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / Math.max(1, dist.length);
  const bw = Math.min(40, slot * 0.72);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const total = d.totals.participants;
  const csv = (
    <CsvButton
      name="points-progress"
      headers={['group', 'participants']}
      rows={[...d.milestones.map((m) => [`${m.points}+ points`, m.count] as CsvValue[]), ...dist.map((x) => [`${x.label} points`, x.count] as CsvValue[])]}
    />
  );
  return (
    <Card glyph="chest" title="Progress to the prize" action={csv}>
      <ul className="miles">
        {d.milestones.map((m) => (
          <li key={m.points} className={m.points === d.goal ? 'goal' : undefined}>
            <span className="miles-pts">{m.points}+</span>
            <b className="miles-n">{m.count}</b>
            <span className="miles-pct">{pctOf(m.count, total)}%</span>
          </li>
        ))}
      </ul>
      <h3 className="dash-sub">Everyone by points</h3>
      <div ref={ref} className="chart">
        <svg width={w} height={H} role="img" aria-label={`Participants by points: ${dist.map((x) => `${x.label}: ${x.count}`).join(', ')}`}>
          {ax.ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">{t}</text>
            </g>
          ))}
          {dist.map((x, i) => {
            const cx = pad.l + slot * i + slot / 2;
            const last = i === dist.length - 1;
            return (
              <g key={x.label}>
                <rect x={cx - bw / 2} y={y(x.count)} width={bw} height={Math.max(0, pad.t + ih - y(x.count))} className={`bar ${last ? 'gold' : i === 0 ? 'muted' : 'blue'}`}>
                  <title>{`${x.label} points: ${x.count}`}</title>
                </rect>
                {x.count > 0 && <text x={cx} y={y(x.count) - 3} className="val" textAnchor="middle">{x.count}</text>}
                {/* Labels alternate between two lines so ranges like "100–174" never collide on a phone. */}
                <text x={cx} y={H - (i % 2 ? 6 : 22)} className="axis small" textAnchor="middle">{x.label}</text>
              </g>
            );
          })}
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="base" />
        </svg>
      </div>
    </Card>
  );
}

// ───────────── Where points come from ─────────────
function SourcesCard({ d }: { d: AdminStats }) {
  const parts: [string, string, number][] = [
    ['Events', 'event', d.sources.event],
    ['Proof uploads', 'digital', d.sources.digital],
    ['Referrals', 'referral', d.sources.referral],
    ['Staff awards', 'staff', d.sources.staff],
    ...(d.sources.other ? ([['Earlier (demo)', 'other', d.sources.other]] as [string, string, number][]) : []),
  ];
  const total = parts.reduce((n, p) => n + p[2], 0);
  const csv = (
    <CsvButton name="points-by-source" headers={['source', 'points', 'percent']} rows={[...parts.map(([l, , v]) => [l, v, pctOf(v, total)] as CsvValue[]), ['Removed by corrections', d.sources.removed, '']]} />
  );
  return (
    <Card glyph="coin" title="Where points come from" action={csv}>
      <div className="src-bar" role="img" aria-label={parts.map(([l, , v]) => `${l} ${pctOf(v, total)}%`).join(', ')}>
        {total > 0 ? parts.filter((p) => p[2] > 0).map(([l, k, v]) => <span key={k} className={`src ${k}`} style={{ flexGrow: v }} title={`${l}: ${v} pts`} />) : <span className="src none" />}
      </div>
      <ul className="src-legend">
        {parts.map(([l, k, v]) => (
          <li key={k}>
            <i className={`sw ${k}`} aria-hidden="true" />
            <span className="src-name">{l}</span>
            <b>{v.toLocaleString()}</b>
            <span className="src-pct">{pctOf(v, total)}%</span>
          </li>
        ))}
      </ul>
      {d.sources.removed > 0 && <p className="muted stats-foot">{d.sources.removed.toLocaleString()} points were removed by corrections.</p>}
    </Card>
  );
}

// ───────────── Top badges ─────────────
function BadgesCard({ d }: { d: AdminStats }) {
  const [all, setAll] = useState(false);
  const list = d.badges.filter((b) => badgeById(b.id));
  const shown = all ? list : list.slice(0, 6);
  const max = Math.max(1, ...list.map((b) => b.count));
  const csv = (
    <CsvButton name="badges-earned" headers={['badge', 'participants']} rows={list.map((b) => [badgeById(b.id)?.name ?? b.id, b.count])} />
  );
  return (
    <Card glyph="star" title="Top badges" action={csv}>
      <ul className="badge-stats">
        {shown.map((b) => (
          <li key={b.id}>
            <BadgeIcon id={b.id} size={28} earned={b.count > 0} />
            <span className="bs-name">{badgeById(b.id)?.name}</span>
            <span className="bs-bar"><span style={{ width: `${b.count > 0 ? Math.max(3, (b.count / max) * 100) : 0}%` }} /></span>
            <b className="bs-n">{b.count}</b>
          </li>
        ))}
      </ul>
      {list.length > 6 && (
        <button type="button" className="dash-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${list.length} badges`}
        </button>
      )}
    </Card>
  );
}

// ───────────── Exports ─────────────
function ExportsCard({ isChair }: { isChair: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function participants() {
    setBusy(true);
    try {
      const rows = await api.adminParticipantsExport();
      downloadCsv(
        csvFilename('participants'),
        toCsv(
          ['name', 'handle', 'email', 'campus', 'points_this_cycle', 'badges', 'badge_names', 'events_attended', 'joined', 'email_opt_in'],
          rows.map((r) => [r.displayName, r.handle, r.email, campusName(r.campus), r.points, r.badges.length, r.badges.map((id) => badgeById(id)?.name ?? id).join('; '), r.eventsAttended, csvDateTime(r.joinedAt), r.emailOptIn]),
        ),
      );
      toast(`Downloaded ${rows.length} participants.`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  const note: ReactNode = isChair
    ? 'Everyone’s name, handle, email, campus, points, badges, events attended, join date and email setting. Contains personal info: keep it private.'
    : 'A YACquest Chair can download the full participant list. Event lists are under Events → Going / Came.';
  return (
    <Card glyph="scroll" title="Exports">
      <p className="muted stats-foot" style={{ marginTop: 0 }}>{note}</p>
      {isChair && (
        <button type="button" className="btn small navy block" disabled={busy} onClick={() => void participants()}>
          {busy ? 'Preparing…' : '⬇ All participants (CSV)'}
        </button>
      )}
    </Card>
  );
}

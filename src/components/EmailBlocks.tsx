/**
 * 0032 email blocks shared by Admin → System (queue + budget), Admin → Stats (summary card) and
 * Admin → Stats → Email (the full view). Dashboard card style (src/components/Blocks.tsx).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { Card } from './Blocks';
import { ErrorText, Loading } from './ui';
import { axis } from '../lib/adminTools';
import { bounceCheckOn, budgetPct, pctText, queueLine } from '../lib/emailStats';
import { fmtDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import type { EmailStats } from '../types';

/** Width of an element, kept up to date (charts draw in real pixels so text never stretches). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
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

/** "Today: 132 / 450 sent · 40 waiting · next batch in ~6 min" + budget meter + bounce checking state. */
export function EmailQueueCard({ id }: { id?: string }) {
  const q = useAsync(() => api.emailQueueStatus(), [], { live: true });
  const d = q.data;
  const pct = d ? budgetPct(d) : 0;
  return (
    <Card glyph="mail" title="Email sending" id={id} action={<Link to="/admin/stats/email" className="dash-more">Email stats ›</Link>}>
      {q.loading && !d ? <Loading lines={2} /> : q.error ? <ErrorText error={q.error} /> : d && (
        <div className="stack" style={{ gap: 8 }}>
          <p style={{ margin: 0, fontWeight: 800 }} role="status">{queueLine(d)}</p>
          <div className={`em-meter ${pct >= 85 ? 'high' : ''}`} role="img" aria-label={`${d.sent24h} of ${d.budget} emails used in the last 24 hours`}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Free Gmail allows about 500 recipients a day, so YACquest sends at most {d.budget} in any 24 hours, about 20 a minute.
            The last {d.reserve} are kept for prize alerts and event reminders; announcements and Wrapped wait. Emails that would arrive
            too late (a reminder after the event started, an announcement after 3 days) are skipped and show as “Skipped — too late (budget)”.
            {d.skippedToday > 0 && <> <b>{d.skippedToday} skipped in the last 24 hours.</b></>}
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            {bounceCheckOn(d) ? (
              <span className="chip approved">Bounce checking on</span>
            ) : (
              <span className="chip neutral">Bounce checking off</span>
            )}{' '}
            <span className="muted">
              {bounceCheckOn(d)
                ? d.lastBounceCheckAt ? `Gmail checked ${fmtDateTime(d.lastBounceCheckAt)}.` : ''
                : d.bounceError
                  ? `Gmail said: ${d.bounceError}. Turn on IMAP in Gmail (Settings → Forwarding and POP/IMAP). Sending still works.`
                  : 'Sending still works. Turn on IMAP in Gmail (Settings → Forwarding and POP/IMAP) to catch bad addresses.'}
            </span>
          </p>
        </div>
      )}
    </Card>
  );
}

/** Admin → Stats: last 7 days at a glance + a link to the full view. */
export function EmailSummaryCard() {
  const s = useAsync(() => api.emailStats(7), []);
  const t = s.data?.totals;
  return (
    <Card glyph="mail" title="Email (7 days)" id="email" action={<Link to="/admin/stats/email" className="dash-more">Details ›</Link>}>
      {s.loading && !t ? <Loading lines={2} /> : s.error ? <ErrorText error={s.error} /> : t && (
        <>
          <div className="em-kpis">
            <Kpi n={t.sent} label="Sent" />
            <Kpi n={t.opened} label={`Opened ~${pctText(t.opened, t.delivered)}`} />
            <Kpi n={t.clicked} label={`Clicked ${pctText(t.clicked, t.delivered)}`} />
            <Kpi n={t.bounced + t.unsubscribed} label="Bounced + unsub." />
          </div>
          {s.data && <EmailDailyChart data={s.data} height={110} />}
          <p className="muted stats-foot">Opens are approximate (Apple Mail preloads images; some apps block them).</p>
        </>
      )}
    </Card>
  );
}

export function Kpi({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="em-kpi">
      <b>{typeof n === 'number' ? n.toLocaleString() : n}</b>
      <span>{label}</span>
    </div>
  );
}

/** Sent per day (blue) with opened (gold) and clicked (dark) bars inside it. Hand-rolled SVG like Stats. */
export function EmailDailyChart({ data, height = 160 }: { data: EmailStats; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const days = data.daily;
  const pad = { l: 30, r: 6, t: 8, b: 22 };
  const ax = axis(Math.max(1, ...days.map((x) => x.sent)), 3);
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const n = Math.max(1, days.length);
  const slot = iw / n;
  const bw = Math.max(3, Math.min(26, slot * 0.7));
  const y = (v: number) => pad.t + ih - (v / ax.max) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 44))));
  const label = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div ref={ref} className="chart" style={{ marginTop: 8 }}>
      <div className="legend" aria-hidden="true">
        <span><i className="sw going" /> Sent</span>
        <span><i className="sw came" /> Opened</span>
        <span><i className="sw" style={{ background: 'var(--navy-800)' }} /> Clicked</span>
      </div>
      <svg width={w} height={height} role="img"
        aria-label={`Emails per day: ${days.filter((x) => x.sent).map((x) => `${label(x.day)} ${x.sent} sent, ${x.opened} opened, ${x.clicked} clicked`).join('; ') || 'none'}`}>
        {ax.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {days.map((x, i) => {
          const cx = pad.l + slot * i + slot / 2;
          return (
            <g key={x.day}>
              {x.sent > 0 && <rect x={cx - bw / 2} y={y(x.sent)} width={bw} height={pad.t + ih - y(x.sent)} className="bar blue" />}
              {x.opened > 0 && <rect x={cx - bw / 4} y={y(x.opened)} width={bw / 2} height={pad.t + ih - y(x.opened)} style={{ fill: 'var(--gold-500)' }} />}
              {x.clicked > 0 && <rect x={cx - bw / 8} y={y(x.clicked)} width={Math.max(2, bw / 4)} height={pad.t + ih - y(x.clicked)} style={{ fill: 'var(--navy-800)' }} />}
              {i % every === 0 && <text x={cx} y={height - 6} className="axis small" textAnchor="middle">{label(x.day)}</text>}
            </g>
          );
        })}
        <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="base" />
      </svg>
    </div>
  );
}

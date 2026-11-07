/**
 * Admin home (/admin): greeting, compact quick-nav, then a dashboard of cards in priority order —
 * Hero of the Week, Needs attention, KPIs, Next event, Prize race, Campus Cup, Adventurer of the Month,
 * and the weekly email preview (collapsed). One column on phones, two columns on wider screens.
 * Chair-only rows and buttons are hidden from plain admins.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { useAuth } from '../../lib/auth';
import { ADMIN_NEAR_GOAL_POINTS, CAMPUSES, PRIZE, campusName, type CampusId } from '../../config';
import { Empty, ErrorText, Loading, Modal } from '../../components/ui';
import { Avatar } from '../../components/Avatar';
import { CampusFrame } from '../../components/CampusFrame';
import { PixelGlyph, type GlyphName } from '../../components/PixelGlyph';
import { Card } from '../../components/Blocks';
import { Sprite } from '../../components/Sprite';
import { fmtDate, monthName, ordinal } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { yakPunOfTheDay } from '../../lib/yakPuns';
import { barPct, greetingFor, greetingName, needsAttention, pickNextEvent } from '../../lib/adminDashboard';
import type { HeroBoard, YacEvent } from '../../types';
import { QuickNav, useAdminContext } from './AdminLayout';
import { CheckInQr, Going } from './Events';

const WIDE_QUERY = '(min-width: 820px)';

function useWide() {
  const query = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(WIDE_QUERY).matches;
  const [wide, setWide] = useState(query);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return wide;
}

export default function AdminHome() {
  const { user } = useAuth();
  const { counts, badge, sections, isChair } = useAdminContext();
  const wide = useWide();
  const o = useAsync(() => api.adminOverview(), [], { live: true });
  const heroes = useAsync(() => api.heroBoard(), [], { live: true });
  const events = useAsync(() => api.adminListEvents(), [], { live: true });

  const prizesToDeliver = o.data?.prize.claims.filter((c) => c.status === 'info_submitted').length;
  const todo = needsAttention({
    isChair,
    pendingReviews: counts.review,
    newFeedback: counts.feedback,
    prizesToDeliver,
    hasHero: heroes.data ? !!heroes.data.current : undefined,
  });
  const todoLoading = counts.review === undefined && counts.feedback === undefined;

  const cards = {
    hero: <HeroCard key="hero" board={heroes.data} error={heroes.error} isChair={isChair} meId={user?.id} />,
    todo: <TodoCard key="todo" items={todo} loading={todoLoading} />,
    kpis: <Kpis key="kpis" o={o.data} error={o.error} />,
    event: <NextEventCard key="event" events={events.data} error={events.error} />,
    prize: <PrizeRace key="prize" o={o.data} />,
    cup: <CampusCupCard key="cup" />,
    star: <AdventurerCard key="star" />,
  };

  return (
    <div className="stack dash">
      <Greeting name={greetingName(user?.displayName)} isChair={isChair} />
      <QuickNav sections={sections} badge={badge} />
      {wide ? (
        <div className="dash-cols">
          <div className="stack">{[cards.hero, cards.event, cards.cup]}</div>
          <div className="stack">{[cards.todo, cards.kpis, cards.prize, cards.star]}</div>
        </div>
      ) : (
        <div className="stack">{[cards.hero, cards.todo, cards.kpis, cards.event, cards.prize, cards.cup, cards.star]}</div>
      )}
      <EmailPreview isChair={isChair} />
    </div>
  );
}

function Greeting({ name, isChair }: { name: string; isChair: boolean }) {
  const hello = greetingFor(new Date().getHours());
  return (
    <header className="dash-hello">
      <span className="dash-hello-yak bob" aria-hidden="true"><Sprite id="yak" size={44} /></span>
      <div className="dash-hello-text">
        <div className="dash-eyebrow">
          Admin HQ <span className={`chip ${isChair ? 't1' : 't2'}`}>{isChair ? 'YACquest Chair' : 'Admin'}</span>
        </div>
        <h1 className="dash-hello-title">{hello}, {name}!</h1>
        <p className="dash-pun"><span className="sr-only">Yak of the day: </span>{yakPunOfTheDay()}</p>
      </div>
    </header>
  );
}

// ───────────── Hero of the Week ─────────────
function HeroCard({ board, error, isChair, meId }: { board: HeroBoard | null; error: string | null; isChair: boolean; meId?: string }) {
  const [all, setAll] = useState(false);
  const cur = board?.current ?? null;
  const action = isChair ? (
    <Link to="/admin/heroes" className="btn small navy">{cur ? 'Manage' : 'Crown'}</Link>
  ) : undefined;
  if (!board) {
    return (
      <Card glyph="crown" title="Hero of the Week" tone="gold" action={action} className="hero-card">
        {error ? <ErrorText error={error} /> : <Loading lines={1} />}
      </Card>
    );
  }
  const crowns = cur ? board.team.find((t) => t.userId === cur.userId)?.heroCount ?? 1 : 0;
  const past = board.history.filter((r) => r.endedAt);
  const shown = all ? past : past.slice(0, 3);
  return (
    <Card glyph="crown" title="Hero of the Week" tone="gold" action={action} className="hero-card" label="Hero of the Week">
      {cur ? (
        <div className="hero-feature">
          <Avatar id={cur.avatar} look={cur.look} campus={cur.campus} size={88} hero title={cur.displayName} />
          <div className="hero-feature-text">
            <b className="hero-name">{cur.displayName}</b>
            {cur.note && <p className="hero-note">“{cur.note}”</p>}
            <div className="hero-meta">
              <span>Hero since {fmtDate(cur.crownedAt)}</span>
              <span className="chip hero-count" title={`Crowned ${crowns} time${crowns === 1 ? '' : 's'}`}>
                {crowns === 1 ? '1st crown' : `${ordinal(crowns)} crown`}
              </span>
              {meId === cur.userId && <span className="chip hero-you">That’s you! 🎉</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="hero-empty">
          <span className="hero-empty-art" aria-hidden="true"><PixelGlyph name="crown" size={40} /></span>
          <div>
            <b>No hero this week yet</b>
            <p className="muted">{isChair ? 'Pick a teammate who went above and beyond at the next YAC meeting.' : 'A YACquest Chair crowns one at the next YAC meeting.'}</p>
            {isChair && <Link to="/admin/heroes" className="btn small">Crown a hero</Link>}
          </div>
        </div>
      )}
      <div className="hero-hall">
        <h3 className="dash-sub">Hall of Heroes</h3>
        {past.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No past heroes yet.</p>
        ) : (
          <ul className="hall-list">
            {shown.map((r) => (
              <li key={r.id}>
                <Avatar id={r.avatar} look={r.look} campus={r.campus} size={28} title={r.displayName} />
                <span className="hall-name">{r.displayName}</span>
                <span className="hall-date">{fmtDate(r.crownedAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {past.length > 3 && (
          <button type="button" className="dash-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? 'Show fewer' : `Show all ${past.length}`}
          </button>
        )}
      </div>
    </Card>
  );
}

// ───────────── Needs attention ─────────────
function TodoCard({ items, loading }: { items: ReturnType<typeof needsAttention>; loading: boolean }) {
  return (
    <Card glyph="todo" title="Needs attention" action={items.length ? <span className="chip pending">{items.length}</span> : undefined}>
      {loading ? (
        <Loading lines={1} />
      ) : items.length === 0 ? (
        <div className="todo-clear">
          <Sprite id="yak" size={40} />
          <div>
            <b>All caught up! 🐂</b>
            <div className="muted">Nothing waiting on you right now.</div>
          </div>
        </div>
      ) : (
        <ul className="todo-list">
          {items.map((t) => (
            <li key={t.id}>
              <Link to={t.to} className="todo-row">
                <PixelGlyph name={t.glyph} size={22} />
                <span className="todo-count">{t.id === 'hero' ? '!' : t.count}</span>
                <span className="todo-text">{t.text}</span>
                <span className="todo-arrow" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────────── KPI tiles ─────────────
function Kpis({ o, error }: { o: api.AdminOverview | null; error: string | null }) {
  if (!o) return error ? <ErrorText error={error} /> : <Loading lines={2} />;
  const tiles: [GlyphName, number, string][] = [
    ['people', o.participants, 'Participants'],
    ['bolt', o.activeThisWeek, 'Active this week'],
    ['coin', o.pointsThisWeek, 'Points this week'],
    ['userplus', o.newSignupsThisWeek, 'New this week'],
  ];
  return (
    <section className="kpi-grid" aria-label="This week at a glance">
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

// ───────────── Next event ─────────────
type AdminEvent = YacEvent & { goingCount: number; rsvpCame: number };

const whenText = (e: YacEvent) => {
  const s = new Date(e.startsAt);
  const day = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${t(s)} – ${t(new Date(e.endsAt))}`;
};

function NextEventCard({ events, error }: { events: AdminEvent[] | null; error: string | null }) {
  const [modal, setModal] = useState<'qr' | 'going' | null>(null);
  const next = pickNextEvent(events);
  const allLink = <Link to="/admin/events" className="dash-link">All events ›</Link>;
  if (!events) {
    return (
      <Card glyph="calendar" title="Next event" action={allLink}>
        {error ? <ErrorText error={error} /> : <Loading lines={1} />}
      </Card>
    );
  }
  if (!next) {
    return (
      <Card glyph="calendar" title="Next event" action={allLink}>
        <Empty>No upcoming events.</Empty>
        <Link to="/admin/events" className="btn small block">+ New event</Link>
      </Card>
    );
  }
  const e = next.event;
  return (
    <Card glyph="calendar" title={next.live ? 'Happening now' : 'Next event'} action={allLink} className={next.live ? 'event-live' : ''}>
      <div className="next-ev">
        <div className="next-ev-head">
          {next.live && <span className="live-chip"><span className="ci-live-dot" aria-hidden="true" />LIVE</span>}
          <b className="next-ev-title">{e.title}</b>
        </div>
        <div className="next-ev-meta">
          <span>🕒 {whenText(e)}</span>
          <span>📍 {e.location} · {e.campus === 'all' ? 'All campuses' : campusName(e.campus)}</span>
        </div>
        <div className="next-ev-stats">
          <span className="stat-pill"><b>{e.goingCount}</b> going</span>
          {next.live && <span className="stat-pill green"><b>{e.attendeeCount}</b> checked in</span>}
          {next.othersLive > 0 && <Link to="/admin/events" className="stat-pill link">+{next.othersLive} more live</Link>}
        </div>
        <div className="btn-row">
          <button type="button" className="btn small navy" onClick={() => setModal('qr')}>QR code</button>
          <button type="button" className="btn small blue" onClick={() => setModal('going')}>Who’s going</button>
        </div>
        <Link to={`/admin/door/${e.id}`} state={{ from: '/admin' }} className="btn small block door-btn">🚪 Door mode</Link>
      </div>
      <Modal open={modal === 'qr'} onClose={() => setModal(null)} title="Check-in QR code">
        {modal === 'qr' && <CheckInQr e={e} onClose={() => setModal(null)} />}
      </Modal>
      <Modal open={modal === 'going'} onClose={() => setModal(null)} title={`Who’s going: ${e.title}`}>
        {modal === 'going' && <Going e={e} past={false} onClose={() => setModal(null)} />}
      </Modal>
    </Card>
  );
}

// ───────────── Prize race + close to the goal ─────────────
function PrizeRace({ o }: { o: api.AdminOverview | null }) {
  const [all, setAll] = useState(false);
  if (!o) return null;
  const { prize } = o;
  const live = prize.claims.filter((c) => c.status !== 'revoked').sort((a, b) => a.spot - b.spot);
  const spots = Array.from({ length: prize.total }, (_, i) => live.find((c) => c.spot === i + 1));
  const near = all ? o.nearGoal : o.nearGoal.slice(0, 3);
  return (
    <Card glyph="chest" title="Prize race" action={<span className="chip t1">{prize.remaining} of {prize.total} left</span>}>
      <ul className="chests" aria-label={`${prize.total - prize.remaining} of ${prize.total} prize spots claimed`}>
        {spots.map((c, i) => (
          <li key={i} className={c ? 'won' : 'open'} title={c ? `#${i + 1} ${c.displayName} · ${campusName(c.campus)} · ${fmtDate(c.qualifiedAt)}` : `Spot #${i + 1} is still open`}>
            <Sprite id="chest" size={40} title={c ? `Spot ${i + 1}: ${c.displayName}` : `Spot ${i + 1}: open`} />
            <span className="chest-name">{c ? c.displayName.split(' ')[0] : 'Open'}</span>
          </li>
        ))}
      </ul>
      <p className="muted dash-note">First {prize.total} to {prize.goal} points win a {PRIZE.name}.</p>
      <h3 className="dash-sub">Close to the goal</h3>
      {o.nearGoal.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Nobody within {ADMIN_NEAR_GOAL_POINTS} points yet.</p>
      ) : (
        <ul className="near-list">
          {near.map((r) => (
            <li key={r.userId}>
              <Avatar id={r.avatar} look={r.look} campus={r.campus} size={32} title={r.displayName} />
              <div className="near-main">
                <div className="near-top">
                  <span className="near-name">{r.displayName}</span>
                  <span className="near-pts"><b>{r.points}</b>/{prize.goal}</span>
                </div>
                <div className="mini-bar" role="progressbar" aria-valuemin={0} aria-valuemax={prize.goal} aria-valuenow={r.points} aria-label={`${r.displayName}: ${prize.goal - r.points} to go`}>
                  <span style={{ width: `${barPct(r.points, prize.goal)}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {o.nearGoal.length > 3 && (
        <button type="button" className="dash-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${o.nearGoal.length}`}
        </button>
      )}
    </Card>
  );
}

// ───────────── Campus Cup ─────────────
function CampusCupCard() {
  const { data, error } = useAsync(() => api.campusCup(), [], { live: true });
  if (!data) return error ? <ErrorText error={error} /> : null;
  const max = Math.max(0, ...data.map((r) => r.perCapita));
  const color = (id: CampusId) => CAMPUSES.find((c) => c.id === id)?.color ?? 'var(--navy-800)';
  return (
    <Card glyph="trophy" title="Campus Cup" action={<span className="dash-hint">pts / member</span>}>
      <ul className="cup-list">
        {data.map((r, i) => (
          <li key={r.campus}>
            <span className={`cup-name cup-${r.campus}`}>
              {i === 0 && r.perCapita > 0 && <PixelGlyph name="crown" size={14} />}
              {campusName(r.campus)}
            </span>
            <span className="cup-bar"><span style={{ width: `${barPct(r.perCapita, max)}%`, background: color(r.campus) }} /></span>
            <span className="cup-val"><b>{r.perCapita}</b><small>{r.members} {r.members === 1 ? 'member' : 'members'}</small></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ───────────── Adventurer of the Month ─────────────
function AdventurerCard() {
  const { data } = useAsync(() => api.monthlyShoutout(), []);
  if (!data) return null;
  const month = monthName(data.month);
  return (
    <Card glyph="star" title={data.final ? 'Adventurer of the Month' : 'Leading this month'}>
      <div className="adv">
        <CampusFrame campus={data.campus} label>
          <span className="adv-avatar"><Avatar id={data.avatar} look={data.look} campus={data.campus} size={48} title={data.displayName} /></span>
        </CampusFrame>
        <div style={{ minWidth: 0 }}>
          <b className="adv-name">{data.displayName}</b>
          <div className="muted adv-sub">{campusName(data.campus)} · {month}</div>
          <div className="adv-pts"><span className="coin" aria-hidden /> +{data.pointsThisMonth} pts {data.final ? `in ${month}` : 'so far'}</div>
        </div>
      </div>
    </Card>
  );
}

// ───────────── Weekly email preview (collapsed) ─────────────
function EmailPreview({ isChair }: { isChair: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="panel dash-email" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <PixelGlyph name="mail" size={20} />
        <span>Preview this week’s email</span>
        <span className="dash-email-caret" aria-hidden="true">▸</span>
      </summary>
      {open && <EmailBody isChair={isChair} />}
    </details>
  );
}

function EmailBody({ isChair }: { isChair: boolean }) {
  const rep = useAsync(() => api.weeklyReportPreview(), []);
  if (!rep.data) return rep.error ? <ErrorText error={rep.error} /> : <Loading />;
  const d = rep.data;
  return (
    <div className="stack" style={{ gap: 8, marginTop: 12 }}>
      <div style={{ fontSize: 15 }}>
        <div><strong>Subject:</strong> {d.subject}</div>
        <div style={{ wordBreak: 'break-word' }}>
          <strong>To:</strong>{' '}
          {d.recipients.length ? d.recipients.join(', ') : <span className="muted">nobody yet — a YACquest Chair can add recipients in Admin → System</span>}
        </div>
      </div>
      {d.html ? (
        <iframe title="Weekly email preview" sandbox="" srcDoc={d.html} style={{ width: '100%', height: 420, border: 'var(--px) solid var(--border)', background: '#fff' }} />
      ) : (
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, padding: 12, background: 'var(--paper)', border: 'var(--px) solid var(--border)', fontFamily: 'var(--font-body)', fontSize: 15 }}>{d.text}</pre>
      )}
      <div className="btn-row">
        <button type="button" className="btn small ghost" onClick={() => void rep.reload()}>Refresh preview</button>
        {isChair && <Link to="/admin/system" className="btn small ghost">Email settings</Link>}
      </div>
    </div>
  );
}

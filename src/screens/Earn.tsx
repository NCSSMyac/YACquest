import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, TIER_POINTS, UPLOAD, campusName, type Tier } from '../config';
import { ACTIVITIES, activityById } from '../lib/activities';
import { useAuth } from '../lib/auth';
import { downloadIcs, googleCalendarUrl, type CalEvent } from '../lib/calendar';
import { noteCelebratedPoints } from '../lib/celebrate';
import { siteUrl } from '../lib/supabase';
import { kindTier } from '../lib/eventKinds';
import { fmtDate, fmtDateTime } from '../lib/format';
import { prepareImage } from '../lib/image';
import { errorMessage, useAsync } from '../lib/useAsync';
import { Empty, ErrorText, Loading, Modal, Panel, StatusChip, TierChip, useToast } from '../components/ui';
import { RsvpRow } from '../components/Rsvp';
import { CheckInConfirm, type CheckInPass } from '../components/CheckInConfirm';
import { StarterTips } from '../components/StarterTips';
import { isNewAdventurer } from '../lib/starterTips';
import type { Activity } from '../types';
import { Accordion, Card, ShowMore } from '../components/Blocks';
import type { GlyphName } from '../components/PixelGlyph';
import { limitToInclude, nextLimit } from '../lib/listing';

type Ev = Awaited<ReturnType<typeof api.listEvents>>[number];
type TabId = 'events' | 'quests' | 'subs';
const TABS: { id: TabId; label: string }[] = [
  { id: 'events', label: 'Events' },
  { id: 'quests', label: 'Quests' },
  { id: 'subs', label: 'My proofs' },
];
const TIER_TITLES: Record<Tier, string> = { 1: 'Tier 1 · High-Impact', 2: 'Tier 2 · Active', 3: 'Tier 3 · Digital' };
const TIER_GLYPH: Record<Tier, GlyphName> = { 1: 'star', 2: 'bolt', 3: 'chat' };
const OPEN_BEFORE_MIN = 30;
const EVENTS_STEP = 4;

export default function Earn() {
  // `#/earn?tab=quests|proofs` deep-links a tab; `#/earn?event=<id>` (Home's "Today" chip) jumps to that event's card.
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = raw === 'quests' ? 'quests' : raw === 'proofs' ? 'subs' : 'events';
  const setTab = (id: TabId) => setParams(id === 'events' ? {} : { tab: id === 'subs' ? 'proofs' : id }, { replace: true });
  const focusId = params.get('event') ?? undefined;
  const dash = useAsync(() => api.getDashboard(), [], { live: true });
  const isNew = isNewAdventurer(dash.data);
  return (
    <div className="stack">
      <h1 className="pixel" style={{ margin: 0 }}>Quest Board</h1>
      {isNew && <StarterTips title="🧭 New here? Start with these" />}
      <div className="tabs sticky" role="tablist" aria-label="Quest board sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`earn-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="earn-panel" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div id="earn-panel" role="tabpanel" aria-labelledby={`earn-tab-${tab}`} className="stack">
        {tab === 'events' && <Events focusId={focusId} />}
        {tab === 'quests' && <Quests goEvents={() => setTab('events')} />}
        {tab === 'subs' && <Submissions />}
      </div>
    </div>
  );
}

// ── Events ──────────────────────────────────────────
function Events({ focusId }: { focusId?: string }) {
  const up = useAsync(() => api.listEvents('upcoming'), [], { live: true });
  const past = useAsync(() => api.listEvents('past'), [], { live: true });
  const [showPast, setShowPast] = useState(false);
  const [pastLimit, setPastLimit] = useState(10);
  // Live and soonest events first; the rest behind "Show more" (always far enough to include a deep-linked event).
  const focusIndex = focusId && up.data ? up.data.findIndex((e) => e.id === focusId) : -1;
  const [limit, setLimit] = useState(EVENTS_STEP);
  const shownLimit = Math.max(limit, limitToInclude(focusIndex, EVENTS_STEP));
  const [pass, setPass] = useState<CheckInPass | null>(null);
  const { user } = useAuth();
  const scrolled = useRef(false);
  const hasData = !!up.data;
  useEffect(() => {
    if (!focusId || !hasData || scrolled.current) return;
    scrolled.current = true;
    const el = document.getElementById(`event-${focusId}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      el.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    }
  }, [focusId, hasData]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);

  return (
    <>
      {up.loading && !up.data ? <Loading lines={3} /> : null}
      <ErrorText error={up.error} />
      {up.data && up.data.length === 0 && <Empty>No upcoming events yet. Check back soon, adventurer!</Empty>}
      {up.data?.slice(0, shownLimit).map((e) => (
        <EventCard key={e.id} e={e} now={now} focused={e.id === focusId} onDone={(pts) => {
          // Full-screen confirmation (with coins) instead of the small pop.
          setPass({ eventTitle: e.title, points: pts, checkedInAt: new Date() });
          if (user) noteCelebratedPoints(user.id, pts);
        }} />
      ))}
      {up.data && <ShowMore shown={Math.min(shownLimit, up.data.length)} total={up.data.length} step={EVENTS_STEP} noun={['event', 'events']} onMore={() => setLimit(nextLimit(shownLimit, EVENTS_STEP, up.data?.length ?? 0))} />}
      {pass && <CheckInConfirm pass={pass} onDone={() => setPass(null)} />}
      <button className="btn ghost small" aria-expanded={showPast} onClick={() => setShowPast((s) => !s)}>
        {showPast ? '▼' : '▶'} Past events{past.data ? ` (${past.data.length})` : ''}
      </button>
      {showPast && (
        <Panel tone="flat">
          {past.loading && !past.data ? <Loading /> : null}
          {past.data && past.data.length === 0 && <Empty>No past events.</Empty>}
          <ul className="mini-list">
            {past.data?.slice(0, pastLimit).map((e) => (
              <li key={e.id}>
                <span className="mini-main">
                  <span className="mini-title">{e.title}</span>
                  <span className="mini-meta">{fmtDate(e.startsAt)} · {e.campus === 'all' ? 'All campuses' : campusName(e.campus)}</span>
                </span>
                {e.checkedIn ? <span className="chip approved">Went ✓</span> : <span className="chip neutral">Missed</span>}
              </li>
            ))}
          </ul>
          {past.data && <ShowMore shown={Math.min(pastLimit, past.data.length)} total={past.data.length} step={10} onMore={() => setPastLimit((l) => nextLimit(l, 10, past.data?.length ?? 0))} />}
        </Panel>
      )}
    </>
  );
}

function EventCard({ e, now, focused, onDone }: { e: Ev; now: number; focused?: boolean; onDone: (pts: number) => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = new Date(e.startsAt).getTime();
  const opensAt = start - OPEN_BEFORE_MIN * 60_000;
  const closesAt = new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60_000;
  const live = now >= opensAt && now <= closesAt;
  const tier: Tier = kindTier(e.kind);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await api.checkIn(e.id, pw.trim());
      setPw('');
      onDone(r.points);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id={`event-${e.id}`} className={focused ? 'event-focus' : undefined}>
    <Panel tone={live && !e.checkedIn ? 'gold' : undefined}>
      <div className="stack" style={{ gap: 10 }}>
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <strong style={{ fontSize: 18, lineHeight: 1.25, minWidth: 0 }}>{e.title}</strong>
          {live && !e.checkedIn && <span className="chip t1 blink">● LIVE</span>}
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: -4 }}>
          <TierChip tier={tier} />
          <span className="chip neutral">{e.campus === 'all' ? 'All campuses' : campusName(e.campus)}</span>
        </div>
        <div className="ev-meta"><span>🕒 {fmtDateTime(e.startsAt)}</span><span>📍 {e.location}</span></div>
        {/* 0022: RSVP until the event starts; Add to calendar sits on the same line. */}
        {!e.checkedIn && now < start ? (
          <RsvpRow e={e} calendar={<AddToCalendar e={e} />} />
        ) : (
          now <= new Date(e.endsAt).getTime() && <AddToCalendar e={e} />
        )}
        {e.checkedIn ? (
          <span className="chip approved" style={{ alignSelf: 'flex-start' }}>Checked in ✓</span>
        ) : live ? (
          <form className="stack" style={{ gap: 6 }} onSubmit={submit}>
            <label className="field" htmlFor={`pw-${e.id}`}>
              <span>Event password <small className="muted" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0, fontSize: 12 }}>· announced at the event</small></span>
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input id={`pw-${e.id}`} className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Password" value={pw} onChange={(x) => setPw(x.target.value)} autoComplete="off" autoCapitalize="off" required />
              <button className="btn green" style={{ flex: 'none' }} disabled={busy || !pw.trim()}>{busy ? '…' : 'Check in'}</button>
            </div>
            <ErrorText error={err} />
          </form>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Check-in opens {OPEN_BEFORE_MIN} min before start</p>
        )}
      </div>
    </Panel>
    </div>
  );
}

/** "📅 Add to calendar" with a tiny menu: Google Calendar link or an .ics download. Never includes the password. */
function AddToCalendar({ e }: { e: Ev }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const cal: CalEvent = { id: e.id, title: e.title, location: e.location, startsAt: e.startsAt, endsAt: e.endsAt };
  const menuId = `cal-menu-${e.id}`;
  useEffect(() => {
    if (!open) return;
    const onDown = (x: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(x.target as Node)) setOpen(false);
    };
    const onKey = (x: KeyboardEvent) => x.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="cal-wrap" ref={wrap}>
      <button type="button" className="btn ghost small" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        📅 Add to calendar
      </button>
      {open && (
        <div className="cal-menu" id={menuId}>
          <a className="cal-item" href={googleCalendarUrl(cal, siteUrl())} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            Google Calendar ↗
          </a>
          <button
            type="button"
            className="cal-item"
            onClick={() => {
              downloadIcs(cal, siteUrl());
              setOpen(false);
            }}
          >
            Apple / Outlook (.ics)
          </button>
        </div>
      )}
    </div>
  );
}

// ── Quests ──────────────────────────────────────────
function Quests({ goEvents }: { goEvents: () => void }) {
  const [proof, setProof] = useState<Activity | null>(null);
  return (
    <>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Tap a quest to see how it works and send proof.</p>
      {([1, 2, 3] as Tier[]).map((t) => {
        const list = ACTIVITIES.filter((a) => a.tier === t);
        return (
          <Card key={t} glyph={TIER_GLYPH[t]} title={TIER_TITLES[t]} label={TIER_TITLES[t]} action={<span className={`chip t${t}`}>+{TIER_POINTS[t]} each</span>}>
            {list.map((a) => (
              <QuestRow key={a.id} a={a} goEvents={goEvents} onProof={() => setProof(a)} />
            ))}
          </Card>
        );
      })}
      {proof && <ProofModal activity={proof} onClose={() => setProof(null)} />}
    </>
  );
}

/** Quests that happen on Instagram get a direct link. */
const INSTAGRAM_QUESTS = new Set(['follow_ig', 'repost', 'story_game', 'social_tag']);

function QuestRow({ a, goEvents, onProof }: { a: Activity; goEvents: () => void; onProof: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(user?.friendCode ?? '');
      toast('Code copied!', 'success');
    } catch {
      toast('Couldn’t copy. Select the code and copy it by hand.', 'error');
    }
  }
  return (
    <Accordion
      flat
      className="quest-row"
      title={a.title}
      summary={a.limitLabel}
      // The card heading already names the tier; the chip just shows the points.
      right={<span className={`chip t${a.tier}`} aria-label={`${TIER_POINTS[a.tier]} points`}>+{TIER_POINTS[a.tier]}</span>}
    >
      <p>{a.description}</p>
      {INSTAGRAM_QUESTS.has(a.id) && (
        <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
          Open {INSTAGRAM_HANDLE} ↗
        </a>
      )}
      {(a.method === 'screenshot' || a.method === 'photo') && <button className="btn small" onClick={onProof}>Submit proof</button>}
      {a.method === 'event_password' && <button className="btn blue small" onClick={goEvents}>See events</button>}
      {a.method === 'referral' && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="pixel" style={{ fontSize: 16 }} aria-label="Your friend code">{user?.friendCode}</span>
          <button className="btn ghost small" onClick={copy}>Copy</button>
        </div>
      )}
    </Accordion>
  );
}

function ProofModal({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const toast = useToast();
  const needsEvent = activity.id === 'event_photos';
  const events = useAsync(() => api.listEvents('all'), [], {});
  const attended = (events.data ?? []).filter((e) => e.checkedIn);
  const [eventId, setEventId] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setBlocker(null);
    if (needsEvent && !eventId) return;
    api.canSubmit(activity.id, needsEvent ? eventId : undefined).then((m) => alive && setBlocker(m), () => {});
    return () => {
      alive = false;
    };
  }, [activity.id, eventId, needsEvent]);

  async function pick(f?: File) {
    setErr(null);
    if (!f) return;
    try {
      setImage(await prepareImage(f));
    } catch (x) {
      setImage(null);
      setErr(errorMessage(x));
    }
  }

  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    if (needsEvent && !eventId) return setErr('Pick the event your photo is from.');
    if (!image) return setErr('Add an image first.');
    setBusy(true);
    try {
      const msg = await api.canSubmit(activity.id, needsEvent ? eventId : undefined);
      if (msg) {
        setBlocker(msg);
        return;
      }
      await api.submitProof({ activityId: activity.id, eventId: needsEvent ? eventId : undefined, imageDataUrl: image, note: note.trim() });
      toast('Sent for review!', 'success');
      onClose();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Proof: ${activity.title}`}>
      <form className="stack" onSubmit={send}>
        <span style={{ alignSelf: 'flex-start' }}><TierChip tier={activity.tier} /></span>
        {needsEvent && (
          <label className="field">
            <span>Which event?</span>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
              <option value="">{events.loading ? 'Loading…' : attended.length ? 'Choose an event' : 'No check-ins yet'}</option>
              {attended.map((e) => (
                <option key={e.id} value={e.id}>{e.title} ({fmtDate(e.startsAt)})</option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Screenshot or photo (max {Math.round(UPLOAD.maxBytes / 1024 / 1024)} MB)</span>
          <input className="input" type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {image && <img src={image} alt="Preview of your upload" style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain', border: '3px solid var(--navy-900)' }} />}
        <label className="field">
          <span>Note (optional)</span>
          <textarea className="input" rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
          <small className="muted" aria-live="polite">{note.length}/280</small>
        </label>
        {blocker && <p className="field-error" role="alert">{blocker}</p>}
        <ErrorText error={err} />
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !!blocker}>{busy ? 'Sending…' : 'Submit'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Submissions ─────────────────────────────────────
function Submissions() {
  const { data, loading, error } = useAsync(() => api.mySubmissions(), [], { live: true });
  if (loading && !data) return <Loading lines={3} />;
  if (error) return <ErrorText error={error} />;
  if (!data?.length) return <Empty>No proofs sent yet. Pick a quest and show us what you did!</Empty>;
  return (
    <Panel>
      <ul className="list">
        {data.map((s) => (
          <li key={s.id} className="row" style={{ alignItems: 'flex-start' }}>
            <img src={s.imageUrl} alt="" width={56} height={56} style={{ objectFit: 'cover', border: '3px solid var(--navy-900)', flex: 'none' }} />
            <div className="stack" style={{ flex: 1, gap: 4 }}>
              <div className="spread">
                <strong>{activityById(s.activityId)?.title ?? s.activityId}</strong>
                <StatusChip status={s.status} />
              </div>
              <span className="muted">{fmtDate(s.createdAt)}</span>
              {s.status === 'rejected' && s.reviewReason && <span className="field-error">Reason: {s.reviewReason}</span>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}


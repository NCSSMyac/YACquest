import { useEffect, useRef, useState } from 'react';
import * as api from '../api';
import { CAMPUSES, CAPS, INSTAGRAM_HANDLE, INSTAGRAM_URL, TIER_LABELS, TIER_POINTS, UPLOAD, campusName, type Tier } from '../config';
import { ACTIVITIES, activityById } from '../lib/activities';
import { useAuth } from '../lib/auth';
import { downloadIcs, googleCalendarUrl, type CalEvent } from '../lib/calendar';
import { noteCelebratedPoints, useCelebrate } from '../lib/celebrate';
import { siteUrl } from '../lib/supabase';
import { kindTier } from '../lib/eventKinds';
import { fmtDate, fmtDateTime } from '../lib/format';
import { prepareImage } from '../lib/image';
import { errorMessage, useAsync } from '../lib/useAsync';
import { Empty, ErrorText, Loading, Modal, Panel, StatusChip, TierChip, useToast } from '../components/ui';
import type { Activity } from '../types';

type Ev = Awaited<ReturnType<typeof api.listEvents>>[number];
type TabId = 'events' | 'quests' | 'subs';
const TABS: { id: TabId; label: string }[] = [
  { id: 'events', label: 'Events' },
  { id: 'quests', label: 'Quests' },
  { id: 'subs', label: 'My Submissions' },
];
const TIER_TITLES: Record<Tier, string> = { 1: 'Tier 1 · High-Impact', 2: 'Tier 2 · Active', 3: 'Tier 3 · Digital' };
const OPEN_BEFORE_MIN = 30;

export default function Earn() {
  const [tab, setTab] = useState<TabId>('events');
  return (
    <div className="stack">
      <h1 className="pixel" style={{ margin: 0 }}>Quest Board</h1>
      <div className="tabs" role="tablist" aria-label="Quest board sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`earn-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="earn-panel" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div id="earn-panel" role="tabpanel" aria-labelledby={`earn-tab-${tab}`} className="stack">
        {tab === 'events' && <Events />}
        {tab === 'quests' && <Quests goEvents={() => setTab('events')} />}
        {tab === 'subs' && <Submissions />}
      </div>
    </div>
  );
}

// ── Events ──────────────────────────────────────────
function Events() {
  const up = useAsync(() => api.listEvents('upcoming'), [], { live: true });
  const past = useAsync(() => api.listEvents('past'), [], { live: true });
  const [showPast, setShowPast] = useState(false);
  const celebrate = useCelebrate();
  const { user } = useAuth();
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
      {up.data?.map((e) => (
        <EventCard key={e.id} e={e} now={now} onDone={(pts) => {
          celebrate({ title: 'Quest complete!', subtitle: e.title, points: pts, size: 'small' });
          if (user) noteCelebratedPoints(user.id, pts);
        }} />
      ))}
      <button className="btn ghost small" aria-expanded={showPast} onClick={() => setShowPast((s) => !s)}>
        {showPast ? '▼' : '▶'} Past events
      </button>
      {showPast && (
        <Panel tone="flat">
          {past.loading && !past.data ? <Loading /> : null}
          {past.data && past.data.length === 0 && <Empty>No past events.</Empty>}
          <ul className="list">
            {past.data?.map((e) => (
              <li key={e.id} className="spread">
                <span>
                  <strong>{e.title}</strong>
                  <br />
                  <span className="muted">{fmtDate(e.startsAt)} · {e.campus === 'all' ? 'All campuses' : campusName(e.campus)}</span>
                </span>
                {e.checkedIn ? <span className="chip approved">Went ✓</span> : <span className="chip neutral">Missed</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function EventCard({ e, now, onDone }: { e: Ev; now: number; onDone: (pts: number) => void }) {
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
    <Panel tone={live && !e.checkedIn ? 'gold' : undefined}>
      <div className="stack">
        <div className="spread">
          <strong style={{ fontSize: 18 }}>{e.title}</strong>
          {live && !e.checkedIn && <span className="chip t1 blink">● LIVE</span>}
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <TierChip tier={tier} />
          <span className="chip neutral">{e.campus === 'all' ? 'All campuses' : campusName(e.campus)}</span>
        </div>
        <div className="muted">📍 {e.location}<br />🕒 {fmtDateTime(e.startsAt)}</div>
        {now <= new Date(e.endsAt).getTime() && <AddToCalendar e={e} />}
        {e.checkedIn ? (
          <span className="chip approved" style={{ alignSelf: 'flex-start' }}>Checked in ✓</span>
        ) : live ? (
          <form className="stack" onSubmit={submit}>
            <label className="field">
              <span>Event password (announced at the event)</span>
              <input className="input" value={pw} onChange={(x) => setPw(x.target.value)} autoComplete="off" autoCapitalize="off" required />
            </label>
            <ErrorText error={err} />
            <button className="btn green" disabled={busy || !pw.trim()}>{busy ? 'Checking…' : 'Check in'}</button>
          </form>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Opens {OPEN_BEFORE_MIN} min before start</p>
        )}
      </div>
    </Panel>
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
      {([1, 2, 3] as Tier[]).map((t) => (
        <section key={t} className="stack" aria-label={TIER_TITLES[t]}>
          <h2 className="pixel" style={{ fontSize: 16, margin: '8px 0 0' }}>{TIER_TITLES[t]} · +{TIER_POINTS[t]} each</h2>
          {ACTIVITIES.filter((a) => a.tier === t).map((a) => (
            <QuestCard key={a.id} a={a} goEvents={goEvents} onProof={() => setProof(a)} />
          ))}
        </section>
      ))}
      {proof && <ProofModal activity={proof} onClose={() => setProof(null)} />}
    </>
  );
}

/** Quests that happen on Instagram get a direct link. */
const INSTAGRAM_QUESTS = new Set(['follow_ig', 'repost', 'story_game', 'social_tag']);

function QuestCard({ a, goEvents, onProof }: { a: Activity; goEvents: () => void; onProof: () => void }) {
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
    <Panel>
      <div className="stack">
        <div className="spread">
          <strong style={{ fontSize: 17 }}>{a.title}</strong>
          <TierChip tier={a.tier} />
        </div>
        <p style={{ margin: 0 }}>{a.description}</p>
        {a.limitLabel && <span className="chip neutral" style={{ alignSelf: 'flex-start' }}>{a.limitLabel}</span>}
        {INSTAGRAM_QUESTS.has(a.id) && (
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
            Open {INSTAGRAM_HANDLE} ↗
          </a>
        )}
        {(a.method === 'screenshot' || a.method === 'photo') && <button className="btn small" onClick={onProof}>Submit proof</button>}
        {a.method === 'event_password' && <button className="btn blue small" onClick={goEvents}>See events</button>}
        {a.method === 'lead_award' && <p className="muted" style={{ margin: 0 }}>A YAC admin awards this at events.</p>}
        {a.method === 'referral' && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span className="pixel" style={{ fontSize: 16 }} aria-label="Your friend code">{user?.friendCode}</span>
            <button className="btn ghost small" onClick={copy}>Copy</button>
            <span className="muted">Max {CAPS.referralsPerCycle} friends</span>
          </div>
        )}
      </div>
    </Panel>
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
        <TierChip tier={activity.tier} />
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
          <span className="muted" aria-live="polite">{note.length}/280</span>
        </label>
        {blocker && <p className="field-error" role="alert">{blocker}</p>}
        <ErrorText error={err} />
        <div className="row">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !!blocker}>{busy ? 'Sending…' : 'Send for review'}</button>
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

void CAMPUSES;
void TIER_LABELS;

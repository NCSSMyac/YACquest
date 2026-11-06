import { useEffect, useState, type FormEvent } from 'react';
import * as api from '../../api';
import { CAMPUSES, campusName, type CampusId } from '../../config';
import { EVENT_KINDS, kindInfo, kindPoints, kindTier } from '../../lib/eventKinds';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { checkInUrl } from '../../lib/pendingCheckin';
import { errorMessage, useAsync } from '../../lib/useAsync';
import type { AdminEventRsvpCounts, EventAttendee, EventRsvp, YacEvent } from '../../types';

type AdminEvent = YacEvent & AdminEventRsvpCounts;

const WORDS = ['YAK', 'MOO', 'HORN', 'QUEST', 'GOLD', 'SHAGGY', 'FJORD', 'RIDGE'];
const genPassword = () => `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${1000 + Math.floor(Math.random() * 9000)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function phase(e: YacEvent): 'LIVE' | 'Upcoming' | 'Past' {
  const now = Date.now();
  const s = new Date(e.startsAt).getTime();
  const end = new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60000;
  return now < s ? 'Upcoming' : now <= end ? 'LIVE' : 'Past';
}

interface Form { title: string; campus: CampusId | 'all'; kind: YacEvent['kind']; location: string; start: string; end: string; grace: number; password: string }

export default function Events() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useAsync(() => api.adminListEvents(), [], { live: true });
  const [editing, setEditing] = useState<YacEvent | 'new' | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'current' | 'past'>('current');
  const [whoCame, setWhoCame] = useState<YacEvent | null>(null);
  const [whoGoing, setWhoGoing] = useState<AdminEvent | null>(null);
  const [qrFor, setQrFor] = useState<YacEvent | null>(null);

  // Upcoming + live: soonest first. Past (kept forever): newest first.
  const current = (list.data ?? []).filter((e) => phase(e) !== 'Past').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = (list.data ?? []).filter((e) => phase(e) === 'Past').sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const shown = tab === 'current' ? current : past;

  function open(e: YacEvent | 'new') {
    setErr(null);
    setEditing(e);
    if (e === 'new') {
      const s = new Date(Date.now() + 86400000);
      s.setHours(18, 0, 0, 0);
      const en = new Date(s.getTime() + 2 * 3600000);
      setForm({ title: '', campus: user?.campus ?? 'duke', kind: 'active', location: '', start: toLocal(s.toISOString()), end: toLocal(en.toISOString()), grace: 60, password: genPassword() });
    } else {
      setForm({ title: e.title, campus: e.campus, kind: e.kind, location: e.location, start: toLocal(e.startsAt), end: toLocal(e.endsAt), grace: e.checkInGraceMinutes, password: e.password ?? '' });
    }
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (!form || !editing) return;
    setBusy(true);
    setErr(null);
    const input: api.EventInput = {
      title: form.title, campus: form.campus, crossCampus: form.campus === 'all', kind: form.kind, location: form.location,
      startsAt: new Date(form.start).toISOString(), endsAt: new Date(form.end).toISOString(), checkInGraceMinutes: form.grace, password: form.password,
    };
    try {
      if (editing === 'new') await api.createEvent(input);
      else await api.updateEvent(editing.id, input);
      toast('Event saved.', 'success');
      setEditing(null);
      void list.reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function del(e: YacEvent) {
    if (!window.confirm(`Delete "${e.title}"?`)) return;
    try {
      await api.deleteEvent(e.id);
      toast('Event deleted.', 'success');
      void list.reload();
    } catch (er) {
      toast(errorMessage(er), 'error');
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="stack">
      <button className="btn" onClick={() => open('new')}>+ New event</button>
      <div className="tabs" role="tablist" aria-label="Which events">
        <button role="tab" aria-selected={tab === 'current'} onClick={() => setTab('current')}>Upcoming ({current.length})</button>
        <button role="tab" aria-selected={tab === 'past'} onClick={() => setTab('past')}>Past ({past.length})</button>
      </div>
      {list.loading && !list.data ? <Loading lines={3} /> : list.error ? <ErrorText error={list.error} /> : !shown.length ? <Empty>{tab === 'past' ? 'No past events yet.' : 'No upcoming events. Make one!'}</Empty> : (
        shown.map((e) => {
          const p = phase(e);
          return (
            <Panel key={e.id}>
              <div className="spread">
                <strong>{e.title}</strong>
                <span className={`chip ${p === 'LIVE' ? 'approved' : p === 'Upcoming' ? 'pending' : 'neutral'}`}>{p}</span>
              </div>
              <p className="muted">
                🕒 {fmtDateTime(e.startsAt)} – {fmtDateTime(e.endsAt)}
                <br />📍 {e.location} · {e.campus === 'all' ? 'All campuses' : campusName(e.campus)}
                <br />Tier {kindTier(e.kind)} · {kindInfo(e.kind).label} (+{kindPoints(e.kind)})
              </p>
              <p>Password: <strong style={{ fontFamily: 'monospace', fontSize: 18 }}>{e.password}</strong></p>
              <p style={{ marginTop: -6 }}>
                <b>{e.goingCount}</b> going · <b>{e.attendeeCount}</b> came
                {p === 'Past' && e.goingCount > 0 && <span className="muted"> · {e.goingCount - e.rsvpCame} RSVP’d but didn’t come</span>}
              </p>
              <div className="btn-row">
                <button className="btn small blue" onClick={() => setWhoGoing(e)}>Who’s going ({e.goingCount})</button>
                <button className="btn small" onClick={() => setWhoCame(e)}>Who came ({e.attendeeCount})</button>
                <button className="btn small navy" onClick={() => setQrFor(e)}>QR code</button>
                <button className="btn small blue" onClick={() => open(e)}>Edit</button>
                <button className="btn small red" onClick={() => del(e)}>Delete</button>
              </div>
            </Panel>
          );
        })
      )}

      <Modal open={!!whoCame} onClose={() => setWhoCame(null)} title={whoCame ? `Who came: ${whoCame.title}` : undefined}>
        {whoCame && <Attendees e={whoCame} onClose={() => setWhoCame(null)} />}
      </Modal>
      <Modal open={!!whoGoing} onClose={() => setWhoGoing(null)} title={whoGoing ? `Who’s going: ${whoGoing.title}` : undefined}>
        {whoGoing && <Going e={whoGoing} past={phase(whoGoing) === 'Past'} onClose={() => setWhoGoing(null)} />}
      </Modal>
      <Modal open={!!qrFor} onClose={() => setQrFor(null)} title="Check-in QR code">
        {qrFor && <CheckInQr e={qrFor} onClose={() => setQrFor(null)} />}
      </Modal>

      <Modal open={!!editing && !!form} onClose={() => setEditing(null)} title={editing === 'new' ? 'New event' : 'Edit event'}>
        {form && (
          <form className="stack" onSubmit={save}>
            <label className="field"><span>Title</span><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} required /></label>
            <label className="field">
              <span>Tier (sets the points)</span>
              <select value={form.kind} onChange={(e) => set('kind', e.target.value as YacEvent['kind'])}>
                {EVENT_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    Tier {k.tier} · {k.label} · +{kindPoints(k.id)} pts
                  </option>
                ))}
              </select>
            </label>
            <p className="muted" style={{ margin: 0 }}>
              {kindInfo(form.kind).help} Everyone who checks in earns <strong>+{kindPoints(form.kind)} points</strong>.
            </p>
            <label className="field">
              <span>Campus</span>
              <select value={form.campus} onChange={(e) => set('campus', e.target.value as CampusId | 'all')}>
                <option value="all">All campuses</option>
                {CAMPUSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Location</span><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} required /></label>
            <label className="field"><span>Starts</span><input className="input" type="datetime-local" value={form.start} onChange={(e) => set('start', e.target.value)} required /></label>
            <label className="field"><span>Ends</span><input className="input" type="datetime-local" value={form.end} onChange={(e) => set('end', e.target.value)} required /></label>
            <label className="field"><span>Check-in grace (minutes after end)</span><input className="input" type="number" min={0} value={form.grace} onChange={(e) => set('grace', Number(e.target.value))} /></label>
            <label className="field">
              <span>Event password</span>
              <div className="row">
                <input className="input" value={form.password} onChange={(e) => set('password', e.target.value)} required />
                <button type="button" className="btn small blue" onClick={() => set('password', genPassword())}>Generate</button>
              </div>
            </label>
            <ErrorText error={err} />
            <div className="btn-row">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

async function copyText(text: string, toast: ReturnType<typeof useToast>, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied!`, 'success');
  } catch {
    toast('Couldn’t copy here. Select the text and copy it yourself.', 'error');
  }
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Admin → Events → Who came: everyone who checked in, oldest first. */
function Attendees({ e, onClose }: { e: YacEvent; onClose: () => void }) {
  const toast = useToast();
  const list = useAsync<EventAttendee[]>(() => api.adminEventAttendees(e.id), [e.id]);
  const rows = list.data ?? [];
  const csv = ['name,username,campus,checked_in', ...rows.map((a) => [a.displayName, '@' + a.handle, campusName(a.campus), fmtDateTime(a.checkedInAt)].map(csvCell).join(','))].join('\n');
  return (
    <div className="stack">
      {list.loading && !list.data ? <Loading lines={3} /> : list.error ? <ErrorText error={list.error} /> : !rows.length ? <Empty>Nobody has checked in yet.</Empty> : (
        <ol className="list" style={{ maxHeight: '50vh', overflow: 'auto' }}>
          {rows.map((a) => (
            <li key={a.userId + a.checkedInAt} className="spread" style={{ gap: 8 }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><b>{a.displayName}</b> <span className="muted">· {campusName(a.campus)}</span></span>
              <small className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.checkedInAt)}</small>
            </li>
          ))}
        </ol>
      )}
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn" disabled={!rows.length} onClick={() => copyText(csv, toast, 'List')}>Copy list</button>
      </div>
    </div>
  );
}

/** 0022: Admin → Events → Who's going: everyone who RSVP'd, oldest first, ✓ if they checked in. */
function Going({ e, past, onClose }: { e: YacEvent; past: boolean; onClose: () => void }) {
  const toast = useToast();
  const list = useAsync<EventRsvp[]>(() => api.adminEventRsvps(e.id), [e.id]);
  const rows = list.data ?? [];
  const came = rows.filter((r) => r.checkedIn).length;
  const csv = ['name,username,campus,email,rsvp_at,came', ...rows.map((r) => [r.displayName, '@' + r.handle, campusName(r.campus), r.email, fmtDateTime(r.rsvpAt), r.checkedIn ? 'yes' : 'no'].map(csvCell).join(','))].join('\n');
  return (
    <div className="stack">
      {rows.length > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {rows.length} going · {came} of them came{past && <> · <b>{rows.length - came}</b> RSVP’d but didn’t come</>}
        </p>
      )}
      {list.loading && !list.data ? <Loading lines={3} /> : list.error ? <ErrorText error={list.error} /> : !rows.length ? <Empty>No RSVPs yet.</Empty> : (
        <ol className="list" style={{ maxHeight: '50vh', overflow: 'auto' }}>
          {rows.map((r) => (
            <li key={r.userId} className="spread" style={{ gap: 8 }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <b>{r.displayName}</b> <span className="muted">· {campusName(r.campus)}</span>
                {r.checkedIn && <span className="chip approved" style={{ marginLeft: 6 }} aria-label="came">✓ came</span>}
              </span>
              <small className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.rsvpAt)}</small>
            </li>
          ))}
        </ol>
      )}
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn" disabled={!rows.length} onClick={() => copyText(csv, toast, 'List')}>Copy list</button>
      </div>
    </div>
  );
}

/** Admin → Events → QR code: big enough to project or screenshot. Scanning it opens #/checkin. */
function CheckInQr({ e, onClose }: { e: YacEvent; onClose: () => void }) {
  const toast = useToast();
  const url = checkInUrl(e.id, e.password ?? '', e.title);
  const [img, setImg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setImg(null);
    // Lazy-loaded so the QR library stays out of the main bundle.
    import('qrcode')
      .then((QR) => QR.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0b2a5bff', light: '#ffffffff' } }))
      .then((d) => alive && setImg(d))
      .catch(() => alive && setErr('Couldn’t make the QR code. Share the link below instead.'));
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="stack" style={{ alignItems: 'stretch' }}>
      <strong className="center" style={{ fontSize: 20 }}>{e.title}</strong>
      <div style={{ background: '#fff', border: 'var(--px) solid var(--navy-900)', padding: 8, display: 'grid', placeItems: 'center', aspectRatio: '1 / 1' }}>
        {img ? <img src={img} alt={`QR code to check in to ${e.title}`} style={{ width: '100%', height: 'auto', imageRendering: 'pixelated' }} /> : err ? <ErrorText error={err} /> : <Loading lines={1} />}
      </div>
      <div className="center">
        <div className="muted">Password</div>
        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 32, letterSpacing: 2, overflowWrap: 'anywhere' }}>{e.password}</div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Scan to check in (works when check-in is open: 30 min before the start until {e.checkInGraceMinutes} min after the end). People without an account are asked to log in or sign up first.
      </p>
      <div className="field">
        <span>Check-in link</span>
        <input className="input" readOnly value={url} onFocus={(x) => x.currentTarget.select()} style={{ fontSize: 13 }} />
      </div>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn" onClick={() => copyText(url, toast, 'Link')}>Copy link</button>
      </div>
    </div>
  );
}

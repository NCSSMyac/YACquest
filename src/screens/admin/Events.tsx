import { useState, type FormEvent } from 'react';
import * as api from '../../api';
import { CAMPUSES, TIER_POINTS, campusName, type CampusId } from '../../config';
import { activityById } from '../../lib/activities';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import type { YacEvent } from '../../types';

const KINDS: YacEvent['kind'][] = ['social', 'panel', 'service', 'game_night'];
const WORDS = ['YAK', 'MOO', 'HORN', 'QUEST', 'GOLD', 'SHAGGY', 'FJORD', 'RIDGE'];
const genPassword = () => `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${1000 + Math.floor(Math.random() * 9000)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const homePts = TIER_POINTS[activityById('home_event')!.tier];
const crossPts = TIER_POINTS[activityById('cross_campus_event')!.tier];

function phase(e: YacEvent): 'LIVE' | 'Upcoming' | 'Past' {
  const now = Date.now();
  const s = new Date(e.startsAt).getTime();
  const end = new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60000;
  return now < s ? 'Upcoming' : now <= end ? 'LIVE' : 'Past';
}

interface Form { title: string; campus: CampusId | 'all'; crossCampus: boolean; kind: YacEvent['kind']; location: string; start: string; end: string; grace: number; password: string }

export default function Events() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useAsync(() => api.adminListEvents(), [], { live: true });
  const [editing, setEditing] = useState<YacEvent | 'new' | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isChair = user?.role === 'chair';

  function open(e: YacEvent | 'new') {
    setErr(null);
    setEditing(e);
    if (e === 'new') {
      const s = new Date(Date.now() + 86400000);
      s.setHours(18, 0, 0, 0);
      const en = new Date(s.getTime() + 2 * 3600000);
      setForm({ title: '', campus: user!.campus, crossCampus: false, kind: 'social', location: '', start: toLocal(s.toISOString()), end: toLocal(en.toISOString()), grace: 60, password: genPassword() });
    } else {
      setForm({ title: e.title, campus: e.campus, crossCampus: e.crossCampus, kind: e.kind, location: e.location, start: toLocal(e.startsAt), end: toLocal(e.endsAt), grace: e.checkInGraceMinutes, password: e.password ?? '' });
    }
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (!form || !editing) return;
    setBusy(true);
    setErr(null);
    const input: api.EventInput = {
      title: form.title, campus: form.campus, crossCampus: form.crossCampus, kind: form.kind, location: form.location,
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
      {list.loading && !list.data ? <Loading lines={3} /> : list.error ? <ErrorText error={list.error} /> : !list.data?.length ? <Empty>No events yet.</Empty> : (
        list.data.map((e) => {
          const p = phase(e);
          return (
            <Panel key={e.id}>
              <div className="spread">
                <strong>{e.title}</strong>
                <span className={`chip ${p === 'LIVE' ? 'approved' : p === 'Upcoming' ? 'pending' : 'neutral'}`}>{p}</span>
              </div>
              <p className="muted">{fmtDateTime(e.startsAt)} – {fmtDateTime(e.endsAt)} · {e.location} · {e.campus === 'all' ? 'All campuses' : campusName(e.campus)}{e.crossCampus ? ' · cross-campus' : ''}</p>
              <p>Password: <strong style={{ fontFamily: 'monospace', fontSize: 22 }}>{e.password}</strong> · {e.attendeeCount} checked in</p>
              <div className="grid-2">
                <button className="btn small blue" onClick={() => open(e)}>Edit</button>
                <button className="btn small red" onClick={() => del(e)}>Delete</button>
              </div>
            </Panel>
          );
        })
      )}

      <Modal open={!!editing && !!form} onClose={() => setEditing(null)} title={editing === 'new' ? 'New event' : 'Edit event'}>
        {form && (
          <form className="stack" onSubmit={save}>
            <label className="field"><span>Title</span><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} required /></label>
            <label className="field">
              <span>Campus</span>
              <select value={form.campus} disabled={!isChair} onChange={(e) => set('campus', e.target.value as CampusId | 'all')}>
                {isChair && <option value="all">All campuses</option>}
                {CAMPUSES.filter((c) => isChair || c.id === user?.campus).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="row"><input type="checkbox" checked={form.crossCampus} onChange={(e) => set('crossCampus', e.target.checked)} /> Cross-campus event (open to other campuses)</label>
            <p className="muted">Check-in earns +{homePts} for home-campus members and +{crossPts} for cross-campus attendees.</p>
            <label className="field">
              <span>Kind</span>
              <select value={form.kind} onChange={(e) => set('kind', e.target.value as YacEvent['kind'])}>
                {KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
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
            <div className="grid-2">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

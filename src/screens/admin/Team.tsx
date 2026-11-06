import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../api';
import type { AdminUserRow, TeamMember } from '../../api';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { MAX_CHAIRS } from '../../config';

type Pick = { id: string; displayName: string; handle: string };

type SearchAction = { label: string; className?: string; onPick: (u: AdminUserRow) => void; disabled?: boolean; title?: string };

function PersonSearch({ label, actions, exclude }: { label: string; actions: SearchAction[]; exclude?: (u: AdminUserRow) => boolean }) {
  const [text, setText] = useState('');
  const list = useAsync(() => (text.trim().length >= 2 ? api.searchUsers(text.trim(), 8) : Promise.resolve([] as AdminUserRow[])), [text]);
  const rows = (list.data ?? []).filter((u) => !exclude?.(u));
  return (
    <div className="stack">
      <label className="field">
        <span>{label}</span>
        <input className="input" type="search" placeholder="Name, username or email" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {text.trim().length >= 2 && !list.loading && !rows.length && <Empty>No matches.</Empty>}
      {rows.length > 0 && (
        <ul className="list">
          {rows.map((u) => (
            <li key={u.id} className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span>{u.displayName} <span className="muted">@{u.handle}</span></span>
              <span className="btn-row" style={{ gap: 6 }}>
                {actions.map((a) => (
                  <button key={a.label} className={`btn small ${a.className ?? 'ghost'}`} disabled={a.disabled} title={a.title} onClick={() => a.onPick(u)}>{a.label}</button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Team() {
  const toast = useToast();
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const team = useAsync(() => api.listTeam(), [], { live: true });
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [adding, setAdding] = useState<Pick | null>(null);
  const [handing, setHanding] = useState<Pick | null>(null);
  const [promoting, setPromoting] = useState<Pick | null>(null);
  const [steppingDown, setSteppingDown] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<void>, ok: string, done: () => void) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast(ok, 'success');
      done();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const chairs = team.data?.filter((m) => m.role === 'chair').length ?? 0;
  const admins = team.data?.filter((m) => m.role === 'admin').length ?? 0;
  const chairsFull = chairs >= MAX_CHAIRS;
  const fullHint = `YAC already has ${MAX_CHAIRS} chairs. Someone must step down first.`;
  const openPromote = (u: Pick) => { setErr(null); setPromoting(u); };

  const handoverOk = handing && typed.trim().toLowerCase() === handing.handle.toLowerCase();

  return (
    <div className="stack">
      <Panel title="Roles">
        {team.data && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <span className="chip t1">Chairs: {chairs} of {MAX_CHAIRS}</span>
            <span className="chip t2">Admins: {admins}</span>
          </div>
        )}
        <ul className="list" style={{ margin: 0 }}>
          <li><b>Chair</b>: can do everything: team, prizes, the action log and system settings (weekly email, reset). Up to {MAX_CHAIRS} chairs.</li>
          <li><b>Admin</b>: a day-to-day helper. Reviews submissions, awards points, runs events and sends announcements (including email to everyone).</li>
        </ul>
      </Panel>

      <Panel title="Current team">
        {team.loading && !team.data ? <Loading /> : team.error ? <ErrorText error={team.error} /> : !team.data?.length ? <Empty>No team yet.</Empty> : (
          <ul className="list">
            {team.data.map((m) => (
              <li key={m.id} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <strong>{m.displayName} <span className="muted">@{m.handle}</span>{m.id === user?.id && <span className="muted"> (you)</span>}</strong>
                  <span className={`chip ${m.role === 'chair' ? 't1' : 't2'}`}>{m.role === 'chair' ? 'YAC Chair' : 'Admin'}</span>
                </div>
                <span className="muted wrap-anywhere">{m.email}{!m.emailVerified && ' · email not confirmed'}</span>
                {m.role === 'admin' && (
                  <div className="btn-row" style={{ gap: 6 }}>
                    <button className="btn small" disabled={chairsFull} title={chairsFull ? fullHint : undefined} onClick={() => openPromote(m)}>Make chair</button>
                    <button className="btn small red" onClick={() => { setErr(null); setRemoving(m); }}>Remove admin</button>
                  </div>
                )}
                {m.role === 'admin' && chairsFull && <span className="muted" style={{ fontSize: 13 }}>{fullHint}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Add someone">
        <PersonSearch
          label="Find a participant"
          exclude={(u) => u.role !== 'participant'}
          actions={[
            { label: 'Make admin', onPick: (u) => { setErr(null); setAdding(u); } },
            { label: 'Make chair', onPick: openPromote, disabled: chairsFull, title: chairsFull ? fullHint : undefined },
          ]}
        />
        {chairsFull && <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{fullHint}</p>}
      </Panel>

      <Panel title="Step down as chair" tone="flat">
        <p className="muted">You become an admin. Another chair can then remove you from the team.{chairs <= 1 && ' You’re the only chair, so make someone else a chair first.'}</p>
        <button className="btn red" disabled={chairs <= 1} onClick={() => { setErr(null); setSteppingDown(true); }}>Step down as chair</button>
      </Panel>

      <Panel title="Hand over my chair seat" tone="flat">
        <p className="muted">Swap places in one step: the person you pick becomes a YAC Chair and you become an admin. Useful when the chair team is full.</p>
        <PersonSearch label="Who takes your seat?" exclude={(u) => u.id === user?.id || u.role === 'chair'} actions={[{ label: 'Select', onPick: (u) => { setErr(null); setTyped(''); setHanding(u); } }]} />
      </Panel>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove admin?">
        <div className="stack">
          <p style={{ margin: 0 }}>{removing?.displayName} will go back to being a regular adventurer.</p>
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setRemoving(null)}>Cancel</button>
            <button className="btn red" disabled={busy} onClick={() => removing && run(() => api.setRole(removing.id, 'participant'), 'Admin removed.', () => { setRemoving(null); void team.reload(); })}>{busy ? 'Saving…' : 'Remove'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!adding} onClose={() => setAdding(null)} title="Make admin?">
        <div className="stack">
          <p style={{ margin: 0 }}>{adding?.displayName} (@{adding?.handle}) will be able to review submissions, award points and run events. They must have confirmed their email.</p>
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setAdding(null)}>Cancel</button>
            <button className="btn green" disabled={busy} onClick={() => adding && run(() => api.setRole(adding.id, 'admin'), 'Admin added.', () => { setAdding(null); void team.reload(); })}>{busy ? 'Saving…' : 'Make admin'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!promoting} onClose={() => setPromoting(null)} title="Make chair?">
        <div className="stack">
          <p style={{ margin: 0 }}>{promoting?.displayName} (@{promoting?.handle}) will be able to do everything you can: manage the team, prizes, emails and the cycle reset. They must have confirmed their email. Chairs: {chairs} of {MAX_CHAIRS}.</p>
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setPromoting(null)}>Cancel</button>
            <button className="btn green" disabled={busy} onClick={() => promoting && run(() => api.setRole(promoting.id, 'chair'), 'New chair added.', () => { setPromoting(null); void team.reload(); })}>{busy ? 'Saving…' : 'Make chair'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={steppingDown} onClose={() => setSteppingDown(false)} title="Step down as chair?">
        <div className="stack">
          <p style={{ margin: 0 }}>You’ll become an admin: you can still review submissions, award points and run events, but not manage the team, prizes or settings. Another chair can remove you from the team afterwards.</p>
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setSteppingDown(false)}>Cancel</button>
            <button className="btn red" disabled={busy} onClick={() => run(() => api.stepDownChair(), 'You are now an admin.', () => { setSteppingDown(false); void refresh().then(() => nav('/admin')); })}>{busy ? 'Saving…' : 'Step down'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!handing} onClose={() => setHanding(null)} title="Hand over chair seat?">
        <div className="stack">
          <p style={{ margin: 0 }}>{handing?.displayName} becomes a YAC Chair and you become an admin. To confirm, type their username: <b>{handing?.handle}</b></p>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type their username" autoCapitalize="none" />
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setHanding(null)}>Cancel</button>
            <button
              className="btn red"
              disabled={busy || !handoverOk}
              onClick={() => handing && run(() => api.transferChair(handing.id), 'Chair seat handed over.', () => { setHanding(null); void refresh().then(() => nav('/admin')); })}
            >{busy ? 'Saving…' : 'Hand over'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

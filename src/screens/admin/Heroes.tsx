/**
 * Admin → Heroes (chairs only, 0020). Crown / clear Hero of the Week (picked at YAC's biweekly
 * meetings), grant Council wardrobe items and Council MVP (Golden Yak). Every action is logged.
 * Staff only: participants can never reach this route or its API calls.
 */
import { useState } from 'react';
import * as api from '../../api';
import { Avatar } from '../../components/Avatar';
import { HallOfHeroes, HeroBannerPanel } from '../../components/HeroBanner';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { STAFF_GRANTS, staffGrantById } from '../../lib/staffRewards';
import { errorMessage, useAsync } from '../../lib/useAsync';
import type { StaffRewardRow } from '../../types';

const NOTE_MAX = 120;

export default function Heroes() {
  const toast = useToast();
  const board = useAsync(() => api.heroBoard(), [], { live: true });
  const [heroId, setHeroId] = useState('');
  const [note, setNote] = useState('');
  const [grantTo, setGrantTo] = useState('');
  const [reward, setReward] = useState(STAFF_GRANTS[0].id);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ where: 'crown' | 'grant' | 'clear'; msg: string } | null>(null);

  async function run(where: 'crown' | 'grant' | 'clear', fn: () => Promise<void>, ok: string, done?: () => void) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast(ok, 'success');
      done?.();
    } catch (e) {
      setErr({ where, msg: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (board.loading && !board.data) return <Loading lines={4} />;
  if (!board.data) return <ErrorText error={board.error ?? 'Could not load.'} />;
  const b = board.data;
  const team = b.team;
  const nameOf = (id: string) => team.find((m) => m.userId === id)?.displayName ?? 'them';
  const grantee = team.find((m) => m.userId === grantTo);
  const alreadyHas = !!grantee && grantee.grants.includes(reward);

  return (
    <div className="stack">
      <HeroBannerPanel board={b} />

      <Panel title="🦸 Crown Hero of the Week">
        <p style={{ margin: '0 0 8px', fontSize: 15 }}>
          Picked at YAC’s biweekly meeting. The hero gets the Hero’s Crown, Cape and Hall of Heroes background plus a gold glow until a chair crowns the next hero. Admins and chairs only.
        </p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!heroId) return setErr({ where: 'crown', msg: 'Pick who to crown.' });
            void run('crown', () => api.crownHero(heroId, note), `👑 ${nameOf(heroId)} is Hero of the Week!`, () => {
              setHeroId('');
              setNote('');
            });
          }}
        >
          <label className="field">
            <span>Team member</span>
            <select className="input" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
              <option value="">Pick an admin or chair…</option>
              {team.map((m) => (
                <option key={m.userId} value={m.userId}>{m.displayName} (@{m.handle}){m.isHero ? ' · current hero' : ''}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Note (optional)</span>
            <input className="input" value={note} maxLength={NOTE_MAX} placeholder="e.g. ran the pickleball check-in table" onChange={(e) => setNote(e.target.value)} />
            <small className="muted">{note.length} / {NOTE_MAX}</small>
          </label>
          {err?.where === 'crown' && <ErrorText error={err.msg} />}
          <div className="btn-row" style={{ gap: 8 }}>
            <button className="btn" disabled={busy}>{busy ? 'Working…' : '👑 Crown hero'}</button>
            {b.current && (
              <button type="button" className="btn small ghost" disabled={busy} onClick={() => { setErr(null); setConfirmClear(true); }}>Clear current hero</button>
            )}
          </div>
        </form>
      </Panel>

      <Panel title="🎁 Grant a Council reward">
        <p style={{ margin: '0 0 8px', fontSize: 15 }}>
          Royal Scepter, Starlit Throne Room and Wizard Council Hat are chair-granted only. <b>Council MVP</b> is for an extra-special accomplishment: it unlocks the Legendary Golden Yak.
        </p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!grantTo) return setErr({ where: 'grant', msg: 'Pick who gets it.' });
            const g = staffGrantById(reward);
            void run('grant', () => api.grantStaffReward(grantTo, reward), `${nameOf(grantTo)} got the ${g?.name ?? reward}!`);
          }}
        >
          <label className="field">
            <span>Team member</span>
            <select className="input" value={grantTo} onChange={(e) => setGrantTo(e.target.value)}>
              <option value="">Pick an admin or chair…</option>
              {team.map((m) => (
                <option key={m.userId} value={m.userId}>{m.displayName} (@{m.handle})</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reward</span>
            <select className="input" value={reward} onChange={(e) => setReward(e.target.value)}>
              {STAFF_GRANTS.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.what})</option>
              ))}
            </select>
          </label>
          {alreadyHas && <span className="muted">{grantee!.displayName} already has this one.</span>}
          {err?.where === 'grant' && <ErrorText error={err.msg} />}
          <button className="btn" disabled={busy || alreadyHas}>{busy ? 'Working…' : 'Grant reward'}</button>
        </form>
      </Panel>

      <Panel title="The Council">
        {team.length === 0 ? <Empty>No team yet.</Empty> : (
          <ul className="list">
            {team.map((m) => <CouncilRow key={m.userId} m={m} />)}
          </ul>
        )}
      </Panel>

      <HallOfHeroes board={b} />

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear the current hero?">
        <div className="stack">
          <p style={{ margin: 0 }}>
            {b.current?.displayName} stops being Hero of the Week: the gold glow goes away and the Hero’s Crown, Cape and Hall of Heroes come off. Their Hero of the Week badge count stays.
          </p>
          {err?.where === 'clear' && <ErrorText error={err.msg} />}
          <div className="btn-row" style={{ gap: 8 }}>
            <button className="btn red" disabled={busy} onClick={() => void run('clear', () => api.clearHero(), 'Hero cleared.', () => setConfirmClear(false))}>Clear hero</button>
            <button className="btn ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CouncilRow({ m }: { m: StaffRewardRow }) {
  return (
    <li className="row" style={{ gap: 10, alignItems: 'center' }}>
      <Avatar id={m.avatar} look={m.look} campus={m.campus} size={44} hero={m.isHero} title={m.displayName} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ wordBreak: 'break-word' }}>{m.displayName}</strong> <span className="muted">@{m.handle}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          <span className={`chip ${m.role === 'chair' ? 't1' : 't2'}`}>{m.role === 'chair' ? 'Chair' : 'Admin'}</span>
          {m.isHero && <span className="chip t1">🦸 Hero</span>}
          {m.heroCount > 0 && <span className="chip neutral">Hero ×{m.heroCount}</span>}
          {m.legendary && <span className="chip legendary">★ Golden Yak</span>}
          {m.grants.filter((g) => g !== 'council_mvp').map((g) => (
            <span key={g} className="chip t3">{staffGrantById(g)?.name ?? g}</span>
          ))}
        </div>
      </div>
    </li>
  );
}

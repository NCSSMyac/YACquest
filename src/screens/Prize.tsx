import { useEffect, useState } from 'react';
import * as api from '../api';
import { CAMPUSES, PRIZE, PRIZE_POLL_MS, campusName } from '../config';
import { fmtDate } from '../lib/format';
import { errorMessage, useAsync } from '../lib/useAsync';
import { Sprite } from '../components/Sprite';
import { Empty, ErrorText, Loading, Panel, ProgressBar, useToast } from '../components/ui';
import type { PrizeClaim } from '../types';

const GIFT_CARDS = ['Amazon', 'Target', 'Starbucks', 'Chick-fil-A', 'DoorDash', 'Visa'];
const campusColor = (id: string) => CAMPUSES.find((c) => c.id === id)?.color ?? 'var(--navy-800)';

export default function Prize() {
  const status = useAsync(api.prizeStatus, [], { live: true });
  const dash = useAsync(api.getDashboard, [], { live: true });
  const { reload } = status;
  const reloadDash = dash.reload;
  useEffect(() => {
    const i = setInterval(() => {
      void reload();
      void reloadDash();
    }, PRIZE_POLL_MS);
    return () => clearInterval(i);
  }, [reload, reloadDash]);

  const s = status.data;
  if (!s) return status.error ? <ErrorText error={status.error} /> : <Loading lines={4} />;
  const claim = dash.data?.myClaim ?? s.claims.find((c) => c.userId === dash.data?.user.id);
  const points = dash.data?.points ?? 0;

  return (
    <div className="stack">
      <h1 className="pixel" style={{ margin: 0 }}>Treasure Vault</h1>
      <Panel tone="gold">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Sprite id="chest" size={96} className="bob" />
          <div className="pixel" style={{ fontSize: 16 }} aria-live="polite">{s.remaining} / {s.total} LEFT</div>
          <p style={{ margin: 0 }}>The first {s.total} adventurers to reach {s.goal} points each win a {PRIZE.name}.</p>
        </div>
      </Panel>

      <Panel title="Prize spots">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
          {Array.from({ length: s.total }, (_, i) => {
            const c = s.claims.find((x) => x.spot === i + 1);
            return (
              <div key={i} className="panel flat" style={{ padding: 8, textAlign: 'center', borderColor: c ? campusColor(c.campus) : undefined }} aria-label={c ? `Spot ${i + 1}: ${c.displayName}` : `Spot ${i + 1} open`}>
                <div className="pixel" style={{ fontSize: 14 }}>{c ? `#${i + 1}` : '?'}</div>
                {c ? (
                  <>
                    <strong style={{ display: 'block', wordBreak: 'break-word' }}>{c.displayName}</strong>
                    <span className="muted">{campusName(c.campus)}</span>
                  </>
                ) : (
                  <span className="muted">Open slot</span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Winners’ Circle">
        {s.claims.length === 0 ? (
          <Empty>No winners yet. Will you be first?</Empty>
        ) : (
          <ol className="list">
            {s.claims.map((c) => (
              <li key={c.spot} className="spread">
                <span><span className="pixel" style={{ fontSize: 10 }}>#{c.spot}</span> <strong>{c.displayName}</strong></span>
                <span className="chip neutral">{campusName(c.campus)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Your quest">
        <ProgressBar value={Math.min(points, s.goal)} max={s.goal} label={`${points} / ${s.goal}`} />
        <div style={{ marginTop: 12 }}>
          {claim?.status === 'qualified' ? (
            <ClaimForm claim={claim} onDone={() => { void reload(); void reloadDash(); }} />
          ) : claim?.status === 'info_submitted' ? (
            <div className="stack">
              <strong>Spot #{claim.spot} is yours!</strong>
              <p style={{ margin: 0 }}>Reference: <span className="pixel" style={{ fontSize: 11 }}>{claim.reference}</span></p>
              <p style={{ margin: 0 }}>We’ll deliver after the cycle ends (by {fmtDate(PRIZE.fulfillBy)}).</p>
            </div>
          ) : claim?.status === 'fulfilled' ? (
            <p className="pixel" style={{ fontSize: 12 }}>Delivered! Enjoy your {PRIZE.name}!</p>
          ) : s.remaining === 0 ? (
            <p style={{ margin: 0 }}>All prizes claimed. Keep climbing the leaderboard and chase the Campus Cup!</p>
          ) : (
            <p style={{ margin: 0 }}>
              <strong>{Math.max(0, s.goal - points)}</strong> more points to go. Only {s.remaining} {s.remaining === 1 ? 'spot' : 'spots'} left, so hurry!
            </p>
          )}
        </div>
      </Panel>

      <Suggest />
    </div>
  );
}

function ClaimForm({ claim, onDone }: { claim: PrizeClaim; onDone: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [preference, setPreference] = useState(GIFT_CARDS[0]);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PrizeClaim | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      setDone(await api.submitClaimInfo({ fullName: fullName.trim(), email: email.trim(), preference, notes: notes.trim() || undefined }));
      onDone();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="stack" style={{ textAlign: 'center', alignItems: 'center' }}>
        <Sprite id="trophy" size={64} className="bob" />
        <strong>Treasure secured!</strong>
        <p style={{ margin: 0 }}>Reference number: <span className="pixel" style={{ fontSize: 12 }}>{done.reference}</span></p>
        <p style={{ margin: 0 }}>We’ll deliver after the cycle ends (by {fmtDate(PRIZE.fulfillBy)}).</p>
      </div>
    );

  return (
    <form className="stack" onSubmit={submit}>
      <div style={{ textAlign: 'center' }}>
        <Sprite id="trophy" size={64} className="bob" />
        <div className="pixel" style={{ fontSize: 14 }}>YOU DID IT! Spot #{claim.spot}</div>
        <p style={{ margin: '6px 0 0' }}>Tell us where to send your {PRIZE.name}.</p>
      </div>
      <label className="field"><span>Full name</span><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" /></label>
      <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label className="field">
        <span>Gift card preference</span>
        <select value={preference} onChange={(e) => setPreference(e.target.value)}>
          {GIFT_CARDS.map((g) => <option key={g}>{g}</option>)}
        </select>
      </label>
      <label className="field"><span>Notes (optional)</span><textarea className="input" rows={2} maxLength={280} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <ErrorText error={err} />
      <button className="btn green" disabled={busy}>{busy ? 'Sending…' : 'Claim my treasure'}</button>
    </form>
  );
}

function Suggest() {
  const toast = useToast();
  const [idea, setIdea] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.suggestPrize(idea.trim());
      setIdea('');
      toast('Thanks! Idea sent to the council.', 'success');
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Suggest a prize idea" tone="flat">
      <form className="stack" onSubmit={send}>
        <label className="field">
          <span>What loot would you love?</span>
          <textarea className="input" rows={2} maxLength={280} value={idea} onChange={(e) => setIdea(e.target.value)} required />
        </label>
        <ErrorText error={err} />
        <button className="btn small" disabled={busy || !idea.trim()}>Send idea</button>
      </form>
    </Panel>
  );
}

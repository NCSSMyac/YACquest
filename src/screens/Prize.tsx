import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { CAMPUSES, CONTACT_EMAILS, PRIZE, PRIZE_POLL_MS, campusName } from '../config';
import { fmtDate } from '../lib/format';
import { CLAIM_LIMITS, claimContactError } from '../lib/validate';
import { errorMessage, useAsync } from '../lib/useAsync';
import { Sprite } from '../components/Sprite';
import { Empty, ErrorText, Loading, Panel, ProgressBar, useToast } from '../components/ui';
import type { PrizeClaim } from '../types';
import { useAuth } from '../lib/auth';
import { useCelebrate } from '../lib/celebrate';
import { badgeById } from '../lib/badges';
import { cosmeticById } from '../lib/cosmetics';
import { BadgesPanel } from '../components/cosmetics/BadgesPanel';
import { WardrobePanel } from '../components/cosmetics/WardrobePanel';
import { QuestCardButton } from '../components/QuestCard';
import { takeNew } from '../components/cosmetics/seen';
import { useStaffRewards } from '../lib/useStaffRewards';
import { staffBadgeById, staffCosmeticById } from '../lib/staffRewards';

const GIFT_CARDS = ['Amazon', 'Target', 'Starbucks', 'Chick-fil-A', 'DoorDash', 'Visa'];
const campusColor = (id: string) => CAMPUSES.find((c) => c.id === id)?.color ?? 'var(--navy-800)';

type HubTab = 'treasure' | 'badges' | 'wardrobe';
const HUB_TABS: { id: HubTab; label: string }[] = [
  { id: 'treasure', label: 'Treasure' },
  { id: 'badges', label: 'Badges' },
  { id: 'wardrobe', label: 'Wardrobe' },
];

/** Quest hub: the prize race, the badge collection and the wardrobe. Deep link with /prize?tab=badges|wardrobe. */
export default function Prize() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: HubTab = raw === 'badges' || raw === 'wardrobe' ? raw : 'treasure';
  const { user } = useAuth();
  const celebrate = useCelebrate();
  const badges = useAsync(api.myBadges, [], { live: true });
  const unlocks = useAsync(api.myUnlocks, [], { live: true });
  // Staff only (0020): null for participants — no API call, nothing rendered.
  const staff = useStaffRewards().data;

  // One-time celebrations for badges / looks earned since this player last looked (first visit ever: none).
  const userId = user?.id;
  const earnedIds = badges.data?.filter((b) => b.earned).map((b) => b.id).join(',');
  const unlockIds = unlocks.data?.join(',');
  useEffect(() => {
    if (!userId || earnedIds === undefined) return;
    for (const id of takeNew('badges', userId, earnedIds ? earnedIds.split(',') : []))
      celebrate({ title: 'Badge unlocked!', subtitle: badgeById(id)?.name ?? id, badgeId: id, size: 'big' });
  }, [userId, earnedIds, celebrate]);
  useEffect(() => {
    if (!userId || unlockIds === undefined) return;
    // Free looks aren't news.
    const ids = unlockIds ? unlockIds.split(',').filter((id) => cosmeticById(id)?.rule.type !== 'free') : [];
    for (const id of takeNew('looks', userId, ids))
      celebrate({ title: 'New look unlocked!', subtitle: cosmeticById(id)?.name ?? id, cosmeticId: id, size: 'big' });
  }, [userId, unlockIds, celebrate]);

  // Staff only: celebrate newly earned Council badges / looks too (separate "seen" sets).
  const staffBadgeIds = staff?.badges.filter((b) => b.earned).map((b) => b.id).join(',');
  const staffLookIds = staff?.unlocks.filter((id) => !['staff', 'hero'].includes(staffCosmeticById(id)?.rule.type ?? '')).join(',');
  useEffect(() => {
    if (!userId || staffBadgeIds === undefined) return;
    for (const id of takeNew('staff-badges', userId, staffBadgeIds ? staffBadgeIds.split(',') : []))
      celebrate({ title: 'Council badge unlocked!', subtitle: staffBadgeById(id)?.name ?? id, badgeId: id, hint: staffBadgeById(id)?.flavor, size: 'big' });
  }, [userId, staffBadgeIds, celebrate]);
  useEffect(() => {
    if (!userId || staffLookIds === undefined) return;
    for (const id of takeNew('staff-looks', userId, staffLookIds ? staffLookIds.split(',') : []))
      celebrate({ title: 'New Council look!', subtitle: staffCosmeticById(id)?.name ?? id, size: 'big' });
  }, [userId, staffLookIds, celebrate]);

  const select = (id: HubTab) => setParams(id === 'treasure' ? {} : { tab: id }, { replace: true });
  const title = tab === 'badges' ? 'Badge Book' : tab === 'wardrobe' ? 'Wardrobe' : 'Treasure Vault';

  return (
    <div className="stack">
      <h1 className="pixel" style={{ margin: 0 }}>{title}</h1>
      <div className="tabs" role="tablist" aria-label="Quest hub">
        {HUB_TABS.map((t) => (
          <button key={t.id} role="tab" id={`hub-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="hub-panel" onClick={() => select(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${tab}`}>
        {tab === 'treasure' && <Treasure />}
        {tab === 'badges' && <BadgesPanel badges={badges.data} error={badges.error} staffBadges={staff?.badges} />}
        {tab === 'wardrobe' && <WardrobePanel unlocks={unlocks.data} error={unlocks.error} staff={staff} />}
      </div>
    </div>
  );
}

function Treasure() {
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
      <Panel tone="gold">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Sprite id="chest" size={96} className="bob" />
          <div className="pixel" style={{ fontSize: 22 }} aria-live="polite">{s.remaining} / {s.total} LEFT</div>
          <p style={{ margin: 0 }}>The first {s.total} adventurers to reach {s.goal} points each win a {PRIZE.name}.</p>
          <QuestCardButton />
        </div>
      </Panel>

      <Panel title="Prize spots">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
          {Array.from({ length: s.total }, (_, i) => {
            const c = s.claims.find((x) => x.spot === i + 1);
            return (
              <div key={i} className="panel flat" style={{ padding: 8, textAlign: 'center', borderColor: c ? campusColor(c.campus) : undefined }} aria-label={c ? `Spot ${i + 1}: ${c.displayName}` : `Spot ${i + 1} open`}>
                <div className="pixel" style={{ fontSize: 18 }}>{c ? `#${i + 1}` : '?'}</div>
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
                <span><span className="pixel" style={{ fontSize: 14 }}>#{c.spot}</span> <strong>{c.displayName}</strong></span>
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
              <p style={{ margin: 0 }}>Reference: <span className="pixel" style={{ fontSize: 15 }}>{claim.reference}</span></p>
              <p style={{ margin: 0 }}>We’ve got your delivery info. We’ll deliver after the cycle ends (by {fmtDate(PRIZE.fulfillBy)}).</p>
              <ContactLine />
            </div>
          ) : claim?.status === 'fulfilled' ? (
            <p className="pixel" style={{ fontSize: 16 }}>Delivered! Enjoy your {PRIZE.name}!</p>
          ) : s.remaining === 0 ? (
            <p style={{ margin: 0 }}>All prizes claimed. Keep climbing the leaderboard and chase the Campus Cup!</p>
          ) : (
            <p style={{ margin: 0 }}>
              <strong>{Math.max(0, s.goal - points)}</strong> more points to go. Only {s.remaining} {s.remaining === 1 ? 'spot' : 'spots'} left, so hurry!
            </p>
          )}
        </div>
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>Prizes must be earned legitimately: if points are later removed and you drop below {PRIZE.goal}, your prize spot is revoked and goes to the next person who qualified.</p>
      </Panel>

      <Suggest />
    </div>
  );
}

type FieldKey = 'fullName' | 'email' | 'phone' | 'address' | 'notes';

function ClaimForm({ claim, onDone }: { claim: PrizeClaim; onDone: () => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', address: '', preference: '', notes: '' });
  const [fieldErr, setFieldErr] = useState<{ field: FieldKey; message: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PrizeClaim | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (fieldErr?.field === k) setFieldErr(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const contact = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      preference: form.preference || undefined,
      notes: form.notes.trim() || undefined,
    };
    const problem = claimContactError(contact);
    if (problem) {
      setFieldErr({ field: problem.code as FieldKey, message: problem.message });
      document.getElementById(`claim-${problem.code}`)?.focus();
      return;
    }
    setFieldErr(null);
    setBusy(true);
    try {
      setDone(await api.submitClaimInfo(contact));
      onDone();
    } catch (x) {
      const code = (x as { code?: string }).code;
      if (code && ['fullName', 'email', 'phone', 'address', 'notes'].includes(code)) setFieldErr({ field: code as FieldKey, message: errorMessage(x) });
      else setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="stack" style={{ textAlign: 'center', alignItems: 'center' }} role="status">
        <Sprite id="trophy" size={64} className="bob" />
        <strong>Treasure secured!</strong>
        <p style={{ margin: 0 }}>Reference number: <span className="pixel" style={{ fontSize: 16 }}>{done.reference}</span></p>
        <p style={{ margin: 0 }}>We’ve alerted the YAC team. Your {PRIZE.name} will be delivered after the cycle ends (by {fmtDate(PRIZE.fulfillBy)}).</p>
        <ContactLine />
      </div>
    );

  const fieldProps = (k: FieldKey) => ({
    id: `claim-${k}`,
    'aria-invalid': fieldErr?.field === k || undefined,
    'aria-describedby': fieldErr?.field === k ? `claim-${k}-err` : undefined,
  });
  const fieldError = (k: FieldKey) => (fieldErr?.field === k ? <span id={`claim-${k}-err`} className="field-error" role="alert">{fieldErr.message}</span> : null);

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div style={{ textAlign: 'center' }}>
        <Sprite id="trophy" size={64} className="bob" />
        <div className="pixel" style={{ fontSize: 18 }}>YOU DID IT! Spot #{claim.spot}</div>
        <p style={{ margin: '6px 0 0' }}>Tell us where to send your {PRIZE.name}. Only the YACquest Chairs see this.</p>
      </div>
      <label className="field"><span>Full name</span><input className="input" {...fieldProps('fullName')} value={form.fullName} onChange={set('fullName')} required autoComplete="name" />{fieldError('fullName')}</label>
      <label className="field"><span>Email</span><input className="input" type="email" {...fieldProps('email')} value={form.email} onChange={set('email')} required autoComplete="email" inputMode="email" />{fieldError('email')}</label>
      <label className="field"><span>Phone</span><input className="input" type="tel" {...fieldProps('phone')} value={form.phone} onChange={set('phone')} required autoComplete="tel" inputMode="tel" placeholder="(919) 555-0100" />{fieldError('phone')}</label>
      <label className="field">
        <span>Mailing address</span>
        <textarea className="input" rows={3} {...fieldProps('address')} value={form.address} onChange={set('address')} required autoComplete="street-address" placeholder={'Street, apt\nCity, State ZIP'} />
        {fieldError('address')}
      </label>
      <label className="field">
        <span>Gift card preference (optional)</span>
        <select value={form.preference} onChange={set('preference')}>
          <option value="">No preference</option>
          {GIFT_CARDS.map((g) => <option key={g}>{g}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Notes (optional)</span>
        <textarea className="input" rows={2} maxLength={CLAIM_LIMITS.notesMax} {...fieldProps('notes')} value={form.notes} onChange={set('notes')} />
        {fieldError('notes')}
      </label>
      <ErrorText error={err} />
      <button className="btn green" disabled={busy}>{busy ? 'Sending…' : 'Claim my treasure'}</button>
      <ContactLine />
    </form>
  );
}

function ContactLine() {
  return (
    <p className="muted" style={{ margin: 0, fontSize: 14 }}>
      Questions? Email{' '}
      {CONTACT_EMAILS.map((e, i) => (
        <span key={e}>
          {i > 0 && (i === CONTACT_EMAILS.length - 1 ? ' or ' : ', ')}
          <a href={`mailto:${e}`} className="wrap-anywhere">{e}</a>
        </span>
      ))}
      .
    </p>
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
      toast('Thanks! The YAC team will see your idea.', 'success');
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

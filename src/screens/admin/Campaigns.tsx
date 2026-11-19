/**
 * 0034 Admin → Events → "🎁 Campaigns": reusable limited reward events. A campaign = name ("Brew & Quest
 * 2026"), free item ("free coffee" / "free snack" / "free merch"), pass name ("Coffee Pass"), emoji and its
 * own outfit set; new special events start from it, and the pass, countdown and recap card use its labels.
 * Also the 📸 Recap card modal for past events (feed 1080×1350 / story 1080×1920).
 */
import { useCallback, useState } from 'react';
import * as api from '../../api';
import { Accordion } from '../../components/Blocks';
import { ShareImage } from '../../components/QuestCard';
import { ErrorText, Modal, useToast } from '../../components/ui';
import { DEFAULT_CAMPAIGN, OUTFIT_SETS, campaignInputError, fillMessage } from '../../lib/rewardEvents';
import { errorMessage } from '../../lib/useAsync';
import { RECAP_SIZE, type RecapFormat } from '../../lib/promo';
import type { RewardCampaign, YacEvent } from '../../types';

export type CampaignDraft = Omit<RewardCampaign, 'id' | 'updatedAt'> & { id?: string };

export const blankCampaign = (): CampaignDraft => ({
  name: '',
  itemLabel: 'free snack',
  passName: 'Snack Pass',
  emoji: '🍪',
  outfitSet: OUTFIT_SETS.find((s) => s.id !== DEFAULT_CAMPAIGN.outfitSet)?.id ?? OUTFIT_SETS[0].id,
  message: 'First quest: meet us at {venue}! The first {limit} people to meet us get {item} on us 🍪',
});

export function CampaignsPanel({ campaigns, onChanged, onEdit }: { campaigns: RewardCampaign[]; onChanged: () => void; onEdit: (c: CampaignDraft) => void }) {
  const toast = useToast();
  async function del(c: RewardCampaign) {
    if (!window.confirm(`Delete the campaign “${c.name}”? (Only possible while no event uses it.)`)) return;
    try {
      await api.deleteRewardCampaign(c.id);
      toast('Campaign deleted.', 'success');
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }
  return (
    <Accordion title="Campaigns" icon="🎁" summary="Reusable limited reward events (Brew & Quest…)" right={<span className="chip neutral">{campaigns.length}</span>} className="camp-acc">
      <ul className="camp-list">
        {campaigns.map((c) => (
          <li key={c.id} className="camp-row">
            <span className="camp-emoji" aria-hidden="true">{c.emoji}</span>
            <span className="camp-main">
              <b>{c.name}</b>
              <small>{c.itemLabel} · {c.passName} · {OUTFIT_SETS.find((s) => s.id === c.outfitSet)?.name ?? c.outfitSet}</small>
            </span>
            <button type="button" className="btn small ghost" onClick={() => onEdit({ ...c })}>Edit<span className="sr-only"> {c.name}</span></button>
            <button type="button" className="btn small red" onClick={() => del(c)} aria-label={`Delete ${c.name}`}>✕</button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn small" style={{ marginTop: 'var(--space-3)' }} onClick={() => onEdit(blankCampaign())}>+ New campaign</button>
      <p className="muted" style={{ margin: 'var(--space-2) 0 0', fontSize: 13 }}>
        Each campaign has its own outfit set (one free item per person per campaign). New outfit sets are added in code: see docs/SETUP.md → “Add a new outfit set”.
      </p>
    </Accordion>
  );
}

export function CampaignEditor({ draft, campaigns, onClose, onSaved }: { draft: CampaignDraft; campaigns: RewardCampaign[]; onClose: () => void; onSaved: (c: RewardCampaign) => void }) {
  const toast = useToast();
  const [f, setF] = useState<CampaignDraft>(draft);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CampaignDraft>(k: K, v: CampaignDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = campaignInputError(f, campaigns, f.id);
    if (problem) return setErr(problem);
    setBusy(true);
    setErr(null);
    try {
      const c = await api.saveRewardCampaign(f);
      toast(`Saved “${c.name}”.`, 'success');
      onSaved(c);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  const preview = fillMessage(f.message || DEFAULT_CAMPAIGN.message, { venue: 'Cup of Joe', limit: 10, itemLabel: f.itemLabel || 'free coffee' });
  return (
    <Modal open onClose={onClose} title={f.id ? `Edit campaign: ${draft.name}` : 'New campaign'}>
      <form className="stack" onSubmit={save}>
        <label className="field"><span>Campaign name</span><input className="input" value={f.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Snack Attack 2027" required /></label>
        <div className="grid-2">
          <label className="field"><span>Free item</span><input className="input" value={f.itemLabel} maxLength={40} onChange={(e) => set('itemLabel', e.target.value)} placeholder="free snack" /></label>
          <label className="field"><span>Emoji</span><input className="input" value={f.emoji} maxLength={8} onChange={(e) => set('emoji', e.target.value)} placeholder="🍪" /></label>
        </div>
        <label className="field"><span>Pass name</span><input className="input" value={f.passName} maxLength={30} onChange={(e) => set('passName', e.target.value)} placeholder="Snack Pass" /></label>
        <label className="field">
          <span>Outfit set</span>
          <select value={f.outfitSet} onChange={(e) => set('outfitSet', e.target.value)}>
            {OUTFIT_SETS.map((s) => {
              const owner = campaigns.find((c) => c.outfitSet === s.id && c.id !== f.id);
              return <option key={s.id} value={s.id}>{s.name}{owner ? ` (used by ${owner.name})` : ''}</option>;
            })}
          </select>
          <small className="muted">One outfit per campaign. Add new sets in code (docs/SETUP.md).</small>
        </label>
        <label className="field">
          <span>Default countdown message <small className="muted" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0, fontSize: 12 }}>· {'{venue} {limit} {item}'}</small></span>
          <textarea className="input" rows={3} maxLength={300} value={f.message} onChange={(e) => set('message', e.target.value)} />
          <small className="muted">Preview: “{preview}”</small>
        </label>
        <ErrorText error={err} />
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save campaign'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** 📸 Recap card for a past event: feed or story image, characters only (no names). */
export function RecapCardModal({ e, onClose }: { e: YacEvent; onClose: () => void }) {
  const [format, setFormat] = useState<RecapFormat>('feed');
  const make = useCallback(async () => {
    const [recap, card, q] = await Promise.all([api.adminEventRecap(e.id), import('../../lib/recapCard'), import('../../lib/questCard')]);
    return q.cardBlob(await card.drawRecapCard(recap, format));
  }, [e.id, format]);
  const size = RECAP_SIZE[format];
  return (
    <Modal open onClose={onClose} title={`Recap card: ${e.title}`}>
      <div className="stack">
        <div className="recap-formats" role="group" aria-label="Image size">
          <button type="button" className="btn small ghost" aria-pressed={format === 'feed'} onClick={() => setFormat('feed')}>Feed 4:5</button>
          <button type="button" className="btn small ghost" aria-pressed={format === 'story'} onClick={() => setFormat('story')}>Story 9:16</button>
        </div>
        <ShareImage key={format} make={make} fileName={`yacquest-recap-${format}.png`} alt={`Recap card for ${e.title} (${size.w}×${size.h})`} shareTitle={`${e.title} recap`}
          onClose={onClose} feed={format === 'feed'} sizeLabel={`${format === 'feed' ? 'Feed' : 'Story'}-sized (${size.w}×${size.h}). Characters only, no names.`} />
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../lib/auth';
import { badgeById } from '../../lib/badges';
import { COSMETICS, type CosmeticDef, type UnlockRule } from '../../lib/cosmetics';
import { errorMessage } from '../../lib/useAsync';
import { STAFF_COSMETICS, staffRequirementText } from '../../lib/staffRewards';
import type { CosmeticSlot, Look, StaffRewards } from '../../types';
import { Avatar, CosmeticIcon } from '../Avatar';
import { ErrorText, Loading, Panel, useToast } from '../ui';

const SECTIONS: { slot: CosmeticSlot; title: string }[] = [
  { slot: 'hat', title: 'Hats' },
  { slot: 'accessory', title: 'Jewelry' },
  { slot: 'background', title: 'Backgrounds' },
];

export function requirementText(rule: UnlockRule): string {
  switch (rule.type) {
    case 'free':
      return 'Free for everyone';
    case 'points':
      return `Reach ${rule.min} points`;
    case 'badge':
      return `Earn the ${badgeById(rule.id)?.name ?? rule.id} badge`;
    case 'badges':
      return `Collect ${rule.min} badges`;
  }
}

const sameLook = (a?: Look, b?: Look) => (a?.hat ?? '') === (b?.hat ?? '') && (a?.accessory ?? '') === (b?.accessory ?? '') && (a?.background ?? '') === (b?.background ?? '');

/** `staff` (0020): the caller's staff rewards — only ever non-null for admins/chairs; adds the Council + Hero sections. */
export function WardrobePanel({ unlocks, error, staff }: { unlocks: string[] | null; error?: string | null; staff?: StaffRewards | null }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState<Look>(user?.look ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const saved = user?.look;
  useEffect(() => {
    setDraft(saved ?? {});
  }, [saved?.hat, saved?.accessory, saved?.background]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;
  if (!unlocks) return error ? <ErrorText error={error} /> : <Loading lines={4} />;
  const have = new Set([...unlocks, ...(staff?.unlocks ?? [])]);
  const dirty = !sameLook(draft, saved);

  const toggle = (c: Pick<CosmeticDef, 'id' | 'slot'>) => {
    if (!have.has(c.id)) return;
    setErr(null);
    setDraft((d) => ({ ...d, [c.slot]: d[c.slot] === c.id ? undefined : c.id }));
  };

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.equipLook(draft);
      await refresh();
      toast('Looking sharp! Your new look is saved.', 'success');
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Panel tone="gold">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <div style={{ border: 'var(--px) solid var(--navy-900)', background: 'var(--paper)', boxShadow: 'var(--shadow)', lineHeight: 0 }}>
            <Avatar id={user.avatar} look={draft} campus={user.campus} size={160} hero={!!staff?.isHero} />
          </div>
          <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
            <button className="btn green" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save look' : 'Saved'}</button>
            {dirty && (
              <button className="btn ghost small" onClick={() => setDraft(saved ?? {})} disabled={busy}>Undo</button>
            )}
          </div>
          <ErrorText error={err} />
          <span style={{ fontSize: 14 }}>Tap an item to try it on. Tap it again to take it off.</span>
        </div>
      </Panel>

      {SECTIONS.map((s) => {
        const items = COSMETICS.filter((c) => c.slot === s.slot);
        const got = items.filter((c) => have.has(c.id)).length;
        return (
          <Panel key={s.slot} title={s.title} action={<span className="chip neutral">{got} / {items.length}</span>}>
            <div role="radiogroup" aria-label={s.title} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
              <Tile selected={!draft[s.slot]} onClick={() => setDraft((d) => ({ ...d, [s.slot]: undefined }))} label="None">
                <div style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 800, color: 'var(--text-soft)' }} aria-hidden>∅</div>
              </Tile>
              {items.map((c) => {
                const locked = !have.has(c.id);
                return (
                  <Tile key={c.id} selected={draft[c.slot] === c.id} locked={locked} onClick={() => toggle(c)} label={c.name} hint={locked ? requirementText(c.rule) : undefined}>
                    <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                      <CosmeticIcon id={c.id} size={44} campus={user.campus} locked={locked} />
                      {locked && <LockGlyph />}
                    </span>
                  </Tile>
                );
              })}
            </div>
          </Panel>
        );
      })}

      {staff && (
        <>
          <StaffSection
            title="🏛️ Council wardrobe"
            note="Staff only. Earned from your YAC staff work (all-time) or granted by a YACquest Chair."
            items={STAFF_COSMETICS.filter((c) => c.rule.type !== 'hero')}
            have={have}
            draft={draft}
            campus={user.campus}
            onToggle={toggle}
          />
          <StaffSection
            title="🦸 Hero of the Week"
            note={staff.isHero ? 'You’re the reigning Hero of the Week! These are yours until the next hero is crowned.' : 'Only for the reigning Hero of the Week. YACquest Chairs crown a hero at YAC meetings.'}
            items={STAFF_COSMETICS.filter((c) => c.rule.type === 'hero')}
            have={have}
            draft={draft}
            campus={user.campus}
            onToggle={toggle}
            gold={staff.isHero}
          />
        </>
      )}
    </div>
  );
}

function StaffSection({ title, note, items, have, draft, campus, onToggle, gold }: {
  title: string;
  note: string;
  items: typeof STAFF_COSMETICS;
  have: Set<string>;
  draft: Look;
  campus: Parameters<typeof CosmeticIcon>[0]['campus'];
  onToggle: (c: Pick<CosmeticDef, 'id' | 'slot'>) => void;
  gold?: boolean;
}) {
  const got = items.filter((c) => have.has(c.id)).length;
  return (
    <Panel title={title} tone={gold ? 'gold' : undefined} action={<span className="chip neutral">{got} / {items.length}</span>}>
      <p style={{ margin: '0 0 8px', fontSize: 14 }}>{note}</p>
      <div role="group" aria-label={title} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
        {items.map((c) => {
          const locked = !have.has(c.id);
          return (
            <Tile key={c.id} selected={draft[c.slot] === c.id} locked={locked} onClick={() => onToggle(c)} label={c.name} hint={locked ? staffRequirementText(c.rule) : undefined}>
              <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                <CosmeticIcon id={c.id} size={44} campus={campus} locked={locked} />
                {locked && <LockGlyph />}
              </span>
            </Tile>
          );
        })}
      </div>
    </Panel>
  );
}

function Tile({ selected, locked, onClick, label, hint, children }: { selected: boolean; locked?: boolean; onClick: () => void; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={locked || undefined}
      aria-label={locked ? `${label} (locked: ${hint})` : label}
      onClick={onClick}
      className="panel flat"
      style={{
        margin: 0,
        padding: '8px 4px',
        cursor: locked ? 'not-allowed' : 'pointer',
        textAlign: 'center',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        background: selected ? 'var(--gold-300)' : locked ? 'repeating-linear-gradient(45deg, rgba(11,42,91,0.05) 0 6px, transparent 6px 12px), var(--surface)' : 'var(--surface)',
        color: selected ? 'var(--navy-900)' : 'var(--text)',
        boxShadow: selected ? '0 0 0 2px var(--gold-500)' : undefined,
      }}
    >
      {children}
      <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2, opacity: locked ? 0.7 : 1 }}>{label}</span>
      {hint && <span className="muted" style={{ fontSize: 11, lineHeight: 1.2 }}>{hint}</span>}
    </button>
  );
}

/** Small pixel padlock in the corner of a locked tile. */
function LockGlyph() {
  return (
    <svg viewBox="0 0 5 6" width={18} height={22} shapeRendering="crispEdges" aria-hidden style={{ position: 'absolute', right: -8, bottom: -4 }}>
      <rect x={1} y={0} width={3} height={1} fill="#1b2340" />
      <rect x={0} y={1} width={1} height={2} fill="#1b2340" />
      <rect x={4} y={1} width={1} height={2} fill="#1b2340" />
      <rect x={0} y={2} width={5} height={4} fill="#1b2340" />
      <rect x={1} y={3} width={3} height={2} fill="#f6b93b" />
      <rect x={2} y={3} width={1} height={1} fill="#1b2340" />
    </svg>
  );
}

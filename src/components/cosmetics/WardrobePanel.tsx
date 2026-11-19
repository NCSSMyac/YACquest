import { useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import type { SeasonalHoliday } from '../../config';
import { aboutFor, holidayState, returnsLabel, seasonalItems, shortDate, untilText, type SeasonalState } from '../../lib/seasonal';
import { useAuth } from '../../lib/auth';
import { badgeById } from '../../lib/badges';
import { COSMETICS, type CosmeticDef, type UnlockRule } from '../../lib/cosmetics';
import { errorMessage } from '../../lib/useAsync';
import { STAFF_COSMETICS, staffRequirementText } from '../../lib/staffRewards';
import type { CosmeticSlot, Look, StaffRewards } from '../../types';
import { Avatar, CosmeticIcon } from '../Avatar';
import { ErrorText, Loading, Modal, Panel, useToast } from '../ui';
import { useEventRewards } from '../../lib/useEventRewards';
import { collectionGroups, collectionProgress, type CollectionGroup } from '../../lib/collection';
import { useAsync } from '../../lib/useAsync';

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
    case 'seasonal':
      return 'Limited time';
    case 'event':
      return 'Event exclusive';
  }
}

// 0034: limited-edition event outfits + seasonal items share ONE "Collection" tab (first).
type Cat = CosmeticSlot | 'collection' | 'council' | 'hero';
const CAT_IDS: string[] = ['collection', 'hat', 'accessory', 'background', 'council', 'hero', 'limited', 'seasonal'];
/** Deep link: /prize?tab=wardrobe&cat=collection (old links ?cat=limited / ?cat=seasonal open Collection too). */
export const isWardrobeCat = (v: string | null): boolean => !!v && CAT_IDS.includes(v);
const toCat = (v: string | null | undefined): Cat | null => (!v || !CAT_IDS.includes(v) ? null : v === 'limited' || v === 'seasonal' ? 'collection' : (v as Cat));
const REGULAR = COSMETICS.filter((c) => c.rule.type !== 'seasonal' && c.rule.type !== 'event');

const sameLook = (a?: Look, b?: Look) => (a?.hat ?? '') === (b?.hat ?? '') && (a?.accessory ?? '') === (b?.accessory ?? '') && (a?.background ?? '') === (b?.background ?? '');

/** `staff` (0020): the caller's staff rewards — only ever non-null for admins/chairs; adds the Council + Hero sections. */
export function WardrobePanel({ unlocks, error, staff, initialCat }: { unlocks: string[] | null; error?: string | null; staff?: StaffRewards | null; initialCat?: string | null }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState<Look>(user?.look ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 0033: NEW limited items → open on the Limited tab; remember which were new for the NEW tags, then mark them seen.
  const rewards = useEventRewards();
  const fresh = useRef<Set<string> | null>(null);
  if (fresh.current === null && rewards.unseen.length) fresh.current = new Set(rewards.unseen);
  // Default stays Hats, unless there are NEW items (then the Collection).
  const [cat, setCat] = useState<Cat>(toCat(initialCat) ?? (rewards.unseen.length ? 'collection' : 'hat'));
  const campaigns = useAsync(() => api.listRewardCampaigns().catch(() => []), []);
  const markSeen = rewards.markSeen;
  const hasUnseen = rewards.unseen.length > 0;
  // NEW items can arrive a moment after the Wardrobe opens: jump to the Collection unless a tab was picked.
  const picked = useRef(!!toCat(initialCat));
  useEffect(() => {
    if (hasUnseen && !picked.current) setCat('collection');
    if (hasUnseen) markSeen();
  }, [hasUnseen, markSeen]);
  const [about, setAbout] = useState<SeasonalHoliday | null>(null);
  const saved = user?.look;
  // 0028: opening the Wardrobe claims any seasonal item whose window is open today (the list reloads itself).
  const claimed = useRef(false);
  useEffect(() => {
    if (claimed.current || !user) return;
    claimed.current = true;
    api.claimSeasonalItems().catch(() => {});
  }, [user]);
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

  const council = STAFF_COSMETICS.filter((c) => c.rule.type !== 'hero');
  const heroItems = STAFF_COSMETICS.filter((c) => c.rule.type === 'hero');
  const groups = collectionGroups(have, campaigns.data);
  const progress = collectionProgress(groups);
  const cats: { id: Cat; label: string; got: number; total: number }[] = [
    // 0034: Limited (event outfits) + Seasonal on one collectible shelf, first
    { id: 'collection' as Cat, label: '⭐ Collection', got: progress.got, total: progress.total },
    ...SECTIONS.map((sec) => {
      const items = REGULAR.filter((c) => c.slot === sec.slot);
      return { id: sec.slot as Cat, label: sec.title, got: items.filter((c) => have.has(c.id)).length, total: items.length };
    }),
    ...(staff
      ? [
          { id: 'council' as Cat, label: '🏛️ Council', got: council.filter((c) => have.has(c.id)).length, total: council.length },
          { id: 'hero' as Cat, label: '🦸 Hero', got: heroItems.filter((c) => have.has(c.id)).length, total: heroItems.length },
        ]
      : []),
  ];
  const current = cats.some((c) => c.id === cat) ? cat : 'hat';
  const section = SECTIONS.find((sec) => sec.slot === current);

  return (
    <div className="stack">
      <Panel tone="gold" className="adm-item">
        <div className="row" style={{ alignItems: 'center', gap: 14 }}>
          <div style={{ border: 'var(--px) solid var(--navy-900)', background: 'var(--paper)', boxShadow: 'var(--shadow)', lineHeight: 0, flex: 'none' }}>
            <Avatar id={user.avatar} look={draft} campus={user.campus} size={112} hero={!!staff?.isHero} />
          </div>
          <div className="stack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14 }}>Tap an item to try it on. Tap it again to take it off.</span>
            <button className="btn green" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save look' : 'Saved'}</button>
            {dirty && (
              <button className="btn ghost small" onClick={() => setDraft(saved ?? {})} disabled={busy}>Undo</button>
            )}
          </div>
        </div>
        <ErrorText error={err} />
      </Panel>

      <div className="chip-tabs" role="tablist" aria-label="Wardrobe categories">
        {cats.map((c) => (
          <button key={c.id} type="button" role="tab" id={`wd-tab-${c.id}`} aria-selected={current === c.id} aria-controls="wd-panel" onClick={() => { picked.current = true; setCat(c.id); }}>
            {c.label} <span className="count">{c.got}/{c.total}</span>
          </button>
        ))}
      </div>

      <div id="wd-panel" role="tabpanel" aria-labelledby={`wd-tab-${current}`}>
        {section && (
          <Panel>
            <div role="radiogroup" aria-label={section.title} className="tile-grid">
              <Tile selected={!draft[section.slot]} onClick={() => setDraft((d) => ({ ...d, [section.slot]: undefined }))} label="None">
                <div style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 800, color: 'var(--text-soft)' }} aria-hidden>∅</div>
              </Tile>
              {REGULAR.filter((c) => c.slot === section.slot).map((c) => {
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
        )}
        {current === 'collection' && (
          <CollectionSection groups={groups} progress={progress} have={have} draft={draft} campus={user.campus} fresh={fresh.current} onToggle={toggle} onAbout={setAbout}
            onWearAll={(g) => setDraft((d) => ({ ...d, ...Object.fromEntries(g.items.filter((c) => have.has(c.id)).map((c) => [c.slot, c.id])) }))} />
        )}
        {staff && current === 'council' && (
          <StaffSection
            title="🏛️ Council wardrobe"
            note="Staff only. Earned from your YAC staff work (all-time) or granted by a YACquest Chair."
            items={council}
            have={have}
            draft={draft}
            campus={user.campus}
            onToggle={toggle}
          />
        )}
        {staff && current === 'hero' && (
          <StaffSection
            title="🦸 Hero of the Week"
            note={staff.isHero ? 'You’re the reigning Hero of the Week! These are yours until the next hero is crowned.' : 'Only for the reigning Hero of the Week. YACquest Chairs crown a hero at YAC meetings.'}
            items={heroItems}
            have={have}
            draft={draft}
            campus={user.campus}
            onToggle={toggle}
            gold={staff.isHero}
          />
        )}
      </div>
      {about && <AboutModal holiday={about} have={have} campus={user.campus} onClose={() => setAbout(null)} />}
    </div>
  );
}

// ───────────── 0034 Collection (limited event outfits + seasonal) ─────────────

function StateChip({ st, holiday }: { st: SeasonalState; holiday?: SeasonalHoliday }) {
  if (st.kind === 'available') return <span className="chip seasonal-chip">Limited time!</span>;
  if (st.kind === 'owned') return <span className="chip neutral">Yours to keep</span>;
  return <span className="chip neutral seasonal-returns">{returnsLabel(st, Date.now(), holiday)}</span>;
}

/** "Back Oct 25, 2027" (or nothing when no date is known: the chip already says "Returns next year"). */
function seasonalBack(g: CollectionGroup): string {
  const st = g.holiday ? holidayState(g.holiday, g.owned > 0) : null;
  return st && st.kind === 'returns' && st.next ? `${returnsLabel(st, Date.now(), g.holiday) === 'Coming soon' ? 'Arrives' : 'Back'} ${shortDate(st.next[0])}, ${st.next[0].slice(0, 4)}` : '';
}

function CollectionSection({ groups, progress, have, draft, campus, fresh, onToggle, onAbout, onWearAll }: {
  groups: CollectionGroup[];
  progress: { got: number; total: number };
  have: Set<string>;
  draft: Look;
  campus: Parameters<typeof CosmeticIcon>[0]['campus'];
  fresh: Set<string> | null;
  onToggle: (c: Pick<CosmeticDef, 'id' | 'slot'>) => void;
  onAbout: (h: SeasonalHoliday) => void;
  onWearAll: (g: CollectionGroup) => void;
}) {
  const pct = progress.total ? Math.round((100 * progress.got) / progress.total) : 0;
  return (
    <div className="stack collection">
      <Panel tone="gold" className="coll-progress">
        <span aria-hidden="true" style={{ fontSize: 30, lineHeight: 1 }}>🏆</span>
        <div className="coll-progress-text">
          <p className="coll-progress-title">Collected {progress.got} / {progress.total}</p>
          <p className="coll-progress-sub">Limited-edition event outfits and seasonal looks. Yours to keep once you have them.</p>
          <div className="coll-meter" role="progressbar" aria-label="Collection progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.got}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Panel>
      {groups.map((g) => (
        <Panel key={g.key} className={`coll-group ${g.kind} ${g.state}`}>
          {g.kind === 'event' && <span className="limited-ribbon">LIMITED EDITION · {g.set?.edition}</span>}
          <div className="coll-head">
            <h2 className="coll-title"><span aria-hidden="true">{g.emoji} </span>{g.title}{g.season && <span className="coll-season">{g.season}</span>}</h2>
            <span className="coll-count chip neutral" aria-label={`${g.owned} of ${g.total} collected`}>{g.owned}/{g.total}</span>
          </div>
          <p className="coll-when">
            {g.kind === 'event' ? (
              <span className={`chip ${g.state === 'owned' ? 'neutral' : 'coll-exclusive'}`}>{g.state === 'owned' ? 'Yours to keep' : '★ Event exclusive'}</span>
            ) : (
              g.holiday && <StateChip st={holidayState(g.holiday, g.owned > 0)} holiday={g.holiday} />
            )}
            <span>{g.kind === 'event' ? (g.state === 'owned' ? 'Wear it any time.' : 'Only from checking in at the event. Not available any other way.') : g.state === 'available' ? g.availability : g.state === 'owned' ? 'Wear it any time.' : seasonalBack(g)}</span>
          </p>
          <div role="group" aria-label={`${g.title} items`} className="coll-shelf">
            {g.items.map((c) => {
              const locked = !have.has(c.id);
              const hint = locked ? (g.kind === 'event' ? 'Event exclusive' : g.state === 'available' ? 'Opening…' : g.availability) : undefined;
              return (
                <SeasonalTile key={c.id} selected={draft[c.slot] === c.id} locked={locked} label={c.name} hint={hint}
                  onTap={() => (locked ? (g.holiday ? onAbout(g.holiday) : undefined) : onToggle(c))} onLongPress={() => g.holiday && onAbout(g.holiday)}
                  lockedNote={g.holiday ? ' (opens About this item)' : ' (locked: event exclusive)'}>
                  <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                    <CosmeticIcon id={c.id} size={44} campus={campus} locked={locked} />
                    {locked && <LockGlyph />}
                    {!locked && fresh?.has(c.id) && <span className="new-dot tile" aria-hidden="true">NEW</span>}
                  </span>
                </SeasonalTile>
              );
            })}
          </div>
          {g.kind === 'event' && <p className="limited-about"><b>About:</b> {g.about}</p>}
          <div className="coll-about-row">
            {g.kind === 'event' && g.owned > 1 && <button type="button" className="btn small blue" onClick={() => onWearAll(g)}>Try on the full set</button>}
            {g.holiday && (
              <button type="button" className="btn small ghost seasonal-about-btn" onClick={() => onAbout(g.holiday!)} data-holiday={g.holiday.id}>
                <span aria-hidden="true">ⓘ </span>About this item<span className="sr-only">: {g.holiday.name}</span>
              </button>
            )}
          </div>
        </Panel>
      ))}
      <p className="muted seasonal-tip">Tip: press and hold a seasonal item to read what it honors.</p>
    </div>
  );
}

/** Tap = try on (or About when locked); press and hold = About this item. */
function SeasonalTile({ selected, locked, label, hint, onTap, onLongPress, children, lockedNote = ' (opens About this item)' }: {
  selected: boolean;
  locked: boolean;
  label: string;
  hint?: string;
  onTap: () => void;
  onLongPress: () => void;
  children: React.ReactNode;
  lockedNote?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      type="button"
      aria-pressed={locked ? undefined : selected}
      className={`panel flat seasonal-tile${selected ? ' selected' : ''}${locked ? ' locked' : ''}`}
      onPointerDown={() => {
        longPressed.current = false;
        clear();
        timer.current = setTimeout(() => {
          longPressed.current = true;
          onLongPress();
        }, 550);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onTap();
      }}
    >
      {children}
      <span className="seasonal-tile-name">{label}</span>
      {hint && <span className="muted seasonal-tile-hint">{hint}</span>}
      {locked && <span className="sr-only">{lockedNote}</span>}
    </button>
  );
}

function AboutModal({ holiday, have, campus, onClose }: { holiday: SeasonalHoliday; have: Set<string>; campus: Parameters<typeof CosmeticIcon>[0]['campus']; onClose: () => void }) {
  const items = seasonalItems(holiday.id);
  const owned = items.some((c) => have.has(c.id));
  const st = holidayState(holiday, owned);
  return (
    <Modal open onClose={onClose} title={`About this item: ${holiday.name}`}>
      <div className="stack seasonal-about">
        <div className="seasonal-about-art">
          {items.map((c) => (
            <figure key={c.id}>
              <CosmeticIcon id={c.id} size={96} campus={campus} locked={!have.has(c.id) && st.kind === 'returns'} />
              <figcaption>
                <b>{c.name}</b>
                <span className="muted">{c.slot === 'hat' ? 'Hat' : c.slot === 'accessory' ? 'Accessory' : 'Background'}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="seasonal-about-label">
          <span className="chip t1">{holiday.emoji} {holiday.name}</span>
          <StateChip st={st} holiday={holiday} />
        </div>
        <p className="seasonal-about-text">{aboutFor(holiday)}</p>
        {holiday.itemAbout && (
          <ul className="seasonal-item-about">
            {items.filter((c) => holiday.itemAbout?.[c.id]).map((c) => (
              <li key={c.id}>
                <b>{c.name}:</b> {holiday.itemAbout![c.id]}
              </li>
            ))}
          </ul>
        )}
        {holiday.learnMore && (
          <a className="btn small blue seasonal-learn" href={holiday.learnMore.url} target="_blank" rel="noopener noreferrer">
            Learn more: {holiday.learnMore.label}<span className="sr-only"> (opens in a new tab)</span> ↗
          </a>
        )}
        {holiday.links?.map((l) => (
          <a key={l.url} className="btn small blue seasonal-learn" href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label}<span className="sr-only"> (opens in a new tab)</span> ↗
          </a>
        ))}
        <p className="muted seasonal-about-fine">
          {st.kind === 'available' ? `${untilText(st.endsOn, st.daysLeft)}. Free for everyone, and yours to keep.` : st.kind === 'owned' ? 'You have this one. Wear it any time.' : returnsLabel(st, Date.now(), holiday) === 'Coming soon' && st.kind === 'returns' && st.next ? `Not here yet: free for everyone from ${shortDate(st.next[0])} to ${shortDate(st.next[1])}.` : `Not available right now. It returns next ${holiday.season === 'winter' ? 'winter' : 'year'}.`}
        </p>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
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
      <div role="group" aria-label={title} className="tile-grid">
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

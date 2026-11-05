/**
 * App-wide celebration overlay (coin burst + optional 8-bit sound).
 * Celebrations are queued and shown one at a time.
 *
 *   const celebrate = useCelebrate();
 *   celebrate({ title: 'Quest complete!', points: 20 });
 *   celebrate({ title: 'Badge unlocked!', subtitle: 'First Steps', badgeId: 'first_checkin', size: 'big' });
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { Sprite } from '../components/Sprite';
import { badgeById } from './badges';
import { cosmeticById } from './cosmetics';
import { playCoin, playFanfare } from './sound';

export interface Celebration {
  title: string;
  subtitle?: string;
  points?: number;
  /** Show this badge's icon (src/lib/badges.ts id). */
  badgeId?: string;
  /** Show this cosmetic (src/lib/cosmetics.ts id). */
  cosmeticId?: string;
  /** 'big' = full-screen moment (badges, milestones); 'small' = quick coin pop (default). */
  size?: 'small' | 'big';
}

// BadgeIcon is optional: use it when the wardrobe/badges module provides it, else a trophy sprite.
type BadgeIconProps = { id: string; earned?: boolean; size?: number };
const badgeMods = import.meta.glob<{ BadgeIcon?: ComponentType<BadgeIconProps> }>('../components/BadgeIcon.tsx', { eager: true });
const BadgeIcon = Object.values(badgeMods)[0]?.BadgeIcon;

const SMALL_MS = 1600;

const Ctx = createContext<(c: Celebration) => void>(() => {});

type Item = Celebration & { key: number };

export function CelebrateProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Item[]>([]);
  const nextKey = useRef(1);
  const push = useCallback((c: Celebration) => {
    setQueue((q) => [...q, { ...c, key: nextKey.current++ }]);
  }, []);
  const current = queue[0];
  const done = useCallback(() => setQueue((q) => q.slice(1)), []);

  return (
    <Ctx.Provider value={push}>
      {children}
      {current && (current.size === 'big' ? <Big key={current.key} c={current} onDone={done} /> : <Small key={current.key} c={current} onDone={done} />)}
    </Ctx.Provider>
  );
}

export const useCelebrate = () => useContext(Ctx);

/** Pixel coins flying out from the center. Hidden entirely under prefers-reduced-motion (CSS). */
function Burst({ count, spread }: { count: number; spread: number }) {
  const coins = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + (i % 2 ? 0.25 : -0.1);
    const r = spread * (0.65 + ((i * 37) % 10) / 28);
    return {
      '--dx': `${Math.round(Math.cos(a) * r)}px`,
      '--dy': `${Math.round(Math.sin(a) * r * 0.75 - spread * 0.25)}px`,
      animationDelay: `${(i % 4) * 40}ms`,
    } as CSSProperties;
  });
  return (
    <div className="cel-burst" aria-hidden>
      {coins.map((s, i) => (
        <span key={i} className="cel-coin" style={s} />
      ))}
    </div>
  );
}

function Small({ c, onDone }: { c: Item; onDone: () => void }) {
  useEffect(() => {
    playCoin();
    const t = setTimeout(onDone, SMALL_MS);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="cel-small-wrap" role="status" aria-live="polite">
      <button type="button" className="cel-small" onClick={onDone} aria-label={`${c.title}${c.points ? ` +${c.points} points` : ''}. Dismiss`}>
        <Burst count={10} spread={70} />
        {c.points ? <span className="cel-plus">+{c.points}</span> : <span className="coin" aria-hidden />}
        <span className="cel-small-text">
          <b className="cel-small-title">{c.title}</b>
          {c.subtitle && <span className="cel-small-sub">{c.subtitle}</span>}
        </span>
      </button>
    </div>
  );
}

function Big({ c, onDone }: { c: Item; onDone: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    playFanfare();
    btn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDone]);
  const badge = c.badgeId ? badgeById(c.badgeId) : undefined;
  const cosmetic = cosmeticById(c.cosmeticId);

  return (
    <div className="cel-backdrop" onClick={onDone}>
      <div className="cel-big" role="dialog" aria-modal="true" aria-label={c.title} onClick={(e) => e.stopPropagation()}>
        <div className="cel-icon">
          <Burst count={18} spread={150} />
          {c.badgeId ? (
            BadgeIcon ? <BadgeIcon id={c.badgeId} earned size={72} /> : <Sprite id="trophy" size={72} />
          ) : cosmetic ? (
            <span className="cel-cosmetic">🎁</span>
          ) : (
            <Sprite id="chest" size={72} />
          )}
        </div>
        <h2 className="cel-big-title">{c.title}</h2>
        {(c.subtitle || badge) && <p className="cel-big-sub">{c.subtitle ?? badge?.name}</p>}
        {badge?.flavor && <p className="cel-big-flavor">{badge.flavor}</p>}
        {cosmetic && <p className="cel-big-flavor">New look unlocked: <b>{cosmetic.name}</b></p>}
        {c.points ? <p className="cel-big-pts"><span className="coin" aria-hidden /> +{c.points} pts</p> : null}
        <button ref={btn} type="button" className="btn" onClick={onDone}>Nice!</button>
      </div>
    </div>
  );
}

// ── "Since your last visit" bookkeeping (per user, localStorage; all failures are silent) ──
const lastKey = (userId: string) => `yacquest-last-points:${userId}`;
const shownKey = (userId: string) => `yacquest-celebrated-points:${userId}`;

function readNum(key: string): number | null {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
function writeNum(key: string, n: number | null) {
  try {
    if (n === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(n));
  } catch {
    /* ignore */
  }
}

/** Points the player had when they last saw Home (null on first visit). */
export const getLastSeenPoints = (userId: string) => readNum(lastKey(userId));
export const setLastSeenPoints = (userId: string, n: number) => writeNum(lastKey(userId), n);

/** Record points already celebrated elsewhere (e.g. the check-in pop) so Home doesn't pop them again. */
export function noteCelebratedPoints(userId: string, n: number) {
  writeNum(shownKey(userId), (readNum(shownKey(userId)) ?? 0) + n);
}
export function takeCelebratedPoints(userId: string): number {
  const n = readNum(shownKey(userId)) ?? 0;
  writeNum(shownKey(userId), null);
  return n;
}

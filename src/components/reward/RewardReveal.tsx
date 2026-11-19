/**
 * 0033 Brew & Quest "loot screen" (lazy-loaded): replaces the normal CHECKED IN pass for special reward
 * events. 1) a pixel gift box wiggles and bursts open (~1.2 s); 2) the player's OWN character in the
 * new outfit turns on a glowing pedestal (retro scaleX "spin" + bob; tap or drag to spin faster);
 * 3) a game-style unlock card ("LATTE NIGHT SCHOLAR", LIMITED EDITION ribbon, rarity chip, rewards);
 * 4) "Wear it now" + "Continue (8)" that drains and continues by itself at 0.
 * prefers-reduced-motion: no box, no spin, no confetti — a static reveal; the Continue countdown still runs.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from '../../lib/auth';
import { continueFraction, continueLeft, outfitSetById, rewardLines } from '../../lib/rewardEvents';
import { playFanfare } from '../../lib/sound';
import type { CheckInReward, Look } from '../../types';
import { Avatar } from '../Avatar';
import { gridRects } from '../cosmetics/Pixels';
import { ALL_COLORS } from '../cosmetics/compose';
import { cosmeticById } from '../../lib/cosmetics';
import './reward.css';

const GIFT_MS = 1200;

const LID = [
  '.....kk..kk.....',
  '....kgGkkGgk....',
  '.....kgGGgk.....',
  'kkkkkkkggkkkkkkk',
  'kQQQQQQggQQQQQQk',
  'kqQQQQQggQQQQQQk',
  'kkkkkkkkkkkkkkkk',
];
const BOX = [
  '.kQQQQQggQQQQQk.',
  '.kqQQQQggQQQQQk.',
  '.kQQQQQggQQQQQk.',
  '.kQQQQQggQQQQQk.',
  '.kQQQQQggQQQQQk.',
  '.krrrrrGGrrrrrk.',
  '.kkkkkkkkkkkkkk.',
];

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Set items → a Look (hat / accessory / background). */
export function lookOf(items: string[]): Look {
  const look: Look = {};
  for (const id of items) {
    const c = cosmeticById(id);
    if (c) look[c.slot] = id;
  }
  return look;
}

function GiftBox() {
  return (
    <div className="rr-gift" aria-hidden="true">
      <svg className="rr-gift-lid" viewBox="0 0 16 7" width={176} height={77} shapeRendering="crispEdges">{gridRects(LID, ALL_COLORS)}</svg>
      <svg className="rr-gift-box" viewBox="0 0 16 7" width={176} height={77} shapeRendering="crispEdges">{gridRects(BOX, ALL_COLORS)}</svg>
      <span className="rr-gift-flash" />
    </div>
  );
}

/** The player's character, turning like an old-school item spin: scaleX = cos(angle). Tap / drag = faster. */
function Spinner({ look, still }: { look: Look; still: boolean }) {
  const { user } = useAuth();
  const turn = useRef<HTMLDivElement>(null);
  const st = useRef({ angle: 0.35, boost: 0, last: 0, dragX: null as number | null });
  useEffect(() => {
    if (still) return;
    let raf = 0;
    const base = (Math.PI * 2) / 3.4; // one turn every ~3.4 s
    const step = (t: number) => {
      const s = st.current;
      const dt = s.last ? Math.min(0.05, (t - s.last) / 1000) : 0;
      s.last = t;
      s.angle += (base + s.boost) * dt;
      s.boost *= Math.pow(0.35, dt); // boost fades out
      const c = Math.cos(s.angle);
      // keep a sliver visible at the edge-on moment, like a sprite turning
      const sx = Math.sign(c || 1) * Math.max(0.06, Math.abs(c));
      if (turn.current) turn.current.style.transform = `scaleX(${sx.toFixed(3)})`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [still]);
  if (!user) return null;
  const faster = () => (st.current.boost = Math.min(st.current.boost + Math.PI * 3, Math.PI * 10));
  return (
    <div
      className="rr-stage"
      onPointerDown={(e) => {
        st.current.dragX = e.clientX;
        faster();
      }}
      onPointerMove={(e) => {
        const s = st.current;
        if (s.dragX === null) return;
        s.angle += (e.clientX - s.dragX) / 40;
        s.dragX = e.clientX;
      }}
      onPointerUp={() => (st.current.dragX = null)}
      onPointerCancel={() => (st.current.dragX = null)}
      onPointerLeave={() => (st.current.dragX = null)}
    >
      <span className="rr-rays" aria-hidden="true" />
      <div className="rr-bob">
        <div className="rr-turn" ref={turn}>
          <Avatar id={user.avatar} look={look} campus={user.campus} size={176} title={`${user.displayName} in the new outfit`} />
        </div>
      </div>
      <span className="rr-pedestal" aria-hidden="true" />
      {!still && <span className="rr-spin-hint">Tap to spin!</span>}
    </div>
  );
}

const CONFETTI_COLORS = ['#ffd97a', '#f48fbd', '#86b9ff', '#7fd8a6', '#ffffff', '#b48cf0', '#ffa36b'];

function Confetti() {
  const bits = Array.from({ length: 28 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    animationDelay: `${((i * 53) % 24) / 10}s`,
    animationDuration: `${2.6 + ((i * 29) % 15) / 10}s`,
    width: i % 3 ? 8 : 12,
    height: i % 3 ? 8 : 12,
  }) as CSSProperties);
  return (
    <div className="rr-confetti" aria-hidden="true">
      {bits.map((s, i) => <span key={i} style={s} />)}
    </div>
  );
}

export default function RewardReveal({ reward, points, eventTitle, onContinue, onWear }: {
  reward: CheckInReward;
  points: number;
  eventTitle: string;
  onContinue: () => void;
  /** Equip all pieces (equip_look). Resolves when saved. */
  onWear: (look: Look) => Promise<void>;
}) {
  const still = useRef(reducedMotion()).current;
  const set = outfitSetById(reward.outfitSet);
  const look = lookOf(reward.items);
  const [stage, setStage] = useState<'gift' | 'reveal'>(still ? 'reveal' : 'gift');
  const [startedAt, setStartedAt] = useState<number | null>(still ? Date.now() : null);
  const [now, setNow] = useState(() => Date.now());
  const [wear, setWear] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const done = useRef(false);
  const cont = useRef<HTMLButtonElement>(null);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onContinue();
  }, [onContinue]);

  useEffect(() => {
    if (stage !== 'gift') return;
    const t = setTimeout(() => {
      setStage('reveal');
      setStartedAt(Date.now() + 900); // the countdown starts once the card and buttons are in
    }, GIFT_MS);
    return () => clearTimeout(t);
  }, [stage]);
  useEffect(() => {
    if (stage === 'reveal') playFanfare();
  }, [stage]);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, []);
  const left = startedAt === null ? 8 : continueLeft(startedAt, now);
  const frac = startedAt === null ? 1 : continueFraction(startedAt, now);
  useEffect(() => {
    if (startedAt !== null && now >= startedAt && left === 0) finish();
  }, [left, now, startedAt, finish]);
  useEffect(() => {
    if (stage === 'reveal') cont.current?.focus({ preventScroll: true });
  }, [stage]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish]);

  async function wearIt() {
    setWear('busy');
    try {
      await onWear(look);
      setWear('done');
    } catch {
      setWear('error');
    }
  }

  const lines = rewardLines(points, reward.items.length, reward.badge === 'early_bird');
  return (
    <div className={`rr-wrap${still ? ' still' : ''}`} role="dialog" aria-modal="true" aria-labelledby="rr-title" aria-describedby="rr-rewards">
      {!still && stage === 'reveal' && <Confetti />}
      <div className="rr-inner">
        <p className="rr-event">{eventTitle} · checked in ✓</p>
        {stage === 'gift' ? (
          <div className="rr-gift-area">
            <GiftBox />
            <p className="rr-opening">Opening your reward…</p>
          </div>
        ) : (
          <>
            <Spinner look={look} still={still} />
            <div className="rr-card">
              <span className="rr-ribbon">LIMITED EDITION · {set.edition}</span>
              <h2 id="rr-title" className="rr-name">{set.name.toUpperCase()}</h2>
              <div className="rr-chips">
                <span className="rr-rarity">★ Limited</span>
                <span className="rr-new">NEW OUTFIT</span>
              </div>
              <ul className="rr-rewards" id="rr-rewards">
                {lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
            <div className="rr-actions">
              <button type="button" className="btn green rr-wear" onClick={wearIt} disabled={wear === 'busy' || wear === 'done'}>
                {wear === 'done' ? 'Wearing it ✓' : wear === 'busy' ? 'Putting it on…' : wear === 'error' ? 'Try again: Wear it now' : 'Wear it now'}
              </button>
              <button ref={cont} type="button" className="btn rr-continue" onClick={finish} style={{ '--drain': frac } as CSSProperties}>
                <span className="rr-drain" aria-hidden="true" />
                <span className="rr-continue-text">Continue ({left})</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

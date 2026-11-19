/**
 * 0033 Brew & Quest "loot screen" (lazy-loaded): replaces the normal CHECKED IN pass for special reward
 * events. 0034: coffee confetti (pixel beans + stars) and a café "ding" for coffee campaigns, steam on the
 * latte, a glow in the player's campus color, a speech bubble + "Share my new look" (1080×1920) after
 * "Wear it now", and the bring-a-friend card (any tap there pauses the Continue countdown). 1) a pixel gift box wiggles and bursts open (~1.2 s); 2) the player's OWN character in the
 * new outfit turns on a glowing pedestal (retro scaleX "spin" + bob; tap or drag to spin faster);
 * 3) a game-style unlock card ("LATTE NIGHT SCHOLAR", LIMITED EDITION ribbon, rarity chip, rewards);
 * 4) "Wear it now" + "Continue (8)" that drains and continues by itself at 0.
 * prefers-reduced-motion: no box, no spin, no confetti — a static reveal; the Continue countdown still runs.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from '../../lib/auth';
import { campaignColorGlow } from './glow';
import { campaignLabels, continueFraction, continueLeft, isCoffee, outfitSetById, rewardEventName, rewardLines } from '../../lib/rewardEvents';
import { speechLine } from '../../lib/promo';
import { playDing, playFanfare } from '../../lib/sound';
import type { CheckInReward, Look } from '../../types';
import { Avatar } from '../Avatar';
import { gridRects } from '../cosmetics/Pixels';
import { ALL_COLORS } from '../cosmetics/compose';
import { BringFriendCard } from '../promo/BringFriend';
import { SpeechBubble } from '../promo/SpeechBubble';
import { ShareImage } from '../QuestCard';
import { Modal } from '../ui';
import { lookOf, reducedMotion } from './lookOf';
import './reward.css';

export { lookOf, reducedMotion };

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
function Spinner({ look, still, bubble }: { look: Look; still: boolean; bubble?: string | null }) {
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
      {bubble && <SpeechBubble text={bubble} className="rr-bubble" />}
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

// 0034: tiny pixel coffee bean + star for coffee campaigns
const BEAN = ['.kkk.', 'kbbbk', 'kbcbk', 'kbcbk', 'kcbbk', 'kbbbk', '.kkk.'];
const BEAN_PAL: Record<string, string> = { k: '#2b1608', b: '#7a4521', c: '#c98a52' };
const PSTAR = ['..y..', '.yyy.', 'yywyy', '.yyy.', '..y..'];
const PSTAR_PAL: Record<string, string> = { y: '#ffd97a', w: '#ffffff' };

function Confetti({ coffee }: { coffee: boolean }) {
  const bits = Array.from({ length: coffee ? 34 : 28 }, (_, i) => ({
    kind: coffee ? (i % 3 === 0 ? 'bean' : i % 5 === 1 ? 'star' : 'bit') : 'bit',
    style: {
      left: `${(i * 37) % 100}%`,
      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      animationDelay: `${((i * 53) % 24) / 10}s`,
      animationDuration: `${2.6 + ((i * 29) % 15) / 10}s`,
      width: i % 3 ? 8 : 12,
      height: i % 3 ? 8 : 12,
    } as CSSProperties,
  }));
  return (
    <div className="rr-confetti" aria-hidden="true">
      {bits.map((b, i) =>
        b.kind === 'bit' ? (
          <span key={i} style={b.style} />
        ) : (
          <span key={i} className="rr-sprite" style={{ ...b.style, background: 'none', width: b.kind === 'bean' ? 15 : 15, height: b.kind === 'bean' ? 21 : 15 }}>
            <svg viewBox={b.kind === 'bean' ? '0 0 5 7' : '0 0 5 5'} width="100%" height="100%" shapeRendering="crispEdges">
              {gridRects(b.kind === 'bean' ? BEAN : PSTAR, b.kind === 'bean' ? BEAN_PAL : PSTAR_PAL)}
            </svg>
          </span>
        ),
      )}
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
  const { user } = useAuth();
  const set = outfitSetById(reward.outfitSet);
  const labels = campaignLabels(reward.outfitSet);
  const coffee = isCoffee({ outfitSet: reward.outfitSet, emoji: reward.pass?.emoji ?? labels.emoji });
  const look = lookOf(reward.items);
  // 0034: any tap on "bring a friend" / "share my look" stops the auto-continue (they're busy!)
  const [paused, setPaused] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const pause = useCallback(() => setPaused(true), []);
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
    if (stage !== 'reveal') return;
    playFanfare();
    if (coffee) {
      const t = setTimeout(playDing, 700); // a soft café bell after the fanfare
      return () => clearTimeout(t);
    }
  }, [stage, coffee]);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, []);
  const left = startedAt === null || paused ? 8 : continueLeft(startedAt, now);
  const frac = startedAt === null || paused ? 1 : continueFraction(startedAt, now);
  useEffect(() => {
    if (!paused && startedAt !== null && now >= startedAt && left === 0) finish();
  }, [left, now, startedAt, finish, paused]);
  useEffect(() => {
    if (stage === 'reveal') cont.current?.focus({ preventScroll: true });
  }, [stage]);
  // 0034: the red confirm-email bar steps aside while the reveal is open (shows again after)
  useEffect(() => {
    document.body.classList.add('takeover-open');
    return () => document.body.classList.remove('takeover-open');
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.rr-wrap .modal-backdrop') && finish();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish]);

  async function wearIt() {
    setWear('busy');
    pause();
    try {
      await onWear(look);
      setWear('done');
      setBubble(speechLine(coffee, Date.now()));
    } catch {
      setWear('error');
    }
  }

  const lines = rewardLines(points, reward.items.length, reward.badge === 'early_bird', !!reward.alreadyOwned);
  const eventName = rewardEventName(eventTitle);
  const makeLook = useCallback(async () => {
    const lc = await import('../../lib/lookCard');
    const { cardBlob } = await import('../../lib/questCard');
    if (!user) throw new Error('Please log in again.');
    return cardBlob(await lc.drawLookCard({ displayName: user.displayName, handle: user.handle, campus: user.campus, avatar: user.avatar, look, setName: set.name, edition: set.edition, eventName, emoji: labels.emoji }));
  }, [user, look, set.name, set.edition, eventName, labels.emoji]);
  return (
    <div className={`rr-wrap${still ? ' still' : ''}${coffee ? ' coffee' : ''}`} style={campaignColorGlow(user?.campus)} role="dialog" aria-modal="true" aria-labelledby="rr-title" aria-describedby="rr-rewards">
      {!still && stage === 'reveal' && <Confetti coffee={coffee} />}
      <div className="rr-inner">
        <p className="rr-event">{eventTitle} · checked in ✓</p>
        {stage === 'gift' ? (
          <div className="rr-gift-area">
            <GiftBox />
            <p className="rr-opening">Opening your reward…</p>
          </div>
        ) : (
          <>
            <Spinner look={look} still={still} bubble={bubble} />
            <div className="rr-card">
              <span className="rr-ribbon">LIMITED EDITION · {set.edition}</span>
              <h2 id="rr-title" className="rr-name">{set.name.toUpperCase()}</h2>
              <div className="rr-chips">
                <span className="rr-rarity">★ Limited</span>
                <span className="rr-new">{reward.alreadyOwned ? 'IN YOUR WARDROBE' : 'NEW OUTFIT'}</span>
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
                <span className="rr-continue-text">{paused ? 'Continue' : `Continue (${left})`}</span>
              </button>
            </div>
            {wear === 'done' && (
              <button type="button" className="btn blue rr-share" onClick={() => { pause(); setSharing(true); }}>
                📸 Share my new look
              </button>
            )}
            <BringFriendCard tone="dark" onEngage={pause} />
            {sharing && (
              <Modal open onClose={() => setSharing(false)} title="Share my new look">
                <ShareImage make={makeLook} fileName="yacquest-new-look.png" alt={`${user?.displayName ?? 'Your character'} in the ${set.name} outfit`} shareTitle={`I unlocked ${set.name} at ${eventName} ${labels.emoji}`} onClose={() => setSharing(false)} />
              </Modal>
            )}
          </>
        )}
      </div>
    </div>
  );
}

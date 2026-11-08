/**
 * 0028 YACquest Wrapped (#/wrapped, lazy-loaded, full screen): a tap-through story of the year.
 * Tap right / swipe left / → = next, tap left / swipe right / ← = back, press and hold (or Space / the
 * pause button) = pause. Progress bars at the top. Reduced motion: no auto-advance, simple fades only.
 * Data: my_wrapped() (participants: ranks; staff: staff stats). Pure helpers: src/lib/wrapped.ts.
 * The last slide makes the 1080×1920 "My YACquest Wrapped" image (src/lib/wrappedCard.ts) to share or save.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api';
import { campusName } from '../config';
import { Avatar } from '../components/Avatar';
import { BadgeIcon } from '../components/BadgeIcon';
import { ShareImage } from '../components/QuestCard';
import { Sprite } from '../components/Sprite';
import { ErrorText, Loading } from '../components/ui';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/useAsync';
import { canOpenWrapped, personality, wrappedSlides, wrappedWindow, type Slide } from '../lib/wrapped';
import type { WrappedData } from '../types';
import { cosmeticById } from '../lib/cosmetics';
import { staffCosmeticById } from '../lib/staffRewards';
import { AVATAR_NAMES } from '../components/Sprite';

const lookName = (id?: string) => (id ? cosmeticById(id)?.name ?? staffCosmeticById(id)?.name : undefined);
/** "Yak with Cempasúchil Crown, Papel Picado" */
function finalLook(d: WrappedData): string {
  const items = [d.look?.hat, d.look?.accessory, d.look?.background].map(lookName).filter(Boolean);
  const who = AVATAR_NAMES[d.avatar] ?? 'Adventurer';
  return items.length ? `${who} with ${items.join(', ')}` : `classic ${who}`;
}
import './wrapped.css';

const SLIDE_MS = 6500;
const HOLD_MS = 220;

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Wrapped() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState<WrappedData | null>(null);
  const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const allowed = canOpenWrapped(user?.role, Date.now(), { mock: api.isMock });

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api.myWrapped().then(
      (d) => alive && setData(d),
      (e) => alive && setErr({ code: (e as { code?: string })?.code, message: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [allowed]);

  const close = useCallback(() => nav(user?.role === 'participant' ? '/' : '/admin', { replace: true }), [nav, user?.role]);

  if (!allowed || err?.code === 'not_open') {
    const opens = new Date(wrappedWindow().opensAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' });
    return (
      <main className="wrapped wr-closed" aria-labelledby="wr-closed-title">
        <div className="wr-closed-box">
          <Sprite id="chest" size={88} className="bob" />
          <h1 id="wr-closed-title">Your Wrapped is still wrapped!</h1>
          <p>YACquest Wrapped opens on {opens}, one week before the quest ends. Keep questing until then!</p>
          <Link to="/" className="btn">Back to Home</Link>
        </div>
      </main>
    );
  }
  if (!data)
    return (
      <main className="wrapped wr-closed" aria-busy={!err}>
        <div className="wr-closed-box">
          {err ? (
            <>
              <ErrorText error={err.message} />
              <Link to="/" className="btn">Back to Home</Link>
            </>
          ) : (
            <>
              <Sprite id="yak" size={72} className="bob" />
              <p>Unwrapping your year…</p>
              <Loading lines={2} />
            </>
          )}
        </div>
      </main>
    );
  return <Story data={data} onClose={close} />;
}

function Story({ data, onClose }: { data: WrappedData; onClose: () => void }) {
  const slides = wrappedSlides(data);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [rm] = useState(reducedMotion);
  const last = slides.length - 1;
  const auto = !rm && i < last;
  const go = useCallback((n: number) => setI((cur) => Math.max(0, Math.min(last, cur + n))), [last]);
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') onClose();
      else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) { e.preventDefault(); setPaused((p) => !p); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Focus the story so arrow keys work right away; keep the page from scrolling behind it.
  useEffect(() => {
    stageRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button, a, .wr-share')) return;
    down.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    holdTimer.current = setTimeout(() => setHolding(true), HOLD_MS);
  }
  function onPointerUp(e: RPointerEvent<HTMLDivElement>) {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    const d = down.current;
    down.current = null;
    const wasHolding = holding;
    setHolding(false);
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - d.y)) return go(dx < 0 ? 1 : -1);
    if (wasHolding || Date.now() - d.t > 450) return;
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left < box.width * 0.3 ? -1 : 1);
  }
  function onPointerCancel() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    down.current = null;
    setHolding(false);
  }

  const isPaused = paused || holding;
  const s = slides[i];
  return (
    <main className={`wrapped wr-theme-${s.id}${rm ? ' wr-rm' : ''}`} aria-label="YACquest Wrapped">
      <div className="wr-bars" aria-hidden="true">
        {slides.map((x, n) => (
          <span key={x.id} className="wr-bar">
            <span
              key={`${x.id}-${n === i ? i : 'x'}`}
              className={`wr-fill${n < i ? ' done' : n === i ? (auto ? ' run' : ' done') : ''}`}
              style={n === i && auto ? { animationDuration: `${SLIDE_MS}ms`, animationPlayState: isPaused ? 'paused' : 'running' } : undefined}
              onAnimationEnd={n === i && auto ? () => go(1) : undefined}
            />
          </span>
        ))}
      </div>
      <div className="wr-top">
        <span className="wr-count" aria-live="off">{i + 1} / {slides.length}</span>
        {data.preview && <span className="wr-preview">Preview</span>}
        {!rm && i < last && (
          <button type="button" className="wr-icon" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'} aria-pressed={paused}>
            {paused ? '▶' : '❚❚'}
          </button>
        )}
        <button type="button" className="wr-icon" onClick={onClose} aria-label="Close Wrapped">✕</button>
      </div>
      <div
        ref={stageRef}
        className="wr-stage"
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <section key={s.id} className="wr-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`} aria-live="polite">
          <SlideBody s={s} data={data} />
        </section>
      </div>
      <div className="wr-nav">
        <button type="button" className="wr-navbtn" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide">◀</button>
        <span className="wr-hint">{rm || isPaused ? 'Tap or use ← → to move' : 'Hold to pause'}</span>
        <button type="button" className="wr-navbtn" onClick={() => go(1)} disabled={i === last} aria-label="Next slide">▶</button>
      </div>
    </main>
  );
}

function SlideBody({ s, data }: { s: Slide; data: WrappedData }) {
  const make = useCallback(async () => {
    const card = await import('../lib/wrappedCard');
    return card.cardBlob(await card.drawWrappedCard(data));
  }, [data]);
  if (s.id === 'share')
    return (
      <div className="wr-share">
        <p className="wr-eyebrow">{s.eyebrow}</p>
        <h2 className="wr-big wr-pop">{s.big}</h2>
        <ShareImage make={make} fileName="yacquest-wrapped.png" alt="Your YACquest Wrapped card" shareTitle="My YACquest Wrapped" className="wr-share-img" />
        <p className="wr-pun">{s.lines[0]}</p>
      </div>
    );
  const p = s.id === 'personality' ? personality(data) : null;
  return (
    <div className="wr-body">
      {(s.id === 'intro' || s.id === 'personality') && (
        <div className="wr-avatar wr-pop">
          <Avatar id={data.avatar} look={data.look} campus={data.campus} size={s.id === 'intro' ? 168 : 152} title={`${data.displayName}’s character`} />
        </div>
      )}
      <p className="wr-eyebrow">{s.eyebrow}</p>
      {s.big && <h2 className={`wr-big wr-pop${s.big.length > 10 ? ' long' : ''}${/[%#]/.test(s.big) ? ' plain' : ''}`}>{s.big}</h2>}
      {s.label && <p className="wr-label">{s.label}</p>}
      {s.badgeId && <div className="wr-badge wr-pop2"><BadgeIcon id={s.badgeId} size={84} /></div>}
      <ul className="wr-lines">
        {s.lines.map((l, n) => (
          <li key={n} className="wr-rise" style={{ animationDelay: `${0.25 + n * 0.25}s` }}>{l}</li>
        ))}
      </ul>
      {s.id === 'events' && data.favoriteCampus && data.favoriteCampus !== 'all' && <p className="wr-foot">Go {campusName(data.favoriteCampus)}! 🎉</p>}
      {p && <p className="wr-foot">Final look: {finalLook(data)}</p>}
    </div>
  );
}

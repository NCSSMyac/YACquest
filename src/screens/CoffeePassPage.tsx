/**
 * 0033 `#/coffee-pass?event=<id>` — the YACquest Coffee Pass (lazy-loaded, full screen, pass holders only).
 * Made to be read by a barista at arm's length: FREE COFFEE · #7 of 30, the person's name, the venue, the
 * SECRET WORD huge, a live ticking clock with a moving shimmer stripe (so a screenshot is obvious),
 * "Valid until 2:45 PM" (30 min after check-in), then greys out as "Pass expired". Optional "Slide to mark
 * as used" (with a plain button as the accessible alternative). Nothing for the café to do in the app.
 * Works offline right after check-in: the pass is kept in this browser session (src/lib/rewardEvents.ts).
 * 0034: ticket style (perforated notches, a stub with the pass number, a little cup stamp), labels from the
 * campaign ("Coffee Pass" / "Snack Pass"), and the bring-a-friend card underneath.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { Sprite } from '../components/Sprite';
import { useSecondTick } from '../components/RewardBanner';
import { Loading } from '../components/ui';
import { useAuth } from '../lib/auth';
import { campusColor, homePass, mergePasses, passLabels, passState, rememberPass, rememberedPasses, rewardEventName } from '../lib/rewardEvents';
import { BringFriendCard } from '../components/promo/BringFriend';
import { QUEST_TZ } from '../lib/todayEvent';
import { errorMessage } from '../lib/useAsync';
import type { CoffeePass } from '../types';
import '../components/reward/reward.css';

const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: QUEST_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: QUEST_TZ, hour: 'numeric', minute: '2-digit' });

export default function CoffeePassPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const eventId = params.get('event') ?? '';
  const nav = useNavigate();
  const [server, setServer] = useState<CoffeePass[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [local, setLocal] = useState<CoffeePass[]>(() => (user ? rememberedPasses(user.id) : []));
  useEffect(() => {
    let alive = true;
    api.myEventRewards().then(
      (r) => alive && (setServer(r.passes), setLoaded(true)),
      () => alive && setLoaded(true), // offline: the remembered copy is enough
    );
    return () => {
      alive = false;
    };
  }, []);
  const now = useSecondTick();
  const all = mergePasses(server, local);
  const pass = (eventId && all.find((p) => p.eventId === eventId)) || homePass(all, now) || all[0];

  if (!user) return null;
  if (!pass) {
    return (
      <div className="cp-wrap empty" role="main">
        {!loaded ? <Loading lines={2} /> : (
          <div className="cp-none">
            <p>No pass here. Passes go to the first people who check in at a special reward event like Brew &amp; Quest.</p>
            <Link to="/" className="btn">Back to Home</Link>
          </div>
        )}
      </div>
    );
  }
  return <PassCard pass={pass} name={user.displayName} now={now} onClose={() => nav('/', { replace: true })} onUsed={(p) => {
    rememberPass(user.id, p);
    setLocal(rememberedPasses(user.id));
    setServer((s) => s?.map((x) => (x.eventId === p.eventId ? p : x)) ?? s);
  }} />;
}

export function PassCard({ pass, name, now, onClose, onUsed }: { pass: CoffeePass; name: string; now: number; onClose: () => void; onUsed: (p: CoffeePass) => void }) {
  const state = passState(pass, now);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const color = campusColor(pass.campus);
  async function markUsed() {
    if (busy || state !== 'valid') return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.markPassUsed(pass.eventId);
      onUsed({ ...pass, usedAt: r.usedAt, usedBy: r.usedBy, secretWord: pass.secretWord });
    } catch (e) {
      const msg = errorMessage(e);
      // Offline: keep it on this phone; the café doesn't need the app to know anyway.
      if (/offline|network|fetch/i.test(msg)) onUsed({ ...pass, usedAt: new Date().toISOString(), usedBy: 'self' });
      else setErr(msg);
    } finally {
      setBusy(false);
    }
  }
  const { passName, emoji } = passLabels(pass);
  const no = String(pass.passNo).padStart(2, '0');
  return (
    <div className={`cp-wrap ${state}`} role="main" style={{ '--campus': color } as CSSProperties}>
      <div className="cp-ticket">
        <div className="cp-card" aria-labelledby="cp-title">
          <div className="cp-head">
            <span className="cp-yak" aria-hidden="true"><Sprite id="yak" size={40} /></span>
            <span className="cp-brand-wrap">
              <b className="cp-brand">YACquest {passName}</b>
              <span className="cp-org">NCSSM Young Alumni Council</span>
            </span>
            <span className="cp-stamp" aria-hidden="true">
              <span className="cp-stamp-cup">{emoji}</span>
              <span className="cp-stamp-text">{rewardEventName(pass.eventTitle).toUpperCase()}</span>
            </span>
          </div>
          <h1 id="cp-title" className="cp-item">
            {pass.item.toUpperCase()} <span className="cp-no">#{pass.passNo} <small>of {pass.limit}</small></span>
          </h1>
          <p className="cp-name">{name}</p>
          <p className="cp-venue">📍 {pass.venue === 'TBD' ? pass.eventTitle : pass.venue}</p>
          <div className="cp-word-box">
            <span className="cp-label">Today’s secret word</span>
            <span className="cp-word">{state === 'valid' ? pass.secretWord ?? '—' : '••••••'}</span>
          </div>
          <div className="cp-live" aria-hidden={state !== 'valid' || undefined}>
            <span className="cp-shimmer" aria-hidden="true" />
            <span className="cp-dot" aria-hidden="true" />
            <time className="cp-clock" dateTime={new Date(now).toISOString()} aria-label={`Live clock ${fmtClock(now)}`}>{fmtClock(now)}</time>
          </div>
          <p className="cp-valid">
            {state === 'valid' ? <>Valid until <b>{fmtTime(pass.validUntil)}</b></> : state === 'used' ? <b>Used ✓ {fmtTime(pass.usedAt!)}</b> : <b>Pass expired</b>}
          </p>
          {state === 'valid' && <SlideToUse onDone={markUsed} busy={busy} />}
          {state === 'valid' && (
            <button type="button" className="btn small ghost cp-mark" onClick={markUsed} disabled={busy}>Mark as used</button>
          )}
          {err && <p className="cp-err" role="alert">{err}</p>}
          <p className="cp-fine">Show this screen at the counter. The barista checks the secret word, the moving clock, and that it isn’t greyed out. One {pass.item.replace(/^free\s+/i, 'free ')} per person.</p>
        </div>
        <div className="cp-stub" aria-label={`Pass number ${pass.passNo} of ${pass.limit}`}>
          <span className="cp-stub-col">
            <span className="cp-stub-label">Pass no.</span>
            <b className="cp-stub-no">{no}</b>
          </span>
          <span className="cp-stub-col grow">
            <span className="cp-stub-event">{pass.eventTitle}</span>
            <span className="cp-stub-of">{pass.passNo} of {pass.limit} · admit one {emoji}</span>
          </span>
          <span className="cp-barcode" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ width: (pass.passNo * (i + 3) + i * 7) % 3 === 0 ? 4 : 2 }} />)}
          </span>
        </div>
      </div>
      <div className="cp-friend"><BringFriendCard tone="dark" /></div>
      <button type="button" className="btn cp-close" onClick={onClose}>Back to the app</button>
    </div>
  );
}

/** Optional "Slide to mark as used" (pointer). Keyboard / screen-reader users get the plain button below. */
function SlideToUse({ onDone, busy }: { onDone: () => void; busy: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const drag = useRef<{ start: number; max: number } | null>(null);
  return (
    <div className="cp-slide" ref={track} aria-hidden="true">
      <span className="cp-slide-text">{busy ? 'Saving…' : 'Slide to mark as used ▶'}</span>
      <span
        className="cp-thumb"
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={(e) => {
          const w = track.current?.clientWidth ?? 0;
          drag.current = { start: e.clientX - x, max: Math.max(0, w - 52) };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setX(Math.max(0, Math.min(d.max, e.clientX - d.start)));
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && x >= d.max * 0.85) onDone();
          setX(0);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setX(0);
        }}
      >☕</span>
    </div>
  );
}

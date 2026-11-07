/**
 * Event-day "Door mode" (#/admin/door/<eventId>, staff only, lazy-loaded): a full-screen page to prop up at
 * the door or put on a projector. Huge check-in QR + password, a live "here" counter (polls every ~5 s),
 * "N going / M here" bar, and the last few arrivals popping in. Keeps the screen awake where the browser
 * allows it (Wake Lock) and can go full screen. Helpers: src/lib/doorMode.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from '../../api';
import { campusName } from '../../config';
import { Avatar } from '../../components/Avatar';
import { Sprite } from '../../components/Sprite';
import { ErrorText, Loading } from '../../components/ui';
import { DOOR_RECENT, arrivalKey, doorProgress, doorStatus, latestArrivals, newArrivalKeys, nextPollDelay } from '../../lib/doorMode';
import { checkInUrl } from '../../lib/pendingCheckin';
import { kindPoints } from '../../lib/eventKinds';
import { qrDataUrl } from '../../lib/qr';
import { errorMessage } from '../../lib/useAsync';
import type { EventCheckin, YacEvent } from '../../types';
import './door.css';

type WakeState = 'on' | 'off' | 'unsupported';
type WakeLockLike = { release: () => Promise<void>; addEventListener?: (t: 'release', fn: () => void) => void };

/** Keeps the screen on while Door mode is open (re-acquired when the tab comes back). Never throws. */
function useWakeLock(): WakeState {
  const [state, setState] = useState<WakeState>(() => (typeof navigator !== 'undefined' && 'wakeLock' in navigator ? 'off' : 'unsupported'));
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockLike> } }).wakeLock;
    if (!wl) return;
    let lock: WakeLockLike | null = null;
    let alive = true;
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        lock = await wl.request('screen');
        if (!alive) {
          void lock.release().catch(() => {});
          return;
        }
        setState('on');
        lock.addEventListener?.('release', () => alive && setState('off'));
      } catch {
        if (alive) setState('off');
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      try {
        void lock?.release().catch(() => {});
      } catch {
        /* already released */
      }
    };
  }, []);
  return state;
}

function useFullscreen(): [boolean, () => void, boolean] {
  const can = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  const [on, setOn] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const fn = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);
  const toggle = useCallback(() => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen().catch(() => {});
    } catch {
      /* not allowed here (iOS Safari, iframes): the page still works */
    }
  }, []);
  return [on, toggle, can];
}

const timeText = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function DoorMode() {
  const { eventId = '' } = useParams();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/admin/events';
  const [event, setEvent] = useState<YacEvent | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<EventCheckin[] | null>(null);
  const [going, setGoing] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);
  const wake = useWakeLock();
  const [isFull, toggleFull, canFull] = useFullscreen();

  // The event (with its password) once.
  useEffect(() => {
    let alive = true;
    api
      .adminListEvents()
      .then((list) => {
        if (!alive) return;
        const e = list.find((x) => x.id === eventId);
        if (e) setEvent(e);
        else setLoadErr('That event wasn’t found. It may have been deleted.');
      })
      .catch((e) => alive && setLoadErr(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [eventId]);

  const url = event ? checkInUrl(event.id, event.password ?? '', event.title) : '';
  useEffect(() => {
    if (!url) return;
    let alive = true;
    qrDataUrl(url, 720)
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(''));
    return () => {
      alive = false;
    };
  }, [url]);

  // Live counter: poll check-ins + RSVPs every ~5 s (backs off while the network is down).
  useEffect(() => {
    let alive = true;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const [c, r] = await Promise.all([api.adminEventCheckins(eventId), api.adminEventRsvps(eventId)]);
        if (!alive) return;
        failures = 0;
        setStale(false);
        const added = newArrivalKeys(seen.current, c);
        seen.current = new Set(c.map(arrivalKey));
        setFresh(added);
        setCheckins(c);
        setGoing(r.length);
      } catch {
        failures++;
        if (alive) setStale(true);
      }
      setNow(Date.now());
      if (alive) timer = setTimeout(tick, nextPollDelay(failures));
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [eventId]);

  function exit() {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch {
      /* ignore */
    }
    nav(from);
  }

  if (loadErr) {
    return (
      <div className="door">
        <div className="door-msg panel">
          <ErrorText error={loadErr} />
          <Link to="/admin/events" className="btn">Back to events</Link>
        </div>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="door">
        <div className="door-msg"><Loading lines={3} /></div>
      </div>
    );
  }

  const here = checkins?.length ?? 0;
  const prog = doorProgress(going ?? 0, here);
  const recent = latestArrivals(checkins ?? [], DOOR_RECENT);
  const status = doorStatus(event, now);
  const opensAt = new Date(new Date(event.startsAt).getTime() - 30 * 60_000).toISOString();

  return (
    <div className="door">
      <header className="door-bar">
        <button type="button" className="btn small ghost door-exit" onClick={exit}>✕ Exit</button>
        <span className={`door-status ${status}`}>
          <span className="door-dot" aria-hidden="true" />
          {status === 'open' ? 'Check-in open' : status === 'early' ? `Opens ${timeText(opensAt)}` : 'Check-in closed'}
        </span>
        <span className="door-bar-right">
          {wake === 'on' && <span className="door-wake" title="This screen won’t go to sleep while Door mode is open">☀ Awake</span>}
          {canFull && (
            <button type="button" className="btn small navy" onClick={toggleFull} aria-pressed={isFull}>
              {isFull ? '⤡ Exit full screen' : '⤢ Full screen'}
            </button>
          )}
        </span>
      </header>

      <main className="door-main">
        <section className="door-scan" aria-label="Scan to check in">
          <h1 className="door-title">{event.title}</h1>
          <p className="door-when">
            {timeText(event.startsAt)} – {timeText(event.endsAt)} · {event.location}
            {event.campus !== 'all' ? ` · ${campusName(event.campus)}` : ''}
          </p>
          <div className="door-qr">
            {qr ? <img src={qr} alt={`QR code to check in to ${event.title}`} /> : qr === '' ? <p className="muted">QR unavailable: use the password.</p> : <Loading lines={1} />}
          </div>
          <div className="door-pw">
            <span className="door-pw-label">Scan, or enter the password</span>
            <span className="door-pw-value">{event.password}</span>
          </div>
        </section>

        <section className="door-live" aria-label="Live check-ins">
          <div className="door-count" aria-live="polite">
            <span className="door-yak bob" aria-hidden="true"><Sprite id="yak" size={56} /></span>
            <span className="door-count-num" key={here}>{checkins ? here : '–'}</span>
            <span className="door-count-lbl">{here === 1 ? 'adventurer here' : 'adventurers here'}</span>
          </div>
          <div className="door-progress">
            <div
              className="door-bar-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={prog.pct}
              aria-label={prog.label}
            >
              <span style={{ width: `${prog.pct}%` }} />
            </div>
            <div className="door-progress-text">
              <span><b>{going ?? '–'}</b> going</span>
              <span><b>{here}</b> here{prog.walkIns > 0 ? ` (+${prog.walkIns} walk-in${prog.walkIns === 1 ? '' : 's'})` : ''}</span>
            </div>
          </div>
          <h2 className="door-sub">Just arrived</h2>
          {!checkins ? (
            <Loading lines={2} />
          ) : recent.length === 0 ? (
            <p className="door-empty">Be the first to check in! 🐂</p>
          ) : (
            <ul className="door-recent">
              {recent.map((a) => {
                const k = arrivalKey(a);
                return (
                  <li key={k} className={fresh.has(k) ? 'pop' : undefined}>
                    <Avatar id={a.avatar} look={a.look} campus={a.campus} size={40} title={a.displayName} />
                    <span className="door-name">{a.displayName}</span>
                    <span className="door-time">{timeText(a.checkedInAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {stale && <p className="door-stale" role="status">Reconnecting… the count may be a little behind.</p>}
          <p className="door-tip">
            <span className="chip t1">+{kindPoints(event.kind)} pts</span>
            <span>Open your phone camera, scan the code, done! No account yet? It walks you through sign-up.</span>
          </p>
        </section>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { CheckInConfirm } from '../components/CheckInConfirm';
import { Sprite } from '../components/Sprite';
import { ErrorText, Loading, Panel } from '../components/ui';
import { useAuth } from '../lib/auth';
import { noteCelebratedPoints } from '../lib/celebrate';
import { peekPendingCheckIn, savePendingCheckIn } from '../lib/pendingCheckin';
import { errorMessage } from '../lib/useAsync';

type Result = { ok: true; points: number; at: Date } | { ok: false; error: string };

/**
 * `#/checkin?event=<eventId>&code=<password>` — what an event's QR code opens (Admin → Events → QR code).
 * Logged in: checks in right away. Logged out: remembers it and sends the person to log in;
 * App's PendingCheckInRedirect brings them back here once they're in.
 */
export default function CheckInLink() {
  const { user, ready } = useAuth();
  const [params] = useSearchParams();
  const eventId = params.get('event')?.trim() ?? '';
  const code = params.get('code')?.trim() ?? '';
  const [title, setTitle] = useState(params.get('title')?.trim() || '');
  const [result, setResult] = useState<Result | null>(null);
  const started = useRef(false);
  const nav = useNavigate();
  const [showPass, setShowPass] = useState(true);

  useEffect(() => {
    if (!ready || !user || !eventId || !code || started.current) return;
    started.current = true;
    api.listEvents('all').then(
      (evs) => {
        const t = evs.find((e) => e.id === eventId)?.title;
        if (t) setTitle(t);
      },
      () => {},
    );
    api.checkIn(eventId, code).then(
      (r) => {
        setResult({ ok: true, points: r.points, at: new Date() });
        noteCelebratedPoints(user.id, r.points);
      },
      (e) => setResult({ ok: false, error: errorMessage(e) }),
    );
  }, [ready, user, eventId, code]);

  if (!ready) return <div className="app-shell"><Loading /></div>;
  if (eventId && code && !user) {
    savePendingCheckIn({ eventId, code, title: title || undefined });
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell" style={{ paddingTop: 24 }}>
      {/* Full-screen "CHECKED IN ✓" pass with coins + a live clock (replaces the small pop). */}
      {result?.ok && showPass && (
        <CheckInConfirm
          pass={{ eventTitle: title || 'YAC event', points: result.points, checkedInAt: result.at }}
          onDone={() => {
            setShowPass(false);
            nav('/', { replace: true });
          }}
        />
      )}
      <div className="stack">
        <div className="center">
          <Sprite id="yak" size={80} className="bob" />
        </div>
        <Panel title={title ? `Check in: ${title}` : 'Event check-in'} tone={result?.ok ? 'gold' : undefined}>
          <div className="stack">
            {!eventId || !code ? (
              <ErrorText error="This check-in link is incomplete. Scan the QR code again, or check in on the Quests page with the event password." />
            ) : !result ? (
              <>
                <p style={{ margin: 0 }}>Checking you in…</p>
                <Loading lines={1} />
              </>
            ) : result.ok ? (
              <p style={{ margin: 0, fontSize: 18 }}>
                ✅ You’re checked in! <b>+{result.points} points</b>
              </p>
            ) : (
              <ErrorText error={result.error} />
            )}
            <Link className="btn block" to="/" replace>Go to Home</Link>
            {result && !result.ok && <Link className="btn block blue" to="/earn" replace>See events</Link>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Shown on Login / Signup when a scanned check-in is waiting for the person to log in. */
export function PendingCheckInBanner() {
  const [pending] = useState(() => peekPendingCheckIn());
  if (!pending) return null;
  return (
    <Panel tone="gold">
      <p style={{ margin: 0 }}>
        📍 Log in or create an account to check in to <b>{pending.title || 'the event'}</b>.
      </p>
    </Panel>
  );
}

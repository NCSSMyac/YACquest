/**
 * Full-screen "CHECKED IN ✓" pass shown after any successful check-in (Quests password entry and the
 * QR deep link). The live ticking clock lets door staff tell it's not a screenshot.
 * Coins use the celebration system's Burst (hidden under prefers-reduced-motion, like everywhere else).
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Burst } from '../lib/celebrate';
import { playCoin } from '../lib/sound';
import { QUEST_TZ } from '../lib/todayEvent';
import { Avatar } from './Avatar';

export interface CheckInPass {
  eventTitle: string;
  points: number;
  checkedInAt: Date;
}

const fmtWhen = (d: Date) =>
  d.toLocaleString('en-US', { timeZone: QUEST_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtClock = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: QUEST_TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });

export function CheckInConfirm({ pass, onDone }: { pass: CheckInPass; onDone: () => void }) {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const btn = useRef<HTMLButtonElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    playCoin();
    btn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ci-pass-wrap" role="dialog" aria-modal="true" aria-labelledby="ci-pass-title">
      <div className="ci-pass">
        <div className="ci-pass-burst"><Burst count={18} spread={150} /></div>
        <h2 id="ci-pass-title" className="ci-pass-title">CHECKED IN <span aria-hidden>✓</span></h2>
        <p className="ci-pass-event">{pass.eventTitle}</p>
        <p className="ci-pass-when">Checked in {fmtWhen(pass.checkedInAt)}</p>
        {user && (
          <div className="ci-pass-who">
            <Avatar id={user.avatar} look={user.look} campus={user.campus} size={64} />
            <div style={{ minWidth: 0 }}>
              <b className="ci-pass-name">{user.displayName}</b>
              <div className="ci-pass-handle">@{user.handle}</div>
            </div>
          </div>
        )}
        <p className="ci-pass-pts"><span className="coin" aria-hidden /> +{pass.points} points</p>
        <div className="ci-pass-clock" aria-label={`Current time ${fmtClock(now)}`}>
          <span className="ci-live-dot" aria-hidden /> <time dateTime={now.toISOString()}>{fmtClock(now)}</time>
        </div>
        <p className="ci-pass-hint">Live clock: show this screen at the door if asked.</p>
        <button ref={btn} type="button" className="btn block" onClick={() => done.current()}>Done</button>
      </div>
    </div>
  );
}

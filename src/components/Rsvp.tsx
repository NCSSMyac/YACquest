/**
 * 0022: "I'm going" / "Going ✓" toggle on an upcoming event card, with a small "12 going" count.
 * No points. Closes when the event starts (the server says `closed`). The card's Add to calendar button
 * (passed in as `calendar`) sits on the same line, so it's right there when you tap "I'm going".
 */
import { useEffect, useState, type ReactNode } from 'react';
import * as api from '../api';
import { errorMessage } from '../lib/useAsync';
import { useToast } from './ui';

export function RsvpRow({ e, calendar }: { e: { id: string; title: string; goingCount: number; myRsvp: boolean }; calendar: ReactNode }) {
  const toast = useToast();
  const [going, setGoing] = useState(e.myRsvp);
  const [count, setCount] = useState(e.goingCount);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setGoing(e.myRsvp);
    setCount(e.goingCount);
  }, [e.myRsvp, e.goingCount]);

  async function toggle() {
    const next = !going;
    setBusy(true);
    // optimistic, rolled back on error
    setGoing(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const r = await api.setRsvp(e.id, next);
      setGoing(r.going);
      setCount(r.goingCount);
      if (next) toast('See you there! Add it to your calendar so you don’t forget.', 'success');
    } catch (x) {
      setGoing(!next);
      setCount(e.goingCount);
      toast(errorMessage(x), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rsvp-row">
      <button
        type="button"
        className={`btn small ${going ? 'green' : 'blue'}`}
        aria-pressed={going}
        aria-label={going ? `Going to ${e.title}. Tap to cancel your RSVP.` : `RSVP: I'm going to ${e.title}`}
        disabled={busy}
        onClick={toggle}
      >
        {going ? 'Going ✓' : 'I’m going'}
      </button>
      <span className="muted rsvp-count" aria-live="polite">{count} going</span>
      {calendar}
    </div>
  );
}

/**
 * Event-today reminder: if the signed-in person RSVP'd to an event happening today (Eastern time)
 * and hasn't checked in yet, the bell gets a dot and Home / Notifications show a one-line chip
 * linking to the event on the Quest Board. Loaded once in Layout and shared through context.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { fmtEventTime, todayRsvpEvent, type TodayCandidate } from '../lib/todayEvent';
import { useAsync } from '../lib/useAsync';

type TodayEv = TodayCandidate & { location: string };
const Ctx = createContext<TodayEv | null>(null);

export function TodayEventProvider({ children }: { children: ReactNode }) {
  const { data } = useAsync(() => api.listEvents('upcoming'), [], { live: true });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(i);
  }, []);
  return <Ctx.Provider value={todayRsvpEvent(data, now)}>{children}</Ctx.Provider>;
}

export const useTodayEvent = () => useContext(Ctx);

/** "📅 Today: Pickleball at 2:00 PM · Check in" → the event's card on the Quest Board. */
export function TodayChip() {
  const e = useTodayEvent();
  if (!e) return null;
  return (
    <Link to={`/earn?event=${encodeURIComponent(e.id)}`} className="today-chip">
      <span className="today-chip-fixed"><span aria-hidden="true">📅 </span>Today:</span>
      <b className="today-chip-title">{e.title}</b>
      <span className="today-chip-fixed">at {fmtEventTime(e.startsAt)}</span>
      <span className="today-chip-cta">· Check in<span aria-hidden="true"> ▶</span></span>
    </Link>
  );
}

/**
 * 0033 Brew & Quest countdown banners (Home, and on the event's card in the Quest Board).
 * Before the start: "☕ Brew & Quest starts in 1d 3h 12m" + the message. During: "☕ First quest: meet us
 * at Cup of Joe! … · 1:23:45 left". Never says how many passes are left. Ticks every second, pauses
 * while the tab is hidden; no motion besides the changing digits (reduced-motion safe).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { campusName, type CampusId } from '../config';
import { useAuth } from '../lib/auth';
import { countdown, rewardBanners, rewardEventName } from '../lib/rewardEvents';
import { useAsync } from '../lib/useAsync';
import type { EventReward, YacEvent } from '../types';
import { CosmeticIcon } from './Avatar';

/** Date.now(), refreshed every second while the page is visible. */
export function useSecondTick(active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer || document.visibilityState === 'hidden') return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVis = () => (document.visibilityState === 'hidden' ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active]);
  return now;
}

type BannerEvent = Pick<YacEvent, 'id' | 'title' | 'campus' | 'startsAt' | 'endsAt'> & { reward: EventReward };

/** One countdown card. `compact` = the line inside a Quest Board event card (no link, no campus chip). */
export function RewardBanner({ e, now, compact, own }: { e: BannerEvent; now: number; compact?: boolean; own?: boolean }) {
  const c = countdown(e, now);
  if (c.phase === 'over') return null;
  const live = c.phase === 'live';
  const name = rewardEventName(e.title);
  const where = e.campus === 'all' ? 'All campuses' : campusName(e.campus as CampusId);
  const body = (
    <>
      <span className="bq-cup" aria-hidden="true"><CosmeticIcon id="latte_aplus" size={compact ? 34 : 44} /></span>
      <span className="bq-text">
        {live ? (
          <>
            <span className="bq-head">☕ {c.message}</span>
            <span className="bq-sub">
              <span className="bq-live">● LIVE</span> <b className="bq-clock">{c.clock}</b> left
            </span>
          </>
        ) : (
          <>
            <span className="bq-head">☕ {name} starts in <b className="bq-clock">{c.clock}</b></span>
            <span className="bq-sub">{c.message}</span>
          </>
        )}
        {!compact && (
          <span className="bq-meta">
            <span className={`chip ${own ? 't1' : 'neutral'}`}>{where}</span> {e.reward.venue !== 'TBD' ? `📍 ${e.reward.venue}` : '📍 Venue coming soon'}
            <span className="bq-cta">{live ? 'Check in' : 'Details'}<span aria-hidden="true"> ▶</span></span>
          </span>
        )}
      </span>
    </>
  );
  const cls = `bq-banner${live ? ' live' : ''}${compact ? ' compact' : ''}${own ? ' own' : ''}`;
  if (compact) return <div className={cls}>{body}</div>;
  return (
    <Link to={`/earn?event=${encodeURIComponent(e.id)}`} className={cls}>
      {body}
    </Link>
  );
}

/** Home: every upcoming/live special event (own campus first). */
export function HomeRewardBanners() {
  const { user } = useAuth();
  const { data } = useAsync(() => api.listEvents('upcoming'), [], { live: true });
  const now = useSecondTick(!!data?.some((e) => e.reward));
  const list = rewardBanners(data, user?.campus, now).slice(0, 3);
  if (!list.length) return null;
  return (
    <section className="bq-stack" aria-label="Brew & Quest">
      {list.map((e) => (
        <RewardBanner key={e.id} e={e} now={now} own={e.campus === user?.campus || e.campus === 'all'} />
      ))}
    </section>
  );
}

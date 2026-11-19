/**
 * 0033: what happens right after check_in() succeeds at a special reward event (Quests password or QR link).
 * Remembers the pass + the NEW outfit on this device first (so it survives a dropped connection), then
 * shows the lazy-loaded reveal takeover. Continue → pass holders go to the Coffee Pass, everyone else Home.
 */
import { Suspense, lazy, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../api';
import { useAuth } from '../../lib/auth';
import { rememberNewOutfit, rememberPass } from '../../lib/rewardEvents';
import type { CheckInReward, Look } from '../../types';

const RewardReveal = lazy(() => import('./RewardReveal'));

export function RewardCheckIn({ reward, points, eventTitle, onClose }: { reward: CheckInReward; points: number; eventTitle: string; onClose?: () => void }) {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const saved = useRef(false);
  useEffect(() => {
    if (!user || saved.current) return;
    saved.current = true;
    if (reward.pass) rememberPass(user.id, reward.pass);
    rememberNewOutfit(user.id, reward.items);
  }, [user, reward]);
  async function wear(look: Look) {
    await api.equipLook(look);
    await refresh();
  }
  function next() {
    onClose?.();
    if (reward.pass) nav(`/coffee-pass?event=${encodeURIComponent(reward.pass.eventId)}`, { replace: true });
    else nav('/', { replace: true });
  }
  return (
    <Suspense fallback={<div className="rr-wrap-loading" aria-hidden="true" />}>
      <RewardReveal reward={reward} points={points} eventTitle={eventTitle} onContinue={next} onWear={wear} />
    </Suspense>
  );
}

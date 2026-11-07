/**
 * 0026 welcome tour: shown once, right after a person's first login. Remembered on the server
 * (profiles.tour_done_at via mark_tour_done()); this device also remembers it, which is the
 * fallback when the server doesn't have 0026 yet. "Replay the tour" (Me, Help) opens it any time.
 */
import { useEffect, useState } from 'react';
import { CYCLE, PRIZE, TIER_LABELS, TIER_POINTS, type Tier } from '../config';
import { ACTIVITIES } from './activities';
import { fmtCycleRange } from './format';

const key = (userId: string) => `yacquest-tour-done:${userId}`;

export function localTourDone(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === '1';
  } catch {
    return false;
  }
}

export function setLocalTourDone(userId: string) {
  try {
    localStorage.setItem(key(userId), '1');
  } catch {
    /* private mode: the server flag still works */
  }
}

/**
 * Show the tour automatically? Only when the server says "not yet" (null) — or, on a server without
 * 0026 (undefined), when this device hasn't seen it. A local "done" always wins (e.g. the server call failed).
 */
export function shouldAutoShowTour(user: { tourDoneAt?: string | null } | null | undefined, localDone: boolean): boolean {
  if (!user || localDone) return false;
  return user.tourDoneAt === null || user.tourDoneAt === undefined;
}

// ── "Replay the tour" from anywhere (Me, Help) ──
let replayRequested = false;
const listeners = new Set<() => void>();

export function requestTour() {
  replayRequested = true;
  listeners.forEach((fn) => fn());
}

/** true while a replay was requested and not yet closed. */
export function useTourRequest(): [boolean, () => void] {
  const [open, setOpen] = useState(replayRequested);
  useEffect(() => {
    const on = () => setOpen(true);
    listeners.add(on);
    if (replayRequested) setOpen(true);
    return () => {
      listeners.delete(on);
    };
  }, []);
  return [
    open,
    () => {
      replayRequested = false;
      setOpen(false);
    },
  ];
}

export interface TourStep {
  id: 'points' | 'checkin' | 'badges' | 'prizes' | 'admin';
  title: string;
}

/** 4 steps for everyone, one more (the Admin tab) for staff. */
export function tourSteps(isStaff: boolean): TourStep[] {
  const steps: TourStep[] = [
    { id: 'points', title: 'Earn points' },
    { id: 'checkin', title: 'Check in at events' },
    { id: 'badges', title: 'Collect badges & dress up' },
    { id: 'prizes', title: 'Win prizes' },
  ];
  if (isStaff) steps.push({ id: 'admin', title: 'Your Admin tab' });
  return steps;
}

const EXAMPLE_ORDER: Record<string, number> = { event_password: 0, photo: 1, lead_award: 2, screenshot: 3, referral: 4 };

/** Tier rows for step 1, from config + the activity list: points and two example quests each. */
export function tierExamples(): { tier: Tier; label: string; points: number; examples: string[] }[] {
  return ([1, 2, 3] as Tier[]).map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    points: TIER_POINTS[tier],
    // Events and photos first (what most people do), then the rest in list order.
    examples: ACTIVITIES.filter((a) => a.tier === tier)
      .map((a, i) => ({ a, rank: (EXAMPLE_ORDER[a.method] ?? 9) * 100 + i }))
      .sort((x, y) => x.rank - y.rank)
      .slice(0, 2)
      .map((x) => x.a.title),
  }));
}

/** Step 4 text: "The first 4 people to reach 350 points win a $75 gift card." */
export const prizeLine = () => `The first ${PRIZE.count} people to reach ${PRIZE.goal} points each win a ${PRIZE.name}.`;
export const questDates = () => fmtCycleRange(CYCLE.displayStart, CYCLE.end);

/**
 * "Start here" tips for brand-new adventurers (0 points, nothing submitted). Shown where Home,
 * Badges and the Quest Board would otherwise look empty; they disappear after the first activity.
 */
import { INSTAGRAM_HANDLE, TIER_POINTS } from '../config';

export function isNewAdventurer(d: { points: number; recentLedger: readonly unknown[]; recentSubmissions: readonly unknown[] } | null | undefined): boolean {
  if (!d) return false;
  return d.points === 0 && d.recentLedger.length === 0 && d.recentSubmissions.length === 0;
}

export interface StarterTip {
  icon: string;
  text: string;
  /** In-app route, an https URL (opens in a new tab), or 'copy-code' (copies the friend code). */
  to: string;
  cta: string;
}

export function starterTips(instagramUrl: string): StarterTip[] {
  return [
    { icon: '📷', text: `Follow ${INSTAGRAM_HANDLE} for your first ${TIER_POINTS[3]} points`, to: instagramUrl, cta: 'Open' },
    { icon: '📅', text: `RSVP to the next event, then check in there for +${TIER_POINTS[2]}`, to: '/earn', cta: 'Events' },
    { icon: '🤝', text: `Share your friend code — you both get ${TIER_POINTS[1]} when they come to an event`, to: 'copy-code', cta: 'Copy code' },
  ];
}

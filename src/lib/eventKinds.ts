import { TIER_LABELS, TIER_POINTS, type Tier } from '../config';
import type { YacEvent } from '../types';

/**
 * Event kinds ARE the three point tiers from the YAC plan. The admin picks one when
 * creating an event and everyone who checks in earns that tier's points.
 * Campus is chosen separately. Must match supabase/migrations/0005_event_tiers.sql.
 */
export const EVENT_KINDS: { id: YacEvent['kind']; tier: Tier; label: string; activityId: string; help: string }[] = [
  {
    id: 'high_impact',
    tier: 1,
    label: 'High-Impact Engagement',
    activityId: 'cross_campus_event',
    help: 'Big events: cross-campus gatherings, signature YAC events, fundraisers.',
  },
  {
    id: 'active',
    tier: 2,
    label: 'Active Participation',
    activityId: 'home_event',
    help: 'Regular in-person events: socials, game nights, sports, panels, mentorship circles, service.',
  },
  {
    id: 'digital',
    tier: 3,
    label: 'Digital Connection',
    activityId: 'digital_event',
    help: 'Digital events: Zoom calls, online trivia, livestreams.',
  },
];

export const kindInfo = (kind: YacEvent['kind']) => EVENT_KINDS.find((k) => k.id === kind) ?? EVENT_KINDS[1];
export const kindTier = (kind: YacEvent['kind']): Tier => kindInfo(kind).tier;
export const kindPoints = (kind: YacEvent['kind']) => TIER_POINTS[kindTier(kind)];
export const kindShort = (kind: YacEvent['kind']) => TIER_LABELS[kindTier(kind)];

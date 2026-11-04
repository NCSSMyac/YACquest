import { TIER_POINTS, type Tier } from '../config';
import type { YacEvent } from '../types';
import { activityById } from './activities';

/**
 * Event kinds = the proposal's event point categories.
 * Picking a kind decides the points; cross-campus events are always for all campuses.
 * Must match supabase/migrations/0002_event_kinds.sql.
 */
export const EVENT_KINDS: { id: YacEvent['kind']; label: string; activityId: string; help: string }[] = [
  { id: 'home', label: 'Home-campus event', activityId: 'home_event', help: 'A YAC event on one campus (socials, game nights, service, sports).' },
  { id: 'cross_campus', label: 'Cross-campus event', activityId: 'cross_campus_event', help: 'An official event for all three campuses.' },
  { id: 'panel', label: 'Panel / mentorship circle', activityId: 'panel_mentorship', help: 'Alumni panels, speaker nights and mentorship circles on one campus.' },
];

export const kindInfo = (kind: YacEvent['kind']) => EVENT_KINDS.find((k) => k.id === kind) ?? EVENT_KINDS[0];
export const kindTier = (kind: YacEvent['kind']): Tier => activityById(kindInfo(kind).activityId)!.tier;
export const kindPoints = (kind: YacEvent['kind']) => TIER_POINTS[kindTier(kind)];

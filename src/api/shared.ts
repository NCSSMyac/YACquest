/**
 * Types and helpers shared by the mock API (mock.ts) and the Supabase API (live.ts).
 * Both must export the same functions — index.ts checks this at compile time.
 */
import type { CampusId } from '../config';
import type { Activity, AvatarId, LeaderRow, PrizeStatus, Role, Submission, User, YacEvent } from '../types';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// ── change notifications (header badge, live counters) ──
const listeners = new Set<() => void>();
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitChange() {
  listeners.forEach((fn) => fn());
}

export interface SignupInput {
  handle: string;
  displayName: string;
  email: string;
  password: string;
  campus: CampusId;
  avatar: AvatarId;
  friendCode?: string;
  acceptedRules: boolean;
}

/** Live backend: the account exists but can't log in until the email link is clicked. */
export interface SignupResult {
  user: User | null;
  needsEmailConfirmation: boolean;
}

export interface QueueItem extends Submission {
  user: Pick<User, 'id' | 'displayName' | 'campus' | 'handle'>;
  activity: Activity;
  eventTitle?: string;
}

export interface AdminUserRow {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  campus: CampusId;
  role: Role;
  points: number;
}

export interface AdminOverview {
  participants: number;
  activeThisWeek: number;
  pointsThisWeek: number;
  pendingReviews: number;
  newSignupsThisWeek: number;
  prize: PrizeStatus;
  nearGoal: LeaderRow[];
}

export type EventInput = Omit<YacEvent, 'id' | 'attendeeCount' | 'activityId'> & { password: string };

export interface TeamMember {
  id: string;
  displayName: string;
  handle: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

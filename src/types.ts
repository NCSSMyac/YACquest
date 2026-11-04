/**
 * Shared data shapes. These match the "YACquest: Data Model & API Contract" doc,
 * so the backend team and the front end agree on field names.
 */
import type { CampusId, Tier } from './config';

export type Role = 'participant' | 'campus_lead' | 'chair';

export type AvatarId = 'yak' | 'knight' | 'mage' | 'ranger';

export interface User {
  id: string;
  handle: string; // login name, unique
  displayName: string;
  email: string;
  campus: CampusId;
  role: Role;
  avatar: AvatarId;
  friendCode: string; // e.g. YAC-7Q2K
  referredBy?: string; // user id
  createdAt: string;
  emailOptIn: boolean;
}

/** How an activity is verified. */
export type VerifyMethod =
  | 'event_password' // check in at an event with the password the lead announces
  | 'screenshot' // upload proof, reviewed by a lead
  | 'photo' // upload event photo, reviewed by a lead
  | 'lead_award' // campus lead awards it (e.g. winning a game)
  | 'referral'; // automatic when a referred friend attends their first event

export interface Activity {
  id: string;
  tier: Tier;
  title: string;
  description: string;
  method: VerifyMethod;
  /** Short cap description shown to participants, e.g. "1 per week". */
  limitLabel?: string;
}

export interface YacEvent {
  id: string;
  title: string;
  campus: CampusId | 'all';
  crossCampus: boolean;
  kind: 'social' | 'panel' | 'service' | 'game_night';
  location: string;
  startsAt: string;
  endsAt: string;
  /** Check-in window closes this long after endsAt. */
  checkInGraceMinutes: number;
  /** Only visible to leads/chair. Participants never receive it from the API. */
  password?: string;
  activityId: string; // which activity the check-in earns
  attendeeCount: number;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface Submission {
  id: string;
  userId: string;
  activityId: string;
  eventId?: string;
  imageUrl: string; // data URL in the mock; object storage URL in production
  note: string;
  status: SubmissionStatus;
  reviewerId?: string;
  reviewReason?: string;
  createdAt: string;
  reviewedAt?: string;
}

export type LedgerSource = 'checkin' | 'submission' | 'manual' | 'referral' | 'seed';

/** Append-only. A user's points = sum(amount). Never edit a row; add a correcting one. */
export interface LedgerEntry {
  id: string;
  userId: string;
  amount: number;
  source: LedgerSource;
  activityId?: string;
  refId?: string; // event id, submission id, etc.
  reason: string;
  createdBy?: string;
  createdAt: string;
}

export type ClaimStatus = 'qualified' | 'info_submitted' | 'fulfilled';

export interface PrizeClaim {
  spot: number; // 1..PRIZE.count, in the order people crossed the goal
  userId: string;
  displayName: string;
  campus: CampusId;
  qualifiedAt: string;
  status: ClaimStatus;
  reference?: string;
  contact?: { fullName: string; email: string; preference: string; notes?: string };
  fulfilledAt?: string;
}

export interface PrizeStatus {
  goal: number;
  total: number;
  remaining: number;
  claims: PrizeClaim[];
}

export type NotificationKind =
  | 'submission_approved'
  | 'submission_rejected'
  | 'points_adjusted'
  | 'prize_qualified'
  | 'prize_update'
  | 'announcement';

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface PrizeSuggestion {
  id: string;
  userId: string;
  idea: string;
  createdAt: string;
}

export interface LeaderRow {
  rank: number;
  userId: string;
  displayName: string;
  campus: CampusId;
  avatar: AvatarId;
  points: number;
}

export interface CampusCupRow {
  campus: CampusId;
  members: number;
  totalPoints: number;
  perCapita: number;
}

export interface Dashboard {
  user: User;
  points: number;
  rankOverall: number;
  rankCampus: number;
  participants: number;
  prize: PrizeStatus;
  myClaim?: PrizeClaim;
  recentSubmissions: Submission[];
  recentLedger: LedgerEntry[];
  unreadCount: number;
  daysLeft: number;
  referralsUsed: number;
}

export interface SyncStatus {
  lastSyncAt: string;
  rowsPushed: number;
  rowsPulled: number;
  conflicts: number;
  state: 'ok' | 'error' | 'syncing';
  sheetUrl: string;
}

export interface ApiError {
  code: string;
  message: string;
}

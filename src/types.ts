/**
 * Shared data shapes. These match the "YACquest: Data Model & API Contract" doc,
 * so the backend team and the front end agree on field names.
 */
import type { CampusId, Tier } from './config';

/**
 * participant — anyone who signs up.
 * admin       — helpers: review submissions, award/adjust points, run events (all campuses).
 * chair       — the 2 YAC chairs: everything, incl. granting admin, prizes, reset. Max 2 at a time.
 */
export type Role = 'participant' | 'admin' | 'chair';

/** Player characters. unicorn + dragon are original designs nodding to NCSSM's mascots (not the official logos). */
export type AvatarId = 'yak' | 'unicorn' | 'dragon' | 'knight' | 'mage' | 'ranger';

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
  /** False until the person clicks the link in their confirmation email (live backend only). */
  emailVerified?: boolean;
}

/** How an activity is verified. */
export type VerifyMethod =
  | 'event_password' // check in at an event with the password the lead announces
  | 'screenshot' // upload proof, reviewed by a lead
  | 'photo' // upload event photo, reviewed by a lead
  | 'lead_award' // a YAC admin awards it (e.g. winning a game)
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
  /** The event's point tier: high_impact = Tier 1, active = Tier 2, digital = Tier 3. */
  kind: 'high_impact' | 'active' | 'digital';
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

/** 'revoked' = points were later removed and the winner fell below the goal; the spot reopens. */
export type ClaimStatus = 'qualified' | 'info_submitted' | 'fulfilled' | 'revoked';

export interface PrizeClaim {
  spot: number; // 1..PRIZE.count, in the order people crossed the goal
  userId: string;
  displayName: string;
  campus: CampusId;
  qualifiedAt: string;
  status: ClaimStatus;
  reference?: string;
  contact?: ClaimContact;
  fulfilledAt?: string;
  revokedAt?: string;
  revokeReason?: string;
}

/** What a winner sends so YAC can deliver the gift card. */
export interface ClaimContact {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  preference?: string;
  notes?: string;
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
  /** Latest admin announcements sent to this person (newest first, up to 3). */
  messages: AppNotification[];
}

/** Weekly committee email + prize alert settings (chairs edit these in Admin → System). */
export interface ReportSettings {
  weeklyEnabled: boolean;
  /** 0 = Sunday … 6 = Saturday (Eastern time). */
  weeklyDay: number;
  /** 0–23, Eastern time. */
  weeklyHour: number;
  /** "Close to the prize" list = people within this many points of the goal. */
  nearGoalPoints: number;
  /** Extra emails on top of chairs/admins. */
  recipients: string[];
  includeChairs: boolean;
  includeAdmins: boolean;
  prizeAlertsEnabled: boolean;
  updatedAt?: string;
}

export interface WeeklyReport {
  subject: string;
  text: string;
  html: string;
  recipients: string[];
}

export type EmailKind = 'weekly_report' | 'prize_qualified' | 'prize_info' | 'test' | 'announcement';
export type EmailStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface EmailLogRow {
  id: string;
  kind: EmailKind | string;
  toEmails: string[];
  subject: string;
  status: EmailStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  sentAt?: string;
}

export type AdminActionKind =
  | 'points_added'
  | 'points_removed'
  | 'submission_approved'
  | 'submission_rejected'
  | 'role_changed'
  | 'event_created'
  | 'event_updated'
  | 'event_deleted'
  | 'prize_fulfilled'
  | 'prize_revoked'
  | 'cycle_reset'
  | 'report_settings_changed';

/** One row of the append-only admin action log (chairs only). */
export interface AdminAction {
  id: number;
  actorName: string;
  action: AdminActionKind | string;
  targetName?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ApiError {
  code: string;
  message: string;
}

/** Who an admin announcement goes to. */
export type AnnouncementAudience = 'all' | 'campus' | 'user';

export interface AnnouncementInput {
  title: string; // 3–80
  body: string; // 1–1000
  audience: AnnouncementAudience;
  campus?: CampusId; // when audience = 'campus'
  userId?: string; // when audience = 'user'
  /** Also email it (only people with email updates on; a direct message always emails that person). Chairs only for 'all'. */
  sendEmail: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  campus?: CampusId;
  targetName?: string;
  sendEmail: boolean;
  recipientCount: number;
  emailCount: number;
  senderName: string;
  createdAt: string;
}

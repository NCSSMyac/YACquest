/**
 * Shared data shapes. These match the "YACquest: Data Model & API Contract" doc,
 * so the backend team and the front end agree on field names.
 */
import type { CampusId, Tier } from './config';

/**
 * participant — anyone who signs up.
 * admin       — helpers: review submissions, award/adjust points, run events (all campuses).
 * chair       — YACquest Chairs (run this app): everything, incl. granting admin/chair, prizes, reset. Up to MAX_CHAIRS (5) at a time.
 */
export type Role = 'participant' | 'admin' | 'chair';

/**
 * Player characters. unicorn + dragon are original designs nodding to NCSSM's mascots (not the official logos).
 * 'golden_yak' is the staff-only Legendary character (0020): never offered in pickers to participants.
 */
export type AvatarId = 'yak' | 'unicorn' | 'dragon' | 'knight' | 'mage' | 'ranger' | 'golden_yak';

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
  /** Equipped unlockable cosmetics (see src/lib/cosmetics.ts). */
  look?: Look;
  /**
   * 0026: when this person finished (or skipped) the welcome tour. null = not yet (show it once);
   * undefined = the server doesn't have 0026 yet (the app falls back to remembering it on this device).
   */
  tourDoneAt?: string | null;
  /** 0026: true hides ALL of this person's approved photos from event photo walls. */
  photoWallOptOut?: boolean;
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
  /** 0026: optional feedback survey link (http/https), sent in the automatic follow-up. Staff views only. */
  surveyUrl?: string;
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
  /** 0026: event photos only: the owner chose "Show my photo on the event photo wall". */
  shareOnWall?: boolean;
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
  | 'announcement'
  /** 0020, staff only: "You're Hero of the Week!" */
  | 'hero_crowned'
  /** 0020, staff only: a chair granted a Council wardrobe item / Council MVP. */
  | 'staff_reward'
  /** 0024: "⏰ Starts in 1 hour: <title> at <location>" for an event you RSVP'd to. */
  | 'event_reminder'
  /** 0026: "Thanks for coming to <title>! 🐂" / "Sorry we missed you at <title>" after an event. */
  | 'event_followup';

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
  look?: Look;
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
  /** 0022: monthly check-in streak (all zeros if the server doesn't have 0022 yet). */
  streak: Streak;
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

export type EmailKind = 'weekly_report' | 'prize_qualified' | 'prize_info' | 'test' | 'announcement' | 'event_reminder' | 'event_followup';
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
  | 'report_settings_changed'
  | 'hero_crowned'
  | 'hero_cleared'
  | 'staff_reward_granted';

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
  /** Also email it (only people with email updates on; a direct message always emails that person). Any admin or chair, any audience. */
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

/** General feedback categories a participant can pick (prize ideas use the separate prize-suggestion form). */
export type FeedbackCategory = 'idea' | 'bug' | 'event' | 'other';

export interface FeedbackItem {
  id: string;
  /** 'feedback' = general feedback form, 'prize' = prize suggestion form. */
  kind: 'feedback' | 'prize';
  category: FeedbackCategory | 'prize';
  message: string;
  status: 'new' | 'reviewed';
  /** 0013: sent with "Send anonymously" — displayName is 'Anonymous', handle '' and campus undefined. */
  anonymous: boolean;
  displayName: string;
  handle: string;
  campus?: CampusId;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
}

/** One check-in at an event (0013: admin_event_attendees). Admins + chairs only. */
export interface EventAttendee {
  userId: string;
  displayName: string;
  handle: string;
  campus: CampusId;
  checkedInAt: string;
  points: number;
}

// ───────────── Quest extras (0009/0012): badges, wardrobe, Adventurer of the Month ─────────────

/** Equipped cosmetics. Missing/undefined = nothing in that slot (background falls back to the default). */
export interface Look {
  hat?: string;
  accessory?: string;
  background?: string;
}

export type CosmeticSlot = 'hat' | 'accessory' | 'background';

/** One badge's state for the current player (computed on the server from this cycle's activity). */
export interface BadgeProgress {
  id: string; // matches BADGES in src/lib/badges.ts
  earned: boolean;
  progress: number; // e.g. 3 (of 5 check-ins)
  goal: number; // e.g. 5
}

/**
 * "Adventurer of the Month" (0012): the participant with the most points (positive rows, this cycle)
 * in the last completed America/New_York calendar month (final). If nobody earned points last month,
 * the current month's leader so far (not final). Ties: whoever reached that total first.
 */
export interface Shoutout {
  userId: string;
  displayName: string;
  campus: CampusId;
  avatar: AvatarId;
  look?: Look;
  /** Points earned in `month`. */
  pointsThisMonth: number;
  /** Calendar month (America/New_York), 'YYYY-MM', e.g. '2026-11'. */
  month: string;
  /** true = that month is over and this is its winner; false = leading the current month so far. */
  final: boolean;
}

// ───────────── Staff-only rewards (0020): Hero of the Week, Council wardrobe + badges, Golden Yak ─────────────
// Participants never receive any of this: the server returns null / forbidden for them.

/** One Hero of the Week reign (newest first in lists). `endedAt` unset = the current hero. */
export interface HeroReign {
  id: string;
  userId: string;
  displayName: string;
  campus: CampusId;
  avatar: AvatarId;
  look?: Look;
  note: string;
  crownedAt: string;
  crownedByName: string;
  endedAt?: string;
}

/** A staff member as shown in the Heroes area (admins + chairs). */
export interface StaffRewardRow {
  userId: string;
  displayName: string;
  handle: string;
  role: Role;
  campus: CampusId;
  avatar: AvatarId;
  look?: Look;
  isHero: boolean;
  heroCount: number;
  /** Chair grants this person holds (STAFF_GRANTS ids, incl. 'council_mvp'). */
  grants: string[];
  legendary: boolean;
}

export interface HeroBoard {
  current: HeroReign | null;
  /** Every reign, newest first (includes the current one). */
  history: HeroReign[];
  team: StaffRewardRow[];
}

/** One card on Admin → Council (0021, staff only). */
export interface CouncilMember {
  userId: string;
  displayName: string;
  handle: string;
  role: Role;
  campus: CampusId;
  avatar: AvatarId;
  look?: Look;
  isHero: boolean;
  heroCount: number;
  /** Council badges in STAFF_BADGES order. */
  badges: BadgeProgress[];
  /** How many Council wardrobe items they can wear right now (hero perks included while reigning). */
  unlockCount: number;
  legendary: boolean;
}

/** The caller's own staff rewards (null for participants). */
export interface StaffRewards {
  isHero: boolean;
  heroCount: number;
  /** Staff cosmetic ids the caller can equip right now (Council wardrobe + hero perks while reigning). */
  unlocks: string[];
  /** Council badges in display order (STAFF_BADGES). 'hero_week' progress = times crowned (not capped). */
  badges: BadgeProgress[];
  /** Golden Yak unlocked (Council Legend badge or a chair's Council MVP grant). */
  legendary: boolean;
  /** Chair grants held (STAFF_GRANTS ids). */
  grants: string[];
}

// ───────────── 0022: event RSVPs, monthly check-in streaks, "My Quest Card" ─────────────

/** RSVP info merged into the participant event list (counts only: participant-safe). */
export interface EventRsvpInfo {
  goingCount: number;
  myRsvp: boolean;
}

/** Admin → Events card counts. `rsvpCame` = people who RSVP'd AND checked in. */
export interface AdminEventRsvpCounts {
  goingCount: number;
  rsvpCame: number;
}

/** One row of Admin → Events → Who's going (admins + chairs only). */
export interface EventRsvp {
  userId: string;
  displayName: string;
  handle: string;
  campus: CampusId;
  email: string;
  rsvpAt: string;
  checkedIn: boolean;
}

/**
 * Monthly check-in streak: consecutive America/New_York calendar months of this cycle with at least one
 * event check-in. `current` counts back from this month, or from last month when there's no check-in yet
 * this month (`checkedInThisMonth` false → "keep it going"). `best` = longest run this cycle.
 */
export interface Streak {
  current: number;
  best: number;
  checkedInThisMonth: boolean;
}

/** my_recap() (0022): the caller's own stats for the shareable "My Quest Card". */
export interface QuestRecap {
  displayName: string;
  handle: string;
  campus: CampusId;
  role: Role;
  avatar: AvatarId;
  look?: Look;
  points: number;
  badgesEarned: number;
  badgeTotal: number;
  /** Earned participant badge ids, in BADGES order. */
  earnedBadgeIds: string[];
  eventsAttended: number;
  currentStreak: number;
  bestStreak: number;
  /** Adventurer of the Month wins (finished months). */
  monthWins: number;
  /** Participants only. */
  rankOverall?: number;
  rankCampus?: number;
  participants?: number;
  campusParticipants?: number;
  /** Staff only: Council badges earned. */
  councilBadges?: number;
  cycleName: string;
  cycleEndsAt: string;
}

// ───────────── 0025: admin tools (staff only) ─────────────

/** One result of review_submissions_bulk: approved, or skipped with the server's code + message. */
export interface BulkReviewResult {
  approved: number;
  skipped: number;
  results: { id: string; ok: boolean; code?: string; message?: string }[];
}

/** One check-in with email + avatar (Door mode live list, "Who came" CSV). */
export interface EventCheckin extends EventAttendee {
  email: string;
  avatar: AvatarId;
  look?: Look;
}

/** Admin → Stats (admin_stats in 0025). Participants only; staff never counted. */
export interface AdminStats {
  generatedAt: string;
  goal: number;
  cycle: { name: string; startsAt: string; endsAt: string };
  totals: { participants: number; active30: number; points: number; checkins: number; approvals: number };
  /** Participants who signed up before this cycle started. */
  signupsBefore: number;
  /** Monday (America/New_York) of each week since the cycle started, oldest first. */
  signupsByWeek: { week: string; count: number }[];
  /** Events of this cycle that have started, oldest first. */
  events: { id: string; title: string; campus: CampusId | 'all'; kind: string; startsAt: string; going: number; came: number }[];
  /** active = earned points in the last 30 days. */
  campuses: { campus: CampusId; members: number; active: number; points: number; perMember: number }[];
  /** How many participants have at least `points` (50, 100, half the goal, 250, the goal). */
  milestones: { points: number; count: number }[];
  distribution: { label: string; min: number; count: number }[];
  /** Points earned this cycle by source (positive rows), and points removed by corrections. */
  sources: { event: number; digital: number; referral: number; staff: number; removed: number; other?: number };
  /** How many participants earned each badge, most first. */
  badges: { id: string; count: number }[];
}

/** One row of the participants CSV (YACquest Chairs only). */
export interface ParticipantExportRow {
  displayName: string;
  handle: string;
  email: string;
  campus: CampusId;
  points: number;
  badges: string[];
  eventsAttended: number;
  joinedAt: string;
  emailOptIn: boolean;
}

/** A saved announcement template (Admin → Announce → Templates). */
export interface AnnouncementTemplate {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  canDelete: boolean;
}

/** A private staff note on a player (Admin → Players). Participants can never read these. */
export interface PlayerNote {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  canDelete: boolean;
}

// ───────────── 0026: participant extras ─────────────

/** Admin → Events: the automatic (or staff-sent) follow-up of one event. */
export interface EventFollowupStatus {
  sentAt: string;
  /** true = sent by the every-10-minutes job; false = a staff member pressed "Send follow-up now". */
  automatic: boolean;
  sentByName?: string;
  /** People thanked (checked in). */
  attended: number;
  /** People who RSVP'd but didn't check in. */
  missed: number;
  emailed: number;
}

/** One photo on an event's photo wall (event_photos in 0026: approved + shared + owner not opted out + not hidden). */
export interface EventPhoto {
  /** The submission id (staff hide by this id). */
  id: string;
  imageUrl: string;
  displayName: string;
  campus: CampusId;
  createdAt: string;
  mine: boolean;
}

/** my_friends() (0026): someone who joined with your friend code. Safe fields only. */
export interface Friend {
  displayName: string;
  campus: CampusId;
  avatar: AvatarId;
  look?: Look;
  joinedAt: string;
  /** Checked in to at least one event. */
  came: boolean;
  /** You got the referral bonus for them this cycle. */
  bonus: boolean;
}

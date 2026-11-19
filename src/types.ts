import type { BugContext } from './lib/bugContext';
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
  /** False until the person confirms their email (0034: the app's own link; before 0034: Supabase's). */
  emailVerified?: boolean;
  /**
   * 0034 Quick start: when the email was confirmed. null = not yet (they can play, but can't hold a prize spot,
   * become staff or get participant emails). undefined = server without 0034 (falls back to emailVerified).
   */
  emailVerifiedAt?: string | null;
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
  | 'referral' // automatic when a referred friend attends their first event
  | 'event_survey'; // 0030: automatic when you answer the in-app survey of an event you checked in to

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
  /**
   * 0033: a special "limited reward" event (Brew & Quest). Participants get the public part only;
   * staff views (adminListEvents) also carry `secretWord`, `issued` and `used`.
   */
  reward?: EventReward & Partial<Pick<EventRewardAdmin, 'secretWord' | 'issued' | 'used'>>;
}

// ───────────── 0033 Brew & Quest: limited reward events ─────────────

/** What everyone may see about a special reward event. Never the secret word, never how many passes are left. */
export interface EventReward {
  /** e.g. "free coffee" */
  itemLabel: string;
  /** How many free items (first N participants to check in). */
  limit: number;
  venue: string;
  /** Reward outfit set id (src/lib/rewardEvents.ts OUTFIT_SETS), e.g. 'latte_night_scholar'. */
  outfitSet: string;
  /** Countdown message template: {venue} {limit} {item}. */
  message: string;
  /** 0034: labels from the event's campaign (reward_campaigns, one per outfit set). Missing = Brew & Quest defaults. */
  emoji?: string;
  passName?: string;
  campaignName?: string;
}

/** 0034: a reusable limited reward campaign (Admin → Events → Campaigns). One per outfit set (= one "series"). */
export interface RewardCampaign {
  /** slug, e.g. brew_quest_2026 */
  id: string;
  /** "Brew & Quest 2026" */
  name: string;
  /** "free coffee" / "free snack" / "free merch" (default for new events) */
  itemLabel: string;
  /** "Coffee Pass" / "Snack Pass" */
  passName: string;
  emoji: string;
  /** OUTFIT_SETS id in src/lib/rewardEvents.ts */
  outfitSet: string;
  /** Default countdown message for new events: {venue} {limit} {item}. */
  message: string;
  updatedAt?: string;
}

/** 0034 reward_teaser(): an upcoming special series within 14 days (no venue, no secret, no counts; anon OK). */
export interface RewardTeaser {
  outfitSet: string;
  /** "Brew & Quest" */
  name: string;
  emoji: string;
  startsAt: string;
  events: { campus: CampusId | 'all'; startsAt: string }[];
}

/** 0034 reward_scoreboard(): participant check-ins per campus for the live series. */
export interface RewardScoreboard {
  outfitSet: string;
  name: string;
  campaign?: string;
  emoji: string;
  startsAt: string;
  endsAt: string;
  events: number;
  campuses: { campus: CampusId; count: number }[];
}

/** 0034 admin_event_recap(): what the Instagram recap card shows. Characters only, never names. */
export interface EventRecap {
  eventId: string;
  title: string;
  location: string;
  venue: string;
  campus: CampusId | 'all';
  startsAt: string;
  endsAt: string;
  attendees: number;
  reward?: { itemLabel: string; limit: number; outfitSet: string; given: number; passName: string; emoji: string; campaign?: string };
  characters: { avatar: AvatarId; look?: Look }[];
}

/** Staff only: + the secret word the café checks and how many passes went out / were used. */
export interface EventRewardAdmin extends EventReward {
  secretWord: string;
  issued: number;
  used: number;
}

/** Admin → Events form → "Special reward event". Blank secret word = the server makes one. */
export type EventRewardInput = EventReward & { secretWord?: string };

/** A YACquest Coffee Pass (only ever sent to the person who holds it). */
export interface CoffeePass {
  eventId: string;
  eventTitle: string;
  campus: CampusId | 'all';
  /** 1..limit, in check-in order */
  passNo: number;
  limit: number;
  venue: string;
  item: string;
  /** Only while the pass is valid and unused. */
  secretWord?: string;
  checkedInAt: string;
  /** checkedInAt + 30 minutes */
  validUntil: string;
  usedAt?: string;
  usedBy?: 'self' | 'staff';
  /** 0034: from the campaign ("Coffee Pass", ☕). Missing = Coffee Pass. */
  outfitSet?: string;
  passName?: string;
  emoji?: string;
}

/** check_in()'s `reward` for a special event. `pass` ONLY for the person who just got one. */
export interface CheckInReward {
  outfitSet: string;
  /** Cosmetic ids unlocked (kept forever). */
  items: string[];
  /** True when the person already owned every piece (e.g. a second Brew & Quest event): no "NEW OUTFIT". */
  alreadyOwned?: boolean;
  badge?: 'early_bird';
  pass?: CoffeePass;
}

/** my_event_rewards(): new outfit items not yet seen in the Wardrobe + my passes (newest first). */
export interface MyEventRewards {
  unseen: string[];
  passes: CoffeePass[];
}

/** Door mode pass list row (staff). */
export interface EventPassRow {
  passNo: number;
  userId: string;
  displayName: string;
  handle: string;
  campus: CampusId;
  createdAt: string;
  validUntil: string;
  usedAt?: string;
  usedBy?: 'self' | 'staff';
}

export interface EventPasses {
  eventId: string;
  limit: number;
  issued: number;
  used: number;
  itemLabel: string;
  venue: string;
  secretWord: string;
  outfitSet: string;
  passes: EventPassRow[];
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

export type LedgerSource = 'checkin' | 'submission' | 'manual' | 'referral' | 'survey' | 'seed';

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
  | 'event_followup'
  /** 0028: "Your YACquest Wrapped is here! 🎁" (once per cycle, when Wrapped opens). */
  | 'wrapped'
  /** 0028: "🪔 New limited-time item for Diwali — see what it honors". */
  | 'seasonal';

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

export type EmailKind = 'weekly_report' | 'prize_qualified' | 'prize_info' | 'test' | 'announcement' | 'event_reminder' | 'event_followup' | 'wrapped' | 'verify_email';
/** 0032: one row per recipient. 'pending' = queued; skipped_* rows were never sent (see EMAIL_STATUS_LABEL). */
export type EmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'bounced' | 'skipped_expired' | 'skipped_opted_out' | 'skipped_bouncing' | 'skipped_unverified';

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
  | 'account_deleted'
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
  /** 0027: "Report a problem" technical details (bug reports only; staff only). */
  context?: BugContext;
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
  sources: { event: number; digital: number; referral: number; staff: number; removed: number; other?: number; survey?: number };
  /** How many participants earned each badge, most first. */
  badges: { id: string; count: number }[];
  /** 0030: in-app survey results per started event of this cycle that has answers, oldest first. Missing before 0030. */
  ratings?: { id: string; title: string; startsAt: string; came: number; responses: number; average: number }[];
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

// ───────────── 0028: pace tracker, Wrapped + end-of-year, seasonal wardrobe ─────────────

/** admin_pace(): raw weekly data; src/lib/pace.ts does the projection. Participants only. */
export interface PaceData {
  generatedAt: string;
  goal: number;
  prizeCount: number;
  cycle: { name: string; startsAt: string; endsAt: string };
  /** Monday (America/New_York) of each week from the cycle start to now, 'YYYY-MM-DD'. */
  weeks: string[];
  /** All participants' points per week (same order as `weeks`). */
  weeklyTotals: number[];
  /** Every participant with points this cycle, most points first. */
  players: { id: string; name: string; campus: CampusId; points: number; firstAt: string | null }[];
  /** Top 10: cumulative points at the end of each week. */
  top: { id: string; name: string; campus: CampusId; points: number; cumulative: number[] }[];
}

export type PointsMix = Record<'event' | 'digital' | 'photos' | 'quests' | 'referral' | 'staff', number>;

/** my_wrapped(): the caller's year. Participants get ranks; staff get `staff` instead (never in percentiles). */
export interface WrappedData {
  cycleName: string;
  cycleEndsAt: string;
  opensAt: string;
  /** A YACquest Chair looking before it opens. */
  preview: boolean;
  displayName: string;
  handle: string;
  campus: CampusId;
  role: Role;
  avatar: AvatarId;
  look?: Look;
  points: number;
  eventsAttended: number;
  favoriteCampus: CampusId | 'all' | null;
  favoriteKind: YacEvent['kind'] | null;
  bestMonth: { month: string; points: number } | null;
  badgesEarned: number;
  badgeTotal: number;
  earnedBadgeIds: string[];
  /** Participants only: the earned badge the fewest players have. */
  rarestBadge?: { id: string; pct: number; holders: number } | null;
  bestStreak: number;
  friendsBrought: number;
  monthWins: number;
  mix: PointsMix;
  rankOverall?: number;
  rankCampus?: number;
  participants?: number;
  campusParticipants?: number;
  topPctOverall?: number;
  topPctCampus?: number;
  staff?: { reviews: number; eventsHosted: number; checkinsAtHosted: number; announcements: number; heroCrowns: number; councilBadges: number; councilBadgeIds: string[] };
}

export type EoyItemId = 'ledger_backup' | 'confirm_winners' | 'deliver_gift_cards' | 'thank_you' | 'reset';

export interface EoyChecklist {
  cycleName: string;
  opensAt: string;
  endsAt: string;
  windowEndsAt: string;
  inWindow: boolean;
  cycleEnded: boolean;
  fulfillBy: string;
  /** null until the automatic "Wrapped is here" send has run. */
  wrapped: { sentAt: string; notified: number; emailed: number } | null;
  items: { id: EoyItemId; done: boolean; doneAt: string | null; doneBy: string | null }[];
}

export interface SeasonalClaim {
  /** Item ids unlocked just now (empty when nothing new). */
  claimed: string[];
  /** Holidays whose window is open today. */
  active: { holiday: string; endsOn: string }[];
}

// ───────────── 0030: in-app event feedback survey ─────────────

/** What a player sends (rating + favorite part are required). */
export interface EventSurveyInput {
  eventId: string;
  rating: number;
  favorite: string;
  leastFavorite?: string;
  comments?: string;
  /** "Send anonymously to the YAC team": still tied to you for points, but staff never see your name. */
  anonymous?: boolean;
}

/** my_survey_status(event): can I answer, and did I already? */
export interface EventSurveyStatus {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  checkedIn: boolean;
  done: boolean;
  /** ends_at + 14 days */
  closesAt: string;
  open: boolean;
  points: number;
}

/** One answer as staff see it. Anonymous answers have no name or campus. */
export interface EventSurveyRow {
  name: string | null;
  campus?: CampusId;
  anonymous: boolean;
  rating: number;
  favorite: string;
  leastFavorite: string;
  comments: string;
  createdAt: string;
}

/** admin_event_survey(event): Admin → Events → 📊 Survey. */
export interface EventSurveyResults {
  eventId: string;
  title: string;
  startsAt: string;
  attendees: number;
  responses: number;
  average: number | null;
  /** Answers per star, [1★, 2★, 3★, 4★, 5★]. */
  distribution: number[];
  rows: EventSurveyRow[];
}


// ───────────────────────────── 0032: email stats, tracking, unsubscribe ─────────────────────────────

/** Totals for the last N days. Opens are approximate (Apple Mail preloads images; some apps block them). */
export interface EmailTotals {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  openRate: number;
  ctr: number;
  bounced: number;
  unsubscribed: number;
  skipped: number;
  expired: number;
  failed: number;
}

/** One announcement or automatic email (a reminder for one event, the weekly report of one day, …). */
export interface EmailCampaignStat {
  id: string;
  label: string;
  kind: EmailKind | string;
  firstAt: string;
  recipients: number;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  skipped: number;
  waiting: number;
  failed: number;
}

export interface EmailStats {
  days: number;
  totals: EmailTotals;
  daily: { day: string; sent: number; opened: number; clicked: number }[];
  campaigns: EmailCampaignStat[];
}

export interface EmailRecipientRow {
  messageId: string;
  userId?: string;
  name: string;
  campus?: CampusId;
  email: string;
  status: EmailStatus | 'queued';
  sentAt?: string;
  opened: boolean;
  openedAt?: string;
  clickedUrls: string[];
  bounced: boolean;
  unsubscribed: boolean;
  error?: string;
}

export interface EmailHistoryRow {
  id: string;
  kind: EmailKind | string;
  label: string;
  subject: string;
  status: EmailStatus | 'queued';
  createdAt: string;
  sentAt?: string;
  opened: boolean;
  clicked: boolean;
  error?: string;
}

/** Admin → System: "Today: 132 / 450 sent · 40 waiting · next batch in ~6 min". */
export interface EmailQueueStatus {
  budget: number;
  reserve: number;
  sent24h: number;
  waiting: number;
  waitingHigh: number;
  skippedToday: number;
  lastRunAt?: string;
  nextRunAt?: string;
  /** 'ok' = Gmail bounce notices were read on the last run; 'error'/'off'/'skipped'/'never' = bounce checking off. */
  bounceCheck: 'ok' | 'off' | 'error' | 'skipped' | 'never';
  bounceError?: string;
  lastBounceCheckAt?: string;
}

export interface MyEmailStatus {
  optIn: boolean;
  bounced: boolean;
  bouncedAt?: string;
}

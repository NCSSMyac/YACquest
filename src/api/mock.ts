/**
 * YACquest API client.
 *
 * RIGHT NOW this is a MOCK: data lives in the browser (localStorage) and is seeded
 * with ~300 fake participants so screens behave like the real thing.
 *
 * WHEN THE BACKEND IS READY: keep every exported function name and return type,
 * and replace the body with a `fetch()` to the matching endpoint in the
 * "Data Model & API Contract" doc. Screens import only from this file, so nothing
 * else has to change. Rules marked "SERVER RULE" must also be enforced by the backend —
 * the front end checks are only for friendly error messages.
 */
import { CAPS, CAMPUSES, CYCLE, PRIZE, TIER_POINTS, type CampusId } from '../config';
import { ACTIVITIES, ONCE_PER_CYCLE, activityById } from '../lib/activities';
import { EVENT_KINDS, kindInfo } from '../lib/eventKinds';
import { BADGES } from '../lib/badges';
import { COSMETICS, cosmeticById, type UnlockRule } from '../lib/cosmetics';
import { announcementError, claimContactError, isEmail } from '../lib/validate';
import type {
  Activity,
  AdminAction,
  AppNotification,
  AvatarId,
  CampusCupRow,
  ClaimContact,
  Dashboard,
  EmailKind,
  EmailLogRow,
  LeaderRow,
  LedgerEntry,
  NotificationKind,
  PrizeClaim,
  PrizeStatus,
  PrizeSuggestion,
  ReportSettings,
  Role,
  Submission,
  SubmissionStatus,
  User,
  WeeklyReport,
  YacEvent,
  Announcement,
  AnnouncementInput,
  FeedbackCategory,
  FeedbackItem,
  BadgeProgress,
  Look,
  Shoutout,
} from '../types';

// ───────────────────────────── errors ─────────────────────────────

import { ApiError, emitChange, subscribe } from './shared';
import { NAME_NOT_ALLOWED, nameIsClean } from '../lib/nameFilter';
export { subscribe } from './shared';
export type { AdminOverview, AdminUserRow, EventInput, QueueItem, SignupInput, SignupResult, TeamMember } from './shared';
import type { AdminOverview, AdminUserRow, EventInput, QueueItem, SignupInput, SignupResult, TeamMember } from './shared';

/** True in the browser-only demo. Screens use it to show demo hints. */
export const isMock: boolean = true;

const fail = (code: string, message: string): never => {
  throw new ApiError(code, message);
};

// ───────────────────────────── storage ─────────────────────────────

interface Db {
  version: number;
  users: User[];
  events: YacEvent[];
  submissions: Submission[];
  ledger: LedgerEntry[];
  claims: PrizeClaim[];
  notifications: AppNotification[];
  suggestions: PrizeSuggestion[];
  archives: { cycle: string; archivedAt: string; ledgerRows: number; winners: PrizeClaim[] }[];
  reportSettings: ReportSettings;
  /** Emails waiting to go out / already sent (the real one is the email_outbox table). */
  outbox: OutboxRow[];
  /** Append-only admin action log, oldest first. */
  actions: AdminAction[];
  /** Admin announcements (the real one is the announcements table). */
  announcements: Announcement[];
  /** General feedback (the real one is the feedback table). */
  feedback: { id: string; userId: string; category: FeedbackCategory; message: string; status: 'new' | 'reviewed'; reviewedBy?: string; reviewedAt?: string; createdAt: string }[];
  seq: number;
}

interface OutboxRow extends EmailLogRow {
  text: string;
  html: string;
  dedupeKey: string;
}

const DB_KEY = 'yacquest-db-v1';
const SESSION_KEY = 'yacquest-session';
const DB_VERSION = 8;

let db: Db | null = null;

function load(): Db {
  if (db) return db;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === DB_VERSION) return (db = parsed);
    }
  } catch {
    /* storage unavailable or corrupt — fall through to a fresh seed */
  }
  db = seed();
  save();
  return db;
}

function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* quota exceeded or private mode: keep working in memory */
  }
  emitChange();
}

const delay = (ms = 120 + Math.random() * 180) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const nextId = (prefix: string) => `${prefix}_${(++load().seq).toString(36)}`;

// ───────────────────────────── session ─────────────────────────────

function sessionUserId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return memorySession;
  }
}
let memorySession: string | null = null;
function setSession(id: string | null) {
  memorySession = id;
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function me(): User {
  const id = sessionUserId();
  const user = id ? load().users.find((u) => u.id === id) : undefined;
  if (!user) return fail('unauthenticated', 'Please log in again.');
  return user;
}

function requireRole(...roles: Role[]): User {
  const user = me();
  if (!roles.includes(user.role)) fail('forbidden', 'You do not have access to that.');
  return user;
}

/** Admins and chairs manage every campus. */
const canManage = (admin: User, _target?: { campus: CampusId }) => admin.role === 'admin' || admin.role === 'chair';

// ───────────────────────────── points helpers ─────────────────────────────

function pointsByUser(): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of load().ledger) totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.amount);
  return totals;
}
const pointsOf = (userId: string) =>
  load().ledger.reduce((sum, r) => (r.userId === userId ? sum + r.amount : sum), 0);

function rankedParticipants(campus?: CampusId): LeaderRow[] {
  const totals = pointsByUser();
  return load()
    .users.filter((u) => u.role === 'participant' && (!campus || u.campus === campus))
    .map((u) => ({ userId: u.id, displayName: u.displayName, campus: u.campus, avatar: u.avatar, points: totals.get(u.id) ?? 0, look: u.look }))
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName))
    .map((r, i, arr) => ({
      ...r,
      // ties share a rank (1, 2, 2, 4)
      rank: i > 0 && arr[i - 1].points === r.points ? -1 : i + 1,
    }))
    .map((r, i, arr) => {
      if (r.rank !== -1) return r;
      let j = i;
      while (arr[j].rank === -1) j--;
      return { ...r, rank: arr[j].rank };
    });
}

function notify(userId: string, kind: NotificationKind, title: string, body: string) {
  load().notifications.unshift({ id: nextId('ntf'), userId, kind, title, body, read: false, createdAt: now() });
}

/**
 * SERVER RULE: the only way points change. Appends to the ledger, then checks the prize race.
 * In production, the claim insert must be a single transaction with a unique (cycle, spot)
 * constraint so two people crossing at once can't both take the last spot.
 */
function addLedger(entry: Omit<LedgerEntry, 'id' | 'createdAt'>, createdAt = now()) {
  const d = load();
  d.ledger.push({ ...entry, id: nextId('led'), createdAt });
  refreshPrizeRace();
}

/** When did this user most recently cross the goal (walking their ledger in order)? null if not at/above it. */
function crossedGoalAt(userId: string): string | null {
  let sum = 0;
  let at: string | null = null;
  for (const row of load().ledger) {
    if (row.userId !== userId) continue;
    const before = sum;
    sum += row.amount;
    if (sum >= PRIZE.goal && before < PRIZE.goal) at = row.createdAt;
    else if (sum < PRIZE.goal) at = null;
  }
  return sum >= PRIZE.goal ? at : null;
}

/** SERVER RULE (refresh_prize_race): revoke claims that fell below the goal, then refill open spots. */
function refreshPrizeRace() {
  const d = load();
  const totals = pointsByUser();
  for (const c of d.claims) {
    if (c.status === 'revoked' || c.status === 'fulfilled') continue;
    if ((totals.get(c.userId) ?? 0) < PRIZE.goal) {
      c.status = 'revoked';
      c.revokedAt = now();
      c.revokeReason = 'Points fell below the goal after a correction';
      logAction('prize_revoked', { displayName: c.displayName }, { spot: c.spot, reason: c.revokeReason });
      notify(c.userId, 'prize_update', 'Prize spot revoked', `Your points dropped below ${PRIZE.goal} after a correction, so spot #${c.spot} reopened. Earn it back to qualify again.`);
    }
  }
  const active = d.claims.filter((c) => c.status !== 'revoked');
  const activeUsers = new Set(active.map((c) => c.userId));
  const taken = new Set(active.map((c) => c.spot));
  const free: number[] = [];
  for (let n = 1; n <= PRIZE.count; n++) if (!taken.has(n)) free.push(n);
  if (!free.length) return;
  const eligible = d.users
    .filter((u) => u.role === 'participant' && !activeUsers.has(u.id) && (totals.get(u.id) ?? 0) >= PRIZE.goal)
    .map((u) => ({ u, at: crossedGoalAt(u.id) ?? now() }))
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const { u, at } of eligible) {
    const spot = free.shift();
    if (spot == null) break;
    const claim: PrizeClaim = { spot, userId: u.id, displayName: u.displayName, campus: u.campus, qualifiedAt: at, status: 'qualified' };
    d.claims.push(claim);
    prizeAlert('prize_qualified', claim);
    notify(u.id, 'prize_qualified', `You won spot #${spot}!`, `You reached ${PRIZE.goal} points and claimed a ${PRIZE.name}. Open Prize to send your delivery info.`);
  }
}

const weekStart = (iso: string) => {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
};

const strip = (e: YacEvent, includePassword: boolean): YacEvent => (includePassword ? e : { ...e, password: undefined });

// ───────────────────────────── auth ─────────────────────────────

export async function currentUser(): Promise<User | null> {
  const id = sessionUserId();
  return load().users.find((u) => u.id === id) ?? null;
}

export async function login(handle: string, password: string): Promise<User> {
  await delay();
  // MOCK: any non-empty password works. Real auth lives on the backend.
  if (!handle.trim() || !password) fail('invalid', 'Enter your username and password.');
  const user = load().users.find((u) => u.handle.toLowerCase() === handle.trim().toLowerCase() || u.email.toLowerCase() === handle.trim().toLowerCase());
  if (!user) return fail('invalid', 'That username and password don’t match.');
  setSession(user.id);
  save();
  return user;
}

export async function logout(): Promise<void> {
  setSession(null);
  save();
}


export async function signup(input: SignupInput): Promise<SignupResult> {
  await delay();
  const d = load();
  if (!input.acceptedRules) fail('rules', 'Please read and accept the rules.');
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(input.handle)) fail('handle', 'Username: 3–20 letters, numbers, dots or underscores.');
  if (input.displayName.trim().length < 2 || input.displayName.length > 24) fail('displayName', 'Display name: 2–24 characters.');
  if (!nameIsClean(input.handle)) fail('handle', NAME_NOT_ALLOWED);
  if (!nameIsClean(input.displayName)) fail('displayName', NAME_NOT_ALLOWED);
  if (!/^\S+@\S+\.\S+$/.test(input.email)) fail('email', 'Enter a valid email.');
  if (input.password.length < 8) fail('password', 'Password must be at least 8 characters.');
  if (d.users.some((u) => u.handle.toLowerCase() === input.handle.toLowerCase())) fail('handle', 'That username is taken.');
  if (d.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) fail('email', 'An account with that email already exists.');
  let referredBy: string | undefined;
  if (input.friendCode?.trim()) {
    const ref = d.users.find((u) => u.friendCode.toLowerCase() === input.friendCode!.trim().toLowerCase());
    if (!ref) fail('friendCode', 'We couldn’t find that friend code.');
    referredBy = ref!.id;
  }
  const user: User = {
    id: nextId('usr'),
    handle: input.handle,
    displayName: input.displayName.trim(),
    email: input.email.trim(),
    campus: input.campus,
    role: 'participant',
    avatar: input.avatar,
    friendCode: makeFriendCode(),
    referredBy,
    createdAt: now(),
    emailOptIn: true,
  };
  d.users.push(user);
  notify(user.id, 'announcement', 'Welcome to YACquest!', `Earn points all year. The first ${PRIZE.count} people to reach ${PRIZE.goal} win a ${PRIZE.name}.`);
  setSession(user.id);
  save();
  return { user, needsEmailConfirmation: false };
}

/** Mock has no email step. */
export async function resendConfirmation(_email: string): Promise<void> {
  await delay(300);
}

/** Called after the user follows a password-reset link. */
export async function updatePassword(newPassword: string): Promise<void> {
  await delay();
  me();
  if (newPassword.length < 8) fail('password', 'Password must be at least 8 characters.');
}

/** Notifies when someone logs in or out. Returns an unsubscribe function. */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  let last = sessionUserId();
  return subscribe(() => {
    const id = sessionUserId();
    if (id !== last) {
      last = id;
      cb(id ? load().users.find((u) => u.id === id) ?? null : null);
    }
  });
}

/** Always resolves, so the form never reveals whether an email has an account. */
export async function requestPasswordReset(_email: string): Promise<void> {
  await delay(400);
}

export async function updateProfile(patch: Partial<Pick<User, 'displayName' | 'avatar' | 'emailOptIn'>>): Promise<User> {
  await delay();
  const user = me();
  if (patch.displayName !== undefined && (patch.displayName.trim().length < 2 || patch.displayName.length > 24))
    fail('displayName', 'Display name: 2–24 characters.');
  if (patch.displayName !== undefined && !nameIsClean(patch.displayName)) fail('displayName', NAME_NOT_ALLOWED);
  Object.assign(user, patch, patch.displayName ? { displayName: patch.displayName.trim() } : {});
  for (const c of load().claims) if (c.userId === user.id) c.displayName = user.displayName;
  save();
  return user;
}

// ───────────────────────────── participant ─────────────────────────────

export async function getDashboard(): Promise<Dashboard> {
  await delay();
  const d = load();
  const user = me();
  const overall = rankedParticipants();
  const campus = rankedParticipants(user.campus);
  return {
    user,
    points: pointsOf(user.id),
    rankOverall: overall.find((r) => r.userId === user.id)?.rank ?? 0,
    rankCampus: campus.find((r) => r.userId === user.id)?.rank ?? 0,
    participants: overall.length,
    prize: prizeStatusSync(),
    myClaim: d.claims.find((c) => c.userId === user.id && c.status !== 'revoked'),
    recentSubmissions: d.submissions.filter((s) => s.userId === user.id).slice(-5).reverse(),
    recentLedger: d.ledger.filter((l) => l.userId === user.id).slice(-8).reverse(),
    unreadCount: d.notifications.filter((n) => n.userId === user.id && !n.read).length,
    daysLeft: Math.max(0, Math.ceil((new Date(CYCLE.end).getTime() - Date.now()) / 86_400_000)),
    referralsUsed: d.ledger.filter((l) => l.userId === user.id && l.activityId === 'bring_new_alum').length,
    messages: d.notifications.filter((n) => n.userId === user.id && n.kind === 'announcement').slice(0, 3),
  };
}

export async function listActivities(): Promise<Activity[]> {
  return ACTIVITIES;
}

export async function listEvents(scope: 'upcoming' | 'past' | 'all' = 'all'): Promise<(YacEvent & { checkedIn: boolean })[]> {
  await delay();
  const d = load();
  const user = me();
  const t = Date.now();
  const isAdmin = user.role !== 'participant';
  return d.events
    .filter((e) => {
      const closes = new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60_000;
      if (scope === 'upcoming') return closes >= t;
      if (scope === 'past') return closes < t;
      return true;
    })
    .sort((a, b) => (scope === 'past' ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)))
    .map((e) => ({
      ...strip(e, isAdmin && canManage(user)),
      checkedIn: d.ledger.some((l) => l.userId === user.id && l.source === 'checkin' && l.refId === e.id),
    }));
}

/** Which activity a check-in earns for this user (cross-campus is Tier 1). */
function checkInActivity(e: YacEvent, user: User): Activity {
  // The event's tier decides the points (mirrors 0005_event_tiers.sql).
  void user;
  return activityById(kindInfo(e.kind).activityId)!;
}

export async function checkIn(eventId: string, password: string): Promise<{ points: number; activity: Activity }> {
  await delay();
  const d = load();
  const user = me();
  const e = d.events.find((x) => x.id === eventId);
  if (!e) return fail('not_found', 'That event no longer exists.');
  const t = Date.now();
  if (t < new Date(e.startsAt).getTime() - 30 * 60_000) fail('not_open', 'Check-in opens 30 minutes before the event starts.');
  if (t > new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60_000) fail('expired', 'Check-in for this event has closed.');
  if (d.ledger.some((l) => l.userId === user.id && l.source === 'checkin' && l.refId === e.id)) fail('duplicate', 'You already checked in to this event.');
  if (!password.trim() || password.trim().toLowerCase() !== (e.password ?? '').toLowerCase()) fail('wrong_password', 'Wrong password. Ask a YAC organizer for the event code.');
  const activity = checkInActivity(e, user);
  const points = TIER_POINTS[activity.tier];
  addLedger({ userId: user.id, amount: points, source: 'checkin', activityId: activity.id, refId: e.id, reason: `Checked in: ${e.title}` });
  e.attendeeCount++;

  // Referral bonus: first event attended by someone who signed up with a friend code.
  const firstCheckIn = d.ledger.filter((l) => l.userId === user.id && l.source === 'checkin').length === 1;
  // BOTH people earn Tier 1 (mirrors 0003_points_and_referrals.sql).
  if (firstCheckIn && user.referredBy) {
    const used = d.ledger.filter((l) => l.userId === user.referredBy && l.activityId === 'bring_new_alum').length;
    if (used < CAPS.referralsPerCycle) {
      addLedger({ userId: user.referredBy, amount: TIER_POINTS[1], source: 'referral', activityId: 'bring_new_alum', refId: user.id, reason: `Brought a new alum: ${user.displayName}` });
      notify(user.referredBy, 'points_adjusted', `+${TIER_POINTS[1]} for bringing a friend`, `${user.displayName} checked in to their first YAC event.`);
    }
    if (!d.ledger.some((l) => l.userId === user.id && l.activityId === 'joined_with_code')) {
      addLedger({ userId: user.id, amount: TIER_POINTS[1], source: 'referral', activityId: 'joined_with_code', refId: `joined:${user.id}`, reason: 'Joined with a friend code' });
      notify(user.id, 'points_adjusted', `+${TIER_POINTS[1]} for joining with a friend code`, 'Welcome bonus for coming to your first YAC event!');
    }
  }
  save();
  return { points, activity };
}

/** Explains why a user can't submit an activity right now, or null if they can. */
function submissionBlocker(user: User, activityId: string, eventId?: string): string | null {
  const d = load();
  const mine = d.submissions.filter((s) => s.userId === user.id && s.status !== 'rejected');
  const a = activityById(activityId);
  if (!a || (a.method !== 'screenshot' && a.method !== 'photo')) return 'That quest can’t be submitted with a screenshot.';
  if (ONCE_PER_CYCLE.has(a.id) && mine.some((s) => s.activityId === a.id)) return 'You already submitted this one for this cycle.';
  const thisWeek = weekStart(now());
  if (a.tier === 3 && mine.some((s) => activityById(s.activityId)?.tier === 3 && weekStart(s.createdAt) === thisWeek))
    return `Digital quests are limited to ${CAPS.digitalPerWeek} per week. Come back Monday!`;
  const month = now().slice(0, 7);
  if (a.id === 'social_tag' && mine.filter((s) => s.activityId === 'social_tag' && s.createdAt.slice(0, 7) === month).length >= CAPS.socialTagPerMonth)
    return `Social tags are limited to ${CAPS.socialTagPerMonth} per month.`;
  if (a.id === 'event_photos') {
    if (!eventId) return 'Pick the event the photo is from.';
    if (!d.ledger.some((l) => l.userId === user.id && l.source === 'checkin' && l.refId === eventId)) return 'You can only upload photos from events you checked in to.';
    if (mine.filter((s) => s.activityId === 'event_photos' && s.eventId === eventId).length >= CAPS.photosPerEvent) return 'You already uploaded a photo for that event.';
    if (mine.filter((s) => s.activityId === 'event_photos').length >= CAPS.photosPerCycle) return `Photo points are limited to ${CAPS.photosPerCycle} per cycle.`;
  }
  return null;
}

export async function canSubmit(activityId: string, eventId?: string): Promise<string | null> {
  return submissionBlocker(me(), activityId, eventId);
}

export async function submitProof(input: { activityId: string; eventId?: string; imageDataUrl: string; note: string }): Promise<Submission> {
  await delay(500);
  const user = me();
  const blocked = submissionBlocker(user, input.activityId, input.eventId);
  if (blocked) fail('limit', blocked);
  if (!input.imageDataUrl.startsWith('data:image/')) fail('file_type', 'Unsupported file. Please upload a JPG, PNG or WebP image.');
  if (input.note.length > 280) fail('note', 'Keep the note under 280 characters.');
  const sub: Submission = {
    id: nextId('sub'),
    userId: user.id,
    activityId: input.activityId,
    eventId: input.eventId,
    imageUrl: input.imageDataUrl,
    note: input.note.trim(),
    status: 'pending',
    createdAt: now(),
  };
  load().submissions.push(sub);
  save();
  return sub;
}

export async function mySubmissions(): Promise<Submission[]> {
  await delay();
  const user = me();
  return load().submissions.filter((s) => s.userId === user.id).slice().reverse();
}

export async function myLedger(): Promise<LedgerEntry[]> {
  await delay();
  const user = me();
  return load().ledger.filter((l) => l.userId === user.id).slice().reverse();
}

// ───────────────────────────── leaderboards ─────────────────────────────

/** Only the top rows are returned, so this stays cheap with 300+ users. */
export async function leaderboard(limit = 10): Promise<LeaderRow[]> {
  await delay();
  return rankedParticipants().slice(0, limit);
}

export async function campusLeaders(perCampus = 3): Promise<Record<CampusId, LeaderRow[]>> {
  await delay();
  return Object.fromEntries(CAMPUSES.map((c) => [c.id, rankedParticipants(c.id).slice(0, perCampus)])) as Record<CampusId, LeaderRow[]>;
}

/** Campus Cup is per-capita so bigger campuses don't win just by size. */
export async function campusCup(): Promise<CampusCupRow[]> {
  await delay();
  return CAMPUSES.map((c) => {
    const rows = rankedParticipants(c.id);
    const total = rows.reduce((s, r) => s + r.points, 0);
    return { campus: c.id, members: rows.length, totalPoints: total, perCapita: rows.length ? Math.round((total / rows.length) * 10) / 10 : 0 };
  }).sort((a, b) => b.perCapita - a.perCapita);
}

export async function myRank(): Promise<LeaderRow | null> {
  const user = me();
  return rankedParticipants().find((r) => r.userId === user.id) ?? null;
}

// ───────────────────────────── prize race ─────────────────────────────

function prizeStatusSync(): PrizeStatus {
  const claims = load().claims.filter((c) => c.status !== 'revoked').sort((a, b) => a.spot - b.spot);
  return { goal: PRIZE.goal, total: PRIZE.count, remaining: Math.max(0, PRIZE.count - claims.length), claims };
}

export async function prizeStatus(): Promise<PrizeStatus> {
  await delay(80);
  return prizeStatusSync();
}

export async function submitClaimInfo(contact: ClaimContact): Promise<PrizeClaim> {
  await delay(400);
  const user = me();
  const claim = load().claims.find((c) => c.userId === user.id && c.status !== 'revoked');
  if (!claim) return fail('no_claim', 'You haven’t won a spot yet.');
  if (claim.status === 'fulfilled') fail('fulfilled', 'This prize was already delivered.');
  const problem = claimContactError(contact);
  if (problem) fail(problem.code, problem.message);
  claim.contact = {
    fullName: contact.fullName.trim(),
    email: contact.email.trim(),
    phone: contact.phone.trim(),
    address: contact.address.trim(),
    preference: contact.preference?.trim() || undefined,
    notes: contact.notes?.trim() || undefined,
  };
  claim.status = 'info_submitted';
  claim.reference = claim.reference ?? `YQ-${new Date().getFullYear()}-${String(claim.spot).padStart(2, '0')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  prizeAlert('prize_info', claim);
  save();
  return claim;
}

export async function suggestPrize(idea: string): Promise<void> {
  await delay();
  const user = me();
  if (idea.trim().length < 3) fail('idea', 'Tell us a bit more about your idea.');
  if (idea.length > 300) fail('idea', 'Keep it under 300 characters.');
  load().suggestions.push({ id: nextId('sug'), userId: user.id, idea: idea.trim(), createdAt: now() });
  save();
}

// ───────────────────────────── notifications ─────────────────────────────

export async function notifications(): Promise<AppNotification[]> {
  await delay();
  const user = me();
  return load().notifications.filter((n) => n.userId === user.id);
}

export function unreadCountSync(): number {
  const id = sessionUserId();
  return id ? load().notifications.filter((n) => n.userId === id && !n.read).length : 0;
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const user = me();
  for (const n of load().notifications) if (n.userId === user.id && (!ids || ids.includes(n.id))) n.read = true;
  save();
}

// ───────────────────────────── admin (admins + chairs) ─────────────────────────────


export async function reviewQueue(filters: { status?: SubmissionStatus; campus?: CampusId; activityId?: string } = {}): Promise<QueueItem[]> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const d = load();
  const status = filters.status ?? 'pending';
  return d.submissions
    .filter((s) => s.status === status && (!filters.activityId || s.activityId === filters.activityId))
    .map((s) => {
      const u = d.users.find((x) => x.id === s.userId)!;
      return {
        ...s,
        user: { id: u.id, displayName: u.displayName, campus: u.campus, handle: u.handle },
        activity: activityById(s.activityId)!,
        eventTitle: s.eventId ? d.events.find((e) => e.id === s.eventId)?.title : undefined,
      };
    })
    .filter((q) => canManage(admin, q.user) && (!filters.campus || q.user.campus === filters.campus))
    .sort((a, b) => (status === 'pending' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
}

export async function reviewSubmission(id: string, decision: 'approved' | 'rejected', reason?: string): Promise<void> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const d = load();
  const s = d.submissions.find((x) => x.id === id);
  if (!s) return fail('not_found', 'Submission not found.');
  const owner = d.users.find((u) => u.id === s.userId)!;
  if (!canManage(admin, owner)) fail('forbidden', 'That participant was not found.');
  if (s.status !== 'pending') fail('already_reviewed', 'Someone already reviewed this one.');
  if (decision === 'rejected' && !reason?.trim()) fail('reason', 'Add a reason so the participant knows what to fix.');
  const a = activityById(s.activityId)!;
  s.status = decision;
  s.reviewerId = admin.id;
  s.reviewReason = reason?.trim();
  s.reviewedAt = now();
  if (decision === 'approved') {
    addLedger({ userId: owner.id, amount: TIER_POINTS[a.tier], source: 'submission', activityId: a.id, refId: s.id, reason: `Approved: ${a.title}`, createdBy: admin.id });
    notify(owner.id, 'submission_approved', `+${TIER_POINTS[a.tier]} pts — ${a.title}`, 'Your submission was approved.');
  } else {
    notify(owner.id, 'submission_rejected', `Not approved — ${a.title}`, reason!.trim());
  }
  logAction(decision === 'approved' ? 'submission_approved' : 'submission_rejected', owner, { activityId: a.id, reason: reason?.trim() || null }, admin);
  save();
}


export async function searchUsers(query: string, limit = 20): Promise<AdminUserRow[]> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const q = query.trim().toLowerCase();
  const totals = pointsByUser();
  return load()
    .users.filter((u) => canManage(admin, u) && (!q || u.displayName.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)))
    .slice(0, limit)
    .map((u) => ({ id: u.id, handle: u.handle, displayName: u.displayName, email: u.email, campus: u.campus, role: u.role, points: totals.get(u.id) ?? 0 }));
}

export async function userLedger(userId: string): Promise<LedgerEntry[]> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const u = load().users.find((x) => x.id === userId);
  if (!u || !canManage(admin, u)) return fail('forbidden', 'Not found.');
  return load().ledger.filter((l) => l.userId === userId).slice().reverse();
}

/** Manual add/remove. Reason is required and is shown to the participant. */
export async function adjustPoints(userId: string, amount: number, reason: string): Promise<void> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const u = load().users.find((x) => x.id === userId);
  if (!u || !canManage(admin, u)) return fail('forbidden', 'That person was not found.');
  if (!Number.isInteger(amount) || amount === 0 || amount > TIER_POINTS[1] || amount < -PRIZE.goal)
    fail('amount', `Add at most ${TIER_POINTS[1]} points at a time (one High-Impact action), or remove up to ${PRIZE.goal}. Not 0.`);
  if (reason.trim().length < 3) fail('reason', 'A reason is required.');
  addLedger({ userId, amount, source: 'manual', reason: reason.trim(), createdBy: admin.id });
  logAction(amount > 0 ? 'points_added' : 'points_removed', u, { amount, reason: reason.trim(), activityId: null }, admin);
  notify(userId, 'points_adjusted', `${amount > 0 ? '+' : ''}${amount} pts from ${admin.displayName}`, reason.trim());
  save();
}

/** Award a lead-verified activity (e.g. winning a game) at its tier value. */
export async function awardActivity(userId: string, activityId: string, note: string): Promise<void> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const u = load().users.find((x) => x.id === userId);
  const a = activityById(activityId);
  if (!u || !canManage(admin, u)) return fail('forbidden', 'That person was not found.');
  if (!a) return fail('activity', 'Unknown activity.');
  const why = note.trim() ? `${a.title}: ${note.trim()}` : a.title;
  addLedger({ userId, amount: TIER_POINTS[a.tier], source: 'manual', activityId, reason: why, createdBy: admin.id });
  logAction('points_added', u, { amount: TIER_POINTS[a.tier], reason: why, activityId }, admin);
  notify(userId, 'points_adjusted', `+${TIER_POINTS[a.tier]} pts — ${a.title}`, note.trim() || `Awarded by ${admin.displayName}`);
  save();
}


export async function adminListEvents(): Promise<YacEvent[]> {
  await delay();
  const admin = requireRole('admin', 'chair');
  return load()
    .events.filter(() => canManage(admin))
    .slice()
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** The kind decides the campus rules (mirrors 0002_event_kinds.sql). */
function normalizeEvent(input: EventInput): EventInput {
  return { ...input, crossCampus: input.campus === 'all' };
}

function validateEvent(admin: User, input: EventInput) {
  if (!EVENT_KINDS.some((k) => k.id === input.kind)) fail('kind', 'Pick the tier for this event.');
  if (input.title.trim().length < 3) fail('title', 'Give the event a title.');
  if (input.password.trim().length < 4) fail('password', 'Event password: at least 4 characters.');
  if (new Date(input.endsAt) <= new Date(input.startsAt)) fail('endsAt', 'End time must be after the start.');
  void admin;
}

export async function createEvent(input: EventInput): Promise<YacEvent> {
  await delay();
  const admin = requireRole('admin', 'chair');
  validateEvent(admin, input);
  const e: YacEvent = { ...normalizeEvent(input), title: input.title.trim(), password: input.password.trim(), id: nextId('evt'), attendeeCount: 0, activityId: kindInfo(input.kind).activityId };
  load().events.push(e);
  logAction('event_created', undefined, { title: e.title, kind: e.kind, campus: e.campus }, admin);
  save();
  return e;
}

export async function updateEvent(id: string, input: EventInput): Promise<YacEvent> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const e = load().events.find((x) => x.id === id);
  if (!e || !canManage(admin)) return fail('forbidden', 'Not found.');
  validateEvent(admin, input);
  Object.assign(e, normalizeEvent(input), { title: input.title.trim(), password: input.password.trim(), activityId: kindInfo(input.kind).activityId });
  logAction('event_updated', undefined, { title: e.title, kind: e.kind, campus: e.campus }, admin);
  save();
  return e;
}

export async function deleteEvent(id: string): Promise<void> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const d = load();
  const e = d.events.find((x) => x.id === id);
  if (!e || !canManage(admin)) return fail('forbidden', 'Not found.');
  if (e.attendeeCount > 0) fail('has_attendees', 'People already checked in — this event can’t be deleted.');
  d.events = d.events.filter((x) => x.id !== id);
  logAction('event_deleted', undefined, { title: e.title, kind: e.kind, campus: e.campus }, admin);
  save();
}

export async function listClaims(): Promise<PrizeClaim[]> {
  await delay();
  requireRole('chair');
  return load().claims.slice().sort((a, b) => Number(a.status === 'revoked') - Number(b.status === 'revoked') || a.spot - b.spot);
}

export async function markFulfilled(spot: number): Promise<void> {
  await delay();
  const chair = requireRole('chair');
  const c = load().claims.find((x) => x.spot === spot && x.status !== 'revoked');
  if (!c) return fail('not_found', 'Claim not found.');
  c.status = 'fulfilled';
  c.fulfilledAt = now();
  logAction('prize_fulfilled', { displayName: c.displayName }, { spot: c.spot, reason: null }, chair);
  notify(c.userId, 'prize_update', 'Your prize is on the way!', `Your ${PRIZE.name} has been sent. Reference ${c.reference ?? '—'}.`);
  save();
}

export async function listSuggestions(): Promise<(PrizeSuggestion & { displayName: string })[]> {
  await delay();
  requireRole('admin', 'chair');
  const d = load();
  return d.suggestions
    .map((s) => ({ ...s, displayName: d.users.find((u) => u.id === s.userId)?.displayName ?? 'Unknown' }))
    .reverse();
}


export async function adminOverview(): Promise<AdminOverview> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const d = load();
  void admin;
  const inScope = new Set(d.users.filter((u) => u.role === 'participant').map((u) => u.id));
  const wk = weekStart(now());
  const thisWeek = d.ledger.filter((l) => inScope.has(l.userId) && new Date(l.createdAt).getTime() >= wk);
  const claimed = new Set(d.claims.filter((c) => c.status !== 'revoked').map((c) => c.userId));
  return {
    participants: inScope.size,
    activeThisWeek: new Set(thisWeek.map((l) => l.userId)).size,
    pointsThisWeek: thisWeek.reduce((s, l) => s + Math.max(0, l.amount), 0),
    pendingReviews: d.submissions.filter((s) => s.status === 'pending' && inScope.has(s.userId)).length,
    newSignupsThisWeek: d.users.filter((u) => inScope.has(u.id) && new Date(u.createdAt).getTime() >= wk).length,
    prize: prizeStatusSync(),
    nearGoal: rankedParticipants().filter((r) => !claimed.has(r.userId) && r.points >= PRIZE.goal - 100).slice(0, 10),
  };
}

/** CSV of the full ledger — for audits and the year-end archive. */
export async function exportLedgerCsv(): Promise<string> {
  await delay();
  requireRole('chair');
  const d = load();
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['entry_id', 'created_at', 'user_id', 'handle', 'display_name', 'campus', 'amount', 'source', 'activity_id', 'ref_id', 'reason', 'created_by'];
  const rows = d.ledger.map((l) => {
    const u = d.users.find((x) => x.id === l.userId);
    return [l.id, l.createdAt, l.userId, u?.handle, u?.displayName, u?.campus, l.amount, l.source, l.activityId, l.refId, l.reason, l.createdBy].map(esc).join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

export async function weeklyReportPreview(): Promise<WeeklyReport> {
  await delay();
  requireRole('admin', 'chair');
  return { ...buildWeeklyReport(), recipients: reportRecipients() };
}

/** End-of-cycle reset (proposal §3): archive, then zero everyone. Chair only. */
export async function resetCycle(confirmText: string): Promise<void> {
  await delay(600);
  const chair = requireRole('chair');
  if (confirmText !== 'RESET') fail('confirm', 'Type RESET to confirm.');
  const d = load();
  logAction('cycle_reset', undefined, { name: CYCLE.name }, chair);
  d.archives.push({ cycle: CYCLE.name, archivedAt: now(), ledgerRows: d.ledger.length, winners: d.claims });
  d.ledger = [];
  d.claims = [];
  d.submissions = [];
  for (const u of d.users) if (u.role === 'participant') notify(u.id, 'announcement', 'A new cycle has started!', 'Points were reset to 0. Good luck!');
  save();
}

export async function archives() {
  await delay();
  requireRole('chair');
  return load().archives;
}

/** Wipes local mock data and re-seeds. Only exists in the mock. */
export async function resetDemoData(): Promise<void> {
  db = seed();
  save();
}

// ───────────────────────────── seed data ─────────────────────────────

function rng(seedNum: number) {
  let s = seedNum >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function makeFriendCode(rand: () => number = Math.random) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'YAC-' + Array.from({ length: 4 }, () => chars[Math.floor(rand() * chars.length)]).join('');
}

const FIRST = ['Ava', 'Ben', 'Chloe', 'Dev', 'Emma', 'Femi', 'Grace', 'Hari', 'Isla', 'Jamal', 'Kira', 'Leo', 'Maya', 'Nate', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Uma', 'Vik', 'Wren', 'Xavi', 'Yara', 'Zane', 'Aiden', 'Bella', 'Caleb', 'Dana', 'Eli', 'Fiona', 'Gabe', 'Hana', 'Ian', 'Jade', 'Kai', 'Lena', 'Milo', 'Nia'];
const LAST = 'ABCDEFGHJKLMNOPRSTWYZ';
const AVATARS: AvatarId[] = ['yak', 'unicorn', 'dragon', 'knight', 'mage', 'ranger'];

const PLACEHOLDER_IMG = (label: string, color: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 32 24" shape-rendering="crispEdges"><rect width="32" height="24" fill="${color}"/><rect x="2" y="2" width="28" height="4" fill="#fff" opacity=".85"/><rect x="2" y="8" width="18" height="2" fill="#fff" opacity=".6"/><rect x="2" y="12" width="22" height="2" fill="#fff" opacity=".6"/><rect x="22" y="14" width="8" height="8" fill="#f2b33d"/><text x="16" y="5.2" font-size="3" text-anchor="middle" font-family="monospace" fill="#0b2a5b">${label}</text></svg>`,
  );

export function seed(): Db {
  const rand = rng(20261015);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const t = Date.now();
  const iso = (offsetMs: number) => new Date(t + offsetMs).toISOString();
  const H = 3_600_000;
  const D = 24 * H;

  const d: Db = {
    version: DB_VERSION,
    users: [],
    events: [],
    submissions: [],
    ledger: [],
    claims: [],
    notifications: [],
    suggestions: [],
    archives: [],
    reportSettings: defaultReportSettings(),
    outbox: [],
    actions: [],
    announcements: [],
    feedback: [],
    seq: 1000,
  };
  db = d;

  const mkUser = (u: Partial<User> & Pick<User, 'handle' | 'displayName' | 'campus' | 'role'>, createdAt: string): User => {
    const user: User = {
      id: nextId('usr'),
      email: `${u.handle}@example.edu`,
      avatar: pick(AVATARS),
      friendCode: makeFriendCode(rand),
      createdAt,
      emailOptIn: true,
      ...u,
    };
    d.users.push(user);
    return user;
  };

  // Staff accounts
  mkUser({ handle: 'iesha', displayName: 'Iesha L.', campus: 'duke', role: 'chair', avatar: 'mage', email: 'iesha.landis.yac@ncssm.edu', emailVerified: true }, CYCLE.start);
  mkUser({ handle: 'jacob', displayName: 'Jacob R.', campus: 'unc', role: 'chair', avatar: 'knight', email: 'jacob.rodriguez.yac@ncssm.edu', emailVerified: true }, CYCLE.start);
  mkUser({ handle: 'admin', displayName: 'YAC Helper', campus: 'ncsu', role: 'admin', avatar: 'ranger', emailVerified: true }, CYCLE.start);

  // Demo participant
  const demo = mkUser({ handle: 'yak001', displayName: 'Yak001', campus: 'duke', role: 'participant', avatar: 'yak', email: 'yak001@example.edu' }, CYCLE.start);

  // ~300 participants (Duke 90, UNC 120, NC State 90 incl. demo)
  const campusPlan: CampusId[] = [...Array(89).fill('duke'), ...Array(120).fill('unc'), ...Array(90).fill('ncsu')];
  const cycleStart = new Date(CYCLE.start).getTime();
  const elapsed = Math.max(D, t - cycleStart);
  for (let i = 0; i < campusPlan.length; i++) {
    const name = `${pick(FIRST)} ${pick(LAST.split(''))}.`;
    const created = new Date(cycleStart + rand() * elapsed * 0.8).toISOString();
    const u = mkUser({ handle: `alum${String(i + 1).padStart(3, '0')}`, displayName: name, campus: campusPlan[i], role: 'participant' }, created);
    // Points so far: most people lightly engaged, a few superfans.
    const engagement = rand() ** 2.2;
    const pts = Math.round((engagement * 160) / 5) * 5;
    if (pts > 0) {
      // Split into an older chunk and (for ~40% of people) a recent one, so "active this week" isn't empty.
      const recent = rand() < 0.4 ? Math.min(pts, 5 * Math.ceil(rand() * 4)) : 0;
      if (pts - recent > 0) d.ledger.push({ id: nextId('led'), userId: u.id, amount: pts - recent, source: 'seed', reason: 'Points earned earlier this cycle', createdAt: created });
      if (recent > 0) d.ledger.push({ id: nextId('led'), userId: u.id, amount: recent, source: 'seed', reason: 'Points earned this week', createdAt: iso(-rand() * 2 * D) });
    }
  }

  // Dress up some of the crowd so leaderboards show off the wardrobe (own rng: keeps the rest of the seed stable).
  {
    const lr = rng(909);
    const lp = <T,>(arr: readonly T[]) => arr[Math.floor(lr() * arr.length)];
    const totals = new Map<string, number>();
    for (const l of d.ledger) totals.set(l.userId, (totals.get(l.userId) ?? 0) + l.amount);
    for (const u of d.users) {
      if (u.role !== 'participant' || u === demo) continue;
      const pts = totals.get(u.id) ?? 0;
      if (lr() > (pts >= 60 ? 0.85 : 0.35)) continue;
      const look: Look = {};
      if (pts >= 100 && lr() < 0.6) look.hat = 'flower_crown';
      else if (lr() < 0.45) look.hat = lp(['party_hat', 'party_hat', 'explorer_cap', 'wizard_hat']);
      if (lr() < 0.4) look.accessory = lp(['bowtie', 'medal', 'pearls', 'bowtie']);
      look.background = pts >= 50 && lr() < 0.4 ? 'sunset' : lp(['meadow', 'campus', 'meadow']);
      u.look = look;
    }
  }

  // Events: past, live now (so check-in works in a demo), and upcoming.
  const ev = (e: Omit<YacEvent, 'id' | 'attendeeCount' | 'checkInGraceMinutes'>, attendees = 0) =>
    d.events.push({ ...e, id: nextId('evt'), attendeeCount: attendees, checkInGraceMinutes: 60 });
  ev({ title: 'Kickoff Mixer', campus: 'duke', crossCampus: false, kind: 'active', location: 'Duke Gardens', startsAt: iso(-12 * D), endsAt: iso(-12 * D + 2 * H), password: 'KICKOFF', activityId: 'home_event' }, 34);
  ev({ title: 'Trivia Night', campus: 'unc', crossCampus: false, kind: 'active', location: 'Top of the Hill', startsAt: iso(-6 * D), endsAt: iso(-6 * D + 2 * H), password: 'TARHEEL', activityId: 'home_event' }, 41);
  ev({ title: 'Study Break Social', campus: 'duke', crossCampus: false, kind: 'active', location: 'Bryan Center', startsAt: iso(-1 * H), endsAt: iso(3 * H), password: 'BLUEDEVIL', activityId: 'home_event' });
  ev({ title: 'Career Panel: First Jobs', campus: 'unc', crossCampus: false, kind: 'active', location: 'Gerrard Hall', startsAt: iso(-1 * H), endsAt: iso(3 * H), password: 'PANEL', activityId: 'home_event' });
  ev({ title: 'Pack Game Watch', campus: 'ncsu', crossCampus: false, kind: 'active', location: 'Talley Student Union', startsAt: iso(-1 * H), endsAt: iso(3 * H), password: 'WOLFPACK', activityId: 'home_event' });
  ev({ title: 'Triangle Trivia Showdown', campus: 'all', crossCampus: true, kind: 'high_impact', location: 'American Tobacco Campus, Durham', startsAt: iso(-1 * H), endsAt: iso(4 * H), password: 'TRIANGLE', activityId: 'cross_campus_event' });
  ev({ title: 'Mentorship Circle', campus: 'duke', crossCampus: false, kind: 'active', location: 'Perkins Library', startsAt: iso(5 * D), endsAt: iso(5 * D + 90 * 60_000), password: 'MENTOR', activityId: 'home_event' });
  ev({ title: 'Winter Service Day', campus: 'all', crossCampus: true, kind: 'high_impact', location: 'NCSSM Durham', startsAt: iso(17 * D), endsAt: iso(17 * D + 4 * H), password: 'SERVE', activityId: 'cross_campus_event' });

  // Demo participant history
  const kickoff = d.events[0];
  d.ledger.push({ id: nextId('led'), userId: demo.id, amount: TIER_POINTS[2], source: 'checkin', activityId: 'home_event', refId: kickoff.id, reason: `Checked in: ${kickoff.title}`, createdAt: kickoff.startsAt });
  d.ledger.push({ id: nextId('led'), userId: demo.id, amount: TIER_POINTS[3], source: 'submission', activityId: 'follow_ig', reason: 'Approved: Follow YAC on Instagram', createdAt: iso(-10 * D) });
  d.ledger.push({ id: nextId('led'), userId: demo.id, amount: TIER_POINTS[2], source: 'manual', activityId: 'game_win', reason: 'Win a Game or Competition: Kickoff cornhole', createdAt: kickoff.endsAt });
  d.submissions.push({ id: nextId('sub'), userId: demo.id, activityId: 'follow_ig', imageUrl: PLACEHOLDER_IMG('FOLLOW', '#3b6fd8'), note: '', status: 'approved', createdAt: iso(-11 * D), reviewedAt: iso(-10 * D) });
  d.submissions.push({ id: nextId('sub'), userId: demo.id, activityId: 'repost', imageUrl: PLACEHOLDER_IMG('REPOST', '#8a4fd8'), note: 'Reposted the trivia poster', status: 'rejected', reviewReason: 'Screenshot was cropped — we couldn’t see the YAC post.', createdAt: iso(-8 * D), reviewedAt: iso(-7 * D) });
  notify(demo.id, 'submission_rejected', 'Not approved — Repost a YAC Post', 'Screenshot was cropped — we couldn’t see the YAC post.');
  // A digital quest + a bit of feedback so the demo player starts with a few badges (First Steps, Champion, Voice).
  d.ledger.push({ id: nextId('led'), userId: demo.id, amount: TIER_POINTS[3], source: 'submission', activityId: 'poll', reason: 'Approved: Vote in a Community Poll', createdAt: iso(-3 * D) });
  d.submissions.push({ id: nextId('sub'), userId: demo.id, activityId: 'poll', imageUrl: PLACEHOLDER_IMG('POLL', '#2fa36b'), note: '', status: 'approved', createdAt: iso(-4 * D), reviewedAt: iso(-3 * D) });
  d.feedback.push({ id: nextId('fb'), userId: demo.id, category: 'idea', message: 'Love the pixel art! More game nights please.', status: 'reviewed', createdAt: iso(-9 * D) });
  demo.look = { hat: 'party_hat', background: 'campus' };
  notify(demo.id, 'announcement', 'Welcome to YACquest!', `Earn points all year. The first ${PRIZE.count} people to reach ${PRIZE.goal} win a ${PRIZE.name}.`);

  // Pending review queue
  const participants = d.users.filter((u) => u.role === 'participant' && u.id !== demo.id);
  const colors = ['#3b6fd8', '#d84f8a', '#2fa36b', '#d8873b', '#8a4fd8'];
  const subActs = ['survey', 'repost', 'poll', 'story_game', 'social_tag', 'annual_fund'];
  for (let i = 0; i < 12; i++) {
    const u = participants[Math.floor(rand() * participants.length)];
    const act = pick(subActs);
    d.submissions.push({ id: nextId('sub'), userId: u.id, activityId: act, imageUrl: PLACEHOLDER_IMG(act.toUpperCase().slice(0, 8), pick(colors)), note: rand() > 0.5 ? 'Here’s my screenshot!' : '', status: 'pending', createdAt: iso(-rand() * 3 * D) });
  }

  d.suggestions.push({ id: nextId('sug'), userId: participants[3].id, idea: 'Chick-fil-A gift cards!', createdAt: iso(-4 * D) });

  // A little admin history so the activity log isn't empty in the demo.
  const [iesha, jacob] = d.users;
  const seedAction = (actor: User, action: string, target: string | undefined, details: Record<string, unknown>, createdAt: string) =>
    d.actions.push({ id: d.actions.length + 1, actorName: actor.displayName, action, targetName: target, details, createdAt });
  seedAction(iesha, 'event_created', undefined, { title: kickoff.title, kind: 'active', campus: 'duke' }, iso(-14 * D));
  seedAction(jacob, 'submission_approved', demo.displayName, { activityId: 'follow_ig', reason: null }, iso(-10 * D));
  seedAction(jacob, 'submission_rejected', demo.displayName, { activityId: 'repost', reason: 'Screenshot was cropped — we couldn’t see the YAC post.' }, iso(-7 * D));
  seedAction(iesha, 'points_added', demo.displayName, { amount: TIER_POINTS[2], reason: 'Win a Game or Competition: Kickoff cornhole', activityId: 'game_win' }, kickoff.endsAt);
  d.actions.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((a, i) => (a.id = i + 1));
  return d;
}

// Expose for tests
export const __test = { load, pointsOf, rankedParticipants, setSession, addLedger, deliverOutbox, badgesFor, unlocksFor, shoutoutSync };

// ───────────────────────────── team (chairs only) ─────────────────────────────

export async function listTeam(): Promise<TeamMember[]> {
  await delay();
  requireRole('chair');
  return load()
    .users.filter((u) => u.role === 'admin' || u.role === 'chair')
    .sort((a, b) => Number(b.role === 'chair') - Number(a.role === 'chair') || a.displayName.localeCompare(b.displayName))
    .map((u) => ({ id: u.id, displayName: u.displayName, handle: u.handle, email: u.email, role: u.role, emailVerified: true }));
}

export async function setRole(userId: string, role: 'participant' | 'admin'): Promise<void> {
  await delay();
  requireRole('chair');
  if (role !== 'participant' && role !== 'admin') return fail('chair_limit', 'Chairs can only be changed with “hand over chair seat”.');
  const u = load().users.find((x) => x.id === userId);
  if (!u) return fail('not_found', 'Person not found.');
  if (u.role === 'chair') return fail('forbidden', 'A chair can’t be changed here.');
  const from = u.role;
  u.role = role;
  if (from !== role) logAction('role_changed', u, { from, to: role });
  notify(u.id, 'announcement', role === 'admin' ? 'You are now a YACquest admin' : 'Your admin access was removed', role === 'admin' ? 'You can now review submissions and award points.' : 'You are back to being a regular adventurer.');
  refreshPrizeRace();
  save();
  emitChange();
}

/** SERVER RULE (admin_rename_user): admins/chairs can fix a display name the filter missed. */
export async function adminRenameUser(userId: string, displayName: string): Promise<void> {
  await delay();
  requireRole('admin', 'chair');
  const name = displayName.trim();
  if (name.length < 2 || name.length > 24) fail('displayName', 'Display name: 2–24 characters.');
  if (!nameIsClean(name)) fail('displayName', NAME_NOT_ALLOWED);
  const d = load();
  const u = d.users.find((x) => x.id === userId);
  if (!u) return fail('not_found', 'Person not found.');
  const from = u.displayName;
  u.displayName = name;
  for (const c of d.claims) if (c.userId === u.id && c.status !== 'revoked') c.displayName = name;
  notify(u.id, 'announcement', 'Your display name was updated', `An admin changed your display name to “${name}”.`);
  logAction('user_renamed', u, { from, to: name });
  save();
  emitChange();
}

export async function transferChair(userId: string): Promise<void> {
  await delay();
  const caller = requireRole('chair');
  if (userId === caller.id) return fail('forbidden', 'Pick someone else.');
  const d = load();
  const target = d.users.find((x) => x.id === userId);
  if (!target) return fail('not_found', 'Person not found.');
  if (target.role === 'chair') return fail('chair_limit', 'That person is already a chair.');
  if (d.users.filter((u) => u.role === 'chair').length > 2) return fail('chair_limit', 'There can only be 2 chairs.');
  const from = target.role;
  target.role = 'chair';
  caller.role = 'admin';
  logAction('role_changed', target, { from, to: 'chair' }, caller);
  logAction('role_changed', caller, { from: 'chair', to: 'admin' }, caller);
  notify(target.id, 'announcement', 'You are now a YAC Chair', `${caller.displayName} handed you their chair seat.`);
  notify(caller.id, 'announcement', 'Chair seat handed over', `${target.displayName} is now a YAC Chair. You are an admin.`);
  refreshPrizeRace();
  save();
  emitChange();
}

// ───────────────────────────── emails + action log (chairs) ─────────────────────────────
// Mirrors 0004_emails_and_audit.sql. In the real app the Edge Function `send-emails` sends
// the outbox every 10 minutes; here a timer "sends" each email a second or two later.

function defaultReportSettings(): ReportSettings {
  return {
    weeklyEnabled: true,
    weeklyDay: 1,
    weeklyHour: 9,
    nearGoalPoints: 150,
    recipients: [],
    includeChairs: true,
    includeAdmins: true,
    prizeAlertsEnabled: true,
    updatedAt: undefined,
  };
}

/** SERVER RULE (triggers in 0004): every admin change is appended to admin_actions. */
function logAction(action: string, target: { displayName: string } | undefined, details: Record<string, unknown> = {}, actor?: User | null) {
  const d = load();
  const who = actor === undefined ? d.users.find((u) => u.id === sessionUserId()) ?? null : actor;
  const id = (d.actions[d.actions.length - 1]?.id ?? 0) + 1;
  d.actions.push({ id, actorName: who?.displayName ?? '', action, targetName: target?.displayName, details, createdAt: now() });
}

/** Extra recipients ∪ chairs ∪ admins (per settings), lower-case, no duplicates. */
function reportRecipients(): string[] {
  const d = load();
  const s = d.reportSettings;
  const out = new Set(s.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean));
  for (const u of d.users) {
    if ((u.role === 'chair' && s.includeChairs) || (u.role === 'admin' && s.includeAdmins)) out.add(u.email.toLowerCase());
  }
  return [...out].sort();
}

/** Inserts into the outbox unless the dedupe key was already used. Returns true if queued. */
function enqueueEmail(kind: EmailKind, to: string[], subject: string, text: string, html: string, dedupeKey: string): boolean {
  const d = load();
  if (!to.length || d.outbox.some((r) => r.dedupeKey === dedupeKey)) return false;
  d.outbox.push({ id: nextId('eml'), kind, toEmails: to, subject, text, html, dedupeKey, status: 'pending', attempts: 0, createdAt: now() });
  scheduleDelivery();
  return true;
}

/** Demo stand-in for SMTP: addresses at *.invalid bounce, so the Retry button can be tried. */
const bounces = (r: OutboxRow) => r.toEmails.some((e) => /\.invalid$/i.test(e));

function startSending() {
  for (const r of load().outbox)
    if (r.status === 'pending') {
      r.status = 'sending';
      r.attempts++;
    }
}
function finishSending() {
  for (const r of load().outbox)
    if (r.status === 'sending') {
      if (bounces(r)) {
        r.status = 'failed';
        r.lastError = '550 5.1.1 Recipient address rejected (demo)';
      } else {
        r.status = 'sent';
        r.sentAt = now();
        r.lastError = undefined;
      }
    }
}
/** Sends everything pending right away (tests use this instead of waiting for the timer). */
function deliverOutbox() {
  startSending();
  finishSending();
  save();
}
let deliveryTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDelivery() {
  if (deliveryTimer) return;
  deliveryTimer = setTimeout(() => {
    startSending();
    save();
    setTimeout(() => {
      deliveryTimer = null;
      finishSending();
      save();
    }, 900);
  }, 700);
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** SERVER RULE (prize alert triggers): email the committee when someone wins / sends delivery info. */
function prizeAlert(kind: 'prize_qualified' | 'prize_info', c: PrizeClaim) {
  const d = load();
  if (!d.reportSettings?.prizeAlertsEnabled) return;
  const to = reportRecipients();
  if (!to.length) return;
  const campus = CAMPUSES.find((x) => x.id === c.campus)?.name ?? c.campus;
  if (kind === 'prize_qualified') {
    const subject = `🏆 YACquest: ${c.displayName} won spot #${c.spot}`;
    const lines = [
      `${c.displayName} (${campus}) just reached ${PRIZE.goal} points and won spot #${c.spot} of ${PRIZE.count} — a ${PRIZE.name}.`,
      'We’re waiting for them to send their delivery info. You’ll get another email when they do.',
    ];
    enqueueEmail(kind, to, subject, lines.join('\n\n'), emailHtml(subject, lines.map((l) => `<p>${esc(l)}</p>`).join('')), `prize_qualified:${c.userId}:${c.spot}:${c.qualifiedAt}`);
  } else {
    const k = c.contact!;
    const subject = `URGENT 🎁 YACquest winner info: ${c.displayName} (spot #${c.spot})`;
    const rows: [string, string][] = [
      ['Full name', k.fullName],
      ['Email', k.email],
      ['Phone', k.phone],
      ['Mailing address', k.address],
      ['Gift card preference', k.preference || 'No preference'],
      ['Notes', k.notes || '—'],
      ['Reference', c.reference ?? '—'],
      ['Campus', campus],
    ];
    const text = [`${c.displayName} sent their delivery info for spot #${c.spot} (${PRIZE.name}).`, '', ...rows.map(([a, b]) => `${a}: ${b}`)].join('\n');
    const html = emailHtml(subject, `<p>${esc(c.displayName)} sent their delivery info for spot #${c.spot} (${esc(PRIZE.name)}).</p><table cellpadding="6" style="border-collapse:collapse">${rows
      .map(([a, b]) => `<tr><td style="font-weight:bold;vertical-align:top">${esc(a)}</td><td style="white-space:pre-wrap">${esc(b)}</td></tr>`)
      .join('')}</table>`);
    enqueueEmail(kind, to, subject, text, html, `prize_info:${c.userId}:${c.spot}:${JSON.stringify(k)}`);
  }
}

function emailHtml(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#e9f0fb;font-family:Arial,Helvetica,sans-serif;color:#14213d"><div style="max-width:600px;margin:0 auto;background:#fffdf6;border:4px solid #0b2a5b"><div style="background:#0b2a5b;color:#ffd97a;padding:14px 18px;font-size:20px;font-weight:bold">${esc(title)}</div><div style="padding:16px 18px;font-size:15px;line-height:1.5">${body}</div><div style="padding:10px 18px;font-size:12px;color:#4a5672;border-top:2px solid #f2b33d">Sent by YACquest. Change who gets this in Admin → System.</div></div></body></html>`;
}

/** Current day-of-week (0=Sun), hour, and ISO week key in America/New_York. */
function easternNow(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  // ISO week of the Eastern calendar date
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const isoDay = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - isoDay + 3);
  const isoYear = date.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return { day, hour: Number(parts.hour), weekKey: `${isoYear}-${String(week).padStart(2, '0')}` };
}

function buildWeeklyReport(): Omit<WeeklyReport, 'recipients'> {
  const d = load();
  const s = d.reportSettings;
  const ranked = rankedParticipants();
  const prize = prizeStatusSync();
  const claimed = new Set(prize.claims.map((c) => c.userId));
  const close = ranked.filter((r) => !claimed.has(r.userId) && r.points >= PRIZE.goal - s.nearGoalPoints);
  const participants = new Set(ranked.map((r) => r.userId));
  const wk = weekStart(now());
  const thisWeek = d.ledger.filter((l) => participants.has(l.userId) && new Date(l.createdAt).getTime() >= wk);
  const active = new Set(thisWeek.map((l) => l.userId)).size;
  const pts = thisWeek.reduce((sum, l) => sum + Math.max(0, l.amount), 0);
  const signups = d.users.filter((u) => participants.has(u.id) && new Date(u.createdAt).getTime() >= wk).length;
  const pending = d.submissions.filter((x) => x.status === 'pending').length;
  const daysLeft = Math.max(0, Math.ceil((new Date(CYCLE.end).getTime() - Date.now()) / 86_400_000));
  const cup = CAMPUSES.map((c) => {
    const rows = ranked.filter((r) => r.campus === c.id);
    const total = rows.reduce((sum, r) => sum + r.points, 0);
    return { name: c.name, members: rows.length, perCapita: rows.length ? Math.round((total / rows.length) * 10) / 10 : 0 };
  }).sort((a, b) => b.perCapita - a.perCapita);
  const cname = (id: CampusId) => CAMPUSES.find((c) => c.id === id)?.name ?? id;
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const subject = `YACquest weekly report — ${dateLabel}`;
  const weekAgo = Date.now() - 7 * 86_400_000;
  const userName = (id: string) => d.users.find((u) => u.id === id)?.displayName ?? 'Unknown';
  const fbLabel: Record<string, string> = { idea: 'Idea', bug: 'Bug / problem', event: 'Event idea', other: 'Other', prize: 'Prize idea' };
  const recentFeedback = [
    ...d.feedback.map((f) => ({ cat: f.category as string, msg: f.message, who: userName(f.userId), at: f.createdAt })),
    ...d.suggestions.map((x) => ({ cat: 'prize', msg: x.idea, who: userName(x.userId), at: x.createdAt })),
  ].filter((f) => new Date(f.at).getTime() >= weekAgo).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);

  const text = [
    `Prize race: ${prize.remaining} of ${prize.total} spots left (goal ${PRIZE.goal} pts, ${PRIZE.name}).`,
    '',
    `CLOSE TO THE PRIZE (within ${s.nearGoalPoints} pts)`,
    ...(close.length ? close.map((r) => `- ${r.displayName} (${cname(r.campus)}): ${r.points} pts, ${PRIZE.goal - r.points} to go`) : ['- Nobody yet.']),
    '',
    'TOP 5',
    ...ranked.slice(0, 5).map((r) => `${r.rank}. ${r.displayName} (${cname(r.campus)}) — ${r.points}`),
    '',
    'CAMPUS CUP (points per member)',
    ...cup.map((c, i) => `${i + 1}. ${c.name}: ${c.perCapita} (${c.members} members)`),
    '',
    'FEEDBACK (last 7 days)',
    ...(recentFeedback.length ? recentFeedback.map((f) => `- [${fbLabel[f.cat]}] ${f.who}: ${f.msg}`) : ['- No new feedback this week.']),
    '',
    'THIS WEEK',
    `- ${active} active participants, ${pts} points awarded, ${signups} new sign-ups`,
    `- ${pending} submissions waiting for review`,
    `- ${daysLeft} days left in the cycle`,
  ].join('\n');

  const h2 = (t: string) => `<h2 style="font-size:16px;color:#0b2a5b;margin:18px 0 6px;border-bottom:2px solid #f2b33d">${esc(t)}</h2>`;
  const li = (t: string) => `<li style="margin:2px 0">${t}</li>`;
  const html = emailHtml(
    subject,
    `<p style="font-size:17px;margin:0"><b style="color:#0b2a5b">${prize.remaining} of ${prize.total}</b> prize spots left <span style="color:#4a5672">(goal ${PRIZE.goal} pts · ${esc(PRIZE.name)})</span></p>` +
      h2(`Close to the prize (within ${s.nearGoalPoints} pts)`) +
      (close.length
        ? `<ul style="padding-left:18px;margin:0">${close.map((r) => li(`<b>${esc(r.displayName)}</b> (${esc(cname(r.campus))}) — ${r.points} pts, <b>${PRIZE.goal - r.points} to go</b>`)).join('')}</ul>`
        : '<p style="margin:0;color:#4a5672">Nobody yet.</p>') +
      h2('Top 5') +
      `<ol style="padding-left:22px;margin:0">${ranked.slice(0, 5).map((r) => li(`${esc(r.displayName)} (${esc(cname(r.campus))}) — ${r.points}`)).join('')}</ol>` +
      h2('Campus Cup (points per member)') +
      `<ol style="padding-left:22px;margin:0">${cup.map((c) => li(`${esc(c.name)}: <b>${c.perCapita}</b> <span style="color:#4a5672">(${c.members} members)</span>`)).join('')}</ol>` +
      h2('💬 Feedback (last 7 days)') +
      (recentFeedback.length
        ? recentFeedback.map((f) => `<div style="border-left:4px solid #f2b33d;padding:6px 10px;margin:0 0 8px;background:#fffaf0"><div style="font-size:12px;color:#4a5672"><b>${esc(fbLabel[f.cat])}</b> · ${esc(f.who)}</div><div style="white-space:pre-wrap">${esc(f.msg)}</div></div>`).join('')
        : '<p style="margin:0;color:#4a5672">No new feedback this week.</p>') +
      h2('This week') +
      `<ul style="padding-left:18px;margin:0">${li(`${active} active participants · ${pts} points awarded · ${signups} new sign-ups`)}${li(`${pending} submissions waiting for review`)}${li(`${daysLeft} days left in the cycle`)}</ul>`,
  );
  return { subject, text, html };
}

/** SERVER RULE (enqueue_weekly_report_if_due, run by the Edge Function): once per ISO week after the set day/hour. */
function maybeEnqueueWeekly(): boolean {
  const s = load().reportSettings;
  if (!s.weeklyEnabled) return false;
  const t = easternNow();
  const monIdx = (day: number) => (day + 6) % 7;
  const due = monIdx(t.day) > monIdx(s.weeklyDay) || (t.day === s.weeklyDay && t.hour >= s.weeklyHour);
  if (!due) return false;
  const r = buildWeeklyReport();
  const queued = enqueueEmail('weekly_report', reportRecipients(), r.subject, r.text, r.html, `weekly:${t.weekKey}`);
  if (queued) save();
  return queued;
}

export async function getReportSettings(): Promise<ReportSettings> {
  await delay();
  requireRole('chair');
  return { ...load().reportSettings, recipients: [...load().reportSettings.recipients] };
}

export async function updateReportSettings(patch: Partial<ReportSettings>): Promise<ReportSettings> {
  await delay();
  const chair = requireRole('chair');
  const d = load();
  const next: ReportSettings = { ...d.reportSettings };
  const isInt = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  if (patch.weeklyDay !== undefined && !isInt(patch.weeklyDay, 0, 6)) fail('weeklyDay', 'Pick a day of the week.');
  if (patch.weeklyHour !== undefined && !isInt(patch.weeklyHour, 0, 23)) fail('weeklyHour', 'Pick an hour between 12 am and 11 pm.');
  if (patch.nearGoalPoints !== undefined && !isInt(patch.nearGoalPoints, 0, 1000)) fail('nearGoalPoints', '“Close to the prize” must be 0–1000 points.');
  if (patch.recipients !== undefined) {
    const list = [...new Set(patch.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const bad = list.find((e) => !isEmail(e));
    if (bad) fail('recipients', `“${bad}” isn’t a valid email.`);
    if (list.length > 20) fail('recipients', 'Up to 20 extra recipients.');
    patch = { ...patch, recipients: list };
  }
  const keys: (keyof ReportSettings)[] = ['weeklyEnabled', 'weeklyDay', 'weeklyHour', 'nearGoalPoints', 'recipients', 'includeChairs', 'includeAdmins', 'prizeAlertsEnabled'];
  const changed: Record<string, unknown> = {};
  for (const k of keys) {
    if (patch[k] === undefined) continue;
    if (JSON.stringify(patch[k]) !== JSON.stringify(next[k])) changed[k] = patch[k];
    (next as unknown as Record<string, unknown>)[k] = patch[k];
  }
  next.updatedAt = now();
  d.reportSettings = next;
  if (Object.keys(changed).length) logAction('report_settings_changed', undefined, changed, chair);
  save();
  return { ...next, recipients: [...next.recipients] };
}

export async function sendWeeklyReportNow(): Promise<void> {
  await delay();
  requireRole('chair');
  const to = reportRecipients();
  if (!to.length) fail('no_recipients', 'Nobody would get it — turn on chairs/admins or add a recipient first.');
  const r = buildWeeklyReport();
  enqueueEmail('weekly_report', to, r.subject, r.text, r.html, `weekly-manual:${Date.now()}:${Math.random()}`);
  save();
}

export async function sendTestEmail(): Promise<void> {
  await delay();
  const chair = requireRole('chair');
  const subject = 'YACquest test email ✅';
  const text = `Hi ${chair.displayName}, this is a test from YACquest. If you're reading this, the weekly report and prize alerts can reach you.`;
  enqueueEmail('test', [chair.email.toLowerCase()], subject, text, emailHtml(subject, `<p>${esc(text)}</p>`), `test:${nextId('t')}`);
  save();
}

export async function emailLog(limit = 50): Promise<EmailLogRow[]> {
  await delay();
  requireRole('chair');
  maybeEnqueueWeekly(); // stands in for the 10-minute cron in the demo
  return load()
    .outbox.slice()
    .reverse()
    .slice(0, limit)
    .map(({ text: _t, html: _h, dedupeKey: _k, ...row }) => ({ ...row, toEmails: [...row.toEmails] }));
}

export async function retryEmail(id: string): Promise<void> {
  await delay();
  requireRole('chair');
  const r = load().outbox.find((x) => x.id === id);
  if (!r) return fail('not_found', 'Email not found.');
  r.status = 'pending';
  r.attempts = 0;
  r.lastError = undefined;
  scheduleDelivery();
  save();
}

export async function adminActionLog(opts: { before?: number; limit?: number } = {}): Promise<AdminAction[]> {
  await delay();
  requireRole('chair');
  const limit = opts.limit ?? 50;
  return load()
    .actions.filter((a) => opts.before == null || a.id < opts.before)
    .slice()
    .reverse()
    .slice(0, limit)
    .map((a) => ({ ...a, details: { ...a.details } }));
}

// ───────────────────────────── announcements (admins) ─────────────────────────────

/** SERVER RULE (send_announcement in 0006): admins send; only chairs may EMAIL everyone; 20 per sender per day. */
export async function sendAnnouncement(input: AnnouncementInput): Promise<{ recipients: number; emailed: number }> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const problem = announcementError(input);
  if (problem) fail(problem.code, problem.message);
  if (input.audience === 'all' && input.sendEmail && admin.role !== 'chair')
    fail('forbidden', 'Only a YAC chair can email everyone. Uncheck email or pick a campus.');
  const d = load();
  const today = d.announcements.filter((a) => a.senderName === admin.displayName && Date.now() - new Date(a.createdAt).getTime() < 86_400_000).length;
  if (today >= 20) fail('limit', 'You’ve sent 20 messages today. Try again tomorrow.');
  const targets = d.users.filter((u) =>
    input.audience === 'all' ? true : input.audience === 'campus' ? u.campus === input.campus : u.id === input.userId,
  );
  if (!targets.length) fail(input.audience === 'user' ? 'user' : 'audience', input.audience === 'user' ? 'Pick the person to message.' : 'Nobody matches that audience yet.');
  const title = input.title.trim();
  const body = input.body.trim();
  for (const u of targets) notify(u.id, 'announcement', title, body);
  let emailed = 0;
  const id = nextId('ann');
  if (input.sendEmail) {
    const emails = [...new Set(targets.filter((u) => u.emailOptIn || input.audience === 'user').map((u) => u.email.toLowerCase()))];
    emailed = emails.length;
    for (let i = 0; i * 90 < emails.length; i++)
      enqueueEmail('announcement', emails.slice(i * 90, (i + 1) * 90), `📣 YACquest: ${title}`, body, emailHtml(title, `<p>${esc(body)}</p>`), `announcement:${id}:${i}`);
  }
  const target = input.audience === 'user' ? targets[0] : undefined;
  d.announcements.unshift({
    id, title, body, audience: input.audience,
    campus: input.audience === 'campus' ? input.campus : undefined,
    targetName: target?.displayName, sendEmail: input.sendEmail,
    recipientCount: targets.length, emailCount: emailed, senderName: admin.displayName, createdAt: now(),
  });
  logAction('announcement_sent', target, { title, audience: input.audience, campus: input.campus ?? null, recipients: targets.length, emailed }, admin);
  save();
  return { recipients: targets.length, emailed };
}

export async function listAnnouncements(limit = 20): Promise<Announcement[]> {
  await delay();
  requireRole('admin', 'chair');
  return load().announcements.slice(0, limit);
}

// ───────────────────────────── feedback ─────────────────────────────

/** SERVER RULE (submit_feedback in 0008): 3–1000 chars, 10 per person per day. */
export async function submitFeedback(category: FeedbackCategory, message: string): Promise<void> {
  await delay();
  const user = me();
  const d = load();
  if (!['idea', 'bug', 'event', 'other'].includes(category)) fail('category', 'Pick what kind of feedback this is.');
  if (message.trim().length < 3 || message.trim().length > 1000) fail('message', 'Feedback: 3–1000 characters.');
  if (d.feedback.filter((f) => f.userId === user.id && Date.now() - new Date(f.createdAt).getTime() < 86_400_000).length >= 10)
    fail('limit', 'Thanks for all the feedback! Please try again tomorrow.');
  d.feedback.unshift({ id: nextId('fb'), userId: user.id, category, message: message.trim(), status: 'new', createdAt: now() });
  save();
}

export async function listFeedback(status?: 'new' | 'reviewed', limit = 50): Promise<FeedbackItem[]> {
  await delay();
  requireRole('admin', 'chair');
  const d = load();
  const who = (id: string) => d.users.find((u) => u.id === id);
  const name = (id?: string) => (id ? who(id)?.displayName : undefined);
  const items: FeedbackItem[] = [
    ...d.feedback.map((f) => ({
      id: f.id, kind: 'feedback' as const, category: f.category, message: f.message, status: f.status,
      displayName: who(f.userId)?.displayName ?? 'Unknown', handle: who(f.userId)?.handle ?? '', campus: who(f.userId)?.campus ?? 'duke',
      reviewedByName: name(f.reviewedBy), reviewedAt: f.reviewedAt, createdAt: f.createdAt,
    })),
    ...d.suggestions.map((s) => {
      const x = s as typeof s & { status?: 'new' | 'reviewed'; reviewedBy?: string; reviewedAt?: string };
      return {
        id: s.id, kind: 'prize' as const, category: 'prize' as const, message: s.idea, status: x.status ?? 'new',
        displayName: who(s.userId)?.displayName ?? 'Unknown', handle: who(s.userId)?.handle ?? '', campus: who(s.userId)?.campus ?? 'duke',
        reviewedByName: name(x.reviewedBy), reviewedAt: x.reviewedAt, createdAt: s.createdAt,
      };
    }),
  ];
  return items
    .filter((i) => !status || i.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function markFeedbackReviewed(kind: FeedbackItem['kind'], id: string): Promise<void> {
  await delay();
  const admin = requireRole('admin', 'chair');
  const d = load();
  const row = kind === 'feedback' ? d.feedback.find((f) => f.id === id) : (d.suggestions.find((s) => s.id === id) as (typeof d.suggestions)[number] & { status?: string; reviewedBy?: string; reviewedAt?: string } | undefined);
  if (!row) return fail('not_found', 'That feedback no longer exists.');
  Object.assign(row, { status: 'reviewed', reviewedBy: admin.id, reviewedAt: now() });
  const target = d.users.find((u) => u.id === row.userId);
  logAction('feedback_reviewed', target, { kind, message: ('message' in row ? row.message : (row as { idea: string }).idea).slice(0, 120) }, admin);
  save();
}

// ───────────────────────────── quest extras (0009): badges, wardrobe, weekly shout-out ─────────────────────────────
// SERVER RULE: my_badges(), my_unlocks(), equip_look() and weekly_shoutout() in 0009_quest_extras.sql
// mirror these rules. Everything counts for the current cycle only (the mock ledger IS the cycle).

const monthKey = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 7);
  }
};

/** Badge progress for any user (exported for tests via __test). */
function badgesFor(userId: string): BadgeProgress[] {
  const d = load();
  const mine = d.ledger.filter((l) => l.userId === userId);
  // Check-ins: one per event.
  const checkins = new Map<string, LedgerEntry>();
  for (const l of mine) if (l.source === 'checkin' && l.refId && !checkins.has(l.refId)) checkins.set(l.refId, l);
  const events = [...checkins.keys()].map((id) => d.events.find((e) => e.id === id)).filter((e): e is YacEvent => !!e);
  const campuses = new Set(events.map((e) => e.campus).filter((c) => c !== 'all'));
  const months = new Set([...checkins.values()].map((l) => monthKey(l.createdAt)));
  const approved = d.submissions.filter((s) => s.userId === userId && s.status === 'approved');
  const digital = approved.filter((s) => activityById(s.activityId)?.tier === 3).length;
  const photos = approved.filter((s) => s.activityId === 'event_photos').length;
  const gifts = approved.filter((s) => s.activityId === 'annual_fund').length;
  const recruits = mine.filter((l) => l.activityId === 'bring_new_alum' && l.amount > 0).length;
  const wins = mine.filter((l) => l.activityId === 'game_win' && l.amount > 0).length;
  const voices = d.feedback.filter((f) => f.userId === userId).length + d.suggestions.filter((x) => x.userId === userId).length;
  const highImpact = events.filter((e) => e.kind === 'high_impact').length;
  const points = Math.max(0, pointsOf(userId));
  const raw: Record<string, [number, number]> = {
    first_checkin: [checkins.size, 1],
    regular: [checkins.size, 5],
    veteran: [checkins.size, 10],
    explorer: [campuses.size, 3],
    big_moment: [highImpact, 1],
    seasons: [months.size, 3],
    digital: [digital, 3],
    shutterbug: [photos, 1],
    recruiter: [recruits, 1],
    giver: [gifts, 1],
    champion: [wins, 1],
    voice: [voices, 1],
    halfway: [points, Math.ceil(PRIZE.goal / 2)],
    legend: [points, PRIZE.goal],
  };
  return BADGES.map((b) => {
    const [progress, goal] = raw[b.id] ?? [0, 1];
    return { id: b.id, earned: progress >= goal, progress: Math.min(progress, goal), goal };
  });
}

function unlocksFor(userId: string): string[] {
  const badges = badgesFor(userId);
  const earned = new Set(badges.filter((b) => b.earned).map((b) => b.id));
  const points = pointsOf(userId);
  const ok = (r: UnlockRule) =>
    r.type === 'free' || (r.type === 'points' && points >= r.min) || (r.type === 'badge' && earned.has(r.id)) || (r.type === 'badges' && earned.size >= r.min);
  return COSMETICS.filter((c) => ok(c.rule)).map((c) => c.id);
}

/** The most points gained (positive rows only) in the last 7 days; ties → alphabetical. */
function shoutoutSync(): Shoutout | null {
  const d = load();
  const since = Date.now() - 7 * 86_400_000;
  const gains = new Map<string, number>();
  for (const l of d.ledger) if (l.amount > 0 && new Date(l.createdAt).getTime() >= since) gains.set(l.userId, (gains.get(l.userId) ?? 0) + l.amount);
  let best: { u: User; pts: number } | null = null;
  for (const u of d.users) {
    const pts = gains.get(u.id) ?? 0;
    if (u.role !== 'participant' || pts <= 0) continue;
    if (!best || pts > best.pts || (pts === best.pts && u.displayName.localeCompare(best.u.displayName) < 0)) best = { u, pts };
  }
  if (!best) return null;
  const { u, pts } = best;
  return { userId: u.id, displayName: u.displayName, campus: u.campus, avatar: u.avatar, look: u.look, pointsThisWeek: pts };
}

export async function myBadges(): Promise<BadgeProgress[]> {
  await delay(100);
  return badgesFor(me().id);
}

export async function myUnlocks(): Promise<string[]> {
  await delay(80);
  return unlocksFor(me().id);
}

/** Replaces the whole look; a missing/'' slot clears it. Errors: `look` (unknown item / wrong slot), `locked`. */
export async function equipLook(look: Look): Promise<User> {
  await delay();
  const user = me();
  const unlocked = new Set(unlocksFor(user.id));
  const next: Look = {};
  for (const slot of ['hat', 'accessory', 'background'] as const) {
    const id = look[slot]?.trim();
    if (!id) continue;
    const item = cosmeticById(id);
    if (!item || item.slot !== slot) fail('look', 'That item doesn’t fit there.');
    if (!unlocked.has(id)) fail('locked', `You haven’t unlocked the ${item!.name} yet.`);
    next[slot] = id;
  }
  // New object so React state holding the old user sees the change.
  const d = load();
  const updated: User = { ...user, look: Object.keys(next).length ? next : undefined };
  d.users[d.users.indexOf(user)] = updated;
  save();
  return updated;
}

export async function weeklyShoutout(): Promise<Shoutout | null> {
  await delay(100);
  return shoutoutSync();
}

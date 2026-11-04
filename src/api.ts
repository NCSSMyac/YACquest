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
import { CAPS, CAMPUSES, CYCLE, PRIZE, TIER_POINTS, type CampusId } from './config';
import { ACTIVITIES, ONCE_PER_CYCLE, activityById } from './lib/activities';
import type {
  Activity,
  AppNotification,
  AvatarId,
  CampusCupRow,
  Dashboard,
  LeaderRow,
  LedgerEntry,
  NotificationKind,
  PrizeClaim,
  PrizeStatus,
  PrizeSuggestion,
  Role,
  Submission,
  SubmissionStatus,
  SyncStatus,
  User,
  YacEvent,
} from './types';

// ───────────────────────────── errors ─────────────────────────────

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
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
  sync: SyncStatus;
  seq: number;
}

const DB_KEY = 'yacquest-db-v1';
const SESSION_KEY = 'yacquest-session';
const DB_VERSION = 1;

let db: Db | null = null;
const listeners = new Set<() => void>();

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
  listeners.forEach((fn) => fn());
}

/** Subscribe to any data change (used for the header badge and live counters). */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
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

/** Campus leads only see their own campus; the chair sees everything. */
const canManage = (admin: User, target: { campus: CampusId }) =>
  admin.role === 'chair' || (admin.role === 'campus_lead' && admin.campus === target.campus);

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
    .map((u) => ({ userId: u.id, displayName: u.displayName, campus: u.campus, avatar: u.avatar, points: totals.get(u.id) ?? 0 }))
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
  const user = d.users.find((u) => u.id === entry.userId);
  if (!user || user.role !== 'participant') return;
  const total = pointsOf(user.id);
  const already = d.claims.some((c) => c.userId === user.id);
  if (total >= PRIZE.goal && !already && d.claims.length < PRIZE.count) {
    const spot = d.claims.length + 1;
    d.claims.push({ spot, userId: user.id, displayName: user.displayName, campus: user.campus, qualifiedAt: createdAt, status: 'qualified' });
    notify(user.id, 'prize_qualified', `You won spot #${spot}!`, `You reached ${PRIZE.goal} points and claimed a ${PRIZE.name}. Open Prize to send your delivery info.`);
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

export async function signup(input: SignupInput): Promise<User> {
  await delay();
  const d = load();
  if (!input.acceptedRules) fail('rules', 'Please read and accept the rules.');
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(input.handle)) fail('handle', 'Username: 3–20 letters, numbers, dots or underscores.');
  if (input.displayName.trim().length < 2 || input.displayName.length > 24) fail('displayName', 'Display name: 2–24 characters.');
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
  return user;
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
    myClaim: d.claims.find((c) => c.userId === user.id),
    recentSubmissions: d.submissions.filter((s) => s.userId === user.id).slice(-5).reverse(),
    recentLedger: d.ledger.filter((l) => l.userId === user.id).slice(-8).reverse(),
    unreadCount: d.notifications.filter((n) => n.userId === user.id && !n.read).length,
    daysLeft: Math.max(0, Math.ceil((new Date(CYCLE.end).getTime() - Date.now()) / 86_400_000)),
    referralsUsed: d.ledger.filter((l) => l.userId === user.id && l.source === 'referral').length,
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
      ...strip(e, isAdmin && canManage(user, { campus: e.campus === 'all' ? user.campus : e.campus })),
      checkedIn: d.ledger.some((l) => l.userId === user.id && l.source === 'checkin' && l.refId === e.id),
    }));
}

/** Which activity a check-in earns for this user (cross-campus is Tier 1). */
function checkInActivity(e: YacEvent, user: User): Activity {
  // Tier 1 is for official cross-campus events. Visiting another campus's home event counts as Tier 2.
  void user;
  if (e.crossCampus || e.campus === 'all') return activityById('cross_campus_event')!;
  if (e.kind === 'panel') return activityById('panel_mentorship')!;
  return activityById('home_event')!;
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
  if (!password.trim() || password.trim().toLowerCase() !== (e.password ?? '').toLowerCase()) fail('wrong_password', 'Wrong password. Ask your campus lead for the event code.');
  const activity = checkInActivity(e, user);
  const points = TIER_POINTS[activity.tier];
  addLedger({ userId: user.id, amount: points, source: 'checkin', activityId: activity.id, refId: e.id, reason: `Checked in: ${e.title}` });
  e.attendeeCount++;

  // Referral bonus: first event attended by someone who signed up with a friend code.
  const firstCheckIn = d.ledger.filter((l) => l.userId === user.id && l.source === 'checkin').length === 1;
  if (firstCheckIn && user.referredBy) {
    const used = d.ledger.filter((l) => l.userId === user.referredBy && l.source === 'referral').length;
    if (used < CAPS.referralsPerCycle) {
      addLedger({ userId: user.referredBy, amount: TIER_POINTS[1], source: 'referral', activityId: 'bring_new_alum', refId: user.id, reason: `Brought a new alum: ${user.displayName}` });
      notify(user.referredBy, 'points_adjusted', `+${TIER_POINTS[1]} for bringing a friend`, `${user.displayName} checked in to their first YAC event.`);
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
  const claims = load().claims.slice().sort((a, b) => a.spot - b.spot);
  return { goal: PRIZE.goal, total: PRIZE.count, remaining: Math.max(0, PRIZE.count - claims.length), claims };
}

export async function prizeStatus(): Promise<PrizeStatus> {
  await delay(80);
  return prizeStatusSync();
}

export async function submitClaimInfo(contact: { fullName: string; email: string; preference: string; notes?: string }): Promise<PrizeClaim> {
  await delay(400);
  const user = me();
  const claim = load().claims.find((c) => c.userId === user.id);
  if (!claim) return fail('no_claim', 'You haven’t won a spot yet.');
  if (claim.status === 'fulfilled') fail('fulfilled', 'This prize was already delivered.');
  if (contact.fullName.trim().length < 2) fail('fullName', 'Enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(contact.email)) fail('email', 'Enter a valid email.');
  claim.contact = { ...contact, fullName: contact.fullName.trim() };
  claim.status = 'info_submitted';
  claim.reference = claim.reference ?? `YQ-${new Date().getFullYear()}-${String(claim.spot).padStart(2, '0')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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

// ───────────────────────────── admin (campus leads + chair) ─────────────────────────────

export interface QueueItem extends Submission {
  user: Pick<User, 'id' | 'displayName' | 'campus' | 'handle'>;
  activity: Activity;
  eventTitle?: string;
}

export async function reviewQueue(filters: { status?: SubmissionStatus; campus?: CampusId; activityId?: string } = {}): Promise<QueueItem[]> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
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
  const admin = requireRole('campus_lead', 'chair');
  const d = load();
  const s = d.submissions.find((x) => x.id === id);
  if (!s) return fail('not_found', 'Submission not found.');
  const owner = d.users.find((u) => u.id === s.userId)!;
  if (!canManage(admin, owner)) fail('forbidden', 'That participant is on another campus.');
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
  save();
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

export async function searchUsers(query: string, limit = 20): Promise<AdminUserRow[]> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
  const q = query.trim().toLowerCase();
  const totals = pointsByUser();
  return load()
    .users.filter((u) => canManage(admin, u) && (!q || u.displayName.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)))
    .slice(0, limit)
    .map((u) => ({ id: u.id, handle: u.handle, displayName: u.displayName, email: u.email, campus: u.campus, role: u.role, points: totals.get(u.id) ?? 0 }));
}

export async function userLedger(userId: string): Promise<LedgerEntry[]> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
  const u = load().users.find((x) => x.id === userId);
  if (!u || !canManage(admin, u)) return fail('forbidden', 'Not found.');
  return load().ledger.filter((l) => l.userId === userId).slice().reverse();
}

/** Manual add/remove. Reason is required and is shown to the participant. */
export async function adjustPoints(userId: string, amount: number, reason: string): Promise<void> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
  const u = load().users.find((x) => x.id === userId);
  if (!u || !canManage(admin, u)) return fail('forbidden', 'You can only adjust participants on your campus.');
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 500) fail('amount', 'Enter a whole number between -500 and 500 (not 0).');
  if (reason.trim().length < 3) fail('reason', 'A reason is required.');
  addLedger({ userId, amount, source: 'manual', reason: reason.trim(), createdBy: admin.id });
  notify(userId, 'points_adjusted', `${amount > 0 ? '+' : ''}${amount} pts from ${admin.displayName}`, reason.trim());
  save();
}

/** Award a lead-verified activity (e.g. winning a game) at its tier value. */
export async function awardActivity(userId: string, activityId: string, note: string): Promise<void> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
  const u = load().users.find((x) => x.id === userId);
  const a = activityById(activityId);
  if (!u || !canManage(admin, u)) return fail('forbidden', 'You can only award participants on your campus.');
  if (!a) return fail('activity', 'Unknown activity.');
  addLedger({ userId, amount: TIER_POINTS[a.tier], source: 'manual', activityId, reason: note.trim() ? `${a.title}: ${note.trim()}` : a.title, createdBy: admin.id });
  notify(userId, 'points_adjusted', `+${TIER_POINTS[a.tier]} pts — ${a.title}`, note.trim() || `Awarded by ${admin.displayName}`);
  save();
}

export type EventInput = Omit<YacEvent, 'id' | 'attendeeCount' | 'activityId'> & { password: string };

export async function adminListEvents(): Promise<YacEvent[]> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
  return load()
    .events.filter((e) => admin.role === 'chair' || e.campus === admin.campus || e.campus === 'all')
    .slice()
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

function validateEvent(admin: User, input: EventInput) {
  if (input.title.trim().length < 3) fail('title', 'Give the event a title.');
  if (input.password.trim().length < 4) fail('password', 'Event password: at least 4 characters.');
  if (new Date(input.endsAt) <= new Date(input.startsAt)) fail('endsAt', 'End time must be after the start.');
  if (admin.role === 'campus_lead' && input.campus !== admin.campus) fail('campus', 'Campus leads can only create events for their campus.');
}

export async function createEvent(input: EventInput): Promise<YacEvent> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
  validateEvent(admin, input);
  const e: YacEvent = { ...input, title: input.title.trim(), password: input.password.trim(), id: nextId('evt'), attendeeCount: 0, activityId: input.crossCampus || input.campus === 'all' ? 'cross_campus_event' : input.kind === 'panel' ? 'panel_mentorship' : 'home_event' };
  load().events.push(e);
  save();
  return e;
}

export async function updateEvent(id: string, input: EventInput): Promise<YacEvent> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
  const e = load().events.find((x) => x.id === id);
  if (!e || (admin.role !== 'chair' && e.campus !== admin.campus)) return fail('forbidden', 'Not found.');
  validateEvent(admin, input);
  Object.assign(e, input, { title: input.title.trim(), password: input.password.trim(), activityId: input.crossCampus || input.campus === 'all' ? 'cross_campus_event' : input.kind === 'panel' ? 'panel_mentorship' : 'home_event' });
  save();
  return e;
}

export async function deleteEvent(id: string): Promise<void> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
  const d = load();
  const e = d.events.find((x) => x.id === id);
  if (!e || (admin.role !== 'chair' && e.campus !== admin.campus)) return fail('forbidden', 'Not found.');
  if (e.attendeeCount > 0) fail('has_attendees', 'People already checked in — this event can’t be deleted.');
  d.events = d.events.filter((x) => x.id !== id);
  save();
}

export async function listClaims(): Promise<PrizeClaim[]> {
  await delay();
  requireRole('chair');
  return prizeStatusSync().claims;
}

export async function markFulfilled(spot: number): Promise<void> {
  await delay();
  requireRole('chair');
  const c = load().claims.find((x) => x.spot === spot);
  if (!c) return fail('not_found', 'Claim not found.');
  c.status = 'fulfilled';
  c.fulfilledAt = now();
  notify(c.userId, 'prize_update', 'Your prize is on the way!', `Your ${PRIZE.name} has been sent. Reference ${c.reference ?? '—'}.`);
  save();
}

export async function listSuggestions(): Promise<(PrizeSuggestion & { displayName: string })[]> {
  await delay();
  requireRole('campus_lead', 'chair');
  const d = load();
  return d.suggestions
    .map((s) => ({ ...s, displayName: d.users.find((u) => u.id === s.userId)?.displayName ?? 'Unknown' }))
    .reverse();
}

export interface AdminOverview {
  participants: number;
  activeThisWeek: number;
  pointsThisWeek: number;
  pendingReviews: number;
  newSignupsThisWeek: number;
  prize: PrizeStatus;
  nearGoal: LeaderRow[]; // people within 100 pts of the goal who haven't claimed
}

export async function adminOverview(): Promise<AdminOverview> {
  await delay();
  const admin = requireRole('campus_lead', 'chair');
  const d = load();
  const campus = admin.role === 'campus_lead' ? admin.campus : undefined;
  const inScope = new Set(d.users.filter((u) => u.role === 'participant' && (!campus || u.campus === campus)).map((u) => u.id));
  const wk = weekStart(now());
  const thisWeek = d.ledger.filter((l) => inScope.has(l.userId) && new Date(l.createdAt).getTime() >= wk);
  const claimed = new Set(d.claims.map((c) => c.userId));
  return {
    participants: inScope.size,
    activeThisWeek: new Set(thisWeek.map((l) => l.userId)).size,
    pointsThisWeek: thisWeek.reduce((s, l) => s + Math.max(0, l.amount), 0),
    pendingReviews: d.submissions.filter((s) => s.status === 'pending' && inScope.has(s.userId)).length,
    newSignupsThisWeek: d.users.filter((u) => inScope.has(u.id) && new Date(u.createdAt).getTime() >= wk).length,
    prize: prizeStatusSync(),
    nearGoal: rankedParticipants(campus).filter((r) => !claimed.has(r.userId) && r.points >= PRIZE.goal - 100).slice(0, 10),
  };
}

// Google Sheets two-way sync (proposal §5). The backend owns the real job;
// the front end only shows status and can trigger a manual run.
export async function syncStatus(): Promise<SyncStatus> {
  await delay();
  requireRole('chair');
  return load().sync;
}

export async function runSync(): Promise<SyncStatus> {
  requireRole('chair');
  const d = load();
  d.sync = { ...d.sync, state: 'syncing' };
  save();
  await delay(1200);
  d.sync = { ...d.sync, state: 'ok', lastSyncAt: now(), rowsPushed: d.ledger.length, rowsPulled: 0, conflicts: 0 };
  save();
  return d.sync;
}

/** CSV of the full ledger — for the Sheet, audits and the year-end archive. */
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

export async function weeklyReportPreview(): Promise<{ subject: string; lines: string[] }> {
  const o = await adminOverview();
  const top = await leaderboard(5);
  return {
    subject: `YACquest weekly report — ${new Date().toLocaleDateString()}`,
    lines: [
      `${o.activeThisWeek} of ${o.participants} participants earned points this week (${o.pointsThisWeek} pts total).`,
      `${o.newSignupsThisWeek} new sign-ups. ${o.pendingReviews} submissions waiting for review.`,
      `Prize race: ${o.prize.remaining} of ${o.prize.total} spots left.`,
      `Top 5: ${top.map((r) => `${r.displayName} (${r.points})`).join(', ')}`,
    ],
  };
}

/** End-of-cycle reset (proposal §3): archive, then zero everyone. Chair only. */
export async function resetCycle(confirmText: string): Promise<void> {
  await delay(600);
  requireRole('chair');
  if (confirmText !== 'RESET') fail('confirm', 'Type RESET to confirm.');
  const d = load();
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
const AVATARS: AvatarId[] = ['yak', 'knight', 'mage', 'ranger'];

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
    sync: { lastSyncAt: iso(-2 * H), rowsPushed: 0, rowsPulled: 0, conflicts: 0, state: 'ok', sheetUrl: 'https://docs.google.com/spreadsheets/' },
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
  mkUser({ handle: 'admin', displayName: 'YAC Chair', campus: 'unc', role: 'chair', avatar: 'yak' }, CYCLE.start);
  mkUser({ handle: 'lead.duke', displayName: 'Duke Lead', campus: 'duke', role: 'campus_lead', avatar: 'knight' }, CYCLE.start);
  mkUser({ handle: 'lead.unc', displayName: 'UNC Lead', campus: 'unc', role: 'campus_lead', avatar: 'mage' }, CYCLE.start);
  mkUser({ handle: 'lead.ncsu', displayName: 'NC State Lead', campus: 'ncsu', role: 'campus_lead', avatar: 'ranger' }, CYCLE.start);

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

  // Events: past, live now (so check-in works in a demo), and upcoming.
  const ev = (e: Omit<YacEvent, 'id' | 'attendeeCount' | 'checkInGraceMinutes'>, attendees = 0) =>
    d.events.push({ ...e, id: nextId('evt'), attendeeCount: attendees, checkInGraceMinutes: 60 });
  ev({ title: 'Kickoff Mixer', campus: 'duke', crossCampus: false, kind: 'social', location: 'Duke Gardens', startsAt: iso(-12 * D), endsAt: iso(-12 * D + 2 * H), password: 'KICKOFF', activityId: 'home_event' }, 34);
  ev({ title: 'Trivia Night', campus: 'unc', crossCampus: false, kind: 'game_night', location: 'Top of the Hill', startsAt: iso(-6 * D), endsAt: iso(-6 * D + 2 * H), password: 'TARHEEL', activityId: 'home_event' }, 41);
  ev({ title: 'Study Break Social', campus: 'duke', crossCampus: false, kind: 'social', location: 'Bryan Center', startsAt: iso(-1 * H), endsAt: iso(3 * H), password: 'BLUEDEVIL', activityId: 'home_event' });
  ev({ title: 'Career Panel: First Jobs', campus: 'unc', crossCampus: false, kind: 'panel', location: 'Gerrard Hall', startsAt: iso(-1 * H), endsAt: iso(3 * H), password: 'PANEL', activityId: 'panel_mentorship' });
  ev({ title: 'Pack Game Watch', campus: 'ncsu', crossCampus: false, kind: 'game_night', location: 'Talley Student Union', startsAt: iso(-1 * H), endsAt: iso(3 * H), password: 'WOLFPACK', activityId: 'home_event' });
  ev({ title: 'Triangle Trivia Showdown', campus: 'all', crossCampus: true, kind: 'game_night', location: 'American Tobacco Campus, Durham', startsAt: iso(-1 * H), endsAt: iso(4 * H), password: 'TRIANGLE', activityId: 'cross_campus_event' });
  ev({ title: 'Mentorship Circle', campus: 'duke', crossCampus: false, kind: 'panel', location: 'Perkins Library', startsAt: iso(5 * D), endsAt: iso(5 * D + 90 * 60_000), password: 'MENTOR', activityId: 'panel_mentorship' });
  ev({ title: 'Winter Service Day', campus: 'all', crossCampus: true, kind: 'service', location: 'NCSSM Durham', startsAt: iso(17 * D), endsAt: iso(17 * D + 4 * H), password: 'SERVE', activityId: 'cross_campus_event' });

  // Demo participant history
  const kickoff = d.events[0];
  d.ledger.push({ id: nextId('led'), userId: demo.id, amount: TIER_POINTS[2], source: 'checkin', activityId: 'home_event', refId: kickoff.id, reason: `Checked in: ${kickoff.title}`, createdAt: kickoff.startsAt });
  d.ledger.push({ id: nextId('led'), userId: demo.id, amount: TIER_POINTS[3], source: 'submission', activityId: 'follow_ig', reason: 'Approved: Follow YAC on Instagram', createdAt: iso(-10 * D) });
  d.ledger.push({ id: nextId('led'), userId: demo.id, amount: TIER_POINTS[2], source: 'manual', activityId: 'game_win', reason: 'Win a Game or Competition: Kickoff cornhole', createdAt: kickoff.endsAt });
  d.submissions.push({ id: nextId('sub'), userId: demo.id, activityId: 'follow_ig', imageUrl: PLACEHOLDER_IMG('FOLLOW', '#3b6fd8'), note: '', status: 'approved', createdAt: iso(-11 * D), reviewedAt: iso(-10 * D) });
  d.submissions.push({ id: nextId('sub'), userId: demo.id, activityId: 'repost', imageUrl: PLACEHOLDER_IMG('REPOST', '#8a4fd8'), note: 'Reposted the trivia poster', status: 'rejected', reviewReason: 'Screenshot was cropped — we couldn’t see the YAC post.', createdAt: iso(-8 * D), reviewedAt: iso(-7 * D) });
  notify(demo.id, 'submission_rejected', 'Not approved — Repost a YAC Post', 'Screenshot was cropped — we couldn’t see the YAC post.');
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
  d.sync.rowsPushed = d.ledger.length;
  return d;
}

// Expose for tests
export const __test = { load, pointsOf, rankedParticipants, setSession, addLedger };

/**
 * YACquest API — the real backend (Supabase). Same exports as mock.ts (index.ts checks).
 *
 * The database contract (tables, RLS, RPC names and shapes, error format) is
 * docs/BACKEND.md. Points only ever change through RPCs; this file never writes to
 * tables directly except the `proofs` storage bucket.
 */
import type { Session, User as AuthUser } from '@supabase/supabase-js';
import { CAMPUSES, PRIZE, TIER_POINTS, type CampusId } from '../config';
import { ACTIVITIES, activityById } from '../lib/activities';
import { getSupabase, siteUrl } from '../lib/supabase';
import { claimContactError, isEmail } from '../lib/validate';
import type {
  Activity,
  AdminAction,
  AppNotification,
  AvatarId,
  CampusCupRow,
  ClaimContact,
  ClaimStatus,
  Dashboard,
  EmailLogRow,
  EmailStatus,
  LeaderRow,
  LedgerEntry,
  LedgerSource,
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
} from '../types';
import { ApiError, emitChange } from './shared';
import type { AdminOverview, AdminUserRow, EventInput, QueueItem, SignupInput, SignupResult, TeamMember } from './shared';

export { subscribe } from './shared';
export type { AdminOverview, AdminUserRow, EventInput, QueueItem, SignupInput, SignupResult, TeamMember } from './shared';

/** False on the real backend. Screens use it to hide demo hints. */
export const isMock: boolean = false;

const sb = () => getSupabase();
const fail = (code: string, message: string): never => {
  throw new ApiError(code, message);
};

// ───────────────────────────── errors ─────────────────────────────

type AnyRow = Record<string, unknown>;

/** RPCs raise `'<code>: <message>'` (docs/BACKEND.md). Everything else becomes a friendly network error. */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = (err ?? {}) as { message?: string; code?: string; status?: number };
  const msg = typeof e.message === 'string' ? e.message : '';
  const m = /^([A-Za-z_]+): ([\s\S]+)$/.exec(msg);
  if (m) return new ApiError(m[1], m[2]);
  if (e.code === 'PGRST301' || /jwt expired|invalid jwt/i.test(msg)) return new ApiError('unauthenticated', 'Your session expired. Please log in again.');
  if (e.code === '42501' || /permission denied|row-level security/i.test(msg)) return new ApiError('forbidden', 'You do not have access to that.');
  console.error('[YACquest] backend error', err);
  if (/failed to fetch|network|load failed/i.test(msg)) return new ApiError('network', 'Can’t reach the server. Check your connection and try again.');
  return new ApiError('network', 'Something went wrong talking to the server. Please try again.');
}

async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await sb().rpc(fn, args);
  } catch (e) {
    throw toApiError(e);
  }
  if (res.error) throw toApiError(res.error);
  return res.data as T;
}

/** Unwraps a PostgREST `{ data, error }` result. */
function rows<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toApiError(res.error);
  return res.data as T;
}

/** Supabase Auth errors → friendly messages. */
function authError(err: unknown, fallbackCode = 'auth'): ApiError {
  const e = (err ?? {}) as { message?: string; code?: string; status?: number };
  const msg = e.message ?? '';
  const code = e.code ?? '';
  if (e.status === 429 || /rate limit|too many/i.test(msg) || code.startsWith('over_')) return new ApiError('rate_limit', 'Too many attempts — wait a minute and try again.');
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return new ApiError('not_verified', 'Please confirm your email first — check your inbox (and spam).');
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return new ApiError('invalid', 'That email and password don’t match.');
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered|already exists/i.test(msg)) return new ApiError('email', 'An account with that email already exists. Try logging in or resetting your password.');
  if (code === 'weak_password' || /password should be|weak password/i.test(msg)) return new ApiError('password', 'That password is too weak. Use at least 8 characters with a mix of letters and numbers.');
  if (code === 'same_password' || /different from the old/i.test(msg)) return new ApiError('password', 'Choose a password that’s different from your old one.');
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(msg)) return new ApiError('email', 'Enter a valid email.');
  if (code === 'session_not_found' || code === 'session_expired' || /auth session missing/i.test(msg)) return new ApiError('unauthenticated', 'Your link expired. Please request a new one.');
  if (/database error saving new user/i.test(msg) || code === 'unexpected_failure')
    return new ApiError('form', 'We couldn’t create your account. Check your username and friend code and try again.');
  console.error('[YACquest] auth error', err);
  if (/failed to fetch|network|load failed/i.test(msg)) return new ApiError('network', 'Can’t reach the server. Check your connection and try again.');
  return new ApiError(fallbackCode, msg || 'Something went wrong. Please try again.');
}

// ───────────────────────────── mappers (snake_case rows → TS types) ─────────────────────────────

/** Reads `row.snake_key` or `row.camelKey` (RPCs that return json may use either). */
function pick<T = unknown>(row: AnyRow, snake: string): T {
  if (row[snake] !== undefined) return row[snake] as T;
  const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return row[camel] as T;
}
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const opt = (v: unknown): string | undefined => (v === null || v === undefined || v === '' ? undefined : String(v));
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

const PROFILE_COLS = 'id, handle, display_name, email, campus, role, avatar, friend_code, referred_by, email_opt_in, points, created_at';

function toUser(r: AnyRow, emailVerified?: boolean): User {
  return {
    id: str(r.id),
    handle: str(pick(r, 'handle')),
    displayName: str(pick(r, 'display_name')),
    email: str(pick(r, 'email')),
    campus: pick<CampusId>(r, 'campus'),
    role: pick<Role>(r, 'role'),
    avatar: pick<AvatarId>(r, 'avatar'),
    friendCode: str(pick(r, 'friend_code')),
    referredBy: opt(pick(r, 'referred_by')),
    createdAt: str(pick(r, 'created_at')),
    emailOptIn: pick(r, 'email_opt_in') !== false,
    emailVerified,
  };
}

const EVENT_COLS = 'id, title, campus, cross_campus, kind, location, starts_at, ends_at, check_in_grace_minutes, activity_id, attendee_count';

function toEvent(r: AnyRow): YacEvent {
  const password = opt(pick(r, 'password'));
  return {
    id: str(r.id),
    title: str(r.title),
    campus: pick<YacEvent['campus']>(r, 'campus'),
    crossCampus: Boolean(pick(r, 'cross_campus')),
    kind: pick<YacEvent['kind']>(r, 'kind'),
    location: str(r.location),
    startsAt: str(pick(r, 'starts_at')),
    endsAt: str(pick(r, 'ends_at')),
    checkInGraceMinutes: num(pick(r, 'check_in_grace_minutes')),
    activityId: str(pick(r, 'activity_id')),
    attendeeCount: num(pick(r, 'attendee_count')),
    ...(password !== undefined ? { password } : {}),
  };
}

const SUBMISSION_COLS = 'id, user_id, activity_id, event_id, image_path, note, status, reviewer_id, review_reason, created_at, reviewed_at';

function toSubmission(r: AnyRow, imageUrl = ''): Submission {
  return {
    id: str(r.id),
    userId: str(pick(r, 'user_id')),
    activityId: str(pick(r, 'activity_id')),
    eventId: opt(pick(r, 'event_id')),
    imageUrl,
    note: str(r.note),
    status: pick<SubmissionStatus>(r, 'status'),
    reviewerId: opt(pick(r, 'reviewer_id')),
    reviewReason: opt(pick(r, 'review_reason')),
    createdAt: str(pick(r, 'created_at')),
    reviewedAt: opt(pick(r, 'reviewed_at')),
  };
}

const LEDGER_COLS = 'id, user_id, amount, source, activity_id, ref_id, reason, created_by, created_at';

function toLedger(r: AnyRow): LedgerEntry {
  return {
    id: str(r.id),
    userId: str(pick(r, 'user_id')),
    amount: num(r.amount),
    source: pick<LedgerSource>(r, 'source'),
    activityId: opt(pick(r, 'activity_id')),
    refId: opt(pick(r, 'ref_id')),
    reason: str(r.reason),
    createdBy: opt(pick(r, 'created_by')),
    createdAt: str(pick(r, 'created_at')),
  };
}

function toContact(v: unknown): ClaimContact | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as AnyRow;
  return {
    fullName: str(pick(c, 'full_name')),
    email: str(c.email),
    phone: str(c.phone),
    address: str(c.address),
    preference: opt(c.preference),
    notes: opt(c.notes),
  };
}

function toClaim(r: AnyRow): PrizeClaim {
  const contact = toContact(pick(r, 'contact'));
  return {
    spot: num(r.spot),
    userId: str(pick(r, 'user_id')),
    displayName: str(pick(r, 'display_name')),
    campus: pick<CampusId>(r, 'campus'),
    qualifiedAt: str(pick(r, 'qualified_at')),
    status: pick<ClaimStatus>(r, 'status'),
    reference: opt(r.reference),
    contact,
    fulfilledAt: opt(pick(r, 'fulfilled_at')),
    revokedAt: opt(pick(r, 'revoked_at')),
    revokeReason: opt(pick(r, 'revoke_reason')),
  };
}

function toNotification(r: AnyRow): AppNotification {
  return {
    id: str(r.id),
    userId: str(pick(r, 'user_id')),
    kind: pick<NotificationKind>(r, 'kind'),
    title: str(r.title),
    body: str(r.body),
    read: Boolean(r.read),
    createdAt: str(pick(r, 'created_at')),
  };
}

function toLeader(r: AnyRow): LeaderRow {
  return {
    rank: num(r.rank),
    userId: str(pick(r, 'user_id')),
    displayName: str(pick(r, 'display_name')),
    campus: pick<CampusId>(r, 'campus'),
    avatar: pick<AvatarId>(r, 'avatar'),
    points: num(r.points),
  };
}

function toPrize(r: AnyRow | null): PrizeStatus {
  const p = r ?? {};
  const claims = (pick<AnyRow[] | null>(p, 'claims') ?? []).map(toClaim);
  return { goal: num(p.goal), total: num(p.total), remaining: num(p.remaining), claims };
}

/** RPCs returning one json object may come back as an object or a 1-row array. */
const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

// ───────────────────────────── session + caches ─────────────────────────────

let me: User | null = null;
let unread = 0;
let cycleCache: { id: string; endsAt: string; at: number } | null = null;

function setUnread(n: number) {
  if (n !== unread) {
    unread = n;
    emitChange();
  }
}

async function session(): Promise<Session | null> {
  const { data } = await sb().auth.getSession();
  return data.session;
}

async function uid(): Promise<string> {
  const s = await session();
  if (!s) return fail('unauthenticated', 'Please log in again.');
  return s.user.id;
}

async function loadProfile(authUser: AuthUser): Promise<User | null> {
  const row = rows(await sb().from('profiles').select(PROFILE_COLS).eq('id', authUser.id).maybeSingle());
  me = row ? toUser(row as AnyRow, Boolean(authUser.email_confirmed_at)) : null;
  return me;
}

async function requireMe(): Promise<User> {
  if (me) return me;
  const s = await session();
  const u = s ? await loadProfile(s.user) : null;
  if (!u) return fail('unauthenticated', 'Please log in again.');
  return u;
}

async function refreshUnread(): Promise<void> {
  const s = await session();
  if (!s) return setUnread(0);
  const res = await sb().from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', s.user.id).eq('read', false);
  if (!res.error) setUnread(res.count ?? 0);
}

async function activeCycle(): Promise<{ id: string; endsAt: string }> {
  if (cycleCache && Date.now() - cycleCache.at < 5 * 60_000) return cycleCache;
  const row = rows(await sb().from('cycles').select('id, ends_at').eq('is_active', true).maybeSingle()) as AnyRow | null;
  if (!row) return fail('no_cycle', 'There is no active cycle right now.');
  cycleCache = { id: str(row.id), endsAt: str(row.ends_at), at: Date.now() };
  return cycleCache;
}

/** One batch call to sign many proof images (1 hour). Missing paths map to ''. */
async function signedUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const { data, error } = await sb().storage.from('proofs').createSignedUrls(unique, 3600);
  if (error) {
    console.error('[YACquest] signing proof images failed', error);
    return out;
  }
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

// Keep the badge fresh when someone comes back to the tab (cheaper than realtime for ~300 users).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && me) void refreshUnread().catch(() => {});
  });
}

// ───────────────────────────── auth ─────────────────────────────

export async function currentUser(): Promise<User | null> {
  try {
    const s = await session();
    if (!s) return (me = null);
    const u = await loadProfile(s.user);
    if (u) void refreshUnread().catch(() => {});
    return u;
  } catch (e) {
    console.error('[YACquest] could not restore session', e);
    return null;
  }
}

const authListeners = new Set<(user: User | null) => void>();
let authSubscribed = false;
let lastAuthUid: string | null | undefined;

function notifyAuth(user: User | null) {
  authListeners.forEach((fn) => fn(user));
}

/** Notifies when someone logs in or out (including via email links). Returns an unsubscribe function. */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  authListeners.add(cb);
  if (!authSubscribed) {
    authSubscribed = true;
    sb().auth.onAuthStateChange((event, s) => {
      const id = s?.user.id ?? null;
      // Token refreshes don't change who is logged in.
      if (event === 'TOKEN_REFRESHED' && id === lastAuthUid) return;
      lastAuthUid = id;
      // Don't call Supabase inside this callback (it can deadlock the auth lock) — defer.
      setTimeout(async () => {
        if (!s) {
          me = null;
          unread = 0;
          notifyAuth(null);
          emitChange();
          return;
        }
        try {
          const u = await loadProfile(s.user);
          notifyAuth(u);
          void refreshUnread().catch(() => {});
          emitChange();
        } catch (e) {
          console.error('[YACquest] could not load profile', e);
        }
      }, 0);
    });
  }
  return () => {
    authListeners.delete(cb);
  };
}

export async function login(handleOrEmail: string, password: string): Promise<User> {
  const email = handleOrEmail.trim();
  if (!email || !password) fail('invalid', 'Enter your email and password.');
  if (!email.includes('@')) fail('invalid', 'Log in with your email address.');
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw authError(error, 'invalid');
  const u = await loadProfile(data.user);
  if (!u) return fail('profile', 'We couldn’t find your player profile. Contact a YAC chair.');
  void refreshUnread().catch(() => {});
  emitChange();
  return u;
}

export async function logout(): Promise<void> {
  try {
    await sb().auth.signOut();
  } catch (e) {
    console.error('[YACquest] sign out failed', e);
  }
  me = null;
  unread = 0;
  emitChange();
}

export async function signup(input: SignupInput): Promise<SignupResult> {
  if (!input.acceptedRules) fail('rules', 'Please read and accept the rules.');
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(input.handle)) fail('handle', 'Username: 3–20 letters, numbers, dots or underscores.');
  if (input.displayName.trim().length < 2 || input.displayName.length > 24) fail('displayName', 'Display name: 2–24 characters.');
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) fail('email', 'Enter a valid email.');
  if (input.password.length < 8) fail('password', 'Password must be at least 8 characters.');
  if (!CAMPUSES.some((c) => c.id === input.campus)) fail('campus', 'Pick your campus.');

  const friendCode = input.friendCode?.trim().toUpperCase() || undefined;
  const [handleOk, codeOk] = await Promise.all([
    rpc<boolean>('handle_available', { p_handle: input.handle }),
    friendCode ? rpc<boolean>('friend_code_exists', { p_code: friendCode }) : Promise.resolve(true),
  ]);
  if (!handleOk) fail('handle', 'That username is taken.');
  if (!codeOk) fail('friendCode', 'We couldn’t find that friend code.');

  const { data, error } = await sb().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: siteUrl() + '?confirmed=1',
      data: { handle: input.handle, display_name: input.displayName.trim(), campus: input.campus, avatar: input.avatar, friend_code: friendCode ?? null },
    },
  });
  if (error) throw authError(error, 'form');
  // With "Confirm email" on, an already-registered email comes back as a user with no identities.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
    fail('email', 'An account with that email already exists. Try logging in or resetting your password.');
  if (!data.session || !data.user) return { user: null, needsEmailConfirmation: true };
  const u = await loadProfile(data.user);
  emitChange();
  return { user: u, needsEmailConfirmation: !u };
}

export async function resendConfirmation(email: string): Promise<void> {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) fail('email', 'Enter a valid email.');
  const { error } = await sb().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: siteUrl() + '?confirmed=1' } });
  if (error) throw authError(error, 'resend');
}

/** Called after the user follows a password-reset link (which logs them in). */
export async function updatePassword(newPassword: string): Promise<void> {
  if (newPassword.length < 8) fail('password', 'Password must be at least 8 characters.');
  const { error } = await sb().auth.updateUser({ password: newPassword });
  if (error) throw authError(error, 'password');
}

/** Always resolves for unknown emails, so the form never reveals whether an account exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) fail('email', 'Enter a valid email.');
  const { error } = await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() + '?reset=1' });
  if (error) {
    const e = authError(error);
    if (e.code === 'rate_limit' || e.code === 'network') throw e;
    // anything else (e.g. user not found) is swallowed on purpose
  }
}

export async function updateProfile(patch: Partial<Pick<User, 'displayName' | 'avatar' | 'emailOptIn'>>): Promise<User> {
  if (patch.displayName !== undefined && (patch.displayName.trim().length < 2 || patch.displayName.length > 24))
    fail('displayName', 'Display name: 2–24 characters.');
  const s = await session();
  const row = one(
    await rpc<AnyRow | AnyRow[]>('update_profile', {
      p_display_name: patch.displayName?.trim() ?? null,
      p_avatar: patch.avatar ?? null,
      p_email_opt_in: patch.emailOptIn ?? null,
    }),
  );
  me = row ? toUser(row, Boolean(s?.user.email_confirmed_at)) : await requireMe();
  notifyAuth(me);
  emitChange();
  return me;
}

// ───────────────────────────── participant ─────────────────────────────

export async function getDashboard(): Promise<Dashboard> {
  const s = await session();
  if (!s) return fail('unauthenticated', 'Please log in again.');
  const userId = s.user.id;
  const cycle = await activeCycle();
  const [user, stats, prize, claimRows, subRows, ledgerRows] = await Promise.all([
    loadProfile(s.user),
    rpc<AnyRow | AnyRow[]>('dashboard_stats').then(one),
    rpc<AnyRow | AnyRow[]>('prize_status').then(one),
    sb().from('prize_claims').select('*').eq('user_id', userId).eq('cycle_id', cycle.id).neq('status', 'revoked').limit(1).then(rows),
    sb().from('submissions').select(SUBMISSION_COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(5).then(rows),
    sb().from('ledger').select(LEDGER_COLS).eq('user_id', userId).eq('cycle_id', cycle.id).order('created_at', { ascending: false }).limit(8).then(rows),
  ]);
  if (!user) return fail('unauthenticated', 'Please log in again.');
  const st = stats ?? {};
  const unreadCount = num(pick(st, 'unread_count'));
  setUnread(unreadCount);
  const claim = (claimRows as AnyRow[] | null)?.[0];
  return {
    user,
    points: num(st.points),
    rankOverall: num(pick(st, 'rank_overall')),
    rankCampus: num(pick(st, 'rank_campus')),
    participants: num(st.participants),
    prize: toPrize(prize),
    myClaim: claim ? toClaim(claim) : undefined,
    // The home screen doesn't show proof images, so we skip signing them here.
    recentSubmissions: ((subRows as AnyRow[]) ?? []).map((r) => toSubmission(r)),
    recentLedger: ((ledgerRows as AnyRow[]) ?? []).map(toLedger),
    unreadCount,
    daysLeft: Math.max(0, Math.ceil((new Date(cycle.endsAt).getTime() - Date.now()) / 86_400_000)),
    referralsUsed: num(pick(st, 'referrals_used')),
  };
}

export async function listActivities(): Promise<Activity[]> {
  return ACTIVITIES;
}

export async function listEvents(scope: 'upcoming' | 'past' | 'all' = 'all'): Promise<(YacEvent & { checkedIn: boolean })[]> {
  const user = await requireMe();
  const cycle = await activeCycle();
  const evRows = rows(await sb().from('events').select(EVENT_COLS).eq('cycle_id', cycle.id).order('starts_at', { ascending: true }).limit(500)) as AnyRow[];
  const t = Date.now();
  const events = (evRows ?? [])
    .map(toEvent)
    .filter((e) => {
      const closes = new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60_000;
      if (scope === 'upcoming') return closes >= t;
      if (scope === 'past') return closes < t;
      return true;
    });
  if (scope === 'past') events.reverse();
  if (!events.length) return [];
  const ids = events.map((e) => e.id);
  const isAdmin = user.role === 'admin' || user.role === 'chair';
  const [checkins, secrets] = await Promise.all([
    sb().from('ledger').select('ref_id').eq('user_id', user.id).eq('source', 'checkin').in('ref_id', ids).then(rows),
    isAdmin ? sb().from('event_secrets').select('event_id, password').in('event_id', ids).then(rows) : Promise.resolve([] as AnyRow[]),
  ]);
  const attended = new Set(((checkins as AnyRow[]) ?? []).map((r) => str(r.ref_id)));
  const pw = new Map(((secrets as AnyRow[]) ?? []).map((r) => [str(r.event_id), str(r.password)]));
  // Participants never receive passwords (RLS on event_secrets enforces this too).
  return events.map((e) => ({ ...e, ...(isAdmin && pw.has(e.id) ? { password: pw.get(e.id) } : {}), checkedIn: attended.has(e.id) }));
}

export async function checkIn(eventId: string, password: string): Promise<{ points: number; activity: Activity }> {
  if (!password.trim()) fail('wrong_password', 'Enter the event password.');
  const res = one(await rpc<AnyRow | AnyRow[]>('check_in', { p_event_id: eventId, p_password: password.trim() })) ?? {};
  emitChange();
  const activity = activityById(str(pick(res, 'activity_id'))) ?? activityById('home_event')!;
  return { points: num(res.points), activity };
}

export async function canSubmit(activityId: string, eventId?: string): Promise<string | null> {
  const reason = await rpc<string | null>('can_submit', { p_activity_id: activityId, p_event_id: eventId ?? null });
  return reason || null;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const mime = /^data:([^;,]+)/.exec(header)?.[1] ?? 'image/jpeg';
  const payload = dataUrl.slice(comma + 1);
  if (header.includes(';base64')) {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

export async function submitProof(input: { activityId: string; eventId?: string; imageDataUrl: string; note: string }): Promise<Submission> {
  if (!input.imageDataUrl.startsWith('data:image/')) fail('file_type', 'Unsupported file. Please upload a JPG, PNG or WebP image.');
  if (input.note.length > 280) fail('note', 'Keep the note under 280 characters.');
  const userId = await uid();
  const blocked = await canSubmit(input.activityId, input.eventId);
  if (blocked) fail('limit', blocked);

  const blob = dataUrlToBlob(input.imageDataUrl);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const up = await sb().storage.from('proofs').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (up.error) {
    console.error('[YACquest] upload failed', up.error);
    if (/size|too large|payload/i.test(up.error.message)) fail('file_size', 'That image is too big (max 5 MB).');
    if (/mime|type/i.test(up.error.message)) fail('file_type', 'Unsupported file. Please upload a JPG, PNG or WebP image.');
    fail('upload', 'The upload didn’t go through. Check your connection and try again.');
  }
  try {
    const row = one(
      await rpc<AnyRow | AnyRow[]>('submit_proof', {
        p_activity_id: input.activityId,
        p_event_id: input.eventId ?? null,
        p_image_path: path,
        p_note: input.note.trim(),
      }),
    );
    emitChange();
    return toSubmission(row ?? {}, input.imageDataUrl);
  } catch (e) {
    void sb().storage.from('proofs').remove([path]).catch(() => {});
    throw e;
  }
}

export async function mySubmissions(): Promise<Submission[]> {
  const userId = await uid();
  const subRows = (rows(await sb().from('submissions').select(SUBMISSION_COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(100)) as AnyRow[]) ?? [];
  const urls = await signedUrls(subRows.map((r) => opt(r.image_path)));
  return subRows.map((r) => toSubmission(r, urls.get(str(r.image_path)) ?? ''));
}

export async function myLedger(): Promise<LedgerEntry[]> {
  const userId = await uid();
  const cycle = await activeCycle();
  const res = rows(await sb().from('ledger').select(LEDGER_COLS).eq('user_id', userId).eq('cycle_id', cycle.id).order('created_at', { ascending: false }).limit(200)) as AnyRow[];
  return (res ?? []).map(toLedger);
}

// ───────────────────────────── leaderboards ─────────────────────────────

export async function leaderboard(limit = 10): Promise<LeaderRow[]> {
  return ((await rpc<AnyRow[]>('leaderboard', { p_limit: limit, p_campus: null })) ?? []).map(toLeader);
}

export async function campusLeaders(perCampus = 3): Promise<Record<CampusId, LeaderRow[]>> {
  const lists = await Promise.all(CAMPUSES.map((c) => rpc<AnyRow[]>('leaderboard', { p_limit: perCampus, p_campus: c.id })));
  return Object.fromEntries(CAMPUSES.map((c, i) => [c.id, (lists[i] ?? []).map(toLeader)])) as Record<CampusId, LeaderRow[]>;
}

export async function campusCup(): Promise<CampusCupRow[]> {
  return ((await rpc<AnyRow[]>('campus_cup')) ?? []).map((r) => ({
    campus: r.campus as CampusId,
    members: num(r.members),
    totalPoints: num(pick(r, 'total_points')),
    perCapita: Math.round(num(pick(r, 'per_capita')) * 10) / 10,
  }));
}

export async function myRank(): Promise<LeaderRow | null> {
  const r = one(await rpc<AnyRow | AnyRow[] | null>('my_rank'));
  return r && pick(r, 'user_id') ? toLeader(r) : null;
}

// ───────────────────────────── prize race ─────────────────────────────

export async function prizeStatus(): Promise<PrizeStatus> {
  return toPrize(one(await rpc<AnyRow | AnyRow[]>('prize_status')));
}

export async function submitClaimInfo(contact: ClaimContact): Promise<PrizeClaim> {
  const problem = claimContactError(contact);
  if (problem) fail(problem.code, problem.message);
  const row = one(
    await rpc<AnyRow | AnyRow[]>('submit_claim_info', {
      p_full_name: contact.fullName.trim(),
      p_email: contact.email.trim(),
      p_phone: contact.phone.trim(),
      p_address: contact.address.trim(),
      p_preference: contact.preference?.trim() || null,
      p_notes: contact.notes?.trim() || null,
    }),
  );
  emitChange();
  return toClaim(row ?? {});
}

export async function suggestPrize(idea: string): Promise<void> {
  if (idea.trim().length < 3) fail('idea', 'Tell us a bit more about your idea.');
  if (idea.length > 300) fail('idea', 'Keep it under 300 characters.');
  await rpc('suggest_prize', { p_idea: idea.trim() });
  emitChange();
}

// ───────────────────────────── notifications ─────────────────────────────

const NOTIFICATION_LIMIT = 50;

export async function notifications(): Promise<AppNotification[]> {
  const userId = await uid();
  const res = ((rows(
    await sb().from('notifications').select('id, user_id, kind, title, body, read, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(NOTIFICATION_LIMIT),
  ) as AnyRow[]) ?? []).map(toNotification);
  if (res.length < NOTIFICATION_LIMIT) setUnread(res.filter((n) => !n.read).length);
  else void refreshUnread().catch(() => {});
  return res;
}

export function unreadCountSync(): number {
  return me ? unread : 0;
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await rpc('mark_notifications_read', { p_ids: ids && ids.length ? ids : null });
  if (!ids) setUnread(0);
  else await refreshUnread().catch(() => {});
  emitChange();
}

// ───────────────────────────── admin (admins + chairs) ─────────────────────────────

async function profilesById(ids: string[], cols = 'id, handle, display_name, campus'): Promise<Map<string, AnyRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, AnyRow>();
  // Chunk so the `in (...)` list keeps the URL short.
  for (let i = 0; i < unique.length; i += 100) {
    const res = rows(await sb().from('profiles').select(cols).in('id', unique.slice(i, i + 100))) as unknown as AnyRow[];
    for (const r of res ?? []) out.set(str(r.id), r);
  }
  return out;
}

export async function reviewQueue(filters: { status?: SubmissionStatus; campus?: CampusId; activityId?: string } = {}): Promise<QueueItem[]> {
  const status = filters.status ?? 'pending';
  let q = sb().from('submissions').select(SUBMISSION_COLS).eq('status', status);
  if (filters.activityId) q = q.eq('activity_id', filters.activityId);
  q = q.order('created_at', { ascending: status === 'pending' }).limit(200);
  const subRows = (rows(await q) as AnyRow[]) ?? [];
  if (!subRows.length) return [];
  const eventIds = [...new Set(subRows.map((r) => opt(r.event_id)).filter((x): x is string => !!x))];
  const [people, urls, evRows] = await Promise.all([
    profilesById(subRows.map((r) => str(r.user_id))),
    signedUrls(subRows.map((r) => opt(r.image_path))),
    eventIds.length ? sb().from('events').select('id, title').in('id', eventIds).then(rows) : Promise.resolve([] as AnyRow[]),
  ]);
  const titles = new Map(((evRows as AnyRow[]) ?? []).map((e) => [str(e.id), str(e.title)]));
  return subRows
    .map((r): QueueItem => {
      const s = toSubmission(r, urls.get(str(r.image_path)) ?? '');
      const p = people.get(s.userId) ?? {};
      return {
        ...s,
        user: { id: s.userId, handle: str(p.handle), displayName: str(p.display_name) || 'Unknown', campus: p.campus as CampusId },
        activity: activityById(s.activityId) ?? { id: s.activityId, tier: 3, title: s.activityId, description: '', method: 'screenshot' },
        eventTitle: s.eventId ? titles.get(s.eventId) : undefined,
      };
    })
    .filter((q2) => !filters.campus || q2.user.campus === filters.campus);
}

export async function reviewSubmission(id: string, decision: 'approved' | 'rejected', reason?: string): Promise<void> {
  if (decision === 'rejected' && !reason?.trim()) fail('reason', 'Add a reason so the participant knows what to fix.');
  await rpc('review_submission', { p_id: id, p_decision: decision, p_reason: reason?.trim() || null });
  emitChange();
}

export async function searchUsers(query: string, limit = 20): Promise<AdminUserRow[]> {
  return ((await rpc<AnyRow[]>('search_users', { p_query: query.trim(), p_limit: limit })) ?? []).map((r) => ({
    id: str(r.id),
    handle: str(r.handle),
    displayName: str(pick(r, 'display_name')),
    email: str(r.email),
    campus: r.campus as CampusId,
    role: r.role as Role,
    points: num(r.points),
  }));
}

export async function userLedger(userId: string): Promise<LedgerEntry[]> {
  const cycle = await activeCycle();
  const res = rows(await sb().from('ledger').select(LEDGER_COLS).eq('user_id', userId).eq('cycle_id', cycle.id).order('created_at', { ascending: false }).limit(200)) as AnyRow[];
  return (res ?? []).map(toLedger);
}

export async function adjustPoints(userId: string, amount: number, reason: string): Promise<void> {
  if (!Number.isInteger(amount) || amount === 0 || amount > TIER_POINTS[1] || amount < -PRIZE.goal)
    fail('amount', `Add at most ${TIER_POINTS[1]} points at a time (one High-Impact action), or remove up to ${PRIZE.goal}. Not 0.`);
  if (reason.trim().length < 3) fail('reason', 'A reason is required.');
  await rpc('adjust_points', { p_user_id: userId, p_amount: amount, p_reason: reason.trim() });
  emitChange();
}

export async function awardActivity(userId: string, activityId: string, note: string): Promise<void> {
  if (!activityById(activityId)) fail('activity', 'Unknown activity.');
  await rpc('award_activity', { p_user_id: userId, p_activity_id: activityId, p_note: note.trim() });
  emitChange();
}

export async function adminListEvents(): Promise<YacEvent[]> {
  return ((await rpc<AnyRow[]>('admin_list_events')) ?? []).map(toEvent);
}

function validateEvent(input: EventInput) {
  if (input.title.trim().length < 3) fail('title', 'Give the event a title.');
  if (input.password.trim().length < 4) fail('password', 'Event password: at least 4 characters.');
  if (new Date(input.endsAt) <= new Date(input.startsAt)) fail('endsAt', 'End time must be after the start.');
}

const eventJson = (input: EventInput) => ({
  title: input.title.trim(),
  campus: input.campus,
  crossCampus: input.crossCampus,
  kind: input.kind,
  location: input.location,
  startsAt: input.startsAt,
  endsAt: input.endsAt,
  checkInGraceMinutes: input.checkInGraceMinutes,
  password: input.password.trim(),
});

export async function createEvent(input: EventInput): Promise<YacEvent> {
  validateEvent(input);
  const row = one(await rpc<AnyRow | AnyRow[]>('create_event', { p_event: eventJson(input) }));
  emitChange();
  return toEvent(row ?? {});
}

export async function updateEvent(id: string, input: EventInput): Promise<YacEvent> {
  validateEvent(input);
  const row = one(await rpc<AnyRow | AnyRow[]>('update_event', { p_id: id, p_event: eventJson(input) }));
  emitChange();
  return toEvent(row ?? {});
}

export async function deleteEvent(id: string): Promise<void> {
  await rpc('delete_event', { p_id: id });
  emitChange();
}

export async function listSuggestions(): Promise<(PrizeSuggestion & { displayName: string })[]> {
  const res = (rows(await sb().from('prize_suggestions').select('id, user_id, idea, created_at').order('created_at', { ascending: false }).limit(200)) as AnyRow[]) ?? [];
  const people = await profilesById(res.map((r) => str(r.user_id)), 'id, display_name');
  return res.map((r) => ({
    id: str(r.id),
    userId: str(r.user_id),
    idea: str(r.idea),
    createdAt: str(r.created_at),
    displayName: str(people.get(str(r.user_id))?.display_name) || 'Unknown',
  }));
}

export async function adminOverview(): Promise<AdminOverview> {
  const o = one(await rpc<AnyRow | AnyRow[]>('admin_overview')) ?? {};
  return {
    participants: num(o.participants),
    activeThisWeek: num(pick(o, 'active_this_week')),
    pointsThisWeek: num(pick(o, 'points_this_week')),
    pendingReviews: num(pick(o, 'pending_reviews')),
    newSignupsThisWeek: num(pick(o, 'new_signups_this_week')),
    prize: toPrize((o.prize as AnyRow) ?? null),
    nearGoal: ((pick<AnyRow[] | null>(o, 'near_goal')) ?? []).map(toLeader),
  };
}

export async function weeklyReportPreview(): Promise<WeeklyReport> {
  const r = one(await rpc<AnyRow | AnyRow[]>('weekly_report_preview')) ?? {};
  return { subject: str(r.subject), text: str(r.text), html: str(r.html), recipients: ((r.recipients as string[] | null) ?? []).map(String) };
}

// ───────────────────────────── chair ─────────────────────────────

export async function listTeam(): Promise<TeamMember[]> {
  return ((await rpc<AnyRow[]>('list_team')) ?? []).map((r) => ({
    id: str(r.id),
    displayName: str(pick(r, 'display_name')),
    handle: str(r.handle),
    email: str(r.email),
    role: r.role as Role,
    emailVerified: Boolean(pick(r, 'email_verified')),
  }));
}

export async function setRole(userId: string, role: 'participant' | 'admin'): Promise<void> {
  await rpc('set_role', { p_user_id: userId, p_role: role });
  emitChange();
}

/** Hands the caller's chair seat to someone else; the caller becomes an admin. */
export async function transferChair(userId: string): Promise<void> {
  await rpc('transfer_chair', { p_user_id: userId });
  // Our own role changed — refresh the profile so the UI drops chair-only screens.
  const s = await session();
  if (s) notifyAuth(await loadProfile(s.user));
  emitChange();
}

export async function listClaims(): Promise<PrizeClaim[]> {
  return ((await rpc<AnyRow[]>('list_claims')) ?? []).map(toClaim);
}

export async function markFulfilled(spot: number): Promise<void> {
  await rpc('mark_fulfilled', { p_spot: spot });
  emitChange();
}

/** CSV of the active cycle's ledger — for audits and the year-end archive. */
export async function exportLedgerCsv(): Promise<string> {
  const cycle = await activeCycle();
  const PAGE = 1000;
  const ledgerRows: AnyRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = (rows(await sb().from('ledger').select(LEDGER_COLS).eq('cycle_id', cycle.id).order('id', { ascending: true }).range(from, from + PAGE - 1)) as AnyRow[]) ?? [];
    ledgerRows.push(...page);
    if (page.length < PAGE) break;
  }
  const people = new Map<string, AnyRow>();
  for (let from = 0; ; from += PAGE) {
    const page = (rows(await sb().from('profiles').select('id, handle, display_name, campus').order('id').range(from, from + PAGE - 1)) as AnyRow[]) ?? [];
    for (const p of page) people.set(str(p.id), p);
    if (page.length < PAGE) break;
  }
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['entry_id', 'created_at', 'user_id', 'handle', 'display_name', 'campus', 'amount', 'source', 'activity_id', 'ref_id', 'reason', 'created_by'];
  const lines = ledgerRows.map((r) => {
    const l = toLedger(r);
    const u = people.get(l.userId);
    return [l.id, l.createdAt, l.userId, u?.handle, u?.display_name, u?.campus, l.amount, l.source, l.activityId, l.refId, l.reason, l.createdBy].map(esc).join(',');
  });
  return [header.join(','), ...lines].join('\n');
}

/** Default name/end for the next cycle: "2027–28", ending May 1 at 23:59:59 Eastern. */
function nextCycleDefaults() {
  const d = new Date();
  const y = d.getMonth() >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return { name: `${y}–${String((y + 1) % 100).padStart(2, '0')}`, endsAt: `${y + 1}-05-01T23:59:59-04:00` };
}

/** End-of-cycle reset: archive, start a new cycle, zero everyone. Chair only. */
export async function resetCycle(confirmText: string, opts: { name?: string; endsAt?: string } = {}): Promise<void> {
  if (confirmText !== 'RESET') fail('confirm', 'Type RESET to confirm.');
  const def = nextCycleDefaults();
  await rpc('reset_cycle', { p_confirm: confirmText, p_name: opts.name ?? def.name, p_ends_at: opts.endsAt ?? def.endsAt });
  cycleCache = null;
  emitChange();
}

export async function archives(): Promise<{ cycle: string; archivedAt: string; ledgerRows: number; winners: PrizeClaim[] }[]> {
  return ((await rpc<AnyRow[]>('archives')) ?? []).map((r) => ({
    cycle: str(r.cycle),
    archivedAt: str(pick(r, 'archived_at')),
    ledgerRows: num(pick(r, 'ledger_rows')),
    winners: ((r.winners as AnyRow[] | null) ?? []).map(toClaim),
  }));
}

// ───────────────────────────── emails + action log (chair; 0004) ─────────────────────────────

function toReportSettings(r: AnyRow | null): ReportSettings {
  const s = r ?? {};
  return {
    weeklyEnabled: pick(s, 'weekly_enabled') !== false,
    weeklyDay: num(pick(s, 'weekly_day')),
    weeklyHour: num(pick(s, 'weekly_hour')),
    nearGoalPoints: num(pick(s, 'near_goal_points')),
    recipients: ((pick<string[] | null>(s, 'recipients')) ?? []).map(String),
    includeChairs: pick(s, 'include_chairs') !== false,
    includeAdmins: pick(s, 'include_admins') !== false,
    prizeAlertsEnabled: pick(s, 'prize_alerts_enabled') !== false,
    updatedAt: opt(pick(s, 'updated_at')),
  };
}

export async function getReportSettings(): Promise<ReportSettings> {
  return toReportSettings(one(await rpc<AnyRow | AnyRow[]>('get_report_settings')));
}

export async function updateReportSettings(patch: Partial<ReportSettings>): Promise<ReportSettings> {
  const body: Record<string, unknown> = {};
  for (const k of ['weeklyEnabled', 'weeklyDay', 'weeklyHour', 'nearGoalPoints', 'recipients', 'includeChairs', 'includeAdmins', 'prizeAlertsEnabled'] as const)
    if (patch[k] !== undefined) body[k] = patch[k];
  if (body.recipients) {
    const list = [...new Set((body.recipients as string[]).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const bad = list.find((e) => !isEmail(e));
    if (bad) fail('recipients', `“${bad}” isn’t a valid email.`);
    body.recipients = list;
  }
  const row = one(await rpc<AnyRow | AnyRow[]>('update_report_settings', { p_settings: body }));
  emitChange();
  return toReportSettings(row);
}

export async function sendWeeklyReportNow(): Promise<void> {
  await rpc('send_weekly_report_now');
  emitChange();
}

export async function sendTestEmail(): Promise<void> {
  await rpc('send_test_email');
  emitChange();
}

export async function emailLog(limit = 50): Promise<EmailLogRow[]> {
  return ((await rpc<AnyRow[]>('email_log', { p_limit: limit })) ?? []).map((r) => ({
    id: str(r.id),
    kind: str(r.kind),
    toEmails: ((pick<string[] | null>(r, 'to_emails')) ?? []).map(String),
    subject: str(r.subject),
    status: (str(r.status) || 'pending') as EmailStatus,
    attempts: num(r.attempts),
    lastError: opt(pick(r, 'last_error')),
    createdAt: str(pick(r, 'created_at')),
    sentAt: opt(pick(r, 'sent_at')),
  }));
}

export async function retryEmail(id: string): Promise<void> {
  await rpc('retry_email', { p_id: id });
  emitChange();
}

export async function adminActionLog(opts: { before?: number; limit?: number } = {}): Promise<AdminAction[]> {
  return ((await rpc<AnyRow[]>('admin_action_log', { p_limit: opts.limit ?? 50, p_before: opts.before ?? null })) ?? []).map((r) => {
    const details = pick<unknown>(r, 'details');
    return {
      id: num(r.id),
      actorName: str(pick(r, 'actor_name')),
      action: str(r.action),
      targetName: opt(pick(r, 'target_name')),
      details: details && typeof details === 'object' ? (details as Record<string, unknown>) : {},
      createdAt: str(pick(r, 'created_at')),
    };
  });
}

export async function resetDemoData(): Promise<void> {
  return fail('forbidden', 'Not available on the live app.');
}

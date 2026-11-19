/**
 * 0034 Quick start: new accounts play right away; the app confirms the email itself. Pure helpers
 * (unit tested in src/__tests__/quickstartPromo.test.ts). The server (verify_email_token,
 * resend_verification_email, refresh_prize_race, set_role…) is the real gatekeeper.
 */
import type { User } from '../types';

/** Verified? 0034 servers send emailVerifiedAt; older ones only the Supabase flag. */
export function isVerified(u: Pick<User, 'emailVerified' | 'emailVerifiedAt'> | null | undefined): boolean {
  if (!u) return false;
  if (u.emailVerifiedAt !== undefined) return u.emailVerifiedAt !== null;
  return u.emailVerified !== false;
}

/** `#/verify?t=<hex>`: the token, or '' if it isn't one (the server checks it for real). */
export function tokenFromQuery(raw: string | null | undefined): string {
  const t = (raw ?? '').trim().toLowerCase();
  return /^[0-9a-f]{32,128}$/.test(t) ? t : '';
}

/** "q•••@gmail.com" for the Resend toast. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 1)}${'•'.repeat(Math.min(3, Math.max(1, user.length - 1)))}@${domain}`;
}

// ───────────── 0034 follow-up: the red "confirm your email" bar (every logged-in screen) ─────────────

/** Screens where the bar never shows (the barista-facing Coffee Pass; the reveal hides it with a body class). */
export const VERIFY_BAR_HIDDEN_PATHS: readonly string[] = ['/coffee-pass'];

/** Show the red bar? Unconfirmed + not on a clean screen + not dismissed for THIS page view (location key). */
export function showVerifyBar(
  u: Pick<User, 'emailVerified' | 'emailVerifiedAt'> | null | undefined,
  pathname: string,
  dismissedKey: string | null,
  locationKey: string,
): boolean {
  if (!u || isVerified(u)) return false;
  if (VERIFY_BAR_HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return dismissedKey === null || dismissedKey !== locationKey;
}

export const VERIFY_BAR_TEXT = '⚠️ Confirm your email to keep your points & prize spot. Check your Spam/Promotions folder for an email from YACquest.';
/** From day 3 unconfirmed: "(day 3)", "(day 4)"… */
export const VERIFY_BAR_DAY_FROM = 3;

export function verifyBarText(u: Pick<User, 'createdAt'> | null | undefined, now: number = Date.now()): string {
  const since = u ? new Date(u.createdAt).getTime() : NaN;
  const days = Number.isFinite(since) ? Math.max(0, Math.floor((now - since) / 86_400_000)) : 0;
  return days >= VERIFY_BAR_DAY_FROM ? `${VERIFY_BAR_TEXT} (day ${days})` : VERIFY_BAR_TEXT;
}

/** role="alert" the first time the bar shows in this browser session, then role="status" (no screen-reader spam). */
const ALERTED_KEY = 'yacquest-verify-bar-alerted';
let alertedMemory = false;
export function verifyBarRole(): 'alert' | 'status' {
  try {
    if (sessionStorage.getItem(ALERTED_KEY)) return 'status';
  } catch {
    /* private mode */
  }
  return alertedMemory ? 'status' : 'alert';
}
export function markVerifyBarAlerted() {
  alertedMemory = true;
  try {
    sessionStorage.setItem(ALERTED_KEY, '1');
  } catch {
    /* in-memory flag still works */
  }
}
/** Tests only. */
export function resetVerifyBarAlerted() {
  alertedMemory = false;
  try {
    sessionStorage.removeItem(ALERTED_KEY);
  } catch {
    /* ignore */
  }
}

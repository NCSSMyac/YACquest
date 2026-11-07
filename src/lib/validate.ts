/**
 * Validation shared by the winner form (Prize screen), the mock API and the live API.
 * Mirrors submit_claim_info in supabase/migrations/0004_emails_and_audit.sql — the
 * server is the real gatekeeper; this just gives instant, friendly messages.
 */
import type { AnnouncementInput, ClaimContact } from '../types';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (v: string) => EMAIL_RE.test(v.trim());

/** Counts the digits in a phone number, so "(919) 555-0100" and "919.555.0100" both pass. */
export const phoneDigits = (v: string) => v.replace(/\D/g, '').length;

export const CLAIM_LIMITS = { nameMin: 2, phoneDigitsMin: 7, addressMin: 10, notesMax: 280 } as const;

/** First problem with a winner's contact info as `{ code, message }`, or null if it's fine. Codes match the server's. */
export function claimContactError(c: Pick<ClaimContact, 'fullName' | 'email' | 'phone' | 'address'> & { notes?: string }): { code: string; message: string } | null {
  if ((c.fullName ?? '').trim().length < CLAIM_LIMITS.nameMin) return { code: 'fullName', message: 'Enter your full name.' };
  if (!isEmail(c.email ?? '')) return { code: 'email', message: 'Enter a valid email.' };
  if (phoneDigits(c.phone ?? '') < CLAIM_LIMITS.phoneDigitsMin) return { code: 'phone', message: 'Enter a phone number with at least 7 digits.' };
  if ((c.address ?? '').trim().length < CLAIM_LIMITS.addressMin) return { code: 'address', message: 'Enter your full mailing address (street, city, state, ZIP).' };
  if ((c.notes ?? '').length > CLAIM_LIMITS.notesMax) return { code: 'notes', message: `Keep notes under ${CLAIM_LIMITS.notesMax} characters.` };
  return null;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** 0 → "12 am", 13 → "1 pm". */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

export const ANNOUNCEMENT_LIMITS = { titleMin: 3, titleMax: 80, bodyMax: 1000 } as const;

/** First problem with an admin announcement, or null. Codes match send_announcement in 0006. */
export function announcementError(a: AnnouncementInput): { code: string; message: string } | null {
  const t = a.title.trim();
  if (t.length < ANNOUNCEMENT_LIMITS.titleMin || t.length > ANNOUNCEMENT_LIMITS.titleMax) return { code: 'title', message: 'Title: 3–80 characters.' };
  if (!a.body.trim() || a.body.trim().length > ANNOUNCEMENT_LIMITS.bodyMax) return { code: 'body', message: 'Message: 1–1000 characters.' };
  if (a.audience === 'campus' && !a.campus) return { code: 'campus', message: 'Pick a campus.' };
  if (a.audience === 'user' && !a.userId) return { code: 'user', message: 'Pick the person to message.' };
  return null;
}

/** 0026: event survey link — same rule as clean_survey_url() in 0026_participant_extras.sql. */
export const SURVEY_URL_MAX = 500;
export const SURVEY_URL_RE = /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(:[0-9]{1,5})?([/?#]\S*)?$/i;

/** '' (no link) is fine. Otherwise an http(s) web address, no spaces, ≤ 500 characters. */
export function surveyUrlError(url: string | undefined | null): string | null {
  const v = (url ?? '').trim();
  if (!v) return null;
  if (v.length > SURVEY_URL_MAX) return 'The survey link is too long (500 characters max).';
  if (!SURVEY_URL_RE.test(v)) return 'The survey link must be a web address starting with https:// (or http://).';
  return null;
}

/** Trimmed survey link, or undefined when empty. */
export const cleanSurveyUrl = (url: string | undefined | null): string | undefined => (url ?? '').trim() || undefined;

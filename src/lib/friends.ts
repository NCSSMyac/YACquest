/** 0026 "My friends": the signup link with your code, and the share text. Pure helpers. */
import { CAPS, TIER_POINTS } from '../config';

export const SIGNUP_URL = 'https://ncssmyac.github.io/YACquest/#/signup';

/** `#/signup?code=YAC-7Q2K` prefills the friend code on the sign-up form. */
export const signupLink = (code: string, base = SIGNUP_URL) => `${base}?code=${encodeURIComponent(code)}`;

export function shareText(code: string, base = SIGNUP_URL): string {
  return `Join me on YACquest, the NCSSM Young Alumni Council points game! Sign up with my friend code ${code} and we both get +${TIER_POINTS[1]} points when you come to your first YAC event: ${signupLink(code, base)}`;
}

/** Friend codes look like YAC-XXXX. Anything else in ?code= is ignored. */
export function codeFromQuery(raw: string | null | undefined): string {
  const v = (raw ?? '').trim().toUpperCase();
  return /^YAC-[A-Z0-9]{4}$/.test(v) ? v : '';
}

export const referralsLine = (used: number) => `${Math.min(used, CAPS.referralsPerCycle)}/${CAPS.referralsPerCycle} friend bonuses used`;

/** Status chip text for a friend. */
export function friendStatus(f: { came: boolean; bonus: boolean }): string {
  if (f.came && f.bonus) return `✓ Came to an event (+${TIER_POINTS[1]} for you)`;
  if (f.came) return '✓ Came to an event';
  return 'Hasn’t checked in yet';
}

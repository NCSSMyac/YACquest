/**
 * {campus_pun}: one friendly, school-spirit line per campus (0039: all positive, no rivalry jokes) for participant emails (announcement fill-in and the
 * event thank-you email). The line rotates: it's picked deterministically per send from a seed key
 * (the announcement / event id), so everyone at one campus gets the same line in one send and the
 * next send usually gets another one.
 *
 * KEEP IN SYNC with public.campus_puns() in supabase/migrations/0039_email_wording_prefs_health.sql (0032 before):
 * same lines, same order (src/__tests__/emailPersonalization.test.ts checks this). Use the plain ' apostrophe.
 */
import type { CampusId } from '../config';

export const CAMPUS_PUNS: Record<CampusId, readonly string[]> = {
  duke: [
    'Go Blue Devils — see you soon!',
    'From the Gothic Wonderland to YAC: welcome back!',
    "Duke's got spirit — bring it to the next event!",
    'Forever Duke, forever NCSSM.',
  ],
  unc: [
    'Go Heels!',
    'Carolina blue skies ahead 💙',
    'Heel yeah, see you there!',
    'Ram-arkable things happen when Tar Heels show up.',
  ],
  ncsu: [
    'Go Pack!',
    'Howl about joining us?',
    'Wolfpack, roll call! 🐾',
    'Think and Do — and come hang with YAC!',
  ],
};

/** Same number as SQL public.email_seed(key): the sum of the key's character codes. */
export function punSeed(key: string): number {
  let n = 0;
  for (const ch of key) n += ch.codePointAt(0) ?? 0;
  return n;
}

/** The pun for this campus and send. Mirrors SQL public.campus_pun(campus, email_seed(key)). */
export function campusPun(campus: CampusId | string | undefined, seedKey: string | number): string {
  const list = CAMPUS_PUNS[(campus ?? '') as CampusId];
  if (!list) return 'See you at the next YAC event!';
  const seed = typeof seedKey === 'number' ? seedKey : punSeed(seedKey);
  return list[Math.abs(seed) % list.length];
}

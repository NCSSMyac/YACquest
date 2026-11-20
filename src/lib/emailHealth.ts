/**
 * 0039: email health — the red/amber banner on the Admin dashboard and the one-line status in Admin → System.
 * The database decides (public.email_health(): sender not run in 60 min, Gmail login rejected, last 3 runs sent
 * nothing, bounce check can't reach Gmail, emails stuck > 2 h, no opens/clicks on > 20 member emails this week,
 * budget > 90 % used); this file only turns the answer into words and caches it for 60 s, so the dashboard costs
 * one small query a minute at most. Pure helpers (unit tested).
 */
import type { EmailHealth, EmailHealthReason } from '../types';

export const EMAIL_HEALTH_CACHE_MS = 60_000;

export interface EmailHealthBanner {
  tone: 'red' | 'amber';
  heading: string;
  /** Red reasons first, each with its "What to do" line. */
  items: EmailHealthReason[];
}

/** null = all good (no banner). */
export function emailHealthBanner(h: EmailHealth | null | undefined): EmailHealthBanner | null {
  if (!h || h.status === 'green' || !h.reasons?.length) return null;
  const items = [...h.reasons].sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  const red = items.some((r) => r.level === 'red');
  return {
    tone: red ? 'red' : 'amber',
    heading: red ? 'Emails aren’t going out properly' : 'Heads-up: email needs a look',
    items,
  };
}

/** "just now" / "3 min ago" / "2 h ago" / "3 days ago". */
export function agoText(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return 'never';
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 90) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(mins / 1440)} days ago`;
}

/** Admin → System: "Email health: all good · last run 3 min ago". */
export function emailHealthLine(h: EmailHealth | null | undefined, now = Date.now()): string {
  if (!h) return 'Email health: checking…';
  const run = h.lastRunAt ? `last run ${agoText(h.lastRunAt, now)}` : 'the sender hasn’t run yet';
  if (h.status === 'green') return `Email health: all good · ${run}`;
  const reds = h.reasons.filter((r) => r.level === 'red').length;
  const ambers = h.reasons.length - reds;
  const parts = [reds ? `${reds} problem${reds === 1 ? '' : 's'}` : '', ambers ? `${ambers} warning${ambers === 1 ? '' : 's'}` : ''].filter(Boolean);
  return `Email health: ${parts.join(', ')} · ${run}`;
}

let cache: { at: number; promise: Promise<EmailHealth> } | null = null;

/** email_health() at most once a minute (the banner and the System line share it). A failed call isn't kept. */
export function cachedEmailHealth(fetch: () => Promise<EmailHealth>, now = Date.now()): Promise<EmailHealth> {
  if (cache && now - cache.at < EMAIL_HEALTH_CACHE_MS) return cache.promise;
  const promise = fetch();
  const entry = { at: now, promise };
  cache = entry;
  promise.catch(() => {
    if (cache === entry) cache = null;
  });
  return promise;
}

export function clearEmailHealthCache() {
  cache = null;
}

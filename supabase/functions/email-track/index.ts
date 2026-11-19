/**
 * YACquest — email-track (Supabase Edge Function, Deno). PUBLIC: deploy with "Verify JWT" OFF —
 * email apps open these links without any login.
 *
 *   GET  /email-track/o/<message id>.gif          → logs an open, returns a 1×1 transparent GIF (no-cache)
 *   GET  /email-track/c/<message id>?u=<url>&s=<sig> → logs a click and redirects (302) ONLY if the
 *                                                     signature matches (no open redirect)
 *   POST /email-track/u/<token>                    → one-click unsubscribe (RFC 8058; Gmail's button)
 *   GET  /email-track/u/<token>                    → sends the browser to the app's unsubscribe page
 *
 * The database checks signatures and tokens (track_email_click, unsubscribe_by_token in
 * supabase/migrations/0032_email_personalization_tracking.sql); its signing secret never leaves it.
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (provided automatically). Optional secret APP_URL
 * (default https://ncssmyac.github.io/YACquest/).
 *
 * DEPLOY: Supabase → Edge Functions → Deploy a new function → Via Editor → name it `email-track` →
 * paste this whole file → Deploy → open the function's Details/Settings → turn OFF "Verify JWT"
 * (also called "Enforce JWT verification") → Save. Full steps: docs/SETUP.md.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

// ════ BEGIN emailCore (copied from supabase/functions/_shared/emailCore.ts — edit it there, then run node scripts/sync-edge-core.mjs) ════
// ═══════════════════════════════════════════════════════════════════════════
// YACquest email core (0032) — pure helpers shared by the two Edge Functions
// (send-emails, email-track) and unit tested by vitest
// (src/__tests__/emailCore.test.ts).
//
// The Supabase dashboard deploys ONE pasted file per function, so this module is
// copied verbatim into both index.ts files between the "BEGIN/END emailCore"
// markers. After editing this file run `node scripts/sync-edge-core.mjs`
// (a vitest test fails if the copies drift).
//
// No imports and no Deno/Node APIs: plain TypeScript only.
// ═══════════════════════════════════════════════════════════════════════════

export type EmailKind =
  | 'weekly_report' | 'prize_qualified' | 'prize_info' | 'test'
  | 'announcement' | 'event_reminder' | 'event_followup' | 'wrapped';

/** Emails to participants: personalized, opt-out respected, unsubscribe footer + List-Unsubscribe headers. */
export const PARTICIPANT_KINDS: readonly string[] = ['announcement', 'event_reminder', 'event_followup', 'wrapped'];
export const isParticipantKind = (kind: string) => PARTICIPANT_KINDS.includes(kind);

/**
 * Lower number = goes first. Same as SQL public.email_priority().
 * 1 staff + prize alerts + test + weekly report, 2 event reminders, 3 follow-ups, 4 announcements, 5 Wrapped.
 */
export const EMAIL_PRIORITY: Record<string, number> = {
  prize_qualified: 1, prize_info: 1, test: 1, weekly_report: 1, verify_email: 1,
  event_reminder: 2, event_followup: 3, announcement: 4, wrapped: 5,
};
export const emailPriority = (kind: string) => EMAIL_PRIORITY[kind] ?? 4;

/** Free @gmail.com: ~500 recipients per rolling 24 h. Google Workspace: use 1900. */
export const BUDGET = { daily: 450, reserve: 50, workspaceDaily: 1900, announcementDays: 3 } as const;

/** Sending pace inside one 10-minute run (Edge Functions stop after ~150 s on the free plan). */
export const THROTTLE = { perMinute: 20, sendWindowMs: 90_000, imapBudgetMs: 25_000, claimChunk: 5 } as const;

/** Wait between two emails: about 3 s (20 a minute) with a little randomness so it doesn't look robotic. */
export function spacingMs(rand: () => number = Math.random): number {
  const base = 60_000 / THROTTLE.perMinute;
  return Math.round(base - 500 + rand() * 1000);
}

export interface QueuedMessage {
  id: string;
  priority: number;
  createdAt: string;
  sendBefore?: string | null;
}

/**
 * Which queued emails go out now. Mirrors SQL public.claim_email_messages():
 * expired rows are skipped; the rolling 24 h budget counts sent + in-flight; priority 1–2 may use the
 * whole budget, priority 3+ only what's left above the reserve (so reminders can always go).
 */
export function planBatch(
  queue: readonly QueuedMessage[],
  o: { now: Date; sentLast24h: number; inFlight?: number; budget?: number; reserve?: number; limit?: number },
): { send: string[]; expired: string[] } {
  const now = o.now.getTime();
  const budget = o.budget ?? BUDGET.daily;
  const reserve = o.reserve ?? BUDGET.reserve;
  const limit = o.limit ?? THROTTLE.claimChunk;
  const expired = queue.filter((m) => m.sendBefore && new Date(m.sendBefore).getTime() <= now).map((m) => m.id);
  const live = queue
    .filter((m) => !expired.includes(m.id))
    .slice()
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const left = budget - o.sentLast24h - (o.inFlight ?? 0);
  const high = live.filter((m) => m.priority <= 2).slice(0, Math.max(0, Math.min(limit, left)));
  const lowRoom = Math.max(0, Math.min(limit - high.length, left - reserve - high.length));
  const low = live.filter((m) => m.priority > 2).slice(0, lowRoom);
  return { send: [...high, ...low].map((m) => m.id), expired };
}

/** UTC offset of New York at that instant, in minutes (−300 in winter, −240 in summer). */
function newYorkOffsetMinutes(d: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}

/** Midnight at the end of that day in New York, as an ISO string. */
export function endOfDayNewYork(iso: string): string {
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  const guess = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + 1, 0, 0, 0));
  return new Date(guess.getTime() - newYorkOffsetMinutes(guess) * 60_000).toISOString();
}

const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * 86_400_000).toISOString();

/**
 * Latest time an email may still go out (null = never expires). Same rules as SQL public.email_campaign():
 *  event_reminder → event start · event_followup → event end + 3 days · announcement → queued + 3 days
 *  (or the start of an upcoming event it mentions, if sooner) · wrapped → cycle end (queued after the end:
 *  queued + 3 days) · weekly_report → end of that day (New York) · prize alerts + test → never.
 */
export function sendBeforeFor(
  kind: string,
  c: { createdAt: string; eventStartsAt?: string; eventEndsAt?: string; cycleEndsAt?: string; announcementDays?: number; mentionedEventStartsAt?: string },
): string | null {
  switch (kind) {
    case 'event_reminder':
      return c.eventStartsAt ?? null;
    case 'event_followup':
      return c.eventEndsAt ? addDays(c.eventEndsAt, 3) : addDays(c.createdAt, 3);
    case 'announcement': {
      const days = addDays(c.createdAt, c.announcementDays ?? BUDGET.announcementDays);
      return c.mentionedEventStartsAt && c.mentionedEventStartsAt < days ? c.mentionedEventStartsAt : days;
    }
    case 'wrapped':
      return c.cycleEndsAt && c.cycleEndsAt > c.createdAt ? c.cycleEndsAt : addDays(c.createdAt, 3);
    case 'weekly_report':
      return endOfDayNewYork(c.createdAt);
    case 'verify_email': // 0034: the confirmation link works for 7 days
      return addDays(c.createdAt, 7);
    default:
      return null;
  }
}

// ───────────────────────────── tracking links ─────────────────────────────

/** Public base URL of the email-track Edge Function. */
export const trackBase = (supabaseUrl: string) => supabaseUrl.replace(/\/+$/, '') + '/functions/v1/email-track';
export const openPixelUrl = (base: string, msgId: string) => `${base}/o/${msgId}.gif`;
export const clickUrl = (base: string, msgId: string, url: string, sig: string) =>
  `${base}/c/${msgId}?u=${encodeURIComponent(url)}&s=${sig}`;
export const unsubscribePostUrl = (base: string, token: string) => `${base}/u/${token}`;

/** Unsubscribe links (app page or one-click endpoint) are never rewritten into tracked links. */
export const isUnsubscribeUrl = (url: string) => /#\/unsubscribe\b|\/email-track\/u\//.test(url);
/** 0034: links that are never rewritten into tracked links: unsubscribe + email confirmation (its token is never logged). */
export const isUntrackedUrl = (url: string) => isUnsubscribeUrl(url) || /#\/verify\b/.test(url);

const unescapeAttr = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const HREF_RE = /(<a\b[^>]*?\bhref\s*=\s*)(["'])(https?:\/\/[^"']+)\2/gi;

/** The http(s) links in the email (unescaped, unique, in order), without unsubscribe links. */
export function extractLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(HREF_RE)) {
    const url = unescapeAttr(m[3]);
    if (!isUntrackedUrl(url) && !out.includes(url)) out.push(url);
  }
  return out;
}

/** Replaces each signed http(s) link with its tracked /c/ link. Links without a signature stay as they are. */
export function rewriteLinks(html: string, msgId: string, base: string, sigs: ReadonlyMap<string, string>): string {
  return html.replace(HREF_RE, (whole, pre: string, q: string, raw: string) => {
    const url = unescapeAttr(raw);
    const sig = sigs.get(url);
    if (!sig || isUntrackedUrl(url)) return whole;
    return `${pre}${q}${escapeAttr(clickUrl(base, msgId, url, sig))}${q}`;
  });
}

/** Adds the 1×1 open pixel just before </body> (or at the end). */
export function addOpenPixel(html: string, pixelUrl: string): string {
  const img = `<img src="${escapeAttr(pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, img + '</body>') : html + img;
}

/** RFC 2369 + RFC 8058 one-click unsubscribe headers (Gmail shows its own "Unsubscribe" button). */
export function listUnsubscribeHeaders(base: string, token: string, mailto?: string): Record<string, string> {
  const parts = [`<${unsubscribePostUrl(base, token)}>`];
  if (mailto) parts.push(`<mailto:${mailto}?subject=unsubscribe>`);
  return { 'List-Unsubscribe': parts.join(', '), 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

/** Message-ID on the sender's own domain, so replies and threads work. */
export function messageIdFor(msgId: string, senderEmail: string): string {
  const domain = (senderEmail.split('@')[1] || 'gmail.com').toLowerCase();
  return `<yacquest.${msgId}@${domain}>`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);
/** Unsubscribe tokens: 32 hex characters (public.email_unsub_tokens). */
export const isUnsubToken = (s: string) => /^[0-9a-f]{32}$/.test(s);
/** Link signatures: 32 hex characters (left half of an HMAC-SHA256, public.email_link_sig). */
export const isSig = (s: string) => /^[0-9a-f]{32}$/.test(s);

/** /…/o/<uuid>.gif → open, /…/c/<uuid> → click, /…/u/<token> → unsubscribe. Anything else → null. */
export function parseTrackPath(pathname: string): { kind: 'open' | 'click' | 'unsub'; id: string } | null {
  const m = pathname.match(/\/(o|c|u)\/([^/?#]+)\/?$/);
  if (!m) return null;
  if (m[1] === 'o') {
    const id = m[2].replace(/\.gif$/i, '');
    return isUuid(id) ? { kind: 'open', id: id.toLowerCase() } : null;
  }
  if (m[1] === 'c') return isUuid(m[2]) ? { kind: 'click', id: m[2].toLowerCase() } : null;
  return isUnsubToken(m[2]) ? { kind: 'unsub', id: m[2] } : null;
}

/** A clicked link may only redirect to http(s) (and only after the signature check). */
export const safeRedirect = (url: string) => /^https?:\/\/[^\s]+$/i.test(url);

/** 43-byte transparent 1×1 GIF. */
export const TRANSPARENT_GIF = new Uint8Array([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0,
  44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);

export const shortUserAgent = (ua: string | null | undefined) => (ua ?? '').replace(/[\r\n]+/g, ' ').slice(0, 120);

// ───────────────────────────── bounces (Gmail DSNs) ─────────────────────────────

/** Gmail's "Delivery Status Notification" senders. */
export function isDsnFrom(from: string): boolean {
  return /mailer-daemon@|postmaster@|mail delivery subsystem/i.test(from);
}

const EMAIL_IN = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * Reads a bounce message (raw RFC 822 source). Returns the failed recipients (lower-case), whether it's a
 * permanent failure (5.x.x / Action: failed) and a short reason. "Delayed" notices (4.x.x) return null:
 * Gmail is still trying. Also null when no recipient can be found.
 */
export function parseDsn(raw: string): { recipients: string[]; hard: boolean; status?: string; reason: string } | null {
  const src = raw.replace(/=\r?\n/g, '').replace(/\r\n/g, '\n');
  const unfolded = src.replace(/\n[ \t]+/g, ' ');
  const found = new Set<string>();
  for (const m of unfolded.matchAll(/^X-Failed-Recipients:\s*(.+)$/gim))
    for (const e of m[1].match(EMAIL_IN) ?? []) found.add(e.toLowerCase());
  for (const m of unfolded.matchAll(/^(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^>\s]+)>?/gim)) found.add(m[1].toLowerCase());
  if (!found.size) {
    const g = unfolded.match(/(?:wasn't|was not|couldn't be|could not be) delivered to\s+<?([A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,})/i);
    if (g) found.add(g[1].toLowerCase());
  }
  const actions = [...unfolded.matchAll(/^Action:\s*(\w+)/gim)].map((m) => m[1].toLowerCase());
  const status = unfolded.match(/^Status:\s*([245]\.\d{1,3}\.\d{1,3})/im)?.[1];
  if (actions.length && actions.every((a) => a === 'delayed')) return null;
  if (status?.startsWith('4') && !actions.includes('failed')) return null;
  if (!found.size) return null;
  const diag = unfolded.match(/^Diagnostic-Code:\s*(?:smtp;\s*)?(.+)$/im)?.[1]
    ?? unfolded.match(/(The (?:email )?account that you tried to reach[^\n]*|address couldn't be found[^\n]*|Address not found[^\n]*)/i)?.[1]
    ?? 'Delivery failed';
  const hard = status ? status.startsWith('5') : actions.includes('failed') || /address (?:couldn't|could not) be found|does not exist|user unknown|no such user/i.test(unfolded);
  return { recipients: [...found], hard, status, reason: diag.trim().slice(0, 300) };
}
// ════ END emailCore ════

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' };
const text = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_CACHE } });
const gif = () => new Response(TRANSPARENT_GIF, { status: 200, headers: { 'Content-Type': 'image/gif', ...NO_CACHE } });

Deno.serve(async (req) => {
  const reqUrl = new URL(req.url);
  const hit = parseTrackPath(reqUrl.pathname);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!hit) return text('Not found', 404);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = (Deno.env.get('APP_URL') || 'https://ncssmyac.github.io/YACquest/').replace(/\/+$/, '');
  if (!url || !serviceKey) return hit.kind === 'open' ? gif() : text('Not configured', 500);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ua = shortUserAgent(req.headers.get('user-agent'));

  if (hit.kind === 'open') {
    try {
      await db.rpc('track_email_open', { p_msg: hit.id, p_ua: ua });
    } catch (e) {
      console.error('track_email_open', e);
    }
    return gif(); // always the pixel, even when logging fails
  }

  if (hit.kind === 'click') {
    const target = reqUrl.searchParams.get('u') ?? '';
    const sig = (reqUrl.searchParams.get('s') ?? '').toLowerCase();
    if (!safeRedirect(target) || !isSig(sig)) return text('This link isn’t valid.', 400);
    const res = await db.rpc('track_email_click', { p_msg: hit.id, p_url: target, p_sig: sig, p_ua: ua });
    if (res.error || res.data !== true) return text('This link isn’t valid.', 400);
    return new Response(null, { status: 302, headers: { Location: target, ...NO_CACHE } });
  }

  // Unsubscribe
  if (req.method === 'POST') {
    const res = await db.rpc('unsubscribe_by_token', { p_token: hit.id });
    return res.error ? text('This unsubscribe link isn’t valid.', 400) : text('You’re unsubscribed from YACquest emails.', 200);
  }
  return new Response(null, { status: 303, headers: { Location: `${appUrl}/#/unsubscribe?t=${hit.id}`, ...NO_CACHE } });
});

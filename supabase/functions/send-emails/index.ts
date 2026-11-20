/**
 * YACquest — send-emails (Supabase Edge Function, Deno)
 *
 * Sends what the database queued: one email per person (0032 email_messages, already personalized),
 * never BCC. Docs: docs/BACKEND.md ("0004", "0032") and docs/SETUP.md ("Weekly email + prize alerts",
 * "Personalized emails, tracking and bounces").
 *
 * DEPLOY (no command line needed):
 *   1. Supabase → Edge Functions → send-emails → Code (or Deploy a new function → Via Editor → name
 *      `send-emails`) → paste this WHOLE file → Deploy.
 *   2. Edge Functions → Secrets: SMTP_USER (the YAC Gmail), SMTP_PASS (its 16-letter app password).
 *      Optional: SMTP_FROM_NAME (sender name; default "YACquest · NCSSM Young Alumni" — if you set this
 *      secret earlier, change it to that), SMTP_HOST / SMTP_PORT (default smtp.gmail.com / 465),
 *      BOUNCE_CHECK=off to skip reading bounce notices.
 *      SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
 *   3. Integrations → Cron: run it every 10 minutes (`*\/10 * * * *`), POST.
 *   Bounce checks read the same Gmail over IMAP: Gmail → Settings → Forwarding and POP/IMAP → Enable IMAP.
 *
 * Each run (must finish well inside the ~150 s Edge limit):
 *   remove files of deleted accounts (0027) → queue reminders / follow-ups / Wrapped / this week's report
 *   if due → for ~90 s: claim a few emails (budget, priority and expiry are decided by the database),
 *   send each to ONE address with tracked links, an open pixel and one-click unsubscribe headers,
 *   ~20 a minute with small random gaps → put back anything claimed but not sent → check Gmail for
 *   bounce notices and emailed "unsubscribe" requests (≤ 25 s together, never blocks sending) → record the
 *   run (Admin → System shows it). The database's per-run call also purges old email data once a day (0037).
 * Only participant emails get tracked links and the open pixel; staff and confirmation emails are never tracked.
 * 0039: List-Unsubscribe's one-click URL is …/email-track/u/<token>?k=<kind> (only that email type is turned off);
 * the mailto (emailed "unsubscribe") still turns off every YACquest email.
 * Failed emails are retried by later runs (up to 5 tries); YACquest Chairs can also press Retry.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import nodemailer from 'npm:nodemailer@6.9.16';

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
  | 'announcement' | 'event_reminder' | 'event_followup' | 'wrapped' | 'verify_email';

/** Emails to participants: personalized, opt-out respected, unsubscribe footer + List-Unsubscribe headers. */
export const PARTICIPANT_KINDS: readonly string[] = ['announcement', 'event_reminder', 'event_followup', 'wrapped'];
export const isParticipantKind = (kind: string) => PARTICIPANT_KINDS.includes(kind);

/**
 * 0039: each member email kind belongs to one of three per-person choices (SQL public.email_kind_type()):
 * announcement → "Announcements", event_reminder + event_followup → "Event reminders and thank-yous",
 * wrapped → "Yearly Wrapped". Staff and account emails have no type (always sent).
 */
export type EmailType = 'announcement' | 'events' | 'wrapped';
export const EMAIL_TYPE_OF_KIND: Readonly<Record<string, EmailType>> = {
  announcement: 'announcement', event_reminder: 'events', event_followup: 'events', wrapped: 'wrapped',
};
/** The type for an email kind (or a type name). null = not a member email type. Same as SQL email_kind_type(). */
export function emailTypeOf(kind: string | null | undefined): EmailType | null {
  const k = (kind ?? '').trim().toLowerCase();
  if (k in EMAIL_TYPE_OF_KIND) return EMAIL_TYPE_OF_KIND[k];
  if (k === 'announcements') return 'announcement';
  if (k === 'events' || k === 'event') return 'events';
  return null;
}
/** Me → Settings labels (SQL email_type_label()). */
export const EMAIL_TYPE_LABEL: Readonly<Record<EmailType, string>> = {
  announcement: 'Announcements', events: 'Event reminders and thank-yous', wrapped: 'Yearly Wrapped',
};
/** In a sentence: "… YACquest {phrase} emails" (SQL email_type_phrase()). */
export const EMAIL_TYPE_PHRASE: Readonly<Record<EmailType, string>> = {
  announcement: 'announcement', events: 'event reminder and thank-you', wrapped: 'yearly Wrapped',
};
/** A `k` value from an unsubscribe link: a member email kind (lower-case), else null (= "everything", like old links). */
export function parseUnsubKind(raw: string | null | undefined): string | null {
  const k = (raw ?? '').trim().toLowerCase();
  return /^[a-z_]{1,40}$/.test(k) && emailTypeOf(k) ? k : null;
}

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

/**
 * 0037 retention, same as the SQL constants public.email_keep_log() / email_keep_sensitive_body() /
 * email_keep_verify_tokens() / email_purge_every() (a vitest test compares them).
 */
export const RETENTION = {
  /** email_events, email_messages and email_outbox rows are deleted after this many months. */
  logMonths: 12,
  /** Contents of prize alerts, weekly reports and confirmation emails are emptied after this many days (prize alerts also once delivered). */
  sensitiveBodyDays: 30,
  /** Used or expired confirmation tokens are deleted after this many days. */
  verifyTokenDays: 30,
  /** The purge runs at most once per this many hours. */
  purgeEveryHours: 24,
} as const;

/** Kinds whose contents are emptied after RETENTION.sensitiveBodyDays (SQL public.email_sensitive_kinds()). */
export const SENSITIVE_BODY_KINDS: readonly string[] = ['prize_info', 'prize_qualified', 'weekly_report', 'verify_email'];

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
  /** 0038: held until then (an announcement's cancel window); not sent before. */
  notBefore?: string | null;
}

/**
 * Which queued emails go out now. Mirrors SQL public.claim_email_messages():
 * expired rows are skipped; rows still in their cancel window (notBefore in the future, 0038) wait; the rolling
 * 24 h budget counts sent + in-flight; priority 1–2 may use the whole budget, priority 3+ only what's left above
 * the reserve (so reminders can always go).
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
    .filter((m) => !expired.includes(m.id) && !(m.notBefore && new Date(m.notBefore).getTime() > now))
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
/** One-click endpoint. 0039: with a member email kind, `?k=<kind>` so only that type is turned off. */
export const unsubscribePostUrl = (base: string, token: string, kind?: string | null) => {
  const k = parseUnsubKind(kind);
  return `${base}/u/${token}${k ? `?k=${k}` : ''}`;
};
/** The app's unsubscribe page (SQL email_unsub_url_for()): <app>/#/unsubscribe?t=<token>[&k=<kind>]. */
export const appUnsubscribeUrl = (appUrl: string, token: string, kind?: string | null) => {
  const k = parseUnsubKind(kind);
  return `${appUrl.replace(/\/+$/, '')}/#/unsubscribe?t=${token}${k ? `&k=${k}` : ''}`;
};

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

/**
 * RFC 2369 + RFC 8058 one-click unsubscribe headers (Gmail shows its own "Unsubscribe" button).
 * 0039: `kind` (the email's kind) makes Gmail's button turn off only that type. The mailto still turns off everything.
 */
export function listUnsubscribeHeaders(base: string, token: string, mailto?: string, kind?: string | null): Record<string, string> {
  const parts = [`<${unsubscribePostUrl(base, token, kind)}>`];
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

// ───────────────────────────── emailed unsubscribes (List-Unsubscribe mailto) ─────────────────────────────

/** Label in the YAC Gmail for processed "unsubscribe" emails, and its sub-label for ones we couldn't match. */
export const UNSUB_LABEL = 'YACquest unsubscribes';
export const UNSUB_UNMATCHED_LABEL = 'YACquest unsubscribes/unmatched';

/**
 * True when an email's subject is an unsubscribe request: exactly "unsubscribe" (any case, spaces around it,
 * an optional final "." or "!"), optionally after one or more "Re:" prefixes. Forwards ("Fwd: unsubscribe")
 * don't count: the sender would be whoever forwarded it.
 */
export function isUnsubscribeRequest(subject: string | null | undefined): boolean {
  if (typeof subject !== 'string') return false;
  return /^\s*(?:re\s*:\s*)*unsubscribe\s*[.!]?\s*$/i.test(subject);
}

/** The sender's address from a From value ("Name <a@b.co>" or "a@b.co"), lower-case; null if none. */
export function senderAddress(from: string | null | undefined): string | null {
  const m = (from ?? '').match(/<\s*([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)\s*>/) ?? (from ?? '').match(/([^<>\s@,;"]+@[^<>\s@,;"]+\.[^<>\s@,;"]+)/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Gmail's Authentication-Results header(s): true when the message passed DKIM, SPF or DMARC and DMARC did not
 * fail. Used so a forged From address can't turn someone else's emails off (those are left for a person to check).
 */
export function senderAuthenticated(authResults: string | null | undefined): boolean {
  const h = (authResults ?? '').toLowerCase();
  if (!h.trim() || /\bdmarc=fail\b/.test(h)) return false;
  return /\b(?:dkim|spf|dmarc)=pass\b/.test(h);
}

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

type Claimed = {
  id: string;
  kind: string;
  email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  unsub_token: string | null;
  attempts: number;
  priority: number;
};

const EDGE_LIMIT_MS = 150_000;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out after ${Math.round(ms / 1000)} s`)), ms); }),
  ]);
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

Deno.serve(async () => {
  const started = Date.now();
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing.' }, 500);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Queue this week's report if it's due (+ reminders, follow-ups, Wrapped — the database decides, never twice).
  const due = await db.rpc('enqueue_weekly_report_if_due');
  if (due.error) return json({ error: `enqueue_weekly_report_if_due: ${due.error.message}` }, 500);
  const enqueuedWeekly = due.data === true;

  // 1b. (0027) Remove uploaded files of deleted accounts through the Storage API. Never blocks the emails.
  let purged = 0;
  try {
    const q = await db.rpc('claim_storage_purge', { p_limit: 100 });
    const items = (q.error ? [] : (q.data ?? [])) as { id: number; bucket_id: string; name: string }[];
    if (q.error && !/claim_storage_purge/.test(q.error.message)) console.error('claim_storage_purge', q.error.message);
    const byBucket = new Map<string, typeof items>();
    for (const it of items) byBucket.set(it.bucket_id, [...(byBucket.get(it.bucket_id) ?? []), it]);
    for (const [bucket, list] of byBucket) {
      const rm = await db.storage.from(bucket).remove(list.map((i) => i.name));
      if (rm.error) { console.error('storage remove failed', bucket, rm.error.message); continue; }
      const done = await db.rpc('finish_storage_purge', { p_ids: list.map((i) => i.id) });
      if (done.error) console.error('finish_storage_purge', done.error.message);
      else purged += list.length;
    }
  } catch (e) {
    console.error('storage purge failed', e);
  }

  // 2. SMTP settings (Edge Function secrets).
  const host = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
  const port = Number(Deno.env.get('SMTP_PORT') || 465);
  const user = (Deno.env.get('SMTP_USER') || '').trim();
  const pass = (Deno.env.get('SMTP_PASS') || '').replace(/\s+/g, ''); // Google shows app passwords with spaces
  const fromName = (Deno.env.get('SMTP_FROM_NAME') || 'YACquest · NCSSM Young Alumni').replace(/["\r\n]/g, '');
  const base = trackBase(url);

  const mark = async (id: string, ok: boolean, error: string | null) => {
    const res = await db.rpc('mark_email_message', { p_id: id, p_ok: ok, p_error: error });
    if (res.error) console.error('mark_email_message failed', id, res.error.message);
  };

  if (!user || !pass) {
    const msg = 'Email isn’t set up: add the SMTP_USER and SMTP_PASS secrets to the send-emails Edge Function (see docs/SETUP.md).';
    const batch = await db.rpc('claim_email_messages', { p_limit: THROTTLE.claimChunk });
    const rows = (batch.data ?? []) as Claimed[];
    for (const r of rows) await mark(r.id, false, msg);
    await db.rpc('email_run_finished', { p_stats: { sent: 0, failed: rows.length, imap: 'off', imapError: msg } });
    return json({ enqueuedWeekly, purged, sent: 0, failed: rows.length, error: msg }, rows.length ? 500 : 200);
  }

  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  const from = `"${fromName}" <${user}>`;

  async function sendOne(r: Claimed) {
    let html = r.body_html ?? '';
    const participant = isParticipantKind(r.kind);
    // Tracked links (participant emails only, 0037): the database signs each http(s) link (its secret never
    // leaves the database). Staff emails, prize alerts, test and confirmation emails are never tracked.
    const links = participant ? extractLinks(html) : [];
    if (links.length) {
      const s = await db.rpc('email_sign_links', { p_msg: r.id, p_urls: links });
      if (s.error) console.error('email_sign_links', s.error.message);
      const sigs = new Map(((s.data ?? []) as { url: string; sig: string }[]).map((x) => [x.url, x.sig]));
      html = rewriteLinks(html, r.id, base, sigs);
    }
    if (participant && html) html = addOpenPixel(html, openPixelUrl(base, r.id));
    // 0039: the one-click URL carries the email's kind (?k=announcement…), so Gmail's Unsubscribe button turns off only
    // that type. An email-track that isn't re-deployed yet ignores it and turns off everything (as before).
    const headers = participant && r.unsub_token ? listUnsubscribeHeaders(base, r.unsub_token, user, r.kind) : undefined;
    await transport.sendMail({
      from,
      to: r.email, // one person per email — never BCC
      replyTo: user,
      subject: r.subject || 'YACquest',
      text: r.body_text || undefined,
      html: html || undefined,
      messageId: messageIdFor(r.id, user),
      headers,
    });
  }

  // 3. Send for up to ~90 s, ~20 a minute. Whatever is left waits for the next run (10 minutes).
  let sent = 0;
  let failed = 0;
  let released = 0;
  let stop = false;
  while (!stop && Date.now() - started < THROTTLE.sendWindowMs) {
    const batch = await db.rpc('claim_email_messages', { p_limit: THROTTLE.claimChunk });
    if (batch.error) { console.error('claim_email_messages', batch.error.message); break; }
    const rows = (batch.data ?? []) as Claimed[];
    if (!rows.length) break;
    for (let i = 0; i < rows.length; i++) {
      if (Date.now() - started > THROTTLE.sendWindowMs) {
        const rest = rows.slice(i).map((r) => r.id);
        const rel = await db.rpc('release_email_messages', { p_ids: rest });
        released += rel.error ? 0 : Number(rel.data ?? 0);
        stop = true;
        break;
      }
      const r = rows[i];
      try {
        await withTimeout(sendOne(r), 30_000, 'SMTP');
        await mark(r.id, true, null);
        sent++;
      } catch (e) {
        console.error('send failed', r.id, errText(e));
        await mark(r.id, false, errText(e));
        failed++;
      }
      await sleep(spacingMs());
    }
  }
  transport.close();

  // 4. Over IMAP: bounce notices (Gmail "Delivery Status Notification (Failure)") and emailed unsubscribe
  //    requests (List-Unsubscribe mailto, 0037). Never blocks sending; never replies to anyone.
  let imap: 'ok' | 'off' | 'error' | 'skipped' = 'off';
  let imapError: string | null = null;
  const inbox: InboxStats = { bounces: 0, unsubscribes: 0, unsubscribeUnmatched: 0 };
  const left = EDGE_LIMIT_MS - (Date.now() - started) - 15_000;
  if ((Deno.env.get('BOUNCE_CHECK') || '').toLowerCase() === 'off') {
    imap = 'off';
    imapError = 'BOUNCE_CHECK=off';
  } else if (left < 8_000) {
    imap = 'skipped';
  } else {
    try {
      await withTimeout(checkInbox(db, user, pass, inbox), Math.min(THROTTLE.imapBudgetMs, left), 'IMAP');
      imap = 'ok';
    } catch (e) {
      imap = 'error';
      imapError = errText(e).slice(0, 300);
      console.error('bounce check failed', imapError);
    }
  }

  const { bounces, unsubscribes, unsubscribeUnmatched } = inbox; // partial counts survive an IMAP timeout
  await db.rpc('email_run_finished', { p_stats: { sent, failed, released, bounces, unsubscribes, imap, imapError } });
  return json({ enqueuedWeekly, purged, sent, failed, released, bounces, unsubscribes, unsubscribeUnmatched, imap, imapError });
});

type InboxStats = { bounces: number; unsubscribes: number; unsubscribeUnmatched: number };
// deno-lint-ignore no-explicit-any
type Imap = any; // an ImapFlow client (imported lazily inside checkInbox)

/** One IMAP connection for both inbox checks. Counts go into `stats` as they happen. */
async function checkInbox(db: ReturnType<typeof createClient>, user: string, pass: string, stats: InboxStats): Promise<void> {
  const { ImapFlow } = await import('npm:imapflow@2.9.1');
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      await checkBounces(db, client, stats);
      try {
        await checkUnsubscribes(db, client, user, stats);
      } catch (e) {
        console.error('unsubscribe check failed', errText(e)); // bounces above still count
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Reads unseen bounce notices from the last 3 days, records them, marks them seen and files them. */
async function checkBounces(db: ReturnType<typeof createClient>, client: Imap, stats: InboxStats): Promise<void> {
  const since = new Date(Date.now() - 3 * 86_400_000);
  const uids = ((await client.search({ seen: false, since, or: [{ from: 'mailer-daemon' }, { from: 'postmaster' }] }, { uid: true })) || []) as number[];
  const list = uids.slice(0, 50);
  const done: number[] = [];
  if (list.length) {
    for await (const msg of client.fetch(list, { uid: true, source: true, envelope: true }, { uid: true })) {
      const fromText = (msg.envelope?.from ?? []).map((a: { name?: string; address?: string }) => `${a.name ?? ''} <${a.address ?? ''}>`).join(', ');
      if (!isDsnFrom(fromText)) continue;
      done.push(msg.uid);
      const dsn = parseDsn(msg.source ? new TextDecoder().decode(msg.source) : '');
      if (!dsn) continue;
      for (const rcpt of dsn.recipients) {
        const res = await db.rpc('record_email_bounce', { p_email: rcpt, p_reason: dsn.reason, p_hard: dsn.hard });
        if (res.error) console.error('record_email_bounce', res.error.message);
        else if ((res.data as { matched?: boolean } | null)?.matched) stats.bounces++;
      }
    }
  }
  if (done.length) {
    await client.messageFlagsAdd(done, ['\\Seen'], { uid: true });
    try { await client.mailboxCreate('YACquest bounces'); } catch { /* already there */ }
    try { await client.messageMove(done, 'YACquest bounces', { uid: true }); } catch { /* marking them seen is enough */ }
  }
}

/**
 * 0037: unread emails from the last 7 days (newest 50) whose subject is "unsubscribe" (what Gmail and other apps
 * send to the List-Unsubscribe mailto). A sender whose address belongs to an account and whose message passed
 * Gmail's checks: emails turned off (unsubscribe_by_email), marked read, moved to "YACquest unsubscribes".
 * Anything else (no account with that address, or the sender couldn't be verified) stays unread in the Inbox with
 * the label "YACquest unsubscribes/unmatched", for a YACquest Chair to handle by hand; it isn't looked at again.
 * Never replies.
 */
async function checkUnsubscribes(db: ReturnType<typeof createClient>, client: Imap, user: string, stats: InboxStats): Promise<void> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const uids = ((await client.search({ seen: false, since, subject: 'unsubscribe' }, { uid: true })) || []) as number[];
  const list = uids.slice().sort((a, b) => b - a).slice(0, 50);
  if (!list.length) return;
  const self = user.toLowerCase();
  const matched: number[] = [];
  const unmatched: number[] = [];
  for await (const msg of client.fetch(list, { uid: true, envelope: true, labels: true, headers: ['authentication-results'] }, { uid: true })) {
    if (!isUnsubscribeRequest(msg.envelope?.subject)) continue;
    const labels = [...((msg.labels as Set<string> | undefined) ?? [])];
    if (labels.some((l) => l === UNSUB_UNMATCHED_LABEL)) continue; // already left for a person
    const a = msg.envelope?.from?.[0] as { name?: string; address?: string } | undefined;
    const from = senderAddress(a?.address ?? '');
    if (!from || from === self) continue; // our own test sends: leave them alone
    const auth = msg.headers ? new TextDecoder().decode(msg.headers) : '';
    if (!senderAuthenticated(auth)) { unmatched.push(msg.uid); stats.unsubscribeUnmatched++; continue; }
    const res = await db.rpc('unsubscribe_by_email', { p_email: from });
    if (res.error) { console.error('unsubscribe_by_email', res.error.message); continue; } // try again next run
    if (res.data === true) { matched.push(msg.uid); stats.unsubscribes++; }
    else { unmatched.push(msg.uid); stats.unsubscribeUnmatched++; }
  }
  if (matched.length) {
    await client.messageFlagsAdd(matched, ['\\Seen'], { uid: true });
    try { await client.mailboxCreate(UNSUB_LABEL); } catch { /* already there */ }
    try { await client.messageMove(matched, UNSUB_LABEL, { uid: true }); } catch { /* marking them read is enough */ }
  }
  if (unmatched.length) {
    try { await client.mailboxCreate(UNSUB_UNMATCHED_LABEL); } catch { /* already there */ }
    try { await client.messageCopy(unmatched, UNSUB_UNMATCHED_LABEL, { uid: true }); } catch (e) { console.error('label unmatched', errText(e)); }
  }
}

/**
 * 0032 Edge Function helpers (supabase/functions/_shared/emailCore.ts): priority, budget + reserve,
 * expiry, tracked-link rewriting, unsubscribe headers, tracking paths, Gmail bounce parsing — plus the
 * check that both Edge Functions carry an up-to-date copy. Fixed dates.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMAIL_PRIORITY, addOpenPixel, clickUrl, endOfDayNewYork, extractLinks, isParticipantKind, listUnsubscribeHeaders,
  messageIdFor, parseDsn, parseTrackPath, planBatch, rewriteLinks, safeRedirect, sendBeforeFor, spacingMs, trackBase,
} from '../../supabase/functions/_shared/emailCore';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const SQL = read('supabase/migrations/0032_email_personalization_tracking.sql');

describe('Edge Functions carry the shared core verbatim', () => {
  it('send-emails and email-track contain the current emailCore.ts (run node scripts/sync-edge-core.mjs)', () => {
    const core = read('supabase/functions/_shared/emailCore.ts').trimEnd();
    for (const f of ['supabase/functions/send-emails/index.ts', 'supabase/functions/email-track/index.ts']) {
      const src = read(f);
      const a = src.indexOf('BEGIN emailCore');
      const b = src.indexOf('// ════ END emailCore');
      const block = src.slice(src.indexOf('\n', a) + 1, b).trimEnd();
      expect(block, f).toBe(core);
    }
  });
  it('send-emails never uses BCC and defaults the From name', () => {
    const src = read('supabase/functions/send-emails/index.ts');
    expect(src).not.toMatch(/\bbcc\s*:/);
    expect(src).toContain("'YACquest · NCSSM Young Alumni'");
    expect(src).toContain("npm:imapflow@2.9.1");
  });
});

describe('priority', () => {
  it('matches SQL email_priority(): staff/prize/test/weekly 1, reminders 2, follow-ups 3, announcements 4, Wrapped 5', () => {
    const body = SQL.slice(SQL.indexOf('function public.email_priority'), SQL.indexOf('function public.email_is_participant_kind'));
    const sql = Object.fromEntries([...body.matchAll(/when '([a-z_]+)' then (\d)/g)].map((m) => [m[1], Number(m[2])]));
    expect(sql).toEqual(EMAIL_PRIORITY);
    expect(isParticipantKind('announcement') && isParticipantKind('event_reminder') && !isParticipantKind('weekly_report')).toBe(true);
  });
});

describe('planBatch (mirror of claim_email_messages)', () => {
  const now = new Date('2026-11-18T15:00:00Z');
  const q = (id: string, priority: number, sendBefore?: string) => ({ id, priority, createdAt: `2026-11-18T14:00:0${id.length}Z`, sendBefore });

  it('sends in priority order', () => {
    const r = planBatch([q('wrap', 5), q('ann', 4), q('rem', 2), q('test', 1), q('fol', 3)], { now, sentLast24h: 0, limit: 10 });
    expect(r.send).toEqual(['test', 'rem', 'fol', 'ann', 'wrap']);
  });

  it('keeps a reserve for priority 1–2: same numbers as the database test (budget 60, reserve 50, 5 sent)', () => {
    const queue = [q('test', 1), q('rem', 2), q('a1', 4), q('a2', 4), q('a3', 4), q('a4', 4), q('w', 5)];
    const r = planBatch(queue, { now, sentLast24h: 5, budget: 60, reserve: 50, limit: 50 });
    expect(r.send).toHaveLength(5); // 2 urgent + 3 low (55 − 50 − 2)
    expect(r.send.slice(0, 2)).toEqual(['test', 'rem']);
    expect(r.send).not.toContain('w');
    // budget almost used: low priority waits, a reminder still goes
    const r2 = planBatch([q('rem2', 2), q('a5', 4)], { now, sentLast24h: 5, inFlight: 5, budget: 60, reserve: 50, limit: 50 });
    expect(r2.send).toEqual(['rem2']);
    // budget fully used: nothing at all
    expect(planBatch([q('rem3', 2)], { now, sentLast24h: 450, budget: 450 }).send).toEqual([]);
  });

  it('skips expired rows instead of sending them late', () => {
    const r = planBatch([q('late', 2, '2026-11-18T14:59:00Z'), q('ok', 2, '2026-11-18T15:30:00Z')], { now, sentLast24h: 0 });
    expect(r.expired).toEqual(['late']);
    expect(r.send).toEqual(['ok']);
  });

  it('spaces emails about 3 s apart (≈ 20 a minute)', () => {
    expect(spacingMs(() => 0)).toBe(2500);
    expect(spacingMs(() => 1)).toBe(3500);
  });
});

describe('expiry (send_before)', () => {
  const createdAt = '2026-11-18T15:00:00Z';
  it('reminder = event start; follow-up = event end + 3 days', () => {
    expect(sendBeforeFor('event_reminder', { createdAt, eventStartsAt: '2026-11-18T23:00:00Z' })).toBe('2026-11-18T23:00:00Z');
    expect(sendBeforeFor('event_followup', { createdAt, eventEndsAt: '2030-02-02T01:00:00.000Z' })).toBe('2030-02-05T01:00:00.000Z'); // DB test: 2030-02-01 20:00-05 + 3 days
  });
  it('announcement = queued + 3 days, or the start of an upcoming event it names (if sooner)', () => {
    expect(sendBeforeFor('announcement', { createdAt })).toBe('2026-11-21T15:00:00.000Z');
    expect(sendBeforeFor('announcement', { createdAt, mentionedEventStartsAt: '2026-11-19T23:00:00.000Z' })).toBe('2026-11-19T23:00:00.000Z');
    expect(sendBeforeFor('announcement', { createdAt, announcementDays: 1 })).toBe('2026-11-19T15:00:00.000Z');
  });
  it('weekly report = end of that day in New York (winter and summer); Wrapped = cycle end; prize alerts never', () => {
    expect(endOfDayNewYork('2026-11-18T15:00:00Z')).toBe('2026-11-19T05:00:00.000Z');
    expect(endOfDayNewYork('2026-11-19T03:00:00Z')).toBe('2026-11-19T05:00:00.000Z'); // still Nov 18 in New York
    expect(endOfDayNewYork('2026-07-04T12:00:00Z')).toBe('2026-07-05T04:00:00.000Z');
    expect(sendBeforeFor('weekly_report', { createdAt })).toBe('2026-11-19T05:00:00.000Z');
    expect(sendBeforeFor('wrapped', { createdAt, cycleEndsAt: '2027-05-01T04:00:00Z' })).toBe('2027-05-01T04:00:00Z');
    expect(sendBeforeFor('wrapped', { createdAt: '2027-05-02T00:00:00Z', cycleEndsAt: '2027-05-01T04:00:00Z' })).toBe('2027-05-05T00:00:00.000Z');
    expect(sendBeforeFor('prize_info', { createdAt })).toBeNull();
    expect(sendBeforeFor('test', { createdAt })).toBeNull();
  });
});

describe('tracked links', () => {
  const base = trackBase('https://abc.supabase.co/');
  const id = '00000000-0000-0000-0000-000000000001';
  const html =
    '<p><a href="https://example.com/rsvp?x=1&amp;y=2" style="c">RSVP</a> <a href="https://example.com/rsvp?x=1&amp;y=2">again</a> ' +
    '<a href="mailto:yac@example.com">mail</a> <a href="https://ncssmyac.github.io/YACquest/#/unsubscribe?t=abc">Unsubscribe</a> ' +
    "<a href='http://plain.example/'>plain</a> <a href=\"https://unsigned.example/\">u</a></p></body>";

  it('finds http(s) links once each, never the unsubscribe link', () => {
    expect(base).toBe('https://abc.supabase.co/functions/v1/email-track');
    expect(extractLinks(html)).toEqual(['https://example.com/rsvp?x=1&y=2', 'http://plain.example/', 'https://unsigned.example/']);
  });

  it('rewrites only signed links, keeps unsubscribe + mailto, escapes the new href', () => {
    const sigs = new Map([['https://example.com/rsvp?x=1&y=2', 'a'.repeat(32)], ['http://plain.example/', 'b'.repeat(32)]]);
    const out = rewriteLinks(html, id, base, sigs);
    const tracked = clickUrl(base, id, 'https://example.com/rsvp?x=1&y=2', 'a'.repeat(32));
    expect(tracked).toBe(`${base}/c/${id}?u=https%3A%2F%2Fexample.com%2Frsvp%3Fx%3D1%26y%3D2&s=${'a'.repeat(32)}`);
    expect(out.split(`href="${tracked.replace(/&/g, '&amp;')}"`)).toHaveLength(3); // both RSVP links
    expect(out).toContain("href='" + clickUrl(base, id, 'http://plain.example/', 'b'.repeat(32)).replace(/&/g, '&amp;') + "'");
    expect(out).toContain('href="https://ncssmyac.github.io/YACquest/#/unsubscribe?t=abc"');
    expect(out).toContain('href="mailto:yac@example.com"');
    expect(out).toContain('href="https://unsigned.example/"');
    // the click URL decodes back to the exact signed URL
    expect(new URL(tracked).searchParams.get('u')).toBe('https://example.com/rsvp?x=1&y=2');
  });

  it('signatures are HMAC-SHA256 (left 32 hex) of "<message id>|<url>" — same value as SQL email_link_sig', () => {
    const sig = createHmac('sha256', 'test-secret').update(`${id}|https://example.com/a?b=1&c=2`).digest('hex').slice(0, 32);
    expect(sig).toBe('9f326b2007899e8b0516ecb8f4e54f58'); // supabase/tests/tests.sql checks the same value
    expect(SQL).toContain("left(encode(hmac(p_msg::text || '|' || coalesce(p_url, ''), (select track_secret from public.email_secrets where id = 1), 'sha256'), 'hex'), 32)");
    const bad = createHmac('sha256', 'test-secret').update(`${id}|https://evil.example/`).digest('hex').slice(0, 32);
    expect(bad).not.toBe(sig);
  });

  it('adds the open pixel before </body>', () => {
    const out = addOpenPixel('<html><body><p>x</p></body></html>', `${base}/o/${id}.gif`);
    expect(out).toMatch(new RegExp(`<img src="${base}/o/${id}\\.gif" width="1" height="1" alt="" [^>]*/></body>`));
    expect(addOpenPixel('<p>x</p>', 'https://p/x.gif')).toMatch(/<p>x<\/p><img /);
  });

  it('List-Unsubscribe (RFC 2369) + one-click POST (RFC 8058) headers', () => {
    expect(listUnsubscribeHeaders(base, 'f'.repeat(32), 'yac@gmail.com')).toEqual({
      'List-Unsubscribe': `<${base}/u/${'f'.repeat(32)}>, <mailto:yac@gmail.com?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(messageIdFor(id, 'yac@gmail.com')).toBe(`<yacquest.${id}@gmail.com>`);
  });

  it('parses tracking paths strictly; only http(s) redirects', () => {
    expect(parseTrackPath(`/email-track/o/${id}.gif`)).toEqual({ kind: 'open', id });
    expect(parseTrackPath(`/functions/v1/email-track/c/${id.toUpperCase()}`)).toEqual({ kind: 'click', id });
    expect(parseTrackPath(`/email-track/u/${'a'.repeat(32)}`)).toEqual({ kind: 'unsub', id: 'a'.repeat(32) });
    expect(parseTrackPath('/email-track/u/not-a-token')).toBeNull();
    expect(parseTrackPath('/email-track/c/../../etc')).toBeNull();
    expect(parseTrackPath('/email-track/x/123')).toBeNull();
    expect(safeRedirect('https://example.com/a')).toBe(true);
    expect(safeRedirect('javascript:alert(1)')).toBe(false);
    expect(safeRedirect('//evil.example')).toBe(false);
  });
});

describe('Gmail bounce notices (DSN)', () => {
  const gmailDsn = [
    'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
    'To: yac@gmail.com',
    'X-Failed-Recipients: Nobody@Example.edu',
    'Subject: Delivery Status Notification (Failure)',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="b"',
    '',
    '--b',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    "Address not found",
    "Your message wasn't delivered to nobody@example.edu because the address couldn't be found, or is unable to receive mail.",
    '--b',
    'Content-Type: message/delivery-status',
    '',
    'Reporting-MTA: dns; googlemail.com',
    '',
    'Final-Recipient: rfc822; nobody@example.edu',
    'Action: failed',
    'Status: 5.1.1',
    'Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.',
    '--b--',
  ].join('\r\n');

  it('finds the failed recipient (lower-case), a hard failure and the reason', () => {
    expect(parseDsn(gmailDsn)).toEqual({
      recipients: ['nobody@example.edu'],
      hard: true,
      status: '5.1.1',
      reason: '550-5.1.1 The email account that you tried to reach does not exist.',
    });
  });

  it('works from the body alone (no headers) and with folded headers', () => {
    expect(parseDsn("Your message wasn't delivered to someone@example.org because the address couldn't be found.")).toMatchObject({ recipients: ['someone@example.org'], hard: true });
    expect(parseDsn('X-Failed-Recipients: a@example.com,\r\n b@example.com\r\n\r\nStatus: 5.2.2')).toMatchObject({ recipients: ['a@example.com', 'b@example.com'], hard: true });
  });

  it('ignores "delayed" notices (Gmail is still trying) and messages without a recipient', () => {
    expect(parseDsn('Final-Recipient: rfc822; slow@example.com\r\nAction: delayed\r\nStatus: 4.4.1')).toBeNull();
    expect(parseDsn('Hello, this is a normal email.')).toBeNull();
  });
});

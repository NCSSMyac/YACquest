/**
 * 0037: emailed unsubscribe parsing (List-Unsubscribe mailto), retention constants (TS = SQL),
 * the opt-out wording everywhere, the Privacy page text, and the demo API mirroring the server.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RETENTION, SENSITIVE_BODY_KINDS, UNSUB_LABEL, UNSUB_UNMATCHED_LABEL, isUnsubscribeRequest, senderAddress, senderAuthenticated,
  type EmailKind,
} from '../../supabase/functions/_shared/emailCore';
import {
  ANNOUNCE_EMAIL_HINT_GROUP, ANNOUNCE_EMAIL_HINT_ONE, EMAIL_OPT_IN_HINT, EMAIL_OPT_IN_LABEL, UNSUB_BACK_ON, UNSUB_CHANGE_MIND, UNSUB_DONE,
} from '../lib/emailWording';
import * as api from '../api/mock';

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: null }) }));
import Privacy from '../screens/Privacy';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const SQL = read('supabase/migrations/0037_email_retention_mailto_unsub.sql');

describe('isUnsubscribeRequest (subject of an emailed unsubscribe)', () => {
  it.each(['unsubscribe', 'Unsubscribe', 'UNSUBSCRIBE', '  unsubscribe  ', 'unsubscribe.', 'Unsubscribe!', 'Re: unsubscribe', 'RE:Unsubscribe', 're : re: unsubscribe', '\tunsubscribe\n'])(
    'accepts %j', (s) => expect(isUnsubscribeRequest(s)).toBe(true),
  );
  it.each(['', 'unsubscribed', 'Please unsubscribe me', 'unsubscribe me', 'Fwd: unsubscribe', 'Fw: unsubscribe', 'How do I unsubscribe?', 'Re: Trivia Night', 'un subscribe'])(
    'rejects %j', (s) => expect(isUnsubscribeRequest(s)).toBe(false),
  );
  it('rejects missing subjects', () => {
    expect(isUnsubscribeRequest(undefined)).toBe(false);
    expect(isUnsubscribeRequest(null)).toBe(false);
  });
});

describe('sender helpers', () => {
  it('senderAddress takes the address, lower-case', () => {
    expect(senderAddress('Ava Yak <Ava.Yak@Gmail.com>')).toBe('ava.yak@gmail.com');
    expect(senderAddress('ava@example.edu')).toBe('ava@example.edu');
    expect(senderAddress('"Yak, Ava" <ava+yac@example.co.uk>')).toBe('ava+yac@example.co.uk');
    expect(senderAddress('')).toBeNull();
    expect(senderAddress('no address here')).toBeNull();
  });
  it('senderAuthenticated: a pass and no DMARC failure', () => {
    expect(senderAuthenticated('mx.google.com; dkim=pass header.i=@gmail.com; spf=pass smtp.mailfrom=ava@gmail.com; dmarc=pass (p=NONE) header.from=gmail.com')).toBe(true);
    expect(senderAuthenticated('mx.google.com; spf=pass smtp.mailfrom=x@school.edu')).toBe(true);
    expect(senderAuthenticated('mx.google.com; spf=softfail; dkim=none; dmarc=fail (p=REJECT) header.from=gmail.com')).toBe(false);
    expect(senderAuthenticated('mx.google.com; dkim=pass; dmarc=fail header.from=gmail.com')).toBe(false);
    expect(senderAuthenticated('mx.google.com; spf=neutral; dkim=none')).toBe(false);
    expect(senderAuthenticated('')).toBe(false);
    expect(senderAuthenticated(null)).toBe(false);
  });
  it('labels mirror the bounce label style', () => {
    expect(UNSUB_LABEL).toBe('YACquest unsubscribes');
    expect(UNSUB_UNMATCHED_LABEL).toBe('YACquest unsubscribes/unmatched');
  });
  it('EmailKind includes verify_email', () => {
    const k: EmailKind = 'verify_email';
    expect(k).toBe('verify_email');
  });
});

describe('retention: TypeScript constants = SQL 0037 constants', () => {
  it('periods', () => {
    expect(SQL).toMatch(new RegExp(`email_keep_log\\(\\)\\s*returns interval language sql immutable as \\$\\$ select interval '${RETENTION.logMonths} months'`));
    expect(SQL).toMatch(new RegExp(`email_keep_sensitive_body\\(\\)\\s*returns interval language sql immutable as \\$\\$ select interval '${RETENTION.sensitiveBodyDays} days'`));
    expect(SQL).toMatch(new RegExp(`email_keep_verify_tokens\\(\\)\\s*returns interval language sql immutable as \\$\\$ select interval '${RETENTION.verifyTokenDays} days'`));
    expect(RETENTION.purgeEveryHours).toBe(24);
    expect(SQL).toMatch(/email_purge_every\(\)\s*returns interval language sql immutable as \$\$ select interval '1 day'/);
  });
  it('kinds whose contents are emptied', () => {
    expect(SQL).toContain(`select array[${SENSITIVE_BODY_KINDS.map((k) => `'${k}'`).join(', ')}]`);
    expect(SENSITIVE_BODY_KINDS).toEqual(expect.arrayContaining(['prize_info', 'prize_qualified', 'weekly_report']));
  });
  it('the purge rides on the per-run call and never blocks it', () => {
    expect(SQL).toMatch(/begin\s+perform public\.purge_email_data\(now\(\), false\);\s+exception when others then\s+raise warning/);
  });
});

describe('send-emails (0037)', () => {
  const src = read('supabase/functions/send-emails/index.ts');
  const main = src.slice(src.indexOf('// ════ END emailCore'));
  it('only participant emails get tracked links and the open pixel', () => {
    expect(main).toContain('const links = participant ? extractLinks(html) : [];');
    expect(main).toContain('if (participant && html) html = addOpenPixel(');
  });
  it('processes emailed unsubscribes inside the IMAP time budget, never replying', () => {
    expect(main).toContain("db.rpc('unsubscribe_by_email', { p_email: from })");
    expect(main).toContain('isUnsubscribeRequest(msg.envelope?.subject)');
    expect(main).toMatch(/withTimeout\(checkInbox\(db, user, pass, inbox\), Math\.min\(THROTTLE\.imapBudgetMs, left\), 'IMAP'\)/);
    expect(main).toContain('unsubscribes, imap, imapError } });');
    expect(main).not.toMatch(/sendMail\([^)]*inReplyTo/);
  });
});

describe('one opt-out setting, the same words everywhere', () => {
  it('label and small print', () => {
    expect(EMAIL_OPT_IN_LABEL).toBe('Email me YACquest updates');
    expect(EMAIL_OPT_IN_HINT).toBe('Announcements, event reminders, post-event thank-yous and your yearly Wrapped. You’ll still see everything in the app.');
  });
  it('unsubscribe page names all four kinds', () => {
    for (const s of [UNSUB_DONE, UNSUB_BACK_ON]) for (const w of ['announcements', 'event reminders', 'event follow-ups', 'Wrapped']) expect(s).toContain(w);
    expect(UNSUB_DONE.startsWith('You won’t get YACquest emails anymore: announcements, event reminders, event follow-ups or Wrapped.')).toBe(true);
    expect(UNSUB_CHANGE_MIND).toContain('“Email me YACquest updates”');
  });
  it('Announce hints: one person is emailed only with emails on and a confirmed address', () => {
    expect(ANNOUNCE_EMAIL_HINT_ONE).not.toContain('Goes to their account email');
    expect(ANNOUNCE_EMAIL_HINT_ONE).toContain('“Email me YACquest updates” on and a confirmed email address');
    expect(ANNOUNCE_EMAIL_HINT_GROUP).toContain('“Email me YACquest updates” on and a confirmed email address');
  });
  it('screens use the shared wording; the old label is gone from the app', () => {
    for (const f of ['src/screens/Signup.tsx', 'src/screens/Me.tsx']) {
      expect(read(f)).toContain('{EMAIL_OPT_IN_LABEL}');
      expect(read(f)).toContain('{EMAIL_OPT_IN_HINT}');
    }
    expect(read('src/screens/Unsubscribe.tsx')).toContain('{UNSUB_DONE}');
    expect(read('src/screens/admin/Announce.tsx')).toContain('ANNOUNCE_EMAIL_HINT_ONE');
    for (const f of ['src/screens/Signup.tsx', 'src/screens/Me.tsx', 'src/screens/Privacy.tsx', 'src/screens/Unsubscribe.tsx', 'src/screens/admin/Announce.tsx', 'src/api/shared.ts']) {
      expect(read(f)).not.toMatch(/Email me announcements/);
    }
  });
});

describe('Privacy page', () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {}); // server render: "useLayoutEffect does nothing"
  const html = renderToStaticMarkup(<MemoryRouter><Privacy /></MemoryRouter>).replace(/<[^>]+>/g, '');
  quiet.mockRestore();
  it('no ads, no analytics, no tracking cookies (no more "no trackers")', () => {
    expect(html).toContain('No ads, no analytics, no tracking cookies.');
    expect(html).not.toMatch(/no ads or trackers/i);
  });
  it('explains open and click tracking, what is stored and what is not', () => {
    expect(html).toContain('tiny invisible image');
    expect(html).toContain('which link was clicked');
    expect(html).toMatch(/don’t store your IP address or your location/);
    expect(html).toMatch(/Not tracked at all:.*confirms your address, password reset emails, and emails to the YAC team/);
    expect(html).toContain('admins and YACquest Chairs see open and click stats and each person’s email history');
  });
  it('prize delivery info and the prize-alert list', () => {
    expect(html).toContain('YACquest Chairs see it in the app');
    expect(html).toContain('prize-alert list: the YACquest Chairs, the admins, and any extra addresses a YACquest Chair adds');
  });
  it('retention periods and how to opt out', () => {
    expect(html).toContain(`deleted after ${RETENTION.logMonths} months`);
    expect(html).toContain(`after ${RETENTION.sensitiveBodyDays} days at the latest`);
    expect(html).toContain('Untick “Email me YACquest updates” in Me → Settings');
    expect(html).toContain('Unsubscribe in one click');
    expect(html).toContain('subject “unsubscribe”');
  });
});

describe('demo API mirrors the server (0037)', () => {
  const { load, setSession, purgeEmailData, clearSensitiveBodies } = api.__test;
  const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
  const DAY = 86_400_000;
  beforeEach(async () => {
    await api.resetDemoData();
  });

  it('test email greets with the first name', async () => {
    asUser('iesha');
    const me = load().users.find((u) => u.handle === 'iesha')!;
    me.displayName = 'Iesha Landis';
    await api.sendTestEmail();
    const tests = load().outbox.filter((o) => o.kind === 'test');
    const row = tests[tests.length - 1];
    expect(row.text.startsWith('Hi Iesha, ')).toBe(true);
    expect(row.text).not.toContain('Landis');
  });

  it('purge: 12-month log, 30-day sensitive contents, tokens; at most once a day', () => {
    const d = load();
    const now = Date.now();
    const iso = (ms: number) => new Date(now - ms).toISOString();
    d.emailPurgeAt = undefined;
    d.outbox.push(
      { id: 'o-old', kind: 'test', toEmails: ['x@y.co'], subject: 's', text: 't', html: 'h', dedupeKey: 'test:o-old', status: 'sent', attempts: 1, createdAt: iso(400 * DAY) },
      { id: 'o-wr', kind: 'weekly_report', toEmails: ['x@y.co'], subject: 's', text: 'Feedback', html: 'h', dedupeKey: 'weekly:x', status: 'sent', attempts: 1, createdAt: iso(31 * DAY) },
      { id: 'o-wr2', kind: 'weekly_report', toEmails: ['x@y.co'], subject: 's', text: 'Feedback', html: 'h', dedupeKey: 'weekly:y', status: 'sent', attempts: 1, createdAt: iso(2 * DAY) },
    );
    (d.messages ??= []).push({ id: 'm-old', kind: 'announcement', campaignId: 'a', campaignLabel: 'a', email: 'x@y.co', subject: 's', text: '', html: '', priority: 4, status: 'sent', attempts: 1, createdAt: iso(400 * DAY) });
    (d.emailEvents ??= []).push({ messageId: 'm-old', type: 'open', createdAt: iso(399 * DAY) });
    (d.verifyTokens ??= []).push(
      { token: 'old', userId: 'u', email: 'x@y.co', reason: 'signup', createdAt: iso(40 * DAY), expiresAt: iso(33 * DAY) },
      { token: 'new', userId: 'u', email: 'x@y.co', reason: 'signup', createdAt: iso(2 * DAY), expiresAt: new Date(now + 5 * DAY).toISOString() },
    );
    expect(purgeEmailData(now)).toBe(true);
    expect(d.outbox.some((o) => o.id === 'o-old')).toBe(false);
    expect(load().messages!.some((m) => m.id === 'm-old')).toBe(false);
    expect(load().emailEvents!.some((e) => e.messageId === 'm-old')).toBe(false);
    expect(d.outbox.find((o) => o.id === 'o-wr')).toMatchObject({ text: '', html: '' });
    expect(d.outbox.find((o) => o.id === 'o-wr')!.bodyPurgedAt).toBeTruthy();
    expect(d.outbox.find((o) => o.id === 'o-wr2')).toMatchObject({ text: 'Feedback' });
    expect(load().verifyTokens!.map((t) => t.token)).toEqual(expect.not.arrayContaining(['old']));
    expect(load().verifyTokens!.map((t) => t.token)).toContain('new');
    expect(purgeEmailData(now + 3_600_000)).toBe(false);
    expect(purgeEmailData(now + 25 * 3_600_000)).toBe(true);
  });

  it('prize alerts are emptied when the prize is delivered, and Retry refuses emptied emails', async () => {
    const d = load();
    const winner = d.users.find((u) => u.role === 'participant')!;
    d.claims.push({ spot: 1, userId: winner.id, displayName: winner.displayName, campus: winner.campus, qualifiedAt: new Date().toISOString(), status: 'info_submitted', contact: { fullName: 'A B', email: 'a@b.co', phone: '1', address: '1 Main St', preference: '', notes: '' } });
    d.outbox.push({ id: 'o-pi', kind: 'prize_info', toEmails: ['x@y.co'], subject: 's', text: '1 Main St', html: '1 Main St', dedupeKey: `prize_info:${winner.id}:1:{}`, status: 'failed', attempts: 5, createdAt: new Date().toISOString() });
    clearSensitiveBodies(Date.now()); // not delivered yet, and recent: kept
    expect(d.outbox.find((o) => o.id === 'o-pi')!.text).toBe('1 Main St');
    asUser('iesha');
    await api.markFulfilled(1);
    expect(load().outbox.find((o) => o.id === 'o-pi')).toMatchObject({ text: '', html: '' });
    await expect(api.retryEmail('o-pi')).rejects.toMatchObject({ code: 'purged' });
  });
});

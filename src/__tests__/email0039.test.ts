/**
 * 0039: no winner details in the prize email, cleaner wording (subjects, ET, campus lines, footers),
 * per-type email choices + typed one-click unsubscribe, email health. The database side is tested in
 * supabase/tests/tests.sql (section 0039) with the same words.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMAIL_TYPE_LABEL, appUnsubscribeUrl, emailTypeOf, listUnsubscribeHeaders, parseTrackPath, parseUnsubKind, unsubscribePostUrl,
} from '../../supabase/functions/_shared/emailCore';
import * as api from '../api/mock';
import { CAMPUS_PUNS } from '../lib/campusPuns';
import {
  EMAIL_OPT_IN_LABEL, EMAIL_PREFS_EXPLAINER, EMAIL_PREFS_TITLE, EMAIL_PREF_ITEMS, emailPrefsOf, emailPrefsSummary, unsubView,
} from '../lib/emailWording';
import { EMAIL_HEALTH_CACHE_MS, agoText, cachedEmailHealth, clearEmailHealthCache, emailHealthBanner, emailHealthLine } from '../lib/emailHealth';
import { emailKindOn, emailTypeOffError, prizeInfoEmail, renderForRecipient, emailLayout } from '../lib/emailRender';
import { emailEventTime, emailEventWhen, missedEmailText } from '../lib/followups';
import type { EmailHealth } from '../types';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const SQL = read('supabase/migrations/0039_email_wording_prefs_health.sql');
const { load, setSession, deliverOutbox, queueEventReminders, emailHealthSync, setDemoEmailHealth } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
/** Anything outside printable ASCII except the few typographic marks we use (’ — · … –). */
const NOT_PLAIN = /[^\x20-\x7E’—·…–]/u;

beforeEach(async () => {
  await api.resetDemoData();
  clearEmailHealthCache();
  setDemoEmailHealth(null);
});

describe('emailCore: one-click links carry the kind', () => {
  const base = 'https://x.supabase.co/functions/v1/email-track';
  const tok = 'f'.repeat(32);
  it('types of member email kinds (same as SQL email_kind_type)', () => {
    expect(emailTypeOf('announcement')).toBe('announcement');
    expect(emailTypeOf('event_reminder')).toBe('events');
    expect(emailTypeOf('event_followup')).toBe('events');
    expect(emailTypeOf('wrapped')).toBe('wrapped');
    expect(emailTypeOf('EVENTS')).toBe('events');
    for (const k of ['test', 'weekly_report', 'prize_info', 'verify_email', '', null, undefined]) expect(emailTypeOf(k)).toBeNull();
    expect(EMAIL_TYPE_LABEL).toEqual({ announcement: 'Announcements', events: 'Event reminders and thank-yous', wrapped: 'Yearly Wrapped' });
  });
  it('parseUnsubKind keeps member kinds only (anything else = everything)', () => {
    expect(parseUnsubKind('announcement')).toBe('announcement');
    expect(parseUnsubKind(' Event_Followup ')).toBe('event_followup');
    for (const k of ['prize_info', 'nonsense', 'x'.repeat(50), '<script>', '', null]) expect(parseUnsubKind(k)).toBeNull();
  });
  it('POST url, headers and app url', () => {
    expect(unsubscribePostUrl(base, tok)).toBe(`${base}/u/${tok}`);
    expect(unsubscribePostUrl(base, tok, 'announcement')).toBe(`${base}/u/${tok}?k=announcement`);
    expect(unsubscribePostUrl(base, tok, 'weekly_report')).toBe(`${base}/u/${tok}`);
    expect(listUnsubscribeHeaders(base, tok, 'yac@gmail.com', 'wrapped')).toEqual({
      'List-Unsubscribe': `<${base}/u/${tok}?k=wrapped>, <mailto:yac@gmail.com?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    // old call (no kind) unchanged
    expect(listUnsubscribeHeaders(base, tok, 'yac@gmail.com')['List-Unsubscribe']).toBe(`<${base}/u/${tok}>, <mailto:yac@gmail.com?subject=unsubscribe>`);
    expect(appUnsubscribeUrl('https://a.b/YACquest/', tok, 'event_reminder')).toBe(`https://a.b/YACquest/#/unsubscribe?t=${tok}&k=event_reminder`);
    expect(appUnsubscribeUrl('https://a.b/YACquest', tok)).toBe(`https://a.b/YACquest/#/unsubscribe?t=${tok}`);
    // the query string doesn't change what the path means (an old email-track ignores it → everything off)
    expect(parseTrackPath(new URL(unsubscribePostUrl(base, tok, 'announcement')).pathname)).toEqual({ kind: 'unsub', id: tok });
  });
  it('the Edge Functions pass the kind on', () => {
    const send = read('supabase/functions/send-emails/index.ts');
    expect(send).toContain('listUnsubscribeHeaders(base, r.unsub_token, user, r.kind)');
    const track = read('supabase/functions/email-track/index.ts');
    expect(track).toContain("parseUnsubKind(reqUrl.searchParams.get('k'))");
    expect(track).toContain("kind ? { p_token: hit.id, p_kind: kind } : { p_token: hit.id }");
    expect(track).toContain('appUnsubscribeUrl(appUrl, hit.id, kind)');
  });
});

describe('wording', () => {
  it('campus lines: friendly school spirit, 4 per campus, the agreed lines', () => {
    expect(CAMPUS_PUNS.duke).toEqual(['Go Blue Devils — see you soon!', 'From the Gothic Wonderland to YAC: welcome back!', "Duke's got spirit — bring it to the next event!", 'Forever Duke, forever NCSSM.']);
    expect(CAMPUS_PUNS.unc).toEqual(['Go Heels!', 'Carolina blue skies ahead 💙', 'Heel yeah, see you there!', 'Ram-arkable things happen when Tar Heels show up.']);
    expect(CAMPUS_PUNS.ncsu).toEqual(['Go Pack!', 'Howl about joining us?', 'Wolfpack, roll call! 🐾', 'Think and Do — and come hang with YAC!']);
    for (const l of Object.values(CAMPUS_PUNS).flat()) {
      expect(l).not.toContain('😈');
      expect(l).not.toMatch(/bet they|devilish|break/i);
    }
  });
  it('event times in emails say ET', () => {
    expect(emailEventTime('2026-11-19T19:00:00-05:00')).toBe('7:00 PM ET');
    expect(emailEventWhen('2026-11-19T19:00:00-05:00')).toBe('Thu, Nov 19 at 7:00 PM ET');
    expect(missedEmailText('Trivia', { title: 'Board Games', startsAt: '2026-11-19T19:00:00-05:00', location: 'Pit' }))
      .toBe('We missed you at Trivia. Hope to see you next time!\n\nNext up: Board Games\nWhen: Thu, Nov 19 at 7:00 PM ET\nWhere: Pit\n\nRSVP in YACquest → Quests.');
  });
  it('staff footer: same words in HTML and plain text', () => {
    const r = renderForRecipient({ kind: 'test', subject: 'YACquest test email', text: 'Hi', html: emailLayout('Test', '<p>Hi</p>'), campaignId: 'test' }, null);
    const words = "You get this because you're on the YACquest staff email list.";
    expect(r.text).toContain(words);
    expect(r.html).toContain(words);
    expect(r.html + r.text).not.toContain('committee list');
  });
  it('member footer names the type; its one-click link turns off only that type', () => {
    const r = renderForRecipient({ kind: 'wrapped', subject: 'Your YACquest Wrapped is here', text: 'w', html: emailLayout('W', '<p>w</p>'), campaignId: 'wrapped:c' },
      { displayName: 'Jordan Lee', campus: 'unc', points: 10, friendCode: 'YAC-1' }, { unsubToken: 'c'.repeat(32) });
    expect(r.text).toContain("You're getting this because you have YACquest yearly Wrapped emails on.");
    expect(r.text).toContain(`#/unsubscribe?t=${'c'.repeat(32)}&k=wrapped`);
    expect(r.html).toContain('Unsubscribe from these in one click</a> · Manage all email choices in the app (Me → Settings)');
  });
  it('the confirmation email says what confirming does (SQL + demo)', () => {
    expect(SQL).toContain('Confirming lets you hold a prize spot and get YACquest emails.');
    expect(read('src/api/mock.ts')).not.toContain('locks in your points');
  });
  it('Me → Settings and Sign-up wording', () => {
    expect(EMAIL_OPT_IN_LABEL).toBe('Email me YACquest updates');
    expect(EMAIL_PREFS_TITLE).toBe('Emails');
    expect(EMAIL_PREFS_EXPLAINER).toBe('Pick what we email you. Everything still shows up in the app.');
    expect(EMAIL_PREF_ITEMS.map((i) => i.label)).toEqual(['Announcements', 'Event reminders and thank-yous', 'Yearly Wrapped']);
    expect(emailPrefsSummary({ announcements: true, events: false, wrapped: true })).toBe('Announcements on · Events off · Wrapped on');
    expect(emailPrefsSummary({ announcements: false, events: false, wrapped: false })).toBe('All emails off');
  });
  it('without 0039 columns, the one switch stands for all three', () => {
    expect(emailPrefsOf({ emailOptIn: false })).toEqual({ announcements: false, events: false, wrapped: false });
    expect(emailPrefsOf({ emailOptIn: true, emailPrefs: { announcements: true, events: false, wrapped: false } })).toEqual({ announcements: true, events: false, wrapped: false });
  });
});

describe('winner email: no delivery details', () => {
  it('the agreed sentence, a button to Admin → Prizes, the reference, chairs only', () => {
    const m = prizeInfoEmail({ name: 'Jordan', campusName: 'UNC', spot: 3, reference: 'YQ-7K2P', valueUsd: 75, deadline: 'May 15, 2027' });
    expect(m.subject).toBe('YACquest winner info received: Jordan (spot #3)');
    expect(m.text.startsWith('Jordan (UNC) sent their delivery details for prize spot #3. Open YACquest → Admin → Prizes to see them and send the $75 gift card by May 15, 2027. For privacy, delivery details are only shown in the app.')).toBe(true);
    expect(m.text).toContain('A YACquest chair can see them in Admin → Prizes');
    expect(m.text).toContain('Reference: YQ-7K2P');
    expect(m.html).toContain('href="https://ncssmyac.github.io/YACquest/#/admin/prizes"');
    expect(m.html).toContain('A YACquest chair can see them in Admin → Prizes (only chairs can open it).');
  });
  it('the demo queues it without the address, phone, email or notes', async () => {
    const d = load();
    const u = d.users.find((x) => x.role === 'participant')!;
    api.__test.addLedger({ userId: u.id, amount: 400, source: 'manual', reason: 'test boost' });
    setSession(u.id);
    await api.submitClaimInfo({ fullName: 'Rhea Q. Winner', email: 'rhea@example.com', phone: '(919) 555-0139', address: '39 Elm St\nRaleigh NC', preference: 'Target', notes: 'leave at door' });
    const alert = d.outbox.find((o) => o.kind === 'prize_info')!;
    expect(alert.subject).toMatch(/^YACquest winner info received: .+ \(spot #\d+\)$/);
    for (const v of ['Rhea', '555-0139', '39 Elm', 'rhea@example.com', 'Target', 'leave at door']) expect(alert.text + alert.html).not.toContain(v);
  });
});

describe('subjects: no emoji, no URGENT (demo, every generated kind)', () => {
  it('test, prize, reminder, Wrapped, weekly report, confirmation', async () => {
    asUser('iesha');
    await api.sendTestEmail();
    await api.sendWeeklyReportNow();
    queueEventReminders(Date.now());
    const d = load();
    const subjects = d.outbox.map((o) => [o.kind, o.subject] as const);
    expect(subjects.find(([k]) => k === 'test')?.[1]).toBe('YACquest test email');
    for (const [k, s] of subjects) {
      expect(s, k).not.toMatch(NOT_PLAIN);
      expect(s, k).not.toMatch(/urgent/i);
    }
    const rem = d.outbox.filter((o) => o.kind === 'event_reminder');
    for (const r of rem) expect(r.subject).toMatch(/ starts at \d{1,2}:\d{2} [AP]M ET$/);
    expect(read('src/api/mock.ts')).toContain("enqueueEmail('wrapped', [u.email], 'Your YACquest Wrapped is here',");
    expect(SQL).toContain("v_subject constant text := 'Your YACquest Wrapped is here'");
  });
});

describe('per-type choices (demo mirrors the database)', () => {
  it('Me → Settings: setEmailPrefs changes one type; email_opt_in = any on', async () => {
    asUser('yak001');
    let u = await api.setEmailPrefs({ events: false });
    expect(u.emailPrefs).toEqual({ announcements: true, events: false, wrapped: true });
    expect(u.emailOptIn).toBe(true);
    u = await api.setEmailPrefs({ announcements: false, wrapped: false });
    expect(u.emailOptIn).toBe(false);
    u = await api.setEmailPrefs({ wrapped: true });
    expect(u.emailOptIn).toBe(true);
    expect((await api.myEmailStatus())?.prefs).toEqual({ announcements: false, events: false, wrapped: true });
    // the old single switch (and Sign-up's one box) sets all three
    u = await api.updateProfile({ emailOptIn: true });
    expect(u.emailPrefs).toEqual({ announcements: true, events: true, wrapped: true });
  });
  it('each kind checks its own type (render + send)', () => {
    const p = { announcements: false, events: true, wrapped: true };
    expect(emailKindOn('announcement', p)).toBe(false);
    expect(emailKindOn('event_reminder', p)).toBe(true);
    expect(emailKindOn('weekly_report', { announcements: false, events: false, wrapped: false })).toBe(true);
    expect(emailTypeOffError('event_followup')).toBe('Event reminder and thank-you emails are off for this person.');
  });
  it('announcements skip people with Announcements off; their other types still work', async () => {
    const d = load();
    const u = d.users.find((x) => x.handle === 'alum010')!;
    u.emailPrefs = { announcements: false, events: true, wrapped: true };
    asUser('iesha');
    const c = await api.announcementAudienceCount('user', undefined, u.id);
    expect(c).toMatchObject({ email: 0, emailReason: 'emails_off', emailTypes: { announcements: false, events: true, wrapped: true } });
    await api.sendAnnouncement({ title: 'Hello', body: 'Hi', audience: 'all', sendEmail: true });
    expect((d.messages ?? []).some((m) => m.subject === 'YACquest: Hello' && m.userId === u.id)).toBe(false);
    expect((d.messages ?? []).some((m) => m.subject === 'YACquest: Hello')).toBe(true);
    const rows = await api.searchUsers('alum010');
    expect(rows[0].emailPrefs).toEqual({ announcements: false, events: true, wrapped: true });
  });
  it('a type turned off after queuing is skipped by the sender', async () => {
    const d = load();
    asUser('iesha');
    await api.sendAnnouncement({ title: 'Later', body: 'Hi', audience: 'campus', campus: 'duke', sendEmail: true });
    const m = (d.messages ?? []).find((x) => x.kind === 'announcement' && x.status === 'pending' && x.userId)!;
    d.users.find((x) => x.id === m.userId)!.emailPrefs = { announcements: false, events: true, wrapped: true };
    deliverOutbox(Date.now() + 3_600_000);
    expect(m.status).toBe('skipped_opted_out');
    expect(m.error).toBe('Announcement emails are off for this person.');
  });
});

describe('one-click unsubscribe with a kind', () => {
  it('turns off only that type; without a kind, everything', async () => {
    const d = load();
    const u = d.users.find((x) => x.handle === 'alum041')!;
    const tok = api.__test.unsubTokenFor(u.id);
    setSession(null);
    expect(await api.unsubscribeByToken(tok, 'event_reminder')).toEqual({ alreadyOff: false, type: 'events', othersOn: true });
    expect(emailPrefsOf(u)).toEqual({ announcements: true, events: false, wrapped: true });
    expect(await api.unsubscribeByToken(tok, 'event_followup')).toEqual({ alreadyOff: true, type: 'events', othersOn: true });
    expect(d.emailEvents!.filter((e) => e.userId === u.id && e.type === 'unsubscribe').map((e) => e.detail)).toEqual(['one-click:events']);
    expect(await api.unsubscribeByToken(tok, 'nonsense')).toEqual({ alreadyOff: false, type: 'all', othersOn: false });
    expect(emailPrefsOf(u)).toEqual({ announcements: false, events: false, wrapped: false });
  });
});

describe('unsubscribe page states (unsubView)', () => {
  it('typed link: "You’re unsubscribed from announcement emails." + also-all + back on (logged in) + manage', () => {
    const v = unsubView({ kind: 'announcement', scope: 'type', alreadyOff: false, othersOn: true, loggedIn: true });
    expect(v.headline).toBe('You’re unsubscribed from announcement emails.');
    expect(v.alsoAll).toBe(true);
    expect(v.backOn).toBe('Turn announcement emails back on');
    expect(v.login).toBe(false);
    expect(v.manage).toBe('Manage all email choices in Me → Settings');
  });
  it('typed link, logged out, nothing else on', () => {
    const v = unsubView({ kind: 'event_followup', scope: 'type', alreadyOff: true, othersOn: false, loggedIn: false });
    expect(v.headline).toBe('Event reminder and thank-you emails were already off.');
    expect(v.alsoAll).toBe(false);
    expect(v.backOn).toBeNull();
    expect(v.login).toBe(true);
  });
  it('old link (no k): everything off, as before', () => {
    const v = unsubView({ kind: null, scope: 'all', alreadyOff: false, othersOn: false, loggedIn: true });
    expect(v.headline).toBe('You’re unsubscribed.');
    expect(v.lines[0]).toMatch(/^You won’t get YACquest emails anymore/);
    expect(v.backOn).toBe('Turn emails back on');
    expect(v.alsoAll).toBe(false);
  });
  it('the page uses it and passes the kind', () => {
    const page = read('src/screens/Unsubscribe.tsx');
    expect(page).toContain("parseUnsubKind(params.get('k'))");
    expect(page).toContain('.unsubscribeByToken(token, kind)');
    expect(page).toContain('unsubView(');
  });
});

describe('email health', () => {
  const base: EmailHealth = { status: 'green', reasons: [], sent24h: 3, budget: 450, checkedAt: '2026-11-20T15:00:00Z', lastRunAt: '2026-11-20T14:57:00Z' };
  const now = new Date('2026-11-20T15:00:00Z').getTime();
  it('green → no banner; line "all good · last run 3 min ago"', () => {
    expect(emailHealthBanner(base)).toBeNull();
    expect(emailHealthBanner(null)).toBeNull();
    expect(emailHealthLine(base, now)).toBe('Email health: all good · last run 3 min ago');
  });
  it('red first, with "What to do" lines', () => {
    const h: EmailHealth = {
      ...base, status: 'red',
      reasons: [
        { code: 'tracking', level: 'amber', title: 'Open/click tracking may be down — check the email-track function', todo: 'x' },
        { code: 'not_running', level: 'red', title: 'Email sender hasn’t run in 2 hours — check Supabase → Integrations → Cron', todo: 'y' },
      ],
    };
    const b = emailHealthBanner(h)!;
    expect(b.tone).toBe('red');
    expect(b.items.map((r) => r.code)).toEqual(['not_running', 'tracking']);
    expect(emailHealthLine(h, now)).toBe('Email health: 1 problem, 1 warning · last run 3 min ago');
    expect(emailHealthBanner({ ...h, status: 'amber', reasons: [h.reasons[0]] })!.tone).toBe('amber');
  });
  it('agoText', () => {
    expect(agoText(undefined, now)).toBe('never');
    expect(agoText('2026-11-20T14:59:50Z', now)).toBe('just now');
    expect(agoText('2026-11-20T12:00:00Z', now)).toBe('3 h ago');
    expect(agoText('2026-11-17T12:00:00Z', now)).toBe('3 days ago');
  });
  it('cached for 60 s (one query a minute at most)', async () => {
    let calls = 0;
    const f = async () => { calls++; return base; };
    await cachedEmailHealth(f, 1000);
    await cachedEmailHealth(f, 1000 + EMAIL_HEALTH_CACHE_MS - 1);
    expect(calls).toBe(1);
    await cachedEmailHealth(f, 1000 + EMAIL_HEALTH_CACHE_MS);
    expect(calls).toBe(2);
  });
  it('demo: staff only; green normally, red/amber when simulated', async () => {
    asUser('yak001');
    await expect(api.emailHealth()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    expect((await api.emailHealth()).status).toBe('green');
    setDemoEmailHealth('red');
    const red = emailHealthSync();
    expect(red.status).toBe('red');
    expect(red.reasons[0].title).toBe('Gmail rejected the login — check the app password');
    setDemoEmailHealth('amber');
    const amber = emailHealthSync();
    expect(amber.status).toBe('amber');
    expect(amber.reasons.map((r) => r.code)).toEqual(['bounce_check', 'tracking']);
    expect(amber.reasons.find((r) => r.code === 'tracking')!.title).toBe('Open/click tracking may be down — check the email-track function');
  });
  it('SQL: admin-only RPC, all seven checks, the weekly report line', () => {
    expect(SQL).toContain('create or replace function public.email_health(p_now timestamptz default null)');
    expect(SQL).toMatch(/email_health\(p_now timestamptz default null\)[\s\S]*?perform public\.require_admin\(\);/);
    for (const code of ['not_running', 'gmail_login', 'not_sending', 'bounce_check', 'stuck', 'tracking', 'budget']) expect(SQL).toContain(`'code', '${code}'`);
    expect(SQL).toContain("t := t || E'\\n🩺 ' || public.email_health_line(v_health) || E'\\n';");
  });
  it('the dashboard and Admin → System use the cached call', () => {
    expect(read('src/screens/admin/AdminHome.tsx')).toContain('cachedEmailHealth(api.emailHealth)');
    expect(read('src/components/EmailBlocks.tsx')).toContain('cachedEmailHealth(api.emailHealth)');
  });
});

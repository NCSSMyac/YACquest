/**
 * 0032 in the demo backend (mirrors the database): one email per person, opted-out skip, unsubscribe
 * tokens, stats aggregation + drill-down, staff-only access, bounce flag — plus the small UI helpers.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api/mock';
import { campusPun } from '../lib/campusPuns';
import { budgetPct, queueLine, recipientCsvRows, startedEventsMentioned, EMAIL_STATUS_LABEL } from '../lib/emailStats';

const { load, setSession, deliverOutbox, pointsOf } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);

beforeEach(async () => {
  await api.resetDemoData();
});

describe('one email per person', () => {
  it('an announcement to everyone becomes one personalized message per opted-in person (no BCC)', async () => {
    const d = load();
    const off = d.users.find((u) => u.handle === 'alum010')!;
    off.emailOptIn = false;
    asUser('iesha');
    const r = await api.sendAnnouncement({ title: 'Hi {first_name}', body: 'You have {points} points. {campus_pun}', audience: 'all', sendEmail: true });
    const outbox = d.outbox.filter((o) => o.kind === 'announcement');
    expect(outbox).toHaveLength(1);
    const msgs = (d.messages ?? []).filter((m) => m.outboxId === outbox[0].id);
    expect(msgs.filter((m) => m.status === 'pending')).toHaveLength(r.emailed); // 0038: emailed = really queued
    expect(msgs.every((m) => !m.email.includes(','))).toBe(true);
    expect(msgs.some((m) => m.email === off.email)).toBe(false);
    const demo = d.users.find((u) => u.handle === 'yak001')!;
    const mine = msgs.find((m) => m.userId === demo.id)!;
    expect(mine.subject).toBe('YACquest: Hi Yak001');
    expect(mine.text.startsWith(`Hi Yak001,\n\nYou have ${pointsOf(demo.id)} points. ${campusPun('duke', mine.campaignId)}`)).toBe(true);
    expect(mine.html).toContain(`#/unsubscribe?t=${d.unsubTokens![demo.id]}`);
    expect(mine.priority).toBe(4);
    // in the app, filled per person too
    const n = d.notifications.find((x) => x.userId === demo.id && x.kind === 'announcement' && x.title === 'Hi Yak001')!;
    expect(n.body).toBe(`You have ${pointsOf(demo.id)} points. ${campusPun('duke', mine.campaignId)}`);
  });

  it('a direct message to someone with emails off stays in the app', async () => {
    const d = load();
    const u = d.users.find((x) => x.handle === 'alum020')!;
    u.emailOptIn = false;
    asUser('admin');
    const r = await api.sendAnnouncement({ title: 'Just for you', body: 'Your prize is ready', audience: 'user', userId: u.id, sendEmail: true });
    expect(r.emailed).toBe(0);
  });

  it('opting out after queueing skips the email; delivery log says why', async () => {
    const d = load();
    const u = d.users.find((x) => x.handle === 'alum030')!;
    asUser('iesha');
    await api.sendAnnouncement({ title: 'Big news', body: 'Hi', audience: 'user', userId: u.id, sendEmail: true });
    u.emailOptIn = false;
    deliverOutbox();
    const m = d.messages!.find((x) => x.userId === u.id && x.subject === 'YACquest: Big news')!;
    expect(m.status).toBe('skipped_opted_out');
    expect(EMAIL_STATUS_LABEL[m.status]).toBe('Skipped — emails off');
  });
});

describe('unsubscribe link', () => {
  it('works without logging in, only turns emails off, and rejects bad tokens harmlessly', async () => {
    const d = load();
    const u = d.users.find((x) => x.handle === 'alum040')!;
    const before = { ...u, emailOptIn: undefined };
    setSession(null);
    await expect(api.unsubscribeByToken('nope')).rejects.toMatchObject({ code: 'invalid_token' });
    await expect(api.unsubscribeByToken('a'.repeat(32))).rejects.toMatchObject({ code: 'invalid_token' });
    await expect(api.unsubscribeByToken(u.id)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(await api.unsubscribeByToken(d.unsubTokens![u.id])).toEqual({ alreadyOff: false });
    expect(u.emailOptIn).toBe(false);
    expect({ ...u, emailOptIn: undefined }).toEqual(before);
    expect(await api.unsubscribeByToken(d.unsubTokens![u.id])).toEqual({ alreadyOff: true });
    expect(d.emailEvents!.filter((e) => e.type === 'unsubscribe' && e.userId === u.id)).toHaveLength(1);
  });
});

describe('stats (staff only)', () => {
  it('participants and logged-out visitors can’t read email stats', async () => {
    asUser('yak001');
    await expect(api.emailStats(7)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.emailCampaignRecipients('test')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.emailHistoryFor('x')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.emailQueueStatus()).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.emailBouncingUsers()).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('aggregates sent / delivered / unique opens / clicks / bounces / unsubscribes per email', async () => {
    const d = load();
    asUser('iesha');
    const people = ['alum050', 'alum051', 'alum052', 'alum053'].map((h) => d.users.find((u) => u.handle === h)!);
    people.forEach((p) => (p.emailOptIn = true));
    for (const p of people) await api.sendAnnouncement({ title: 'Stats test', body: 'Hello {first_name}', audience: 'user', userId: p.id, sendEmail: true });
    deliverOutbox(Date.now() + 11 * 60_000); // 0038: after the 10-minute cancel window
    const ms = d.messages!.filter((m) => m.subject === 'YACquest: Stats test');
    expect(ms.map((m) => m.status)).toEqual(['sent', 'sent', 'sent', 'sent']);
    const [a, b, c, e] = ms;
    const at = new Date().toISOString();
    d.emailEvents!.push(
      { messageId: a.id, userId: a.userId, type: 'open', createdAt: at },
      { messageId: a.id, userId: a.userId, type: 'open', createdAt: at },
      { messageId: a.id, userId: a.userId, type: 'click', url: 'https://ncssmyac.github.io/YACquest/', createdAt: at },
      { messageId: b.id, userId: b.userId, type: 'open', createdAt: at },
      { messageId: e.id, userId: e.userId, type: 'unsubscribe', createdAt: at },
    );
    c.status = 'bounced';
    const s = await api.emailStats(1);
    const camps = s.campaigns.filter((x) => x.label === 'Stats test');
    expect(camps).toHaveLength(4); // each direct message is its own send
    const sum = (k: 'sent' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed') => camps.reduce((n, x) => n + x[k], 0);
    expect([sum('sent'), sum('opened'), sum('clicked'), sum('bounced'), sum('unsubscribed')]).toEqual([4, 2, 1, 1, 1]);
    expect(s.totals.delivered).toBe(s.totals.sent - s.totals.bounced);
    expect(s.totals.ctr).toBe(Math.round((100 * s.totals.clicked) / s.totals.delivered));
    expect(s.daily).toHaveLength(1);
    const rows = await api.emailCampaignRecipients(a.campaignId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ opened: true, clickedUrls: ['https://ncssmyac.github.io/YACquest/'], bounced: false });
    expect(recipientCsvRows(rows)[0].slice(5)).toEqual(['yes', 'https://ncssmyac.github.io/YACquest/', 'no', 'no']);
    const hist = await api.emailHistoryFor(a.userId!);
    expect(hist[0]).toMatchObject({ label: 'Stats test', opened: true, clicked: true });
  });

  it('demo data has opens, clicks, bounces, a "too late" skip and one bouncing player', async () => {
    asUser('admin');
    const s = await api.emailStats(30);
    expect(s.totals.sent).toBeGreaterThan(100);
    expect(s.totals.opened).toBeGreaterThan(0);
    expect(s.totals.clicked).toBeGreaterThan(0);
    expect(s.totals.bounced).toBeGreaterThan(0);
    expect(s.totals.expired).toBeGreaterThan(0);
    expect(s.campaigns.map((c) => c.kind)).toEqual(expect.arrayContaining(['announcement', 'event_reminder', 'event_followup', 'weekly_report']));
    const bouncing = await api.emailBouncingUsers();
    expect(bouncing).toHaveLength(1);
    asUser(load().users.find((u) => u.id === bouncing[0])!.handle);
    expect(await api.myEmailStatus()).toMatchObject({ bounced: true });
    await api.clearMyEmailBounce();
    expect(await api.myEmailStatus()).toMatchObject({ bounced: false });
  });
});

describe('UI helpers', () => {
  it('queue line: "Today: 132 / 450 sent · 40 waiting · next batch in ~6 min"', () => {
    const now = new Date('2026-11-18T15:00:00Z');
    const q = { budget: 450, reserve: 50, sent24h: 132, waiting: 40, waitingHigh: 2, skippedToday: 0, bounceCheck: 'ok' as const, lastRunAt: '2026-11-18T14:54:00Z', nextRunAt: '2026-11-18T15:05:30Z' };
    expect(queueLine(q, now)).toBe('Today: 132 / 450 sent · 40 waiting · next batch in ~6 min');
    expect(queueLine({ ...q, nextRunAt: '2026-11-18T14:59:00Z' }, now)).toBe('Today: 132 / 450 sent · 40 waiting · next batch any minute');
    expect(queueLine({ ...q, lastRunAt: undefined, nextRunAt: undefined }, now)).toBe('Today: 132 / 450 sent · 40 waiting · the sender hasn’t run yet');
    expect(budgetPct(q)).toBe(29);
  });

  it('warns about events that already started (unless the same title is coming up again)', () => {
    const now = new Date('2026-11-18T15:00:00Z');
    const events = [
      { title: 'Pickleball Social', startsAt: '2026-11-15T19:00:00Z' },
      { title: 'Trivia Night', startsAt: '2026-11-25T23:00:00Z' },
      { title: 'BBQ', startsAt: '2026-11-01T19:00:00Z' },
    ];
    expect(startedEventsMentioned('Photos from pickleball social are up! Trivia Night next.', events, now).map((e) => e.title)).toEqual(['Pickleball Social']);
    expect(startedEventsMentioned('BBQ recap', events, now)).toEqual([]); // too short to match safely
  });
});

/**
 * 0038 announcement safeguards: the weekly cap on all-member announcement emails, the recipient count and the
 * 10-minute cancel window — the pure helpers (src/lib/announceSafeguards.ts), planBatch's hold, and the demo
 * backend (mirrors supabase/migrations/0038_announcement_safeguards.sql + supabase/tests/tests.sql "0038").
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api/mock';
import { planBatch } from '../../supabase/functions/_shared/emailCore';
import {
  audienceLine, cancelLabel, cancelOpen, capLine, capReached, capReachedMessage, confirmWindowNote, countsTowardCap, minutesLeft,
  recentStatus, sentMessage, weekEndNewYork, weekStartNewYork,
} from '../lib/announceSafeguards';
import { EMAIL_STATUS_LABEL } from '../lib/emailStats';
import type { Announcement } from '../types';

const { load, setSession, deliverOutbox } = api.__test;
const user = (handle: string) => load().users.find((u) => u.handle === handle)!;
const asUser = (handle: string) => setSession(user(handle).id);
const all = (title: string, sendEmail = true) => api.sendAnnouncement({ title, body: 'Hello {first_name}!', audience: 'all', sendEmail });
const NOW = new Date('2026-11-19T15:00:00Z');
const ann = (p: Partial<Announcement>): Announcement => ({
  id: 'a', title: 'T', body: 'B', audience: 'all', sendEmail: true, recipientCount: 10, emailCount: 8, senderName: 'Iesha L.', createdAt: NOW.toISOString(), ...p,
});

describe('wording', () => {
  it('cap line and the cap-reached message', () => {
    expect(capLine({ cap: 3, left: 2 })).toBe('2 of 3 all-member emails left this week (resets Monday)');
    expect(capReachedMessage(3)).toBe('3 all-member announcement emails have already gone out this week (resets Monday). You can still post it in the app, or send the email to one campus.');
    expect(capReachedMessage(1)).toMatch(/^1 all-member announcement email has already gone out/);
    expect(capReachedMessage(0)).toMatch(/turned off \(weekly limit 0\)/);
    expect(capReached({ left: 0 })).toBe(true);
    expect(capReached({ left: 1 })).toBe(false);
    expect(capReached(null)).toBe(false);
  });
  it('who it reaches', () => {
    expect(audienceLine({ inApp: 262, email: 241 }, 'all', true)).toBe('262 people in the app · 241 by email');
    expect(audienceLine({ inApp: 262, email: 241 }, 'all', false)).toBe('262 people in the app');
    expect(audienceLine({ inApp: 1, email: 1 }, 'campus', true)).toBe('1 person in the app · 1 by email');
    expect(audienceLine({ inApp: 1, email: 1 }, 'user', true)).toBe('1 person · emailed: yes');
    expect(audienceLine({ inApp: 1, email: 0, emailReason: 'emails_off' }, 'user', true)).toBe('1 person · emailed: no (announcement emails off)');
    // 0039: their three choices, compactly
    expect(audienceLine({ inApp: 1, email: 0, emailReason: 'emails_off', emailTypes: { announcements: false, events: true, wrapped: true } }, 'user', true))
      .toBe('1 person · emailed: no (announcement emails off) · Announcements off · Events on · Wrapped on');
    expect(audienceLine({ inApp: 1, email: 1, emailTypes: { announcements: true, events: true, wrapped: true } }, 'user', true)).toBe('1 person · emailed: yes · All emails on');
    expect(audienceLine({ inApp: 1, email: 0, emailReason: 'not_confirmed' }, 'user', true)).toBe('1 person · emailed: no (not confirmed)');
    expect(audienceLine({ inApp: 1, email: 0, emailReason: 'bouncing' }, 'user', true)).toBe('1 person · emailed: no (bouncing)');
    expect(audienceLine({ inApp: 1, email: 1 }, 'user', false)).toBe('1 person in the app');
  });
  it('the toast, the confirm note and the countdown', () => {
    expect(sentMessage({ recipients: 262, emailed: 241, emailHoldUntil: NOW.toISOString(), holdMinutes: 10 })).toBe('Sent to the app. Emails go out in 10 minutes — you can cancel until then.');
    expect(sentMessage({ recipients: 262, emailed: 0 })).toBe('Sent to 262 people');
    expect(sentMessage({ recipients: 1, emailed: 1, holdMinutes: 0 })).toBe('Sent to 1 person · emailed 1');
    expect(confirmWindowNote(10)).toMatch(/^Emails wait 10 minutes before they go out\. Until then you can cancel it/);
    const until = new Date(NOW.getTime() + 7.2 * 60_000).toISOString();
    expect(minutesLeft(until, NOW)).toBe(8);
    expect(cancelLabel(until, NOW)).toBe('Cancel · 8 min left');
    expect(minutesLeft(new Date(NOW.getTime() - 1000).toISOString(), NOW)).toBe(0);
  });
  it('when Cancel is offered, and the status line in Recently sent', () => {
    const until = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    expect(cancelOpen(ann({ emailHoldUntil: until, canCancel: true }), NOW)).toBe(true);
    expect(cancelOpen(ann({ emailHoldUntil: until, canCancel: false }), NOW)).toBe(false);
    expect(cancelOpen(ann({ emailHoldUntil: until, canCancel: true, emailsStarted: true }), NOW)).toBe(false);
    expect(cancelOpen(ann({ emailHoldUntil: NOW.toISOString(), canCancel: true }), NOW)).toBe(false);
    expect(recentStatus(ann({ cancelledAt: NOW.toISOString(), cancelledByName: 'Jacob R.' }), NOW)).toBe('Cancelled by Jacob R.');
    expect(recentStatus(ann({ emailHoldUntil: until, emailsStarted: true }), NOW)).toBe('Already sending — can’t cancel');
    expect(recentStatus(ann({ emailHoldUntil: until, canCancel: false }), NOW)).toBe('Emails go out in 5 min');
    expect(recentStatus(ann({ emailHoldUntil: until, canCancel: true }), NOW)).toBeNull();
    expect(EMAIL_STATUS_LABEL.skipped_cancelled).toBe('Cancelled');
  });
});

describe('the week (New York)', () => {
  it('runs Monday 00:00 → Sunday 23:59 New York time', () => {
    // Sunday Nov 22 2026, 11:30 PM EST = Monday 04:30 UTC: still the week of Monday Nov 16
    expect(weekStartNewYork(new Date('2026-11-23T04:30:00Z')).toISOString()).toBe('2026-11-16T05:00:00.000Z');
    expect(weekStartNewYork(new Date('2026-11-23T05:00:00Z')).toISOString()).toBe('2026-11-23T05:00:00.000Z');
    expect(weekEndNewYork(new Date('2026-11-19T15:00:00Z')).toISOString()).toBe('2026-11-23T05:00:00.000Z');
  });
  it('is DST-safe (spring forward on Sunday Mar 8 2026)', () => {
    expect(weekStartNewYork(new Date('2026-03-05T12:00:00Z')).toISOString()).toBe('2026-03-02T05:00:00.000Z');
    expect(weekEndNewYork(new Date('2026-03-05T12:00:00Z')).toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });
  it('only all-member emails that emailed someone and weren’t cancelled count', () => {
    expect(countsTowardCap(ann({}), NOW)).toBe(true);
    expect(countsTowardCap(ann({ audience: 'campus' }), NOW)).toBe(false);
    expect(countsTowardCap(ann({ sendEmail: false }), NOW)).toBe(false);
    expect(countsTowardCap(ann({ emailCount: 0 }), NOW)).toBe(false);
    expect(countsTowardCap(ann({ cancelledAt: NOW.toISOString() }), NOW)).toBe(false);
    expect(countsTowardCap(ann({ createdAt: '2026-11-16T04:59:59Z' }), NOW)).toBe(false); // Sunday 23:59:59 EST
    expect(countsTowardCap(ann({ createdAt: '2026-11-16T05:00:00Z' }), NOW)).toBe(true); // Monday 00:00
  });
});

describe('planBatch holds rows in their cancel window (mirror of claim_email_messages)', () => {
  it('skips a row until notBefore, then sends it', () => {
    const q = [{ id: 'held', priority: 4, createdAt: '2026-11-19T15:00:00Z', notBefore: '2026-11-19T15:10:00Z' }, { id: 'free', priority: 4, createdAt: '2026-11-19T15:00:00Z' }];
    expect(planBatch(q, { now: new Date('2026-11-19T15:09:59Z'), sentLast24h: 0, limit: 10 }).send).toEqual(['free']);
    expect(planBatch(q, { now: new Date('2026-11-19T15:10:00Z'), sentLast24h: 0, limit: 10 }).send.sort()).toEqual(['free', 'held']);
  });
});

describe('demo backend', () => {
  beforeEach(async () => {
    await api.resetDemoData();
    // a clean week: older all-member emails move back a month
    for (const a of load().announcements) a.createdAt = new Date(new Date(a.createdAt).getTime() - 30 * 86_400_000).toISOString();
  });

  it('count: staff only; matches who is really queued; one person says why not', async () => {
    asUser('yak001');
    await expect(api.announcementAudienceCount('all')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.announcementEmailCap()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('admin');
    const c = await api.announcementAudienceCount('all');
    expect(c.inApp).toBe(load().users.length);
    const r = await all('Count check');
    expect(r.emailed).toBe(c.email);
    const queued = (load().messages ?? []).filter((m) => m.subject === 'YACquest: Count check' && m.status === 'pending');
    expect(queued).toHaveLength(c.email);
    const campus = await api.announcementAudienceCount('campus', 'unc');
    const rc = await api.sendAnnouncement({ title: 'UNC check', body: 'Hi', audience: 'campus', campus: 'unc', sendEmail: true });
    expect([rc.recipients, rc.emailed]).toEqual([campus.inApp, campus.email]);
    const off = user('alum020');
    off.emailOptIn = false;
    expect(await api.announcementAudienceCount('user', undefined, off.id)).toEqual({ inApp: 1, email: 0, emailReason: 'emails_off', emailTypes: { announcements: false, events: false, wrapped: false } });
    const on = user('alum021');
    on.emailOptIn = true;
    expect(await api.announcementAudienceCount('user', undefined, on.id)).toMatchObject({ inApp: 1, email: 1 });
    load().emailBounced = { ...(load().emailBounced ?? {}), [on.id]: new Date().toISOString() };
    expect((await api.announcementAudienceCount('user', undefined, on.id)).emailReason).toBe('bouncing');
    await expect(api.announcementAudienceCount('campus', 'mars' as never)).rejects.toMatchObject({ code: 'campus' });
  });

  it('cap: 3 all-member emails a week across all senders; the 4th is refused, in-app / campus / one person still fine', async () => {
    asUser('admin');
    expect(await api.announcementEmailCap()).toMatchObject({ cap: 3, used: 0, left: 3, holdMinutes: 10 });
    await all('One');
    asUser('iesha');
    await all('Two');
    asUser('jacob');
    await all('Three');
    expect((await api.announcementEmailCap()).left).toBe(0);
    asUser('admin');
    await expect(all('Four')).rejects.toMatchObject({ code: 'email_cap', message: capReachedMessage(3) });
    expect(load().announcements.some((a) => a.title === 'Four')).toBe(false);
    expect((await all('Four', false)).recipients).toBe(load().users.length);
    expect((await api.sendAnnouncement({ title: 'Duke only', body: 'Hi', audience: 'campus', campus: 'duke', sendEmail: true })).emailed).toBeGreaterThan(0);
    const p = user('alum030');
    p.emailOptIn = true;
    expect((await api.sendAnnouncement({ title: 'Just you', body: 'Hi', audience: 'user', userId: p.id, sendEmail: true })).emailed).toBe(1);
  });

  it('hold: emails wait 10 minutes, then go out; expiry is still 3 days from sending', async () => {
    asUser('iesha');
    const p = user('alum040');
    p.emailOptIn = true;
    const r = await api.sendAnnouncement({ title: 'Held one', body: 'Hi', audience: 'user', userId: p.id, sendEmail: true });
    expect(r.holdMinutes).toBe(10);
    const m = load().messages!.find((x) => x.subject === 'YACquest: Held one')!;
    const a = load().announcements.find((x) => x.title === 'Held one')!;
    expect(m.notBefore).toBe(a.emailHoldUntil);
    expect(new Date(a.emailHoldUntil!).getTime() - new Date(a.createdAt).getTime()).toBe(10 * 60_000);
    expect(new Date(m.sendBefore!).getTime() - new Date(m.createdAt).getTime()).toBe(3 * 86_400_000);
    deliverOutbox();
    expect(m.status).toBe('pending');
    deliverOutbox(Date.now() + 10 * 60_000 + 1000);
    expect(m.status).toBe('sent');
  });

  it('cancel: sender or YACquest Chair only; stops the emails, removes the in-app notices, logs it, frees the slot', async () => {
    asUser('admin');
    const r = await all('Oops');
    const id = load().announcements.find((a) => a.title === 'Oops')!.id;
    expect((await api.announcementEmailCap()).used).toBe(1);
    const mine = (await api.listAnnouncements(5)).find((a) => a.id === id)!;
    expect(mine).toMatchObject({ canCancel: true, emailsStarted: false });
    expect(new Date(mine.emailHoldUntil!).getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
    asUser('yak001');
    await expect(api.cancelAnnouncement(id)).rejects.toMatchObject({ code: 'forbidden' });
    user('alum050').role = 'admin';
    asUser('alum050');
    expect((await api.listAnnouncements(5)).find((a) => a.id === id)!.canCancel).toBe(false);
    await expect(api.cancelAnnouncement(id)).rejects.toMatchObject({ code: 'forbidden' });
    asUser('admin');
    const res = await api.cancelAnnouncement(id);
    expect(res).toEqual({ emailsCancelled: r.emailed, notificationsRemoved: load().users.length });
    expect(load().notifications.some((n) => n.title === `Oops`)).toBe(false);
    const rows = load().messages!.filter((m) => m.campaignId === `announcement:${id}`);
    expect(rows.filter((m) => m.status === 'skipped_cancelled')).toHaveLength(r.emailed);
    expect(rows.some((m) => m.status === 'pending')).toBe(false);
    const listed = (await api.listAnnouncements(5)).find((a) => a.id === id)!;
    expect(recentStatus(listed)).toBe('Cancelled by YAC Helper');
    expect(listed.canCancel).toBe(false);
    expect((await api.announcementEmailCap()).used).toBe(0);
    await expect(api.cancelAnnouncement(id)).rejects.toMatchObject({ code: 'already_cancelled' });
    deliverOutbox(Date.now() + 3_600_000);
    expect(rows.some((m) => m.status === 'sent')).toBe(false);
    asUser('iesha');
    const log = await api.adminActionLog({ limit: 5 });
    expect(log.find((a) => a.action === 'announcement_cancelled')).toMatchObject({ actorName: 'YAC Helper', details: expect.objectContaining({ title: 'Oops', emailsCancelled: r.emailed }) });
    // stats: cancelled is part of "skipped", never sent or failed
    const s = await api.emailStats(1);
    const camp = s.campaigns.find((c) => c.id === `announcement:${id}`)!;
    expect(camp).toMatchObject({ cancelled: r.emailed, sent: 0, failed: 0, waiting: 0 });
    expect(s.totals.cancelled).toBeGreaterThanOrEqual(r.emailed);
  });

  it('cancel: a chair can cancel anyone’s; not after the window, not once sending, not in-app-only', async () => {
    asUser('admin');
    await all('Chair cancels');
    await all('Window closes');
    const p = user('alum060');
    p.emailOptIn = true;
    await api.sendAnnouncement({ title: 'Goes out', body: 'Hi', audience: 'user', userId: p.id, sendEmail: true });
    await all('In-app only', false);
    const byTitle = (t: string) => load().announcements.find((a) => a.title === t)!;
    asUser('iesha');
    expect((await api.cancelAnnouncement(byTitle('Chair cancels').id)).emailsCancelled).toBeGreaterThan(0);
    byTitle('Window closes').emailHoldUntil = new Date(Date.now() - 1000).toISOString();
    await expect(api.cancelAnnouncement(byTitle('Window closes').id)).rejects.toMatchObject({ code: 'window_closed' });
    startSendingAt(Date.now() + 11 * 60_000);
    await expect(api.cancelAnnouncement(byTitle('Goes out').id)).rejects.toMatchObject({ code: 'already_sending', message: 'Already sending — can’t cancel.' });
    await expect(api.cancelAnnouncement(byTitle('In-app only').id)).rejects.toMatchObject({ code: 'not_cancellable' });
  });

  it('settings: YACquest Chairs only, 0–20 a week and a 0–60 minute window; 0 minutes = no hold', async () => {
    asUser('admin');
    await expect(api.setAnnouncementEmailSettings({ weeklyCap: 5, holdMinutes: 10 })).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    await expect(api.setAnnouncementEmailSettings({ weeklyCap: 21, holdMinutes: 10 })).rejects.toMatchObject({ code: 'weekly_cap' });
    await expect(api.setAnnouncementEmailSettings({ weeklyCap: 3, holdMinutes: 61 })).rejects.toMatchObject({ code: 'hold_minutes' });
    expect(await api.setAnnouncementEmailSettings({ weeklyCap: 1, holdMinutes: 0 })).toMatchObject({ cap: 1, left: 1, holdMinutes: 0 });
    const r = await all('No window');
    expect(r.emailHoldUntil).toBeUndefined();
    expect(sentMessage(r)).toMatch(/^Sent to \d+ people · emailed \d+$/);
    expect(load().messages!.filter((m) => m.subject === 'YACquest: No window').every((m) => !m.notBefore)).toBe(true);
    await expect(all('Second')).rejects.toMatchObject({ code: 'email_cap', message: capReachedMessage(1) });
    expect((await api.adminActionLog({ limit: 3 })).some((a) => a.action === 'announcement_settings_changed')).toBe(true);
  });
});

/** Claim (but don't finish) everything due at `at`: the sender has picked the emails up. */
function startSendingAt(at: number) {
  for (const m of load().messages ?? []) if (m.status === 'pending' && (!m.notBefore || new Date(m.notBefore).getTime() <= at)) { m.status = 'sending'; m.attempts++; }
}

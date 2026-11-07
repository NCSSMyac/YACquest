import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api/mock';
import { MAX_CHAIRS, PRIZE, TIER_POINTS } from '../config';
import { PENDING_CHECKIN_TTL_MS, checkInUrl, clearPendingCheckIn, peekPendingCheckIn, savePendingCheckIn, takePendingCheckIn } from '../lib/pendingCheckin';

// Runs in Node: there's no localStorage, so the mock API keeps data in memory.
const { load, setSession, pointsOf } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);

beforeEach(async () => {
  await api.resetDemoData();
});

describe('seed data', () => {
  it('has about 300 participants across three campuses', () => {
    const participants = load().users.filter((u) => u.role === 'participant');
    expect(participants.length).toBe(300);
    expect(new Set(participants.map((u) => u.campus)).size).toBe(3);
  });
  it('starts with all prize spots open', async () => {
    expect((await api.prizeStatus()).remaining).toBe(PRIZE.count);
  });
});

describe('event check-in', () => {
  it('rejects a wrong password and awards home-campus points once', async () => {
    asUser('yak001');
    const live = load().events.find((e) => e.title === 'Study Break Social')!;
    await expect(api.checkIn(live.id, 'nope')).rejects.toMatchObject({ code: 'wrong_password' });
    const res = await api.checkIn(live.id, 'bluedevil');
    expect(res.points).toBe(TIER_POINTS[2]);
    await expect(api.checkIn(live.id, 'bluedevil')).rejects.toMatchObject({ code: 'duplicate' });
  });
  it('gives Tier 1 only for official cross-campus events', async () => {
    asUser('yak001'); // Duke
    const unc = load().events.find((e) => e.title === 'Career Panel: First Jobs')!;
    expect((await api.checkIn(unc.id, 'PANEL')).points).toBe(TIER_POINTS[2]);
    const all = load().events.find((e) => e.title === 'Triangle Trivia Showdown')!;
    expect((await api.checkIn(all.id, 'TRIANGLE')).points).toBe(TIER_POINTS[1]);
  });
  it('refuses expired events', async () => {
    asUser('yak001');
    const old = load().events.find((e) => e.title === 'Trivia Night')!;
    await expect(api.checkIn(old.id, 'TARHEEL')).rejects.toMatchObject({ code: 'expired' });
  });
});

describe('anti-farming caps', () => {
  // The demo seed may already give yak001 a digital quest this week (depends on today's date),
  // so start these tests from a clean slate for yak001's submissions.
  beforeEach(() => {
    const d = load();
    const me = d.users.find((u) => u.handle === 'yak001')!;
    d.submissions = d.submissions.filter((s) => s.userId !== me.id);
  });
  it('allows only one digital quest per week', async () => {
    asUser('yak001');
    const img = 'data:image/png;base64,AAAA';
    await api.submitProof({ activityId: 'poll', imageDataUrl: img, note: '' });
    await expect(api.submitProof({ activityId: 'survey', imageDataUrl: img, note: '' })).rejects.toMatchObject({ code: 'limit' });
  });
  it('rejects non-image uploads', async () => {
    asUser('yak001');
    await expect(api.submitProof({ activityId: 'poll', imageDataUrl: 'data:text/plain;base64,AA', note: '' })).rejects.toMatchObject({ code: 'file_type' });
  });
});

describe('manual point caps', () => {
  it('adds at most one Tier 1 action per entry, removes up to the goal', async () => {
    asUser('admin');
    const u = load().users.find((x) => x.handle === 'yak001')!;
    await expect(api.adjustPoints(u.id, TIER_POINTS[1] + 1, 'too much')).rejects.toMatchObject({ code: 'amount' });
    await expect(api.adjustPoints(u.id, -PRIZE.goal - 1, 'too much')).rejects.toMatchObject({ code: 'amount' });
    await api.adjustPoints(u.id, TIER_POINTS[1], 'allowed amount');
  });
});

describe('admin permissions', () => {
  it('admins can adjust any campus', async () => {
    asUser('admin');
    for (const campus of ['duke', 'unc', 'ncsu'] as const) {
      const u = load().users.find((x) => x.role === 'participant' && x.campus === campus)!;
      const before = pointsOf(u.id);
      await api.adjustPoints(u.id, 10, 'test');
      expect(pointsOf(u.id)).toBe(before + 10);
    }
  });
  it('participants cannot adjust points', async () => {
    asUser('yak001');
    const other = load().users.find((u) => u.handle === 'alum001')!;
    await expect(api.adjustPoints(other.id, 10, 'test')).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('requires a reason to reject', async () => {
    asUser('admin');
    const pending = (await api.reviewQueue())[0];
    await expect(api.reviewSubmission(pending.id, 'rejected', '')).rejects.toMatchObject({ code: 'reason' });
  });
});

// Writes straight to the ledger (manual admin additions are capped at TIER_POINTS[1] per entry).
const boostTo = async (id: string, target: number) => {
  if (pointsOf(id) < target) api.__test.addLedger({ userId: id, amount: target - pointsOf(id), source: 'manual', reason: 'test boost' });
};

describe('prize race', () => {
  it('gives spots in order and stops at PRIZE.count', async () => {
    asUser('admin');
    const people = load().users.filter((u) => u.role === 'participant').slice(0, PRIZE.count + 2);
    for (const u of people) await boostTo(u.id, PRIZE.goal);
    const status = await api.prizeStatus();
    expect(status.remaining).toBe(0);
    expect(status.claims.map((c) => c.spot)).toEqual(Array.from({ length: PRIZE.count }, (_, i) => i + 1));
    expect(status.claims.map((c) => c.userId)).toEqual(people.slice(0, PRIZE.count).map((u) => u.id));
  });
  it('revokes a spot when points are removed and refills it with the next qualifier', async () => {
    asUser('admin');
    const people = load().users.filter((u) => u.role === 'participant').slice(0, PRIZE.count + 1);
    for (const u of people) await boostTo(u.id, PRIZE.goal);
    await api.adjustPoints(people[1].id, -50, 'correction');
    const status = await api.prizeStatus();
    expect(status.remaining).toBe(0);
    const spot2 = status.claims.find((c) => c.spot === 2)!;
    expect(spot2.userId).toBe(people[PRIZE.count].id);
    expect(status.claims.some((c) => c.userId === people[1].id)).toBe(false);
    asUser('iesha');
    const all = await api.listClaims();
    const revoked = all.find((c) => c.status === 'revoked')!;
    expect(revoked.userId).toBe(people[1].id);
    expect(revoked.revokeReason).toMatch(/fell below/);
    expect(all[all.length - 1].status).toBe('revoked');
  });
});

describe('team roles', () => {
  it('lists admins and chairs for a chair only', async () => {
    asUser('admin');
    await expect(api.listTeam()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    const team = await api.listTeam();
    expect(team.map((m) => m.handle).sort()).toEqual(['admin', 'iesha', 'jacob']);
  });
  it('lets a chair grant and remove admin, but not demote a chair', async () => {
    asUser('iesha');
    const yak = load().users.find((u) => u.handle === 'yak001')!;
    const jacob = load().users.find((u) => u.handle === 'jacob')!;
    await api.setRole(yak.id, 'admin');
    expect(load().users.find((u) => u.id === yak.id)!.role).toBe('admin');
    await api.setRole(yak.id, 'participant');
    expect(load().users.find((u) => u.id === yak.id)!.role).toBe('participant');
    await expect(api.setRole(jacob.id, 'participant')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.setRole(jacob.id, 'admin')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.transferChair(jacob.id)).rejects.toMatchObject({ code: 'chair_limit' });
  });
  it(`makes chairs up to MAX_CHAIRS (${MAX_CHAIRS}) and refuses one more`, async () => {
    asUser('admin');
    const yak = load().users.find((u) => u.handle === 'yak001')!;
    await expect(api.setRole(yak.id, 'chair')).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    const helper = load().users.find((u) => u.handle === 'admin')!;
    await api.setRole(helper.id, 'chair');
    expect(load().users.find((u) => u.id === helper.id)!.role).toBe('chair');
    expect(load().actions.some((a) => a.action === 'role_changed' && (a.details as { to?: string }).to === 'chair')).toBe(true);
    const ppl = load().users.filter((u) => u.role === 'participant');
    let n = load().users.filter((u) => u.role === 'chair').length;
    let i = 0;
    while (n < MAX_CHAIRS) { await api.setRole(ppl[i++].id, 'chair'); n++; }
    expect(load().users.filter((u) => u.role === 'chair').length).toBe(MAX_CHAIRS);
    await expect(api.setRole(ppl[i].id, 'chair')).rejects.toMatchObject({ code: 'chair_limit', message: `There are already ${MAX_CHAIRS} YACquest Chairs.` });
    expect(load().users.find((u) => u.id === ppl[i].id)!.role).toBe('participant');
  });
  it('refuses to make an unconfirmed account a chair', async () => {
    asUser('iesha');
    const yak = load().users.find((u) => u.handle === 'yak001')!;
    yak.emailVerified = false;
    await expect(api.setRole(yak.id, 'chair')).rejects.toMatchObject({ code: 'not_verified' });
  });
  it('step down turns a chair into an admin, but not the last chair', async () => {
    asUser('jacob');
    await api.stepDownChair();
    expect(load().users.find((u) => u.handle === 'jacob')!.role).toBe('admin');
    await expect(api.listTeam()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    await expect(api.stepDownChair()).rejects.toMatchObject({ code: 'last_chair' });
    expect(load().users.find((u) => u.handle === 'iesha')!.role).toBe('chair');
    const jacob = load().users.find((u) => u.handle === 'jacob')!;
    await api.setRole(jacob.id, 'participant');
    expect(load().users.find((u) => u.id === jacob.id)!.role).toBe('participant');
  });
  it('transfer swaps roles', async () => {
    asUser('iesha');
    const helper = load().users.find((u) => u.handle === 'admin')!;
    await api.transferChair(helper.id);
    const users = load().users;
    expect(users.find((u) => u.handle === 'iesha')!.role).toBe('admin');
    expect(users.find((u) => u.handle === 'admin')!.role).toBe('chair');
    expect(users.filter((u) => u.role === 'chair').length).toBe(2);
    await expect(api.listTeam()).rejects.toMatchObject({ code: 'forbidden' });
  });
});

// ───────────────────────────── 0004: prizes, winner form, emails, action log ─────────────────────────────
import { claimContactError } from '../lib/validate';
import { describeAction } from '../lib/actionText';

const goodContact = { fullName: 'Ava Brown', email: 'ava@example.com', phone: '(919) 555-0100', address: '123 Main St\nDurham, NC 27701', preference: 'Target' };

/** Boosts the first participant to the goal and logs in as them. */
async function makeWinner() {
  const u = load().users.find((x) => x.role === 'participant')!;
  await boostTo(u.id, PRIZE.goal);
  setSession(u.id);
  return u;
}

describe('prize config', () => {
  it('is 4 spots of $75', () => {
    expect(PRIZE.count).toBe(4);
    expect(PRIZE.valueUsd).toBe(75);
    expect(PRIZE.name).toBe('$75 gift card');
  });
  it('only the first 4 of 6 qualifiers win', async () => {
    asUser('admin');
    const people = load().users.filter((u) => u.role === 'participant').slice(0, 6);
    for (const u of people) await boostTo(u.id, PRIZE.goal);
    const status = await api.prizeStatus();
    expect(status.total).toBe(4);
    expect(status.claims).toHaveLength(4);
    expect(status.claims.map((c) => c.userId)).toEqual(people.slice(0, 4).map((u) => u.id));
  });
});

describe('winner form validation', () => {
  it('mirrors the server rules', () => {
    expect(claimContactError(goodContact)).toBeNull();
    expect(claimContactError({ ...goodContact, fullName: 'A' })?.code).toBe('fullName');
    expect(claimContactError({ ...goodContact, email: 'nope' })?.code).toBe('email');
    expect(claimContactError({ ...goodContact, phone: '555-01' })?.code).toBe('phone');
    expect(claimContactError({ ...goodContact, phone: '+1 919.555.0100' })).toBeNull();
    expect(claimContactError({ ...goodContact, address: '12 Main' })?.code).toBe('address');
  });
  it('rejects bad phone/address and saves good info with a reference', async () => {
    await makeWinner();
    await expect(api.submitClaimInfo({ ...goodContact, phone: '12345' })).rejects.toMatchObject({ code: 'phone' });
    await expect(api.submitClaimInfo({ ...goodContact, address: 'Durham' })).rejects.toMatchObject({ code: 'address' });
    const claim = await api.submitClaimInfo(goodContact);
    expect(claim.status).toBe('info_submitted');
    expect(claim.reference).toMatch(/^YQ-\d{4}-01[A-Z0-9]{4}$/);
    expect(claim.contact).toMatchObject({ phone: '(919) 555-0100', address: '123 Main St\nDurham, NC 27701', preference: 'Target' });
  });
  it('preference is optional', async () => {
    await makeWinner();
    const claim = await api.submitClaimInfo({ ...goodContact, preference: undefined });
    expect(claim.contact?.preference).toBeUndefined();
  });
});

describe('prize alert emails', () => {
  it('queues a "won" alert and an URGENT info alert to chairs + admins', async () => {
    await makeWinner();
    await api.submitClaimInfo(goodContact);
    const out = load().outbox;
    expect(out.map((r) => r.kind)).toEqual(['prize_qualified', 'prize_info']);
    expect(out[1].subject).toMatch(/^URGENT/);
    expect(out[1].text).toContain('123 Main St');
    expect(out[0].toEmails).toEqual(expect.arrayContaining(['iesha.landis.yac@ncssm.edu', 'jacob.rodriguez.yac@ncssm.edu', 'admin@example.edu']));
    api.__test.deliverOutbox();
    expect(load().outbox.every((r) => r.status === 'sent' && r.attempts === 1)).toBe(true);
  });
  it('sends nothing when prize alerts are off', async () => {
    asUser('iesha');
    await api.updateReportSettings({ prizeAlertsEnabled: false });
    await makeWinner();
    await api.submitClaimInfo(goodContact);
    expect(load().outbox).toHaveLength(0);
  });
});

describe('report settings + weekly email', () => {
  it('chair-only, validated, normalised, and logged', async () => {
    asUser('admin');
    await expect(api.getReportSettings()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    const s = await api.getReportSettings();
    expect(s).toMatchObject({ weeklyEnabled: true, weeklyDay: 1, weeklyHour: 9, nearGoalPoints: 75, includeChairs: true, includeAdmins: true, prizeAlertsEnabled: true });
    await expect(api.updateReportSettings({ weeklyDay: 7 })).rejects.toMatchObject({ code: 'weeklyDay' });
    await expect(api.updateReportSettings({ weeklyHour: 24 })).rejects.toMatchObject({ code: 'weeklyHour' });
    await expect(api.updateReportSettings({ recipients: ['not-an-email'] })).rejects.toMatchObject({ code: 'recipients' });
    const next = await api.updateReportSettings({ weeklyDay: 5, weeklyHour: 16, recipients: [' Board@NCSSM.edu ', 'board@ncssm.edu'] });
    expect(next).toMatchObject({ weeklyDay: 5, weeklyHour: 16, recipients: ['board@ncssm.edu'] });
    const preview = await api.weeklyReportPreview();
    expect(preview.recipients).toContain('board@ncssm.edu');
    expect(preview.subject).toMatch(/weekly report/i);
    expect(preview.html).toContain('Close to the prize');
    expect(preview.text).toContain(`${PRIZE.count} of ${PRIZE.count} spots left`);
    const log = await api.adminActionLog();
    expect(log[0]).toMatchObject({ action: 'report_settings_changed', actorName: 'Iesha L.' });
    expect(describeAction(log[0])).toMatch(/Iesha L\. changed the weekly email settings \(day → Friday, time → 4 pm, recipients\)/);
  });
  it('lists people close to the prize in the report', async () => {
    asUser('iesha');
    const u = load().users.find((x) => x.role === 'participant')!;
    await boostTo(u.id, PRIZE.goal - 40);
    const preview = await api.weeklyReportPreview();
    expect(preview.text).toContain(`${u.displayName}`);
    expect(preview.text).toContain('40 to go');
  });
  it('send now needs recipients; test email goes to the caller', async () => {
    asUser('iesha');
    await api.updateReportSettings({ weeklyEnabled: false, includeChairs: false, includeAdmins: false });
    await expect(api.sendWeeklyReportNow()).rejects.toMatchObject({ code: 'no_recipients' });
    await api.updateReportSettings({ recipients: ['board@ncssm.edu'] });
    await api.sendWeeklyReportNow();
    await api.sendTestEmail();
    const log = await api.emailLog();
    const [test, weekly] = log;
    expect(test).toMatchObject({ kind: 'test', toEmails: ['iesha.landis.yac@ncssm.edu'], status: 'pending', attempts: 0 });
    expect(weekly).toMatchObject({ kind: 'weekly_report', toEmails: ['board@ncssm.edu'] });
  });
  it('auto-queues the weekly report once per week after the set day/hour', async () => {
    asUser('iesha');
    const todayEastern = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date()));
    await api.updateReportSettings({ weeklyDay: todayEastern, weeklyHour: 0 });
    await api.emailLog();
    await api.emailLog();
    expect(load().outbox.filter((r) => r.kind === 'weekly_report')).toHaveLength(1);
    expect(load().outbox[0].dedupeKey).toMatch(/^weekly:\d{4}-\d{2}$/);
  });
  it('failed emails can be retried', async () => {
    asUser('iesha');
    await api.updateReportSettings({ weeklyEnabled: false, includeChairs: false, includeAdmins: false, recipients: ['oops@bad.invalid'] });
    await api.sendWeeklyReportNow();
    api.__test.deliverOutbox();
    const [row] = (await api.emailLog()).filter((r) => r.kind === 'weekly_report');
    expect(row).toMatchObject({ status: 'failed', attempts: 1 });
    expect(row.lastError).toBeTruthy();
    await api.retryEmail(row.id);
    const [again] = (await api.emailLog()).filter((r) => r.id === row.id);
    expect(again).toMatchObject({ status: 'pending', attempts: 0 });
  });
});

describe('admin action log', () => {
  it('records admin changes with friendly sentences, newest first', async () => {
    asUser('admin');
    const jade = load().users.find((u) => u.handle === 'alum001')!;
    await api.awardActivity(jade.id, 'game_win', 'pickleball');
    await api.adjustPoints(jade.id, -5, 'Duplicate award');
    const pending = (await api.reviewQueue())[0];
    await api.reviewSubmission(pending.id, 'rejected', 'Screenshot unclear');
    asUser('iesha');
    const yak = load().users.find((u) => u.handle === 'yak001')!;
    await api.setRole(yak.id, 'admin');
    const log = await api.adminActionLog({ limit: 4 });
    expect(log.map((a) => a.action)).toEqual(['role_changed', 'submission_rejected', 'points_removed', 'points_added']);
    const text = log.map(describeAction);
    expect(text[0]).toBe('Iesha L. made Yak001 an admin');
    expect(text[1]).toMatch(new RegExp(`^YAC Helper rejected ${pending.user.displayName.replace('.', '\\.')}’s? .+ — Screenshot unclear$`));
    expect(text[2]).toBe(`YAC Helper removed 5 points from ${jade.displayName} — Duplicate award`);
    expect(text[3]).toMatch(new RegExp(`^YAC Helper added \\+${TIER_POINTS[2]} to .+ — Win a Game or Competition: pickleball$`));
  });
  it('is chair-only and pages with `before`', async () => {
    asUser('admin');
    await expect(api.adminActionLog()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    const all = await api.adminActionLog({ limit: 100 });
    expect(all.length).toBeGreaterThanOrEqual(3);
    const first = await api.adminActionLog({ limit: 2 });
    const next = await api.adminActionLog({ before: first[1].id, limit: 2 });
    expect(next[0].id).toBeLessThan(first[1].id);
    expect([...first, ...next].map((a) => a.id)).toEqual(all.slice(0, first.length + next.length).map((a) => a.id));
  });
  it('logs event, prize and reset actions', async () => {
    asUser('iesha');
    const e = await api.createEvent({ title: 'Pickleball', campus: 'duke', crossCampus: false, kind: 'active', location: 'Courts', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(), checkInGraceMinutes: 30, password: 'PICKLE' });
    await api.deleteEvent(e.id);
    const winner = await makeWinner();
    asUser('iesha');
    await api.markFulfilled(1);
    await api.resetCycle('RESET');
    const log = await api.adminActionLog({ limit: 4 });
    expect(log.map((a) => a.action)).toEqual(['cycle_reset', 'prize_fulfilled', 'event_deleted', 'event_created']);
    expect(describeAction(log[1])).toBe(`Iesha L. marked ${winner.displayName}’s prize (spot #1) as delivered`.replace(/s’s/, 's’'));
    expect(describeAction(log[3])).toBe('Iesha L. created the event “Pickleball” (Active Participation, Duke)');
  });
});

describe('announcements', () => {
  it('admin sends to a campus; it shows on the dashboard and in the log', async () => {
    asUser('admin');
    const r = await api.sendAnnouncement({ title: 'Pickleball Sunday', body: 'Courts at 2pm!', audience: 'campus', campus: 'duke', sendEmail: false });
    expect(r.recipients).toBe(load().users.filter((u) => u.campus === 'duke').length);
    expect(r.emailed).toBe(0);
    asUser('yak001'); // Duke
    const d = await api.getDashboard();
    expect(d.messages[0]).toMatchObject({ title: 'Pickleball Sunday', body: 'Courts at 2pm!' });
    asUser('iesha');
    const log = await api.adminActionLog();
    expect(log[0].action).toBe('announcement_sent');
  });
  it('admins and chairs can email everyone; participants cannot send', async () => {
    asUser('admin');
    expect(load().users.find((u) => u.handle === 'admin')?.role).toBe('admin');
    const a = await api.sendAnnouncement({ title: 'Admin news', body: 'Hi all', audience: 'all', sendEmail: true });
    expect(a.recipients).toBe(load().users.length);
    expect(a.emailed).toBeGreaterThan(0);
    expect(load().outbox.some((o) => o.kind === 'announcement' && o.subject === '📣 YACquest: Admin news')).toBe(true);
    asUser('yak001');
    await expect(api.sendAnnouncement({ title: 'Big news', body: 'Hi', audience: 'all', sendEmail: false })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.sendAnnouncement({ title: 'Big news', body: 'Hi', audience: 'all', sendEmail: true })).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    const r = await api.sendAnnouncement({ title: 'Big news', body: 'Hi', audience: 'all', sendEmail: true });
    expect(r.emailed).toBeGreaterThan(0);
    expect(load().outbox.filter((o) => o.kind === 'announcement').every((o) => o.toEmails.length <= 90)).toBe(true);
  });
  it('validates title and target', async () => {
    asUser('admin');
    await expect(api.sendAnnouncement({ title: 'Hi', body: 'x', audience: 'all', sendEmail: false })).rejects.toMatchObject({ code: 'title' });
    await expect(api.sendAnnouncement({ title: 'Hello there', body: 'x', audience: 'user', sendEmail: false })).rejects.toMatchObject({ code: 'user' });
  });
});

describe('feedback', () => {
  it('participants send feedback; admins list it with prize ideas and mark it reviewed', async () => {
    asUser('yak001');
    await expect(api.submitFeedback('idea', 'hi')).rejects.toMatchObject({ code: 'message' });
    await api.submitFeedback('event', 'Bowling night please!');
    await api.suggestPrize('Movie tickets');
    await expect(api.listFeedback()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('admin');
    const fresh = await api.listFeedback('new');
    const fb = fresh.find((f) => f.message === 'Bowling night please!')!;
    expect(fb).toMatchObject({ kind: 'feedback', category: 'event', displayName: 'Yak001' });
    expect(fresh.some((f) => f.kind === 'prize' && f.message === 'Movie tickets')).toBe(true);
    await api.markFeedbackReviewed('feedback', fb.id);
    expect((await api.listFeedback('new')).some((f) => f.id === fb.id)).toBe(false);
    expect((await api.listFeedback('reviewed')).find((f) => f.id === fb.id)?.status).toBe('reviewed');
  });
});

describe('launch extras (0013)', () => {
  it('anonymous feedback hides the sender from admins and the weekly email, but still counts for them', async () => {
    asUser('yak001');
    const me = load().users.find((u) => u.handle === 'yak001')!;
    await api.submitFeedback('idea', 'Secret pizza wish', true);
    await api.submitFeedback('bug', 'Named bug report');
    expect(load().feedback.find((f) => f.message === 'Secret pizza wish')).toMatchObject({ userId: me.id, anonymous: true });
    expect((await api.myBadges()).find((b) => b.id === 'voice')?.earned).toBe(true);
    asUser('iesha');
    const list = await api.listFeedback();
    const anon = list.find((f) => f.message === 'Secret pizza wish')!;
    expect(anon).toMatchObject({ anonymous: true, displayName: 'Anonymous', handle: '' });
    expect(anon.campus).toBeUndefined();
    expect(JSON.stringify(anon)).not.toContain(me.displayName);
    expect(list.find((f) => f.message === 'Named bug report')).toMatchObject({ anonymous: false, displayName: me.displayName, handle: 'yak001' });
    const rep = await api.weeklyReportPreview();
    expect(rep.text).toContain('Anonymous: Secret pizza wish');
    expect(rep.text).not.toContain(`${me.displayName}: Secret pizza wish`);
    expect(rep.text).toContain(`${me.displayName}: Named bug report`);
  });

  it('lists who checked in to an event (staff only)', async () => {
    const ev = load().events.find((e) => e.title === 'Study Break Social')!;
    asUser('yak001');
    await api.checkIn(ev.id, 'bluedevil');
    await expect(api.adminEventAttendees(ev.id)).rejects.toMatchObject({ code: 'forbidden' });
    for (const who of ['admin', 'iesha']) {
      asUser(who);
      const rows = await api.adminEventAttendees(ev.id);
      const mine = rows.find((r) => r.handle === 'yak001')!;
      expect(mine).toMatchObject({ campus: 'duke', points: TIER_POINTS[2] });
      expect(rows.length).toBe(ev.attendeeCount);
      expect(rows.map((r) => r.checkedInAt)).toEqual([...rows.map((r) => r.checkedInAt)].sort());
    }
    await expect(api.adminEventAttendees('evt_nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('sign-up respects the "Email me announcements" checkbox (default on)', async () => {
    const base = { displayName: 'New Yak', password: 'password1', campus: 'unc' as const, avatar: 'yak' as const, acceptedRules: true };
    const off = await api.signup({ ...base, handle: 'optout_yak', email: 'optout@example.com', emailOptIn: false });
    expect(off.user?.emailOptIn).toBe(false);
    const on = await api.signup({ ...base, handle: 'default_yak', email: 'default@example.com' });
    expect(on.user?.emailOptIn).toBe(true);
  });
});

describe('check-in QR links', () => {
  it('builds the deep link', () => {
    expect(checkInUrl('evt_1', 'YAK-1234', undefined, 'https://ncssmyac.github.io/YACquest/')).toBe('https://ncssmyac.github.io/YACquest/#/checkin?event=evt_1&code=YAK-1234');
    expect(checkInUrl('e', 'a b', 'Trivia & Tacos', 'https://x/')).toBe('https://x/#/checkin?event=e&code=a+b&title=Trivia+%26+Tacos');
  });
  it('remembers a logged-out scan for 12 hours and completes it once after login', async () => {
    const ev = load().events.find((e) => e.title === 'Study Break Social')!;
    await api.logout();
    savePendingCheckIn({ eventId: ev.id, code: 'bluedevil', title: ev.title });
    expect(peekPendingCheckIn()?.title).toBe(ev.title);
    // later: the person logs in, App takes the pending check-in (once) and checks them in
    await api.login('yak001', 'x');
    const p = takePendingCheckIn()!;
    expect(p).toMatchObject({ eventId: ev.id, code: 'bluedevil' });
    expect(takePendingCheckIn()).toBeNull();
    expect((await api.checkIn(p.eventId, p.code)).points).toBe(TIER_POINTS[2]);
  });
  it('forgets a pending check-in after 12 hours', () => {
    const t0 = Date.now();
    savePendingCheckIn({ eventId: 'e', code: 'c' }, t0);
    expect(peekPendingCheckIn(t0 + PENDING_CHECKIN_TTL_MS - 1000)).not.toBeNull();
    expect(takePendingCheckIn(t0 + PENDING_CHECKIN_TTL_MS + 1000)).toBeNull();
    expect(peekPendingCheckIn(t0)).toBeNull(); // cleared
    clearPendingCheckIn();
  });
});

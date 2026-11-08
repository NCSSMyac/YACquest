import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api/mock';
import { TIER_POINTS } from '../config';
import { axis, bulkSummary, canUndo, niceMax, pctOf, ticks, toggleAll, undoneIds } from '../lib/adminTools';
import { BUILTIN_TEMPLATES, applyTemplate, fillTemplate, placeholders } from '../lib/announceTemplates';
import { csvCell, csvDateTime, csvFilename, toCsv } from '../lib/csv';
import { DOOR_POLL_MS, arrivalKey, doorProgress, doorStatus, latestArrivals, newArrivalKeys, nextPollDelay } from '../lib/doorMode';
import type { LedgerEntry } from '../types';

const { load, setSession, pointsOf } = api.__test;
const asUser = (handle: string) => setSession(load().users.find((u) => u.handle === handle)!.id);
const userId = (handle: string) => load().users.find((u) => u.handle === handle)!.id;
const last = <T,>(xs: T[]): T => xs[xs.length - 1];

// ───────────────────────────── pure helpers ─────────────────────────────

describe('CSV escaper', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('cr\rhere')).toBe('"cr\rhere"');
  });
  it('blocks spreadsheet formulas (= + - @, tab, CR) with a leading apostrophe', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvCell('+1 555')).toBe("'+1 555");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\t=1')).toBe("'\t=1");
    expect(csvCell('=1,2')).toBe(`"'=1,2"`);
    expect(csvCell('a=b')).toBe('a=b'); // only a leading sign is dangerous
  });
  it('writes numbers as numbers (negative points stay negative), booleans as yes/no, blanks as empty', () => {
    expect(csvCell(-20)).toBe('-20');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('yes');
    expect(csvCell(false)).toBe('no');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
  it('builds a whole file with CRLF line ends', () => {
    expect(toCsv(['name', 'points'], [['Ava, B.', 40], ['=evil', -5]])).toBe('name,points\r\n"Ava, B.",40\r\n\'=evil,-5\r\n');
  });
  it('makes tidy file names and sortable dates', () => {
    expect(csvFilename('who-came', 'Trivia Night: Round #2!', new Date(2026, 10, 6))).toBe('who-came-trivia-night-round-2-2026-11-06.csv');
    expect(csvFilename('participants', undefined, new Date(2027, 0, 9))).toBe('participants-2027-01-09.csv');
    expect(csvDateTime(new Date(2026, 10, 6, 18, 5).toISOString())).toBe('2026-11-06 18:05');
    expect(csvDateTime('')).toBe('');
    expect(csvDateTime('not a date')).toBe('');
  });
});

describe('door mode helpers', () => {
  it('"N going / M here" bar', () => {
    expect(doorProgress(12, 9)).toEqual({ pct: 75, walkIns: 0, label: '12 going / 9 here' });
    expect(doorProgress(10, 14)).toEqual({ pct: 100, walkIns: 4, label: '10 going / 14 here' });
    expect(doorProgress(0, 3)).toEqual({ pct: 100, walkIns: 3, label: '0 going / 3 here' });
    expect(doorProgress(0, 0).pct).toBe(0);
    expect(doorProgress(3, 1).pct).toBe(33);
  });
  it('polls every 5 s and backs off to 30 s while failing', () => {
    expect(nextPollDelay(0)).toBe(DOOR_POLL_MS);
    expect(nextPollDelay(1)).toBe(10_000);
    expect(nextPollDelay(2)).toBe(20_000);
    expect(nextPollDelay(3)).toBe(30_000);
    expect(nextPollDelay(50)).toBe(30_000);
  });
  const a = (userId: string, t: string) => ({ userId, checkedInAt: `2026-11-06T18:${t}:00Z` });
  it('shows the newest arrivals first', () => {
    const list = [a('u1', '01'), a('u2', '02'), a('u3', '03'), a('u4', '04'), a('u5', '05'), a('u6', '06')];
    expect(latestArrivals(list, 5).map((x) => x.userId)).toEqual(['u6', 'u5', 'u4', 'u3', 'u2']);
    expect(latestArrivals([], 5)).toEqual([]);
  });
  it('animates only people who arrived since the last poll (nothing on first load)', () => {
    const first = [a('u1', '01'), a('u2', '02')];
    expect(newArrivalKeys(null, first).size).toBe(0);
    const seen = new Set(first.map(arrivalKey));
    const next = [...first, a('u3', '03')];
    expect([...newArrivalKeys(seen, next)]).toEqual([arrivalKey(a('u3', '03'))]);
  });
  it('check-in window: opens 30 min early, closes after the grace period', () => {
    const e = { startsAt: '2026-11-06T18:00:00Z', endsAt: '2026-11-06T20:00:00Z', checkInGraceMinutes: 60 };
    expect(doorStatus(e, Date.parse('2026-11-06T17:29:00Z'))).toBe('early');
    expect(doorStatus(e, Date.parse('2026-11-06T17:30:00Z'))).toBe('open');
    expect(doorStatus(e, Date.parse('2026-11-06T21:00:00Z'))).toBe('open');
    expect(doorStatus(e, Date.parse('2026-11-06T21:00:01Z'))).toBe('closed');
  });
});

describe('bulk approve + undo helpers', () => {
  it('summarises a partial bulk approval', () => {
    expect(bulkSummary({ approved: 7, skipped: 0, results: [] })).toBe('Approved 7.');
    expect(
      bulkSummary({ approved: 7, skipped: 1, results: [{ id: 'x', ok: false, code: 'already_reviewed', message: 'Someone already reviewed this one.' }] }),
    ).toBe('Approved 7, 1 skipped (Someone already reviewed this one)');
    expect(
      bulkSummary({
        approved: 1, skipped: 3,
        results: [
          { id: 'a', ok: false, code: 'already_reviewed', message: 'Someone already reviewed this one.' },
          { id: 'b', ok: false, code: 'already_reviewed', message: 'Someone already reviewed this one.' },
          { id: 'c', ok: false, code: 'forbidden', message: 'You can’t review your own submission.' },
        ],
      }),
    ).toBe('Approved 1, 3 skipped (2× Someone already reviewed this one; 1× You can’t review your own submission)');
  });
  it('"Select all on this page" toggles only that page', () => {
    const s = toggleAll(new Set(['z']), ['a', 'b']);
    expect([...s].sort()).toEqual(['a', 'b', 'z']);
    expect([...toggleAll(s, ['a', 'b'])]).toEqual(['z']);
    expect([...toggleAll(new Set(['a']), ['a', 'b'])].sort()).toEqual(['a', 'b']);
  });
  const row = (id: string, source: LedgerEntry['source'], refId?: string): LedgerEntry => ({ id, userId: 'u', amount: 20, source, refId, reason: 'r', createdAt: '' });
  it('only manual, not-yet-undone, non-undo rows can be undone', () => {
    const ledger = [row('1', 'manual'), row('2', 'manual', 'undo:1'), row('3', 'checkin', 'evt'), row('4', 'manual', 'evt_game'), row('5', 'submission')];
    const undone = undoneIds(ledger);
    expect([...undone]).toEqual(['1']);
    expect(ledger.filter((l) => canUndo(l, undone)).map((l) => l.id)).toEqual(['4']);
  });
});

describe('announcement templates', () => {
  it('fills known placeholders and leaves unknown/empty ones visible', () => {
    expect(fillTemplate('{event} on {date} at {location}', { event: 'Trivia', date: 'Sat', location: '' })).toBe('Trivia on Sat at {location}');
    expect(fillTemplate('{spotsLeft} left of {goal}', { spotsLeft: 0, goal: 350 })).toBe('0 left of 350');
    expect(placeholders('{a} {b} {a}')).toEqual(['a', 'b']);
  });
  it('built-ins fit the announcement limits and report what is still missing', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toEqual(['Event reminder', 'Thank you for coming', 'Prize update', 'Welcome / how to earn', 'Adventurer of the Month', 'Thank you for a great year']);
    const r = applyTemplate(BUILTIN_TEMPLATES[0], { event: 'Kickoff Mixer', date: 'Sat, Nov 14 at 6:00 PM', goal: 350 });
    expect(r.title).toBe('Reminder: Kickoff Mixer is Sat, Nov 14 at 6:00 PM!');
    expect(r.missing).toEqual(['location']);
    const long = applyTemplate(BUILTIN_TEMPLATES[0], { event: 'x'.repeat(200), date: 'd', location: 'l', goal: 1 });
    expect(long.title.length).toBeLessThanOrEqual(80);
  });
});

describe('chart helpers', () => {
  it('rounds axis maxima up to friendly numbers', () => {
    expect([0, 1, 7, 13, 37, 160, 2300].map(niceMax)).toEqual([1, 1, 8, 15, 40, 200, 2500]);
    expect(ticks(8, 4)).toEqual([0, 2, 4, 6, 8]);
    expect(ticks(15, 3)).toEqual([0, 5, 10, 15]);
    expect(axis(131, 4)).toEqual({ max: 150, ticks: [0, 50, 100, 150] });
    expect(axis(114, 3)).toEqual({ max: 150, ticks: [0, 50, 100, 150] });
    expect(axis(7, 4)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(axis(1, 4)).toEqual({ max: 1, ticks: [0, 1] });
    expect(axis(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(ticks(0)).toEqual([0]);
    expect(pctOf(1, 3)).toBe(33);
    expect(pctOf(5, 0)).toBe(0);
  });
});

// ───────────────────────────── mock API (mirrors the 0025 server rules) ─────────────────────────────

describe('bulk approve (mock mirror of review_submissions_bulk)', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });
  it('approves many, skips the rest with reasons, and is staff only', async () => {
    asUser('admin');
    const pending = (await api.reviewQueue({ status: 'pending' })).slice(0, 3);
    const first = pending[0];
    const before = pointsOf(first.userId);
    // One gets reviewed by someone else first.
    asUser('jacob');
    await api.reviewSubmission(pending[2].id, 'rejected', 'Blurry');
    asUser('admin');
    const r = await api.reviewSubmissionsBulk([pending[0].id, pending[1].id, pending[0].id, pending[2].id, 'sub_missing']);
    expect(r.approved).toBe(2);
    expect(r.skipped).toBe(2);
    expect(r.results.map((x) => x.code ?? 'ok')).toEqual(['ok', 'ok', 'already_reviewed', 'not_found']);
    expect(pointsOf(first.userId)).toBeGreaterThan(before);
    expect(load().ledger.filter((l) => l.source === 'submission' && l.refId === first.id)).toHaveLength(1);
    expect(load().actions.filter((a) => a.action === 'submission_approved' && a.actorName === 'YAC Helper').length).toBeGreaterThanOrEqual(2);
    expect(bulkSummary(r)).toMatch(/^Approved 2, 2 skipped \(/);
  });
  it('caps a call at 100 and refuses an empty pick', async () => {
    asUser('admin');
    await expect(api.reviewSubmissionsBulk([])).rejects.toMatchObject({ code: 'empty' });
    await expect(api.reviewSubmissionsBulk(Array.from({ length: 101 }, (_, i) => `x${i}`))).rejects.toMatchObject({ code: 'too_many' });
  });
  it('participants are refused', async () => {
    asUser('yak001');
    await expect(api.reviewSubmissionsBulk(['x'])).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('stats (mock mirror of admin_stats)', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });
  it('counts participants only and adds up', async () => {
    asUser('admin');
    const s = await api.adminStats();
    const parts = load().users.filter((u) => u.role === 'participant');
    expect(s.totals.participants).toBe(parts.length);
    expect(s.campuses.reduce((n, c) => n + c.members, 0)).toBe(parts.length);
    expect(s.distribution.reduce((n, b) => n + b.count, 0)).toBe(parts.length);
    expect(s.milestones.map((m) => m.points)).toEqual([50, 100, 175, 250, 350]);
    for (let i = 1; i < s.milestones.length; i++) expect(s.milestones[i].count).toBeLessThanOrEqual(s.milestones[i - 1].count);
    const totalPts = parts.reduce((n, u) => n + pointsOf(u.id), 0);
    expect(s.totals.points).toBe(totalPts);
    expect(s.sources.event + s.sources.digital + s.sources.referral + s.sources.staff + (s.sources.survey ?? 0) + (s.sources.other ?? 0) - s.sources.removed).toBe(totalPts);
    for (const c of s.campuses) expect(c.perMember).toBe(c.members ? Math.round((c.points / c.members) * 10) / 10 : 0);
  });
  it('a staff check-in or RSVP never shows up; a participant one does', async () => {
    const live = load().events.find((e) => e.title === 'Study Break Social')!;
    asUser('admin');
    const before = (await api.adminStats()).events.find((e) => e.id === live.id)!;
    asUser('iesha');
    await api.checkIn(live.id, 'BLUEDEVIL');
    await api.setRsvp(live.id, true).catch(() => undefined);
    asUser('alum001');
    await api.checkIn(live.id, 'BLUEDEVIL');
    asUser('admin');
    const after = (await api.adminStats()).events.find((e) => e.id === live.id)!;
    expect(after.came).toBe(before.came + 1);
    expect(after.going).toBe(before.going);
  });
  it('is staff only; the participants export is YACquest Chair only', async () => {
    asUser('yak001');
    await expect(api.adminStats()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('admin');
    await expect(api.adminParticipantsExport()).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    const rows = await api.adminParticipantsExport();
    expect(rows).toHaveLength(load().users.filter((u) => u.role === 'participant').length);
    const demo = rows.find((r) => r.handle === 'yak001')!;
    expect(demo.points).toBe(pointsOf(userId('yak001')));
    expect(demo.badges).toContain('first_checkin');
    expect(demo.eventsAttended).toBe(2);
    expect(rows.some((r) => r.handle === 'iesha' || r.handle === 'admin')).toBe(false);
  });
});

describe('announcement templates (mock mirror of 0025)', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });
  it('staff save and list; delete your own; YACquest Chairs delete any; participants are refused', async () => {
    asUser('admin');
    const mine = await api.saveAnnouncementTemplate('  Bring a friend  ', 'Friends earn you points at {event}!');
    expect(mine).toMatchObject({ title: 'Bring a friend', canDelete: true, authorName: 'YAC Helper' });
    const list = await api.listAnnouncementTemplates();
    const iesha = list.find((t) => t.authorName === 'Iesha L.')!;
    expect(iesha.canDelete).toBe(false);
    await expect(api.deleteAnnouncementTemplate(iesha.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.saveAnnouncementTemplate('', 'x')).rejects.toMatchObject({ code: 'title' });
    await expect(api.saveAnnouncementTemplate('x', 'y'.repeat(1001))).rejects.toMatchObject({ code: 'body' });
    await api.deleteAnnouncementTemplate(mine.id);
    asUser('jacob');
    await api.deleteAnnouncementTemplate(iesha.id);
    expect(await api.listAnnouncementTemplates()).toHaveLength(0);
    asUser('yak001');
    await expect(api.listAnnouncementTemplates()).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.saveAnnouncementTemplate('a', 'b')).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('staff notes (mock mirror of 0025)', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });
  it('staff add and read; participants never can; delete own, YACquest Chairs any; logged', async () => {
    const demo = userId('yak001');
    asUser('admin');
    const n = await api.addPlayerNote(demo, '  Great at trivia.  ');
    expect(n.body).toBe('Great at trivia.');
    const notes = await api.listPlayerNotes(demo);
    expect(notes[0].id).toBe(n.id); // newest first
    expect(notes.map((x) => x.authorName)).toEqual(['YAC Helper', 'Jacob R.']);
    await expect(api.addPlayerNote(demo, 'x'.repeat(501))).rejects.toMatchObject({ code: 'body' });
    await expect(api.addPlayerNote(demo, '   ')).rejects.toMatchObject({ code: 'body' });
    const jacobs = notes.find((x) => x.authorName === 'Jacob R.')!;
    expect(jacobs.canDelete).toBe(false);
    await expect(api.deletePlayerNote(jacobs.id)).rejects.toMatchObject({ code: 'forbidden' });
    await api.deletePlayerNote(n.id);
    asUser('yak001');
    await expect(api.listPlayerNotes(demo)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.addPlayerNote(demo, 'hi')).rejects.toMatchObject({ code: 'forbidden' });
    asUser('iesha');
    await api.deletePlayerNote(jacobs.id);
    expect(await api.listPlayerNotes(demo)).toHaveLength(0);
    const acts = load().actions.map((a) => a.action);
    expect(acts).toContain('player_note_added');
    expect(acts).toContain('player_note_deleted');
    expect(load().actions.find((a) => a.action === 'player_note_added')!.details).not.toHaveProperty('body');
  });
});

describe('undo a points change (mock mirror of undo_points_change)', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });
  it('adds a correcting −amount row once, for manual changes only', async () => {
    const demo = userId('yak001');
    asUser('admin');
    const p0 = pointsOf(demo);
    await api.adjustPoints(demo, 30, 'Helped set up');
    const row = last(load().ledger.filter((l) => l.userId === demo && l.source === 'manual'));
    expect(last(load().actions).details.ledgerId).toBe(row.id); // the Log can offer Undo
    const n0 = load().ledger.length;
    const r = await api.undoPointsChange(row.id);
    expect(r.amount).toBe(-30);
    expect(pointsOf(demo)).toBe(p0);
    expect(load().ledger.length).toBe(n0 + 1);
    const undo = last(load().ledger);
    expect(undo).toMatchObject({ amount: -30, source: 'manual', refId: `undo:${row.id}`, reason: 'Undo: Helped set up' });
    expect(row.amount).toBe(30); // the original is never edited
    await expect(api.undoPointsChange(row.id)).rejects.toMatchObject({ code: 'already_undone' });
    await expect(api.undoPointsChange(undo.id)).rejects.toMatchObject({ code: 'not_manual' });
    const checkin = load().ledger.find((l) => l.userId === demo && l.source === 'checkin')!;
    await expect(api.undoPointsChange(checkin.id)).rejects.toMatchObject({ code: 'not_manual' });
    await expect(api.undoPointsChange('led_nope')).rejects.toMatchObject({ code: 'not_found' });
    const log = last(load().actions);
    expect(log).toMatchObject({ action: 'points_removed', targetName: 'Yak001' });
    expect(log.details).toMatchObject({ amount: -30, undoOf: row.id });
    expect(load().notifications[0]).toMatchObject({ userId: demo, title: '-30 pts from YAC Helper', body: 'Undo: Helped set up' });
  });
  it('undoing a removal gives the points back; the seeded game win can be undone; participants are refused', async () => {
    const demo = userId('yak001');
    asUser('iesha');
    await api.adjustPoints(demo, -50, 'Oops');
    const p = pointsOf(demo);
    await api.undoPointsChange(last(load().ledger).id);
    expect(pointsOf(demo)).toBe(p + 50);
    const win = load().ledger.find((l) => l.userId === demo && l.activityId === 'game_win')!;
    expect((await api.undoPointsChange(win.id)).amount).toBe(-TIER_POINTS[2]);
    asUser('yak001');
    await expect(api.undoPointsChange(win.id)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('door mode data (mock mirror of admin_event_checkins)', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });
  it('lists check-ins oldest first with email + avatar; staff only', async () => {
    const live = load().events.find((e) => e.title === 'Study Break Social')!;
    asUser('yak001');
    await api.checkIn(live.id, 'BLUEDEVIL');
    await expect(api.adminEventCheckins(live.id)).rejects.toMatchObject({ code: 'forbidden' });
    asUser('alum002');
    await api.checkIn(live.id, 'BLUEDEVIL').catch(() => undefined);
    asUser('admin');
    const rows = await api.adminEventCheckins(live.id);
    expect(rows[0]).toMatchObject({ handle: 'yak001', email: 'yak001@example.edu', avatar: 'yak' });
    expect(rows.map((r) => r.checkedInAt)).toEqual([...rows.map((r) => r.checkedInAt)].sort());
    expect(latestArrivals(rows, 5)[0].userId).toBe(last(rows).userId);
  });
});

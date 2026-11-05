import { describe, expect, it } from 'vitest';
import type { AppNotification } from '../types';
import { MAX_STORED_IDS, RESUBMIT_HINT, mergePopped, notificationToCelebration, parseAmount, planPopups, questFromTitle } from '../lib/popups';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
function n(kind: AppNotification['kind'], title: string, body = '', opts: Partial<AppNotification> = {}): AppNotification {
  seq++;
  return { id: `n${seq}`, userId: 'u1', kind, title, body, read: false, createdAt: new Date(NOW - seq * 60_000).toISOString(), ...opts };
}

describe('title parsing', () => {
  it('reads signed amounts', () => {
    expect(parseAmount('+20 pts — Repost a YAC Post')).toBe(20);
    expect(parseAmount('-10 pts from Ava')).toBe(-10);
    expect(parseAmount('+35 for bringing a friend')).toBe(35);
    expect(parseAmount('Not approved — X')).toBeNull();
  });
  it('extracts quest names', () => {
    expect(questFromTitle('+20 pts — Repost a YAC Post')).toBe('Repost a YAC Post');
    expect(questFromTitle('Not approved — Coffee Chat')).toBe('Coffee Chat');
    expect(questFromTitle('+15 pts from Ava')).toBeNull();
    expect(questFromTitle('+35 for bringing a friend')).toBeNull();
  });
});

describe('notificationToCelebration', () => {
  it('approval → small coin pop with points and quest name', () => {
    expect(notificationToCelebration(n('submission_approved', '+20 pts — Coffee Chat', 'Your submission was approved.'))).toEqual({
      title: 'Quest approved!', subtitle: 'Coffee Chat', points: 20, size: 'small',
    });
  });
  it('rejection → big notice with quest, reason and resubmit hint', () => {
    const c = notificationToCelebration(n('submission_rejected', 'Not approved — Repost a YAC Post', 'Screenshot was cropped'));
    expect(c).toMatchObject({ title: 'Quest not approved', subtitle: 'Repost a YAC Post — Screenshot was cropped', tone: 'notice', size: 'big', hint: RESUBMIT_HINT });
  });
  it('positive adjustment → Points added with reason', () => {
    expect(notificationToCelebration(n('points_adjusted', '+15 pts from Ava', 'Helped at setup'))).toMatchObject({ title: 'Points added!', subtitle: 'Helped at setup', points: 15 });
    expect(notificationToCelebration(n('points_adjusted', '+35 for bringing a friend', 'Sam checked in'))).toMatchObject({ points: 35, subtitle: 'Sam checked in' });
    expect(notificationToCelebration(n('points_adjusted', '+30 pts — Game Night', 'Awarded by Ava'))).toMatchObject({ points: 30, subtitle: 'Game Night' });
  });
  it('negative adjustment → calm notice', () => {
    const c = notificationToCelebration(n('points_adjusted', '-10 pts from Ava', 'Duplicate check-in'));
    expect(c).toMatchObject({ title: 'Points removed', subtitle: '-10 · Duplicate check-in', tone: 'notice', size: 'small' });
    expect(c?.points).toBeUndefined();
  });
  it('ignores other kinds and unparsable adjustments', () => {
    expect(notificationToCelebration(n('announcement', 'Hi'))).toBeNull();
    expect(notificationToCelebration(n('prize_qualified', 'You won spot #1!'))).toBeNull();
    expect(notificationToCelebration(n('points_adjusted', 'Points fixed'))).toBeNull();
  });
});

describe('planPopups', () => {
  it('first run only pops unread ones from the last 7 days', () => {
    const fresh = n('submission_approved', '+10 pts — A');
    const old = n('submission_approved', '+10 pts — B', '', { createdAt: new Date(NOW - 8 * DAY).toISOString() });
    const read = n('submission_approved', '+10 pts — C', '', { read: true });
    const plan = planPopups([fresh, old, read], null, NOW);
    expect(plan.markIds).toEqual([fresh.id]);
    expect(plan.show.map((c) => c.subtitle)).toEqual(['A']);
  });
  it('later runs skip already popped ids but include older unread ones', () => {
    const a = n('submission_approved', '+10 pts — A');
    const b = n('submission_approved', '+10 pts — B', '', { createdAt: new Date(NOW - 30 * DAY).toISOString() });
    const plan = planPopups([a, b], new Set([a.id]), NOW);
    expect(plan.markIds).toEqual([b.id]);
  });
  it('shows the newest 3 oldest-first, summarises the rest, marks all', () => {
    const notes = [1, 2, 3, 4, 5].map((i) => n('points_adjusted', `+${i} pts from Ava`, `r${i}`)); // newest first
    notes.push(n('announcement', 'skip me'));
    const plan = planPopups(notes, new Set(), NOW);
    expect(plan.show.map((c) => c.points)).toEqual([3, 2, 1]);
    expect(plan.extra).toBe(2);
    expect(plan.markIds).toHaveLength(5);
  });
});

describe('mergePopped', () => {
  it('dedupes and caps', () => {
    expect(mergePopped(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    const many = Array.from({ length: MAX_STORED_IDS }, (_, i) => `x${i}`);
    const out = mergePopped(many, ['new']);
    expect(out).toHaveLength(MAX_STORED_IDS);
    expect(out[out.length - 1]).toBe('new');
    expect(out[0]).toBe('x1');
  });
});

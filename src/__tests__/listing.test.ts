import { describe, expect, it } from 'vitest';
import { dayBucket, groupByDay, limitToInclude, nextLimit, pageOf, recentActivity } from '../lib/listing';
import type { LedgerEntry, Submission } from '../types';

describe('pageOf', () => {
  it('returns the first page and how many are hidden', () => {
    expect(pageOf([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], hidden: 2 });
    expect(pageOf([1, 2], 10)).toEqual({ shown: [1, 2], hidden: 0 });
    expect(pageOf([1, 2], 0)).toEqual({ shown: [], hidden: 2 });
    expect(pageOf([1, 2], -4)).toEqual({ shown: [], hidden: 2 });
  });
});

describe('nextLimit', () => {
  it('adds one step, capped at the total', () => {
    expect(nextLimit(10, 10, 35)).toBe(20);
    expect(nextLimit(30, 10, 35)).toBe(35);
    expect(nextLimit(35, 10, 35)).toBe(35);
  });
  it('never shrinks and always moves forward by at least one', () => {
    expect(nextLimit(20, 10, 5)).toBe(20);
    expect(nextLimit(3, 0, 10)).toBe(4);
  });
});

describe('limitToInclude', () => {
  it('rounds up to whole pages so the item is visible', () => {
    expect(limitToInclude(-1, 4)).toBe(4);
    expect(limitToInclude(0, 4)).toBe(4);
    expect(limitToInclude(3, 4)).toBe(4);
    expect(limitToInclude(4, 4)).toBe(8);
    expect(limitToInclude(9, 4)).toBe(12);
  });
});

describe('groupByDay', () => {
  const now = new Date(2026, 10, 6, 15, 0); // Nov 6, 3 PM local
  const at = (d: number, h: number) => new Date(2026, 10, d, h, 0).toISOString();

  it('buckets by local calendar day', () => {
    expect(dayBucket(at(6, 0), now)).toBe('today');
    expect(dayBucket(at(5, 23), now)).toBe('yesterday');
    expect(dayBucket(at(5, 0), now)).toBe('yesterday');
    expect(dayBucket(at(4, 23), now)).toBe('earlier');
  });

  it('keeps order inside each group and drops empty groups', () => {
    const items = [
      { id: 'a', t: at(6, 14) },
      { id: 'b', t: at(6, 9) },
      { id: 'c', t: at(3, 9) },
      { id: 'd', t: at(1, 9) },
    ];
    const groups = groupByDay(items, (i) => i.t, now);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Earlier', ['c', 'd']],
    ]);
  });

  it('returns nothing for an empty list', () => {
    expect(groupByDay([], () => '', now)).toEqual([]);
  });
});

describe('recentActivity', () => {
  const led = (id: string, createdAt: string, amount = 5): LedgerEntry => ({ id, userId: 'u', amount, source: 'manual', reason: `r${id}`, createdAt });
  const sub = (id: string, createdAt: string, status: Submission['status'], reviewReason?: string): Submission => ({
    id, userId: 'u', activityId: 'repost', imageUrl: '', note: '', status, createdAt, reviewReason,
  });

  it('merges points and open proofs newest first, skipping approved proofs (their points are already listed)', () => {
    const items = recentActivity(
      [led('1', '2026-11-01T10:00:00Z'), led('2', '2026-11-04T10:00:00Z', -5)],
      [sub('a', '2026-11-05T10:00:00Z', 'pending'), sub('b', '2026-11-03T10:00:00Z', 'approved'), sub('c', '2026-11-02T10:00:00Z', 'rejected', 'Cropped')],
      10,
    );
    expect(items.map((i) => i.id)).toEqual(['s-a', 'l-2', 's-c', 'l-1']);
    expect(items[1]).toMatchObject({ kind: 'points', amount: -5, title: 'r2' });
    expect(items[2]).toMatchObject({ kind: 'proof', status: 'rejected', reason: 'Cropped' });
  });

  it('caps the list', () => {
    const ledger = Array.from({ length: 6 }, (_, i) => led(String(i), `2026-11-0${i + 1}T10:00:00Z`));
    expect(recentActivity(ledger, [], 3).map((i) => i.id)).toEqual(['l-5', 'l-4', 'l-3']);
    expect(recentActivity(ledger, [], 0)).toEqual([]);
  });
});

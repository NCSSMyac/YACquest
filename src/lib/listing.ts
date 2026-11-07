/**
 * Small pure helpers for keeping long lists short: "show more" paging, grouping by day,
 * and Home's combined "Recent activity" feed. No React here, so they're easy to test.
 */
import type { LedgerEntry, Submission } from '../types';

/** The first `limit` items, plus how many are hidden. */
export function pageOf<T>(items: readonly T[], limit: number): { shown: T[]; hidden: number } {
  const n = Math.max(0, Math.floor(limit));
  return { shown: items.slice(0, n), hidden: Math.max(0, items.length - n) };
}

/** Next limit after tapping "Show more": one more step, never past the total. */
export function nextLimit(limit: number, step: number, total: number): number {
  return Math.min(Math.max(total, limit), limit + Math.max(1, step));
}

/**
 * Smallest page limit (a multiple of `step`, at least `step`) that still shows the item at `index`.
 * Used so a deep-linked item (e.g. `#/earn?event=…`) is never hidden behind "Show more".
 */
export function limitToInclude(index: number, step: number): number {
  const s = Math.max(1, step);
  if (index < 0) return s;
  return Math.max(s, Math.ceil((index + 1) / s) * s);
}

export type DayGroupKey = 'today' | 'yesterday' | 'earlier';
export type DayGroup<T> = { key: DayGroupKey; label: string; items: T[] };
const DAY_LABEL: Record<DayGroupKey, string> = { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Which local-calendar bucket a timestamp falls in, relative to `now`. */
export function dayBucket(iso: string, now: Date = new Date()): DayGroupKey {
  const t = new Date(iso).getTime();
  const today = startOfDay(now);
  if (t >= today) return 'today';
  const yesterday = startOfDay(new Date(today - 12 * 3600_000)); // noon yesterday → that day's start (DST-safe)
  return t >= yesterday ? 'yesterday' : 'earlier';
}

/** Group items (already newest first) into Today / Yesterday / Earlier, keeping order and dropping empty groups. */
export function groupByDay<T>(items: readonly T[], when: (item: T) => string, now: Date = new Date()): DayGroup<T>[] {
  const groups: Record<DayGroupKey, T[]> = { today: [], yesterday: [], earlier: [] };
  for (const it of items) groups[dayBucket(when(it), now)].push(it);
  return (['today', 'yesterday', 'earlier'] as DayGroupKey[])
    .filter((k) => groups[k].length > 0)
    .map((k) => ({ key: k, label: DAY_LABEL[k], items: groups[k] }));
}

export type ActivityItem =
  | { kind: 'points'; id: string; at: string; title: string; amount: number }
  | { kind: 'proof'; id: string; at: string; activityId: string; status: 'pending' | 'rejected'; reason?: string };

/**
 * Home → Recent activity: points changes plus proofs still waiting (or turned down), newest first.
 * Approved proofs are left out because their points already show up as a ledger line.
 */
export function recentActivity(ledger: readonly LedgerEntry[], submissions: readonly Submission[], max = 3): ActivityItem[] {
  const items: ActivityItem[] = [
    ...ledger.map((l): ActivityItem => ({ kind: 'points', id: `l-${l.id}`, at: l.createdAt, title: l.reason, amount: l.amount })),
    ...submissions
      .filter((s) => s.status !== 'approved')
      .map((s): ActivityItem => ({
        kind: 'proof',
        id: `s-${s.id}`,
        at: s.createdAt,
        activityId: s.activityId,
        status: s.status as 'pending' | 'rejected',
        reason: s.reviewReason,
      })),
  ];
  const t = (iso: string) => new Date(iso).getTime() || 0;
  return items.sort((a, b) => t(b.at) - t(a.at)).slice(0, Math.max(0, max));
}

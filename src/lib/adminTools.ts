/**
 * Small pure helpers for the 0025 admin tools (bulk approve, undo, stats charts).
 * Unit tested in src/__tests__/adminTools.test.ts.
 */
import type { BulkReviewResult, LedgerEntry } from '../types';

// ───────────── Bulk approve (Admin → Review) ─────────────

/** "Approved 7, 1 skipped (Someone already reviewed this one.)" — reasons grouped, most common first. */
export function bulkSummary(r: BulkReviewResult): string {
  const head = `Approved ${r.approved}`;
  if (!r.skipped) return `${head}.`;
  const counts = new Map<string, number>();
  for (const x of r.results) if (!x.ok) {
    const why = (x.message || x.code || 'skipped').replace(/\.$/, '');
    counts.set(why, (counts.get(why) ?? 0) + 1);
  }
  const reasons = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([why, n]) => (counts.size > 1 ? `${n}× ${why}` : why));
  return `${head}, ${r.skipped} skipped (${reasons.join('; ')})`;
}

/** "Select all on this page": selects every id on the page, or clears them all if they're all selected already. */
export function toggleAll(selected: ReadonlySet<string>, pageIds: readonly string[]): Set<string> {
  const next = new Set(selected);
  const all = pageIds.length > 0 && pageIds.every((id) => next.has(id));
  for (const id of pageIds) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}

// ───────────── Undo a points change ─────────────

export const UNDO_PREFIX = 'undo:';

/** Ids of ledger rows that already have an undo row ("undo:<id>"). */
export function undoneIds(ledger: readonly LedgerEntry[]): Set<string> {
  const out = new Set<string>();
  for (const l of ledger) if (l.source === 'manual' && l.refId?.startsWith(UNDO_PREFIX)) out.add(l.refId.slice(UNDO_PREFIX.length));
  return out;
}

/** Manual adjustments/awards that aren't undo rows and haven't been undone yet. (The server re-checks everything.) */
export function canUndo(entry: LedgerEntry, undone: ReadonlySet<string>): boolean {
  return entry.source === 'manual' && !entry.refId?.startsWith(UNDO_PREFIX) && !undone.has(entry.id);
}

// ───────────── Stats charts ─────────────

/** A round axis maximum ≥ n: 0→1, 7→8, 13→15, 37→40, 160→200, 2300→2500. */
export function niceMax(n: number): number {
  if (!(n > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const v = step * pow;
    if (v >= n) return Math.round(v * 1000) / 1000;
  }
  return 10 * pow;
}

/** A y-axis for counts: a round whole-number step (1, 2, 5, 10, 20, 25, 50 …), ticks from 0, and a max that is a tick. */
export function axis(dataMax: number, count = 4): { max: number; ticks: number[] } {
  if (!(dataMax > 0)) return { max: 1, ticks: [0, 1] };
  const raw = dataMax / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= raw && Number.isInteger(v)) ?? 10 * pow);
  const max = Math.ceil(dataMax / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, ticks };
}

/** Evenly spaced ticks from 0 to `max` (see axis()). */
export const ticks = (max: number, count = 4): number[] => (max > 0 ? axis(max, count).ticks : [0]);

/** Share of `part` in `total` as a whole percent (0 when total is 0). */
export const pctOf = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

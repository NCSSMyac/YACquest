/**
 * Pure helpers for Event-day "Door mode" (#/admin/door/<eventId>). Unit tested in src/__tests__/adminTools.test.ts.
 */
import type { PhaseEvent } from './adminDashboard';

/** How often the live counter polls (ms). */
export const DOOR_POLL_MS = 5000;
/** How many recent arrivals scroll in at the bottom. */
export const DOOR_RECENT = 5;

/** Wait before the next poll: every 5 s, backing off (10 s, 20 s, max 30 s) while requests fail. */
export function nextPollDelay(failures: number): number {
  if (!(failures > 0)) return DOOR_POLL_MS;
  return Math.min(30_000, DOOR_POLL_MS * 2 ** Math.min(failures, 3));
}

export interface DoorProgress {
  /** Bar width 0–100 (here ÷ going; full when nobody RSVP'd but people came). */
  pct: number;
  /** People who checked in beyond the RSVP count. */
  walkIns: number;
  /** "12 going / 9 here" */
  label: string;
}

/** The "N going / M here" bar. */
export function doorProgress(going: number, here: number): DoorProgress {
  const g = Math.max(0, Math.floor(going || 0));
  const h = Math.max(0, Math.floor(here || 0));
  const pct = g > 0 ? Math.min(100, Math.round((h / g) * 100)) : h > 0 ? 100 : 0;
  return { pct, walkIns: Math.max(0, h - g), label: `${g} going / ${h} here` };
}

/** A stable key for one check-in row. */
export const arrivalKey = (a: { userId: string; checkedInAt: string }) => `${a.userId}@${a.checkedInAt}`;

/** The newest `n` arrivals, newest first (input is oldest first, as the server returns it). */
export function latestArrivals<T extends { userId: string; checkedInAt: string }>(list: readonly T[], n = DOOR_RECENT): T[] {
  return list
    .slice()
    .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))
    .slice(0, n);
}

/**
 * Keys in `list` that weren't in `seen` (they get the pop-in animation). The very first load
 * (`seen` = null) animates nothing, so opening Door mode mid-event doesn't fire a burst.
 */
export function newArrivalKeys(seen: ReadonlySet<string> | null, list: readonly { userId: string; checkedInAt: string }[]): Set<string> {
  const out = new Set<string>();
  if (!seen) return out;
  for (const a of list) {
    const k = arrivalKey(a);
    if (!seen.has(k)) out.add(k);
  }
  return out;
}

export type DoorStatus = 'early' | 'open' | 'closed';

/** Check-in is open from 30 minutes before the start until `checkInGraceMinutes` after the end. */
export function doorStatus(e: PhaseEvent, now: number = Date.now()): DoorStatus {
  const opens = new Date(e.startsAt).getTime() - 30 * 60_000;
  const closes = new Date(e.endsAt).getTime() + e.checkInGraceMinutes * 60_000;
  return now < opens ? 'early' : now <= closes ? 'open' : 'closed';
}

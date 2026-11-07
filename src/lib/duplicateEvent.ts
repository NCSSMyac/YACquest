/**
 * Admin → Events: the New/Edit event form values, and "Duplicate" (same event one week later,
 * fresh password). Pure helpers (unit tested); nothing is saved until the admin presses Save.
 */
import type { CampusId } from '../config';
import type { YacEvent } from '../types';

export interface EventForm {
  title: string;
  campus: CampusId | 'all';
  kind: YacEvent['kind'];
  location: string;
  /** datetime-local value (viewer's time zone) */
  start: string;
  end: string;
  grace: number;
  password: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → `YYYY-MM-DDTHH:mm` in the viewer's local time (what <input type="datetime-local"> wants). */
export const toLocalInput = (iso: string | Date) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function editForm(e: YacEvent): EventForm {
  return { title: e.title, campus: e.campus, kind: e.kind, location: e.location, start: toLocalInput(e.startsAt), end: toLocalInput(e.endsAt), grace: e.checkInGraceMinutes, password: e.password ?? '' };
}

/** Same title, tier, campus, location, length and grace; one week later (same wall-clock time); new password. */
export function duplicateForm(e: YacEvent, newPassword: string): EventForm {
  const start = new Date(e.startsAt);
  const length = new Date(e.endsAt).getTime() - start.getTime();
  const next = new Date(start);
  next.setDate(next.getDate() + 7);
  const end = new Date(next.getTime() + length);
  return { ...editForm(e), start: toLocalInput(next), end: toLocalInput(end), password: newPassword };
}

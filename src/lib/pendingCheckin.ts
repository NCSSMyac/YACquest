/**
 * Event check-in QR links: `#/checkin?event=<eventId>&code=<password>[&title=<event title>]`.
 *
 * Scanned while logged out → the check-in is remembered here (12 hours) and finished
 * automatically once, right after the person logs in (or signs up, confirms, logs in).
 */
export interface PendingCheckIn {
  eventId: string;
  code: string;
  title?: string;
  savedAt: number;
}

const KEY = 'yacquest-pending-checkin';
export const PENDING_CHECKIN_TTL_MS = 12 * 60 * 60 * 1000;

// Node tests and storage-blocked browsers fall back to memory.
let memory: string | null = null;
function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memory;
  }
}
function write(v: string | null) {
  memory = v;
  try {
    if (v === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  } catch {
    /* storage blocked: memory only */
  }
}

/** The check-in link for an event, on whatever site this page is served from. */
export function checkInUrl(eventId: string, code: string, title?: string, base?: string): string {
  const site = base ?? (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '');
  const q = new URLSearchParams({ event: eventId, code });
  if (title) q.set('title', title);
  return `${site}#/checkin?${q.toString()}`;
}

export function savePendingCheckIn(p: Omit<PendingCheckIn, 'savedAt'>, at = Date.now()) {
  write(JSON.stringify({ ...p, savedAt: at }));
}

/** The remembered check-in, or null (none, unreadable or older than 12 hours — those are cleared). */
export function peekPendingCheckIn(at = Date.now()): PendingCheckIn | null {
  const raw = read();
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingCheckIn;
    if (p && typeof p.eventId === 'string' && typeof p.code === 'string' && typeof p.savedAt === 'number' && at - p.savedAt <= PENDING_CHECKIN_TTL_MS && at >= p.savedAt - 60_000)
      return p;
  } catch {
    /* corrupt: clear below */
  }
  write(null);
  return null;
}

/** Returns the remembered check-in and forgets it, so it's only ever completed once. */
export function takePendingCheckIn(at = Date.now()): PendingCheckIn | null {
  const p = peekPendingCheckIn(at);
  if (p) write(null);
  return p;
}

export function clearPendingCheckIn() {
  write(null);
}

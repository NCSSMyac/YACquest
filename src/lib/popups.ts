/**
 * Pure helpers for NotificationPopups: turn point-related notifications into pop-ups and decide
 * which ones this browser still needs to show. No React, no api — unit-tested in __tests__/popups.test.ts.
 */
import type { AppNotification } from '../types';
import type { Celebration } from './celebrate';

export const POPUP_KINDS = ['submission_approved', 'submission_rejected', 'points_adjusted'] as const;
export const MAX_POPUPS = 3;
export const MAX_STORED_IDS = 300;
export const FIRST_RUN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const RESUBMIT_HINT = 'You can fix it and resubmit on the Quests page.';

/** Leading signed amount of a title: "+20 pts — X" → 20, "-10 pts from Ava" → -10, "+35 for…" → 35. */
export function parseAmount(title: string): number | null {
  const m = /^\s*([+\-−]?)\s*(\d+)/.exec(title);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === '-' || m[1] === '−' ? -n : n;
}

/** Text after "<amount> pts — " (or after "Not approved — "), if the title has that shape. */
export function questFromTitle(title: string): string | null {
  const m = /^\s*(?:[+\-−]?\d+\s*pts?|Not approved)\s*[—–-]\s*(.+)$/i.exec(title);
  return m ? m[1].trim() : null;
}

/** One notification → one pop-up (null = nothing to pop). */
export function notificationToCelebration(n: Pick<AppNotification, 'kind' | 'title' | 'body'>): Celebration | null {
  const body = n.body?.trim() ?? '';
  switch (n.kind) {
    case 'submission_approved': {
      const pts = parseAmount(n.title);
      return {
        title: 'Quest approved!',
        subtitle: questFromTitle(n.title) ?? n.title,
        points: pts && pts > 0 ? pts : undefined,
        size: 'small',
      };
    }
    case 'submission_rejected': {
      const quest = questFromTitle(n.title) ?? 'Your quest';
      return {
        title: 'Quest not approved',
        subtitle: body ? `${quest} — ${body}` : quest,
        hint: RESUBMIT_HINT,
        tone: 'notice',
        size: 'big',
      };
    }
    case 'points_adjusted': {
      const pts = parseAmount(n.title);
      if (!pts) return null;
      if (pts > 0) {
        // Awards ("+20 pts — Game Night") name the activity; manual adds / referrals explain in the body.
        const subtitle = questFromTitle(n.title) ?? (body || n.title);
        return { title: 'Points added!', subtitle, points: pts, size: 'small' };
      }
      return { title: 'Points removed', subtitle: body ? `${pts} · ${body}` : `${pts} pts`, tone: 'notice', size: 'small' };
    }
    default:
      return null;
  }
}

export interface PopupPlan {
  /** Pop-ups to queue, oldest first. */
  show: Celebration[];
  /** How many eligible notifications didn't get their own pop-up. */
  extra: number;
  /** Every eligible id (shown or summarised) — remember these as popped. */
  markIds: string[];
}

/**
 * Pick what to pop. `notes` is newest first (as api.notifications returns). `popped` = ids already shown in
 * this browser, or null on the very first run for this user (then only the last 7 days count).
 */
export function planPopups(notes: AppNotification[], popped: ReadonlySet<string> | null, now = Date.now()): PopupPlan {
  const kinds: readonly string[] = POPUP_KINDS;
  const eligible = notes.filter((n) => {
    if (n.read || !kinds.includes(n.kind)) return false;
    if (popped ? popped.has(n.id) : now - Date.parse(n.createdAt) > FIRST_RUN_WINDOW_MS) return false;
    return true;
  });
  const sorted = [...eligible].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const show = sorted
    .slice(0, MAX_POPUPS)
    .reverse()
    .map(notificationToCelebration)
    .filter((c): c is Celebration => c !== null);
  const extra = Math.max(0, sorted.length - MAX_POPUPS);
  return { show, extra, markIds: eligible.map((n) => n.id) };
}

/** Append new ids to the stored list, de-duplicated, keeping only the most recent `cap`. */
export function mergePopped(stored: readonly string[], add: readonly string[], cap = MAX_STORED_IDS): string[] {
  const seen = new Set(stored);
  const out = [...stored];
  for (const id of add) if (!seen.has(id)) (seen.add(id), out.push(id));
  return out.slice(-cap);
}

// ── per-user storage (all failures are silent) ──
const key = (userId: string) => `yacquest-popped:${userId}`;

/** null = never ran for this user in this browser. */
export function loadPopped(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return null;
  }
}

export function savePopped(userId: string, ids: string[]): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(ids.slice(-MAX_STORED_IDS)));
  } catch {
    /* storage blocked: the in-memory set still prevents repeats this session */
  }
}

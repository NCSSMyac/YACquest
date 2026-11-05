import { useEffect, useRef } from 'react';
import * as api from '../api';
import { useAuth } from '../lib/auth';
import { useCelebrate } from '../lib/celebrate';
import { loadPopped, mergePopped, planPopups, savePopped } from '../lib/popups';

const POLL_MS = 60_000;
const DEBOUNCE_MS = 800;

/** Session-wide memory so a blocked localStorage (or StrictMode double effects) never double-pops. */
const memPopped = new Map<string, Set<string>>();
/** Users we've already run for this session (so "first run" happens once even if storage is blocked). */
const ranFor = new Set<string>();
let busy = false;

/**
 * Pops "Quest approved!", "Points added!", "Quest not approved", "Points removed" when an admin acts on
 * this player's points. Mounted once in Layout. Never marks notifications read — the bell keeps its badge.
 */
export function NotificationPopups() {
  const { user } = useAuth();
  const celebrate = useCelebrate();
  const userId = user?.id;
  const latestUser = useRef(userId);
  latestUser.current = userId;

  useEffect(() => {
    if (!userId) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      if (busy || !userId) return;
      busy = true;
      try {
        const notes = await api.notifications();
        // (No "unmounted?" bail-out: the celebration queue lives above Layout, and StrictMode's
        // throwaway first mount would otherwise swallow the initial check.)
        if (latestUser.current !== userId) return;
        // Re-read after the await: another check may have popped some meanwhile.
        const stored = loadPopped(userId);
        const mem = memPopped.get(userId) ?? new Set<string>();
        memPopped.set(userId, mem);
        const firstRun = stored === null && !ranFor.has(userId);
        ranFor.add(userId);
        const plan = planPopups(notes, firstRun ? null : new Set([...(stored ?? []), ...mem]));
        // Mark first, then queue, so nothing can pop twice.
        for (const id of plan.markIds) mem.add(id);
        if (plan.markIds.length || stored === null) savePopped(userId, mergePopped(stored ?? [], plan.markIds));
        for (const c of plan.show) celebrate(c);
        if (plan.extra > 0) {
          celebrate({ title: `+${plan.extra} more update${plan.extra === 1 ? '' : 's'} in 🔔`, subtitle: 'Tap the bell to see them all', tone: 'notice', size: 'small' });
        }
      } catch {
        /* offline / signed out mid-check: try again next tick */
      } finally {
        busy = false;
      }
    }

    void check();
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    const unsub = api.subscribe(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void check(), DEBOUNCE_MS);
    });
    const poll = setInterval(() => void check(), POLL_MS);
    return () => {
      clearTimeout(debounce);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      unsub();
    };
  }, [userId, celebrate]);

  return null;
}

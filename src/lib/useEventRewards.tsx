/**
 * 0033 Brew & Quest: my reward passes + "NEW outfit" alert, shared by the app chrome (Prize tab dot),
 * Home (Coffee Pass chip, "your outfit is here") and the Prize hub (Wardrobe tab dot). Loaded once in
 * Layout. The server (my_event_rewards) is the source of truth; this device's memory fills in when the
 * network dropped right after check-in (src/lib/rewardEvents.ts).
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import * as api from '../api';
import { useAuth } from './auth';
import { clearNewOutfit, localNewOutfit, mergePasses, rememberedPasses } from './rewardEvents';
import { useAsync } from './useAsync';
import type { CoffeePass } from '../types';

interface EventRewardsState {
  /** Outfit items not yet seen in the Wardrobe. */
  unseen: string[];
  passes: CoffeePass[];
  /** Opening the Wardrobe: clears the NEW alerts (server + this device). */
  markSeen: () => void;
}

const Ctx = createContext<EventRewardsState>({ unseen: [], passes: [], markSeen: () => {} });

export function EventRewardsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { data, error } = useAsync(() => (userId ? api.myEventRewards() : Promise.resolve(null)), [userId], { live: true });
  const markSeen = useCallback(() => {
    if (!userId) return;
    clearNewOutfit(userId);
    api.markEventUnlocksSeen().catch(() => {});
  }, [userId]);
  const value = useMemo<EventRewardsState>(() => {
    if (!userId) return { unseen: [], passes: [], markSeen };
    // Offline / server without 0033 → this device's memory.
    const unseen = data ? data.unseen : error ? localNewOutfit(userId) : [];
    return { unseen, passes: mergePasses(data?.passes, rememberedPasses(userId)), markSeen };
  }, [userId, data, error, markSeen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useEventRewards = () => useContext(Ctx);

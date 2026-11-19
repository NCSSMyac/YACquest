/**
 * 0034 Wardrobe → Collection: limited-edition event outfits (Brew & Quest…) and seasonal holiday items on
 * one collectible shelf, grouped by campaign / holiday, with availability and "Collected 9 / 18".
 * Pure (unit tested in src/__tests__/quickstartPromo.test.ts).
 */
import type { SeasonalHoliday } from '../config';
import { COSMETICS, type CosmeticDef } from './cosmetics';
import { OUTFIT_SETS, campaignLabels, type OutfitSet } from './rewardEvents';
import { aboutFor, returnsLabel, seasonLabel, seasonalItems, seasonalOrder, shortDate } from './seasonal';
import type { RewardCampaign } from '../types';

export type CollectionState = 'available' | 'owned' | 'returns' | 'exclusive';

export interface CollectionGroup {
  /** 'event:<set id>' or 'seasonal:<holiday id>' */
  key: string;
  kind: 'event' | 'seasonal';
  /** "Brew & Quest 2026 — Latte Night Scholar" / "Diwali" */
  title: string;
  emoji: string;
  about: string;
  /** "Available until Nov 30" · "Returns next year" · "Coming soon" · "Event exclusive" · "Yours to keep" */
  availability: string;
  state: CollectionState;
  items: CosmeticDef[];
  owned: number;
  total: number;
  holiday?: SeasonalHoliday;
  set?: OutfitSet;
  /** 0035: "Winter 2026–27" for winter holidays. */
  season?: string;
}

const eventItems = (set: OutfitSet) => COSMETICS.filter((c) => c.rule.type === 'event' && c.rule.id === set.id);

export function collectionGroups(have: ReadonlySet<string>, campaigns: readonly RewardCampaign[] | null | undefined, at: Date | number = Date.now()): CollectionGroup[] {
  const events: CollectionGroup[] = OUTFIT_SETS.map((set) => {
    const items = eventItems(set);
    const owned = items.filter((c) => have.has(c.id)).length;
    const labels = campaignLabels(set.id, campaigns);
    const all = owned === items.length && items.length > 0;
    return {
      key: `event:${set.id}`,
      kind: 'event' as const,
      title: `${labels.name} — ${set.name}`,
      emoji: labels.emoji,
      about: set.about,
      availability: all ? 'Yours to keep' : 'Event exclusive',
      state: all ? ('owned' as const) : ('exclusive' as const),
      items,
      owned,
      total: items.length,
      set,
    };
  });
  const seasonal: CollectionGroup[] = seasonalOrder((h) => seasonalItems(h.id).some((c) => have.has(c.id)), at).map(({ h, st }) => {
    const items = seasonalItems(h.id);
    const owned = items.filter((c) => have.has(c.id)).length;
    const availability =
      st.kind === 'available' ? `Available until ${shortDate(st.endsOn)}` : st.kind === 'owned' ? 'Yours to keep' : st.next && returnsLabel(st, at, h) === 'Coming soon' ? `Arrives ${shortDate(st.next[0])}` : returnsLabel(st, at, h);
    const season = seasonLabel(h, at) || undefined;
    return { key: `seasonal:${h.id}`, kind: 'seasonal' as const, title: h.name, emoji: h.emoji, about: aboutFor(h, at), availability, state: st.kind, items, owned, total: items.length, holiday: h, season };
  });
  return [...events, ...seasonal];
}

/** "Collected 9 / 18" across every group. */
export function collectionProgress(groups: readonly CollectionGroup[]): { got: number; total: number } {
  return groups.reduce((a, g) => ({ got: a.got + g.owned, total: a.total + g.total }), { got: 0, total: 0 });
}

/** Every collectible id (event + seasonal), e.g. for the tab counter. */
export const COLLECTIBLE_IDS = COSMETICS.filter((c) => c.rule.type === 'event' || c.rule.type === 'seasonal').map((c) => c.id);


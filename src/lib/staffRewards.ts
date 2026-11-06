/**
 * STAFF-ONLY rewards (admins + chairs). Participants never see any of this: the server
 * (supabase/migrations/0020_staff_rewards.sql: staff_cosmetics, staff_badges_for(), staff_unlocks_for(),
 * my_staff_rewards(), hero_board(), crown_hero(), clear_hero(), grant_staff_reward()) returns nothing
 * for them and refuses to equip any of it. This file holds names, rules and display order; keep it in
 * sync with the SQL.
 *
 * Staff work counts ALL-TIME (not just this cycle): reviews done, announcements sent, events created
 * that reached 5 check-ins. Being staff is the gate: if someone goes back to participant the items are
 * unequipped and hidden, but nothing is forgotten, so it all comes back if they rejoin the team.
 */
import type { AvatarId, CosmeticSlot } from '../types';

export type StaffRule =
  | { type: 'staff' } // free for every admin/chair
  | { type: 'reviews'; min: number } // submissions reviewed (approved or rejected)
  | { type: 'announcements'; min: number } // announcements sent
  | { type: 'hosted'; min: number } // events created that each reached HOSTED_EVENT_MIN_CHECKINS check-ins
  | { type: 'grant' } // a chair grants it (Admin → Heroes)
  | { type: 'hero' }; // only while you're the reigning Hero of the Week

export interface StaffCosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  rule: StaffRule;
}

/** An event counts toward Event Host once it has this many check-ins. */
export const HOSTED_EVENT_MIN_CHECKINS = 5;

export const STAFF_COSMETICS: StaffCosmeticDef[] = [
  // Council wardrobe (automatic from staff work)
  { id: 'host_top_hat', slot: 'hat', name: 'Event Host Top Hat', rule: { type: 'hosted', min: 3 } },
  { id: 'gatekeeper_monocle', slot: 'accessory', name: 'Gatekeeper’s Monocle', rule: { type: 'reviews', min: 25 } },
  { id: 'heralds_horn', slot: 'accessory', name: 'Herald’s Horn', rule: { type: 'announcements', min: 5 } },
  { id: 'council_chamber', slot: 'background', name: 'Council Chamber', rule: { type: 'staff' } },
  // Council wardrobe (chair-granted)
  { id: 'wizard_council_hat', slot: 'hat', name: 'Wizard Council Hat', rule: { type: 'grant' } },
  { id: 'royal_scepter', slot: 'accessory', name: 'Royal Scepter', rule: { type: 'grant' } },
  { id: 'starlit_throne', slot: 'background', name: 'Starlit Throne Room', rule: { type: 'grant' } },
  // Hero of the Week perks (only while reigning)
  { id: 'hero_crown', slot: 'hat', name: 'Hero’s Crown', rule: { type: 'hero' } },
  { id: 'hero_cape', slot: 'accessory', name: 'Hero’s Cape', rule: { type: 'hero' } },
  { id: 'hall_of_heroes', slot: 'background', name: 'Hall of Heroes', rule: { type: 'hero' } },
];

export const HERO_ITEMS = STAFF_COSMETICS.filter((c) => c.rule.type === 'hero').map((c) => c.id);
export const staffCosmeticById = (id?: string) => (id ? STAFF_COSMETICS.find((c) => c.id === id) : undefined);
export const isStaffCosmetic = (id?: string) => !!staffCosmeticById(id);

/** What a chair can grant in Admin → Heroes. 'council_mvp' unlocks the Golden Yak. */
export const STAFF_GRANTS: { id: string; name: string; what: string }[] = [
  { id: 'wizard_council_hat', name: 'Wizard Council Hat', what: 'hat' },
  { id: 'royal_scepter', name: 'Royal Scepter', what: 'accessory' },
  { id: 'starlit_throne', name: 'Starlit Throne Room', what: 'background' },
  { id: 'council_mvp', name: 'Council MVP', what: 'unlocks the Golden Yak' },
];
export const staffGrantById = (id: string) => STAFF_GRANTS.find((g) => g.id === id);

export interface StaffBadgeDef {
  id: string;
  name: string;
  how: string;
  flavor: string;
}

/** Council badges, shown under "Council badges" on the Badges tab for staff only. */
export const STAFF_BADGES: StaffBadgeDef[] = [
  { id: 'gatekeeper', name: 'Gatekeeper', how: 'Review 25 submissions (all-time).', flavor: 'None shall pass… without a clear screenshot.' },
  { id: 'town_crier', name: 'Town Crier', how: 'Send 5 announcements (all-time).', flavor: 'Hear ye, hear ye!' },
  { id: 'event_host', name: 'Event Host', how: `Create 3 events that each get ${HOSTED_EVENT_MIN_CHECKINS}+ check-ins.`, flavor: 'The party doesn’t start until you walk in.' },
  { id: 'hero_week', name: 'Hero of the Week', how: 'Be crowned Hero of the Week at a YAC meeting.', flavor: 'The council salutes you.' },
  { id: 'council_legend', name: 'Council Legend', how: 'Earn Gatekeeper, Town Crier and Event Host, and be Hero of the Week at least once.', flavor: 'Your name is sung in the Council halls.' },
];
export const staffBadgeById = (id: string) => STAFF_BADGES.find((b) => b.id === id);

/** Characters that are never offered to participants. */
export const LEGENDARY_AVATARS: AvatarId[] = ['golden_yak'];
export const isLegendaryAvatar = (id: AvatarId) => LEGENDARY_AVATARS.includes(id);

export function staffRequirementText(rule: StaffRule): string {
  switch (rule.type) {
    case 'staff':
      return 'Free for all staff';
    case 'reviews':
      return `Review ${rule.min} submissions`;
    case 'announcements':
      return `Send ${rule.min} announcements`;
    case 'hosted':
      return `Host ${rule.min} events with ${HOSTED_EVENT_MIN_CHECKINS}+ check-ins`;
    case 'grant':
      return 'Granted by a chair';
    case 'hero':
      return 'While you’re Hero of the Week';
  }
}

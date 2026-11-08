/**
 * Unlockable looks: hats, accessories (jewelry) and backgrounds. Cosmetic only.
 * The server (cosmetics table + my_unlocks() + equip_look() in 0009_quest_extras.sql; Sparkle Aura at 300 since 0014, re-set in 0018) mirrors
 * these ids and rules and is the real gatekeeper; keep both in sync.
 * 0028: seasonal items (rule 'seasonal', windows in SEASONAL in config.ts, seasonal_windows in the database).
 */
import type { SeasonalHolidayId } from '../config';
import type { CosmeticSlot } from '../types';

export type UnlockRule =
  | { type: 'free' }
  | { type: 'points'; min: number }
  | { type: 'badge'; id: string }
  | { type: 'badges'; min: number }
  /** 0028: free during the holiday's window (SEASONAL in config.ts), owned forever once claimed. */
  | { type: 'seasonal'; id: SeasonalHolidayId };

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  rule: UnlockRule;
}

export const COSMETICS: CosmeticDef[] = [
  // Hats
  { id: 'party_hat', slot: 'hat', name: 'Party Hat', rule: { type: 'badge', id: 'first_checkin' } },
  { id: 'flower_crown', slot: 'hat', name: 'Flower Crown', rule: { type: 'points', min: 100 } },
  { id: 'explorer_cap', slot: 'hat', name: 'Explorer Cap', rule: { type: 'badge', id: 'explorer' } },
  { id: 'wizard_hat', slot: 'hat', name: 'Star Wizard Hat', rule: { type: 'badge', id: 'digital' } },
  { id: 'crown', slot: 'hat', name: 'Golden Crown', rule: { type: 'badge', id: 'legend' } },
  // Accessories / jewelry
  { id: 'bowtie', slot: 'accessory', name: 'Bow Tie', rule: { type: 'badge', id: 'recruiter' } },
  { id: 'pearls', slot: 'accessory', name: 'Pearl Necklace', rule: { type: 'badge', id: 'giver' } },
  { id: 'medal', slot: 'accessory', name: 'Champion Medal', rule: { type: 'badge', id: 'champion' } },
  { id: 'gold_chain', slot: 'accessory', name: 'Gold Chain', rule: { type: 'points', min: 250 } },
  { id: 'sparkles', slot: 'accessory', name: 'Sparkle Aura', rule: { type: 'points', min: 300 } },
  // Backgrounds
  { id: 'meadow', slot: 'background', name: 'Meadow', rule: { type: 'free' } },
  { id: 'campus', slot: 'background', name: 'Campus Colors', rule: { type: 'free' } },
  { id: 'sunset', slot: 'background', name: 'Sunset', rule: { type: 'points', min: 50 } },
  { id: 'night_sky', slot: 'background', name: 'Starry Night', rule: { type: 'points', min: 200 } },
  { id: 'castle', slot: 'background', name: 'Castle', rule: { type: 'badge', id: 'veteran' } },
  { id: 'rainbow', slot: 'background', name: 'Rainbow', rule: { type: 'badges', min: 6 } },
  { id: 'treasure', slot: 'background', name: 'Treasure Hoard', rule: { type: 'badge', id: 'legend' } },
  // 0028 Seasonal (Wardrobe → Seasonal). Never affect points.
  { id: 'land_of_longleaf', slot: 'background', name: 'Land of the Longleaf', rule: { type: 'seasonal', id: 'indigenous_peoples_day' } },
  { id: 'cempasuchil_crown', slot: 'hat', name: 'Cempasúchil Crown', rule: { type: 'seasonal', id: 'dia_de_muertos' } },
  { id: 'papel_picado', slot: 'background', name: 'Papel Picado', rule: { type: 'seasonal', id: 'dia_de_muertos' } },
  { id: 'diya', slot: 'accessory', name: 'Diya', rule: { type: 'seasonal', id: 'diwali' } },
  { id: 'rangoli_diyas', slot: 'background', name: 'Rangoli & Diyas', rule: { type: 'seasonal', id: 'diwali' } },
  { id: 'harvest_scarf', slot: 'accessory', name: 'Harvest Scarf', rule: { type: 'seasonal', id: 'thanksgiving' } },
  { id: 'autumn_harvest', slot: 'background', name: 'Autumn Harvest', rule: { type: 'seasonal', id: 'thanksgiving' } },
  // 0031 Native American Heritage Month (November): a background, never a costume.
  { id: 'three_sisters', slot: 'background', name: 'Three Sisters Garden', rule: { type: 'seasonal', id: 'heritage_month' } },
];

export const cosmeticById = (id?: string) => (id ? COSMETICS.find((c) => c.id === id) : undefined);

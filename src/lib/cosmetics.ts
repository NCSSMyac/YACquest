/**
 * Unlockable looks: hats, accessories (jewelry) and backgrounds. Cosmetic only.
 * The server (cosmetics table + my_unlocks() + equip_look() in 0009_quest_extras.sql; Sparkle Aura at 300 since 0014, re-set in 0018) mirrors
 * these ids and rules and is the real gatekeeper; keep both in sync.
 * 0028: seasonal items (rule 'seasonal', windows in SEASONAL in config.ts, seasonal_windows in the database).
 * 0033: limited-edition event items (rule 'event' = outfit set id; event_unlocks in the database).
 */
import type { SeasonalHolidayId } from '../config';
import type { CosmeticSlot } from '../types';

export type UnlockRule =
  | { type: 'free' }
  | { type: 'points'; min: number }
  | { type: 'badge'; id: string }
  | { type: 'badges'; min: number }
  /** 0028: free during the holiday's window (SEASONAL in config.ts), owned forever once claimed. */
  | { type: 'seasonal'; id: SeasonalHolidayId }
  /** 0033: limited-edition outfit set from a special reward event (Brew & Quest). Owned forever, never available otherwise. */
  | { type: 'event'; id: string };

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
  // 0031 Native American Heritage Month (November): a background.
  { id: 'three_sisters', slot: 'background', name: 'Three Sisters Garden', rule: { type: 'seasonal', id: 'heritage_month' } },
  // 0035 Winter (vector art in winterVec.ts): backgrounds and everyday held objects.
  { id: 'festival_of_lights', slot: 'background', name: 'Festival of Lights', rule: { type: 'seasonal', id: 'hanukkah' } },
  { id: 'dreidel', slot: 'accessory', name: 'Dreidel', rule: { type: 'seasonal', id: 'hanukkah' } },
  { id: 'snowy_pine', slot: 'background', name: 'Snowy Pine & Lights', rule: { type: 'seasonal', id: 'christmas' } },
  { id: 'holiday_hat', slot: 'hat', name: 'Cozy Holiday Hat', rule: { type: 'seasonal', id: 'christmas' } },
  { id: 'candy_cane', slot: 'accessory', name: 'Candy Cane', rule: { type: 'seasonal', id: 'christmas' } },
  { id: 'kinara_glow', slot: 'background', name: 'Kinara Glow', rule: { type: 'seasonal', id: 'kwanzaa' } },
  // 0036 Kwanzaa accessories (held at the side; the scarf is worn at the neck)
  { id: 'kikombe_cha_umoja', slot: 'accessory', name: 'Kikombe cha Umoja (Unity Cup)', rule: { type: 'seasonal', id: 'kwanzaa' } },
  { id: 'zawadi', slot: 'accessory', name: 'Zawadi (Gift)', rule: { type: 'seasonal', id: 'kwanzaa' } },
  { id: 'kwanzaa_scarf', slot: 'accessory', name: 'Red, Black & Green Scarf', rule: { type: 'seasonal', id: 'kwanzaa' } },
  { id: 'longest_night', slot: 'background', name: 'Longest Night', rule: { type: 'seasonal', id: 'winter_solstice' } },
  { id: 'starlight_lantern', slot: 'accessory', name: 'Starlight Lantern', rule: { type: 'seasonal', id: 'winter_solstice' } },
  { id: 'new_year_hat', slot: 'hat', name: 'New Year’s Party Hat', rule: { type: 'seasonal', id: 'new_year' } },
  { id: 'party_popper', slot: 'accessory', name: 'Party Popper', rule: { type: 'seasonal', id: 'new_year' } },
  { id: 'midnight_fireworks', slot: 'background', name: 'Midnight Fireworks', rule: { type: 'seasonal', id: 'new_year' } },
  { id: 'rosca_de_reyes', slot: 'background', name: 'Rosca de Reyes', rule: { type: 'seasonal', id: 'three_kings_day' } },
  { id: 'lanterns_fireworks', slot: 'background', name: 'Lanterns & Fireworks', rule: { type: 'seasonal', id: 'lunar_new_year' } },
  { id: 'red_envelope', slot: 'accessory', name: 'Red Envelope', rule: { type: 'seasonal', id: 'lunar_new_year' } },
  // 0033 Limited edition: "Latte Night Scholar" (Brew & Quest 2026). Only by checking in at a Brew & Quest event.
  { id: 'cozy_beanie', slot: 'hat', name: 'Cozy Knit Beanie', rule: { type: 'event', id: 'latte_night_scholar' } },
  { id: 'latte_aplus', slot: 'accessory', name: 'A+ Latte', rule: { type: 'event', id: 'latte_night_scholar' } },
  { id: 'moonlit_nook', slot: 'background', name: 'Moonlit Study Nook', rule: { type: 'event', id: 'latte_night_scholar' } },
];

export const cosmeticById = (id?: string) => (id ? COSMETICS.find((c) => c.id === id) : undefined);

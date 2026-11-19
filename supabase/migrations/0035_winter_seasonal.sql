-- ═══════════════════════════════════════════════════════════════════════════
-- 0035 — Winter seasonal wardrobe: Hanukkah, Christmas, Kwanzaa, Winter Solstice, New Year's,
--        Three Kings Day (Día de Reyes) and Lunar New Year.
--
--   • 7 holidays (seasonal_holidays) + windows for winter 2026–27 and 2027–28 (America/New_York, inclusive):
--       hanukkah          2026: Nov 30 – Dec 14   (begins at sundown Fri Dec 4, ends Dec 12, 2026 — VERIFY YEARLY)
--                         2027: Dec 20 – Jan 3, 2028 (begins at sundown Fri Dec 24, 2027 — VERIFY YEARLY)
--       christmas         Dec 1–31 (2026, 2027)
--       kwanzaa           Dec 19 – Jan 8 (Kwanzaa is Dec 26 – Jan 1 every year)
--       winter_solstice   Dec 14–28 (solstice Dec 21, 2026 and Dec 21, 2027 in New York — VERIFY YEARLY)
--       new_year          Dec 26 – Jan 7
--       three_kings_day   Jan 1–13 (2027, 2028; Día de Reyes = Jan 6)
--       lunar_new_year    2027: Jan 30 – Feb 20 (Sat Feb 6, 2027, Year of the Goat — VERIFY YEARLY)
--                         2028: Jan 19 – Feb 9  (Wed Jan 26, 2028, Year of the Monkey — VERIFY YEARLY)
--     Windows may overlap. Keep SEASONAL in src/config.ts in sync (the app test compares them).
--
--   • 14 cosmetics (rule 'seasonal'): backgrounds and everyday held objects only — never costumes, no
--     religious figures, no sacred symbols worn as fashion. Art is vector (src/components/cosmetics/winterVec.ts).
--       Hanukkah: festival_of_lights (bg), dreidel · Christmas: snowy_pine (bg), holiday_hat, candy_cane ·
--       Kwanzaa: kinara_glow (bg) · Winter Solstice: longest_night (bg), starlight_lantern ·
--       New Year's: new_year_hat, party_popper, midnight_fireworks (bg) · Three Kings Day: rosca_de_reyes (bg) ·
--       Lunar New Year: lanterns_fireworks (bg), red_envelope.
--
--   • Notifications: item_noun 'items' reads "🕎 New limited-time items for Hanukkah — see what they honor";
--     claim_seasonal_for() is re-created (copy of 0031: plural nouns say "they honor"; the body points to
--     Wardrobe → Collection, the tab's name since 0034).
--
--   Cosmetic only: never affects points. ⚠️ Have each holiday's text and art reviewed by members of that
--   community before promoting it (docs/SETUP.md).
--
-- ADDITIVE (new rows, upserts, one function re-created; nothing dropped): no downtime. Run AFTER 0034.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- 1. Holidays
insert into public.seasonal_holidays (id, name, emoji, sort_order, item_noun) values
  ('hanukkah',        'Hanukkah',        '🕎', 6,  'items'),
  ('christmas',       'Christmas',       '🎄', 7,  'items'),
  ('kwanzaa',         'Kwanzaa',         '🕯️', 8,  'background'),
  ('winter_solstice', 'Winter Solstice', '✨', 9,  'items'),
  ('new_year',        'New Year’s',      '🎆', 10, 'items'),
  ('three_kings_day', 'Three Kings Day', '⭐', 11, 'background'),
  ('lunar_new_year',  'Lunar New Year',  '🧧', 12, 'items')
on conflict (id) do update
  set name = excluded.name, emoji = excluded.emoji, sort_order = excluded.sort_order, item_noun = excluded.item_noun;

-- 2. Windows (inclusive dates, America/New_York). Re-running this migration resets them to these values.
insert into public.seasonal_windows (holiday, year, starts_on, ends_on) values
  -- Hanukkah: verify yearly (Hebrew calendar). 2026: sundown Dec 4 – Dec 12. 2027: sundown Dec 24 – Jan 1, 2028.
  ('hanukkah',        2026, '2026-11-30', '2026-12-14'),
  ('hanukkah',        2027, '2027-12-20', '2028-01-03'),
  -- Christmas: Dec 1–31.
  ('christmas',       2026, '2026-12-01', '2026-12-31'),
  ('christmas',       2027, '2027-12-01', '2027-12-31'),
  -- Kwanzaa: Dec 26 – Jan 1 every year, shown Dec 19 – Jan 8.
  ('kwanzaa',         2026, '2026-12-19', '2027-01-08'),
  ('kwanzaa',         2027, '2027-12-19', '2028-01-08'),
  -- Winter Solstice: verify yearly (Dec 21, 2026; Dec 21, 2027 in New York).
  ('winter_solstice', 2026, '2026-12-14', '2026-12-28'),
  ('winter_solstice', 2027, '2027-12-14', '2027-12-28'),
  -- New Year's: Dec 26 – Jan 7.
  ('new_year',        2026, '2026-12-26', '2027-01-07'),
  ('new_year',        2027, '2027-12-26', '2028-01-07'),
  -- Three Kings Day (Jan 6): Jan 1–13.
  ('three_kings_day', 2027, '2027-01-01', '2027-01-13'),
  ('three_kings_day', 2028, '2028-01-01', '2028-01-13'),
  -- Lunar New Year: verify yearly (lunisolar calendar). Through the Lantern Festival (15th day).
  ('lunar_new_year',  2027, '2027-01-30', '2027-02-20'),
  ('lunar_new_year',  2028, '2028-01-19', '2028-02-09')
on conflict (holiday, year) do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on;

-- 3. Items (mirror COSMETICS in src/lib/cosmetics.ts)
insert into public.cosmetics (id, slot, name, rule_type, rule_value, sort_order) values
  ('festival_of_lights', 'background', 'Festival of Lights',   'seasonal', 'hanukkah',        109),
  ('dreidel',            'accessory',  'Dreidel',              'seasonal', 'hanukkah',        110),
  ('snowy_pine',         'background', 'Snowy Pine & Lights',  'seasonal', 'christmas',       111),
  ('holiday_hat',        'hat',        'Cozy Holiday Hat',     'seasonal', 'christmas',       112),
  ('candy_cane',         'accessory',  'Candy Cane',           'seasonal', 'christmas',       113),
  ('kinara_glow',        'background', 'Kinara Glow',          'seasonal', 'kwanzaa',         114),
  ('longest_night',      'background', 'Longest Night',        'seasonal', 'winter_solstice', 115),
  ('starlight_lantern',  'accessory',  'Starlight Lantern',    'seasonal', 'winter_solstice', 116),
  ('new_year_hat',       'hat',        'New Year’s Party Hat', 'seasonal', 'new_year',        117),
  ('party_popper',       'accessory',  'Party Popper',         'seasonal', 'new_year',        118),
  ('midnight_fireworks', 'background', 'Midnight Fireworks',   'seasonal', 'new_year',        119),
  ('rosca_de_reyes',     'background', 'Rosca de Reyes',       'seasonal', 'three_kings_day', 120),
  ('lanterns_fireworks', 'background', 'Lanterns & Fireworks', 'seasonal', 'lunar_new_year',  121),
  ('red_envelope',       'accessory',  'Red Envelope',         'seasonal', 'lunar_new_year',  122)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, rule_type = excluded.rule_type,
      rule_value = excluded.rule_value, sort_order = excluded.sort_order;

-- 4. claim_seasonal_for: copy of 0031; plural nouns ("items") say "they honor".
create or replace function public.claim_seasonal_for(p_user uuid, p_now timestamptz default now())
returns text[] language plpgsql security definer set search_path = public, extensions as $$
declare
  v_new  text[];
  h      record;
  v_noun text;
begin
  with ins as (
    insert into public.seasonal_unlocks (user_id, item_id, unlocked_at)
    select p_user, c.id, p_now
      from public.cosmetics c
     where c.rule_type = 'seasonal' and c.rule_value in (select a.holiday from public.seasonal_active(p_now) a)
    on conflict do nothing
    returning item_id
  )
  select coalesce(array_agg(ins.item_id order by ins.item_id), '{}'::text[]) into v_new from ins;
  for h in
    select sh.id, sh.name, sh.emoji, sh.item_noun
      from public.seasonal_holidays sh
     where exists (select 1 from public.cosmetics c where c.rule_type = 'seasonal' and c.rule_value = sh.id and c.id = any (v_new))
     order by sh.sort_order
  loop
    v_noun := coalesce(h.item_noun, 'item');
    perform public.notify(p_user, 'seasonal',
      h.emoji || ' New limited-time ' || v_noun || ' for ' || h.name || ' — see what '
        || case when right(v_noun, 1) = 's' then 'they honor' else 'it honors' end,
      'Free in Prize → Wardrobe → Collection while it lasts, and yours to keep. Tap “About this item” to learn what it celebrates.');
  end loop;
  return v_new;
end $$;

-- Internal helper (same as 0028/0031): nobody calls it through the API.
revoke execute on function public.claim_seasonal_for(uuid, timestamptz) from public, anon, authenticated, service_role;

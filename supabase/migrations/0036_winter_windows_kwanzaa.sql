-- ═══════════════════════════════════════════════════════════════════════════
-- 0036 — Winter windows widened, Kwanzaa accessories.
--
--   • Winter windows (America/New_York, inclusive), same month/day pattern for 2026–27 and 2027–28.
--     Every winter holiday is now available from December 1 (Hanukkah from Nov 30):
--       hanukkah          Nov 30 – Dec 31     (Hanukkah 2026: sundown Dec 4 – Dec 12; 2027: sundown Dec 24 – Jan 1, 2028)
--       christmas         Dec 1 – Dec 31      (unchanged)
--       kwanzaa           Dec 1 – Jan 8       (Kwanzaa is Dec 26 – Jan 1)
--       winter_solstice   Dec 1 – Dec 31      (solstice Dec 21)
--       new_year          Dec 1 – Jan 7       (the party hat shows the year being welcomed: "2027" in Dec 2026 – Jan 2027)
--       three_kings_day   Dec 1 – Jan 13      (Día de Reyes = Jan 6; rows keyed by the January's year, as in 0035)
--       lunar_new_year    Dec 1 – Feb 20      (Feb 6, 2027 Goat; Jan 26, 2028 Monkey; rows keyed by the New Year's year)
--     Same (holiday, year) keys as 0035, so the upsert replaces the 0035 dates. Keep SEASONAL in src/config.ts
--     in sync (the app test compares them). ⚠️ Verify Hanukkah, the solstice and Lunar New Year every year.
--
--   • Kwanzaa: 3 accessories (rule 'seasonal', same window as Kinara Glow), vector art in winterVec.ts:
--       kikombe_cha_umoja "Kikombe cha Umoja (Unity Cup)" (held), zawadi "Zawadi (Gift)" (held),
--       kwanzaa_scarf "Red, Black & Green Scarf" (worn at the neck).
--     Kwanzaa's item_noun becomes 'items': "🕯️ New limited-time items for Kwanzaa — see what they honor"
--     (claim_seasonal_for() from 0035 already says "they honor" for plural nouns; not re-created).
--
--   Cosmetic only: never affects points. Have the text and art reviewed by members of the community before
--   promoting it (docs/SETUP.md).
--
-- ADDITIVE (new rows + upserts; nothing dropped or re-created): no downtime. Run AFTER 0035.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- 1. Kwanzaa now has several items
update public.seasonal_holidays set item_noun = 'items' where id = 'kwanzaa';

-- 2. Windows (inclusive dates, America/New_York). Re-running this migration resets them to these values.
insert into public.seasonal_windows (holiday, year, starts_on, ends_on) values
  ('hanukkah',        2026, '2026-11-30', '2026-12-31'),
  ('hanukkah',        2027, '2027-11-30', '2027-12-31'),
  ('christmas',       2026, '2026-12-01', '2026-12-31'),
  ('christmas',       2027, '2027-12-01', '2027-12-31'),
  ('kwanzaa',         2026, '2026-12-01', '2027-01-08'),
  ('kwanzaa',         2027, '2027-12-01', '2028-01-08'),
  ('winter_solstice', 2026, '2026-12-01', '2026-12-31'),
  ('winter_solstice', 2027, '2027-12-01', '2027-12-31'),
  ('new_year',        2026, '2026-12-01', '2027-01-07'),
  ('new_year',        2027, '2027-12-01', '2028-01-07'),
  ('three_kings_day', 2027, '2026-12-01', '2027-01-13'),
  ('three_kings_day', 2028, '2027-12-01', '2028-01-13'),
  ('lunar_new_year',  2027, '2026-12-01', '2027-02-20'),
  ('lunar_new_year',  2028, '2027-12-01', '2028-02-20')
on conflict (holiday, year) do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on;

-- 3. Kwanzaa items (mirror COSMETICS in src/lib/cosmetics.ts)
insert into public.cosmetics (id, slot, name, rule_type, rule_value, sort_order) values
  ('kikombe_cha_umoja', 'accessory', 'Kikombe cha Umoja (Unity Cup)', 'seasonal', 'kwanzaa', 123),
  ('zawadi',            'accessory', 'Zawadi (Gift)',                 'seasonal', 'kwanzaa', 124),
  ('kwanzaa_scarf',     'accessory', 'Red, Black & Green Scarf',      'seasonal', 'kwanzaa', 125)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, rule_type = excluded.rule_type,
      rule_value = excluded.rule_value, sort_order = excluded.sort_order;

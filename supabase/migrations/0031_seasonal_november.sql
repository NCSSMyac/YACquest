-- ═══════════════════════════════════════════════════════════════════════════
-- 0031 — Seasonal wardrobe: Diwali + Thanksgiving all November, Native American Heritage Month.
--
--   • Diwali and Thanksgiving items are now free for ALL OF NOVEMBER:
--       - Diwali 2026: Nov 1–30 (Diwali = Sunday, Nov 8, 2026; Lakshmi Puja; confirmed).
--       - Diwali 2027: Oct 22 – Nov 30 (Diwali = Friday, Oct 29, 2027: VERIFY before Oct 2027, lunar
--         calendar) so the window still covers the festival week and all of November.
--       - Thanksgiving 2026 + 2027: Nov 1–30 (Thanksgiving = Nov 26, 2026; Nov 25, 2027).
--     Día de los Muertos and Indigenous Peoples' Day are unchanged.
--
--   • New: Native American Heritage Month (holiday 'heritage_month', 🌽), Nov 1–30 in 2026 and 2027, with
--     one BACKGROUND (never a costume): 'three_sisters' "Three Sisters Garden" (corn, beans and squash).
--
--   • seasonal_holidays.item_noun ('item' by default; 'background' for Heritage Month) so the one-time
--     notification reads "🌽 New limited-time background for Native American Heritage Month — see what it
--     honors". claim_seasonal_for() is re-created (copy of 0028 + item_noun).
--
--   ⚠️ VERIFY THE DATES EVERY YEAR and keep SEASONAL in src/config.ts in sync (add a new migration with the
--   next year's rows). Have members of each community review descriptions and art (docs/SETUP.md).
--
-- Additive only (new column with a default, new rows, upserts, one function re-created): no downtime.
-- Run AFTER 0030. Safe to run more than once. Re-running 0028 alone would put the old (shorter) windows
-- and notification text back, so re-run 0031 after it.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- 1. Holidays: the new one + the word used in its notification
alter table public.seasonal_holidays add column if not exists item_noun text not null default 'item';

insert into public.seasonal_holidays (id, name, emoji, sort_order, item_noun) values
  ('heritage_month', 'Native American Heritage Month', '🌽', 5, 'background')
on conflict (id) do update
  set name = excluded.name, emoji = excluded.emoji, sort_order = excluded.sort_order, item_noun = excluded.item_noun;

-- 2. Windows (inclusive dates, America/New_York). Re-running this migration resets them to these values.
insert into public.seasonal_windows (holiday, year, starts_on, ends_on) values
  -- Diwali: all of November. 2026: Diwali = Sunday, Nov 8, 2026 (confirmed).
  -- 2027: Diwali = Oct 29, 2027 — VERIFY before Oct 2027 (lunar calendar); starts Oct 22 to cover the festival.
  ('diwali',         2026, '2026-11-01', '2026-11-30'),
  ('diwali',         2027, '2027-10-22', '2027-11-30'),
  -- Thanksgiving: all of November (4th Thursday: Nov 26, 2026; Nov 25, 2027).
  ('thanksgiving',   2026, '2026-11-01', '2026-11-30'),
  ('thanksgiving',   2027, '2027-11-01', '2027-11-30'),
  -- Native American Heritage Month: all of November.
  ('heritage_month', 2026, '2026-11-01', '2026-11-30'),
  ('heritage_month', 2027, '2027-11-01', '2027-11-30')
on conflict (holiday, year) do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on;

-- 3. The item (mirror COSMETICS in src/lib/cosmetics.ts)
insert into public.cosmetics (id, slot, name, rule_type, rule_value, sort_order) values
  ('three_sisters', 'background', 'Three Sisters Garden', 'seasonal', 'heritage_month', 108)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, rule_type = excluded.rule_type,
      rule_value = excluded.rule_value, sort_order = excluded.sort_order;

-- 4. claim_seasonal_for: copy of 0028, notification uses the holiday's item_noun.
create or replace function public.claim_seasonal_for(p_user uuid, p_now timestamptz default now())
returns text[] language plpgsql security definer set search_path = public, extensions as $$
declare
  v_new text[];
  h     record;
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
    perform public.notify(p_user, 'seasonal', h.emoji || ' New limited-time ' || coalesce(h.item_noun, 'item') || ' for ' || h.name || ' — see what it honors',
      'Free in Prize → Wardrobe → Seasonal while it lasts, and yours to keep. Tap “About this item” to learn what it celebrates.');
  end loop;
  return v_new;
end $$;

-- Internal helper (same as 0028): nobody calls it through the API.
revoke execute on function public.claim_seasonal_for(uuid, timestamptz) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — Prize goal back to 350.
--   YAC decided to keep the original 350 goal from 0014 after all (0016 had lowered it to
--   300). Tier points stay 35/20/5, still 4 spots × $75. Simulation
--   (scripts/simulate-points.py, GOAL = 350): see src/config.ts for the current numbers.
--
--   • app_config.prize_goal = 350 and its column default (0014 also sets 350; since the 0019
--     pass 0003 no longer sets 650 and 0016 is a no-op), then refresh_prize_race().
--     NOTE: refresh_prize_race() also REVOKES open claims (qualified / info submitted, not
--     fulfilled) whose holder is now below 350, and notifies them; their spot goes to the
--     next person who reaches 350.
--   • Halfway badge: badges_for() uses half the goal rounded up → 175; Quest Legend = 350.
--     badges_for() below is a copy of 0017's; only the fallback goal (used when app_config
--     has no row) changes from 300 to 350.
--   • cosmetics: Sparkle Aura back to 300 points (was 275 from 0016). Mirrors
--     src/lib/cosmetics.ts. Gold Chain stays at 250.
--   • report_settings.near_goal_points ("close to the prize" in the weekly email): default
--     75 (was 50 from 0016); the existing row is moved from 50 to 75 (other values are left alone).
--   • Manual removal limit (admin_adjust_points in 0003) is −prize_goal, so it is −350 again
--     automatically. admin_overview() "Close to the goal" stays within 75 points (no change).
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0017. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The goal
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.app_config alter column prize_goal set default 350;
update public.app_config set prize_goal = 350 where id = 1;
-- Anyone already at 350+ in the active cycle claims a spot now (in the order they crossed),
-- instead of waiting for their next ledger row. No-op on re-run. Wrapped in a do-block so
-- the SQL Editor doesn't show an empty result box.
do $$ begin perform public.refresh_prize_race(public.active_cycle_id()); end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cosmetics: Sparkle Aura 275 → 300 points (Gold Chain stays at 250)
-- ─────────────────────────────────────────────────────────────────────────────
update public.cosmetics set rule_value = '300' where id = 'sparkles' and rule_type = 'points';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Weekly email "close to the prize" range: 50 → 75
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.report_settings alter column near_goal_points set default 75;
update public.report_settings set near_goal_points = 75 where near_goal_points = 50;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Badges: copy of 0017's badges_for(); fallback goal 300 → 350
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.badges_for(p_user uuid)
returns table (id text, earned boolean, progress int, goal int)
language sql stable security definer set search_path = public, extensions as $$
  with l as (
    select l.* from public.ledger l
     where l.user_id = p_user and l.cycle_id = public.active_cycle_id() and l.amount > 0
  ),
  ci as (
    select l.created_at, e.campus, e.kind
      from l left join public.events e on e.id::text = l.ref_id
     where l.source = 'checkin'
  ),
  s as (
    select
      (select count(*) from ci)::int as checkins,
      (select count(distinct ci.campus) from ci where ci.campus in ('duke', 'unc', 'ncsu'))::int as campuses,
      (select count(*) from ci where ci.kind = 'high_impact')::int as high_impact,
      (select count(distinct to_char(ci.created_at at time zone 'America/New_York', 'YYYY-MM')) from ci)::int as months,
      (select count(*) from l join public.activities a on a.id = l.activity_id
        where l.source = 'submission' and a.tier = 3)::int as digital,
      (select count(*) from l where l.activity_id = 'event_photos')::int as photos,
      (select count(*) from l where l.activity_id = 'bring_new_alum')::int as recruits,
      (select count(*) from l where l.activity_id = 'annual_fund')::int as gifts,
      (select count(*) from l where l.activity_id = 'game_win')::int as wins,
      ((select count(*) from public.feedback f where f.user_id = p_user)
       + (select count(*) from public.prize_suggestions ps where ps.user_id = p_user))::int as voices,
      coalesce((select p.points from public.profiles p where p.id = p_user), 0) as pts,
      coalesce((select c.prize_goal from public.app_config c where c.id = 1), 350) as prize_goal,
      (select count(*) from public.monthly_standings() ms
        where ms.user_id = p_user and ms.place = 1 and ms.final)::int as month_wins
  ),
  raw (ord, bid, val, bgoal) as (
              select  1, 'first_checkin', s.checkins,    1           from s
    union all select  2, 'regular',       s.checkins,    5           from s
    union all select  3, 'veteran',       s.checkins,    10          from s
    union all select  4, 'explorer',      s.campuses,    3           from s
    union all select  5, 'big_moment',    s.high_impact, 1           from s
    union all select  6, 'seasons',       s.months,      3           from s
    union all select  7, 'digital',       s.digital,     3           from s
    union all select  8, 'shutterbug',    s.photos,      1           from s
    union all select  9, 'recruiter',     s.recruits,    1           from s
    union all select 10, 'giver',         s.gifts,       1           from s
    union all select 11, 'champion',      s.wins,        1           from s
    union all select 12, 'voice',         s.voices,      1           from s
    union all select 13, 'halfway',       s.pts,         (s.prize_goal + 1) / 2 from s
    union all select 14, 'legend',        s.pts,         s.prize_goal from s
    union all select 15, 'monthly_star',  s.month_wins,  1           from s
  )
  select raw.bid, raw.val >= raw.bgoal, least(greatest(raw.val, 0), raw.bgoal), raw.bgoal
    from raw order by raw.ord;
$$;

-- Internal only (Supabase auto-grants new functions to anon + authenticated).
revoke execute on function public.badges_for(uuid) from public, anon, authenticated, service_role;

-- Done.

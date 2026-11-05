-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 — Prize goal 350 (fewer events this year).
--   YAC will only run ~6 more events (4 home-campus, 2 cross-campus) and post on social
--   media every other week, so the goal drops from 650 to 350. Tier points stay 35/20/5,
--   still 4 spots × $75. Simulation (scripts/simulate-points.py): ~3 of 300 reach 350.
--
--   • app_config.prize_goal = 350 (0003 sets 650 on every re-run; this file runs after it),
--     then refresh_prize_race() so anyone already past 350 gets a spot right away.
--   • badges_for(): copy of 0012 — only the 'halfway' goal changes: was a hard-coded 325,
--     now half the prize goal rounded up (175). 'legend' already used prize_goal.
--   • cosmetics: Sparkle Aura unlocks at 300 points (was 500). Mirrors src/lib/cosmetics.ts.
--   • admin_overview(): copy of 0001 — "Close to the goal" is now within 75 points (was 100).
--   • report_settings.near_goal_points ("close to the prize" in the weekly email): default
--     75 (was 150); the seeded row is moved from 150 to 75 (other values are left alone).
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0013. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The goal
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.app_config alter column prize_goal set default 350;
update public.app_config set prize_goal = 350 where id = 1;
-- Anyone already at 350+ in the active cycle claims a spot now (in the order they crossed),
-- instead of waiting for their next ledger row. No-op on re-run.
select public.refresh_prize_race(public.active_cycle_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cosmetics: Sparkle Aura 500 → 300 points
-- ─────────────────────────────────────────────────────────────────────────────
update public.cosmetics set rule_value = '300' where id = 'sparkles' and rule_type = 'points';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Badges: copy of 0012's badges_for(); 'halfway' = half of prize_goal (rounded up)
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal: badges for any user (not callable through the API). my_badges() /
-- unlocks_for() from 0009 call this.
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Admin home "Close to the goal": copy of 0001's admin_overview(), within 75 (was 100)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_cycle uuid := public.active_cycle_id();
  v_wk    timestamptz := public.week_start();
  cfg     public.app_config;
begin
  perform public.require_admin();
  select * into cfg from public.app_config where id = 1;
  return json_build_object(
    'participants', (select count(*) from public.profiles where role = 'participant'),
    'activeThisWeek', (select count(distinct l.user_id) from public.ledger l join public.profiles p on p.id = l.user_id
                        where p.role = 'participant' and l.cycle_id = v_cycle and l.created_at >= v_wk),
    'pointsThisWeek', (select coalesce(sum(greatest(0, l.amount)), 0) from public.ledger l join public.profiles p on p.id = l.user_id
                        where p.role = 'participant' and l.cycle_id = v_cycle and l.created_at >= v_wk),
    'pendingReviews', (select count(*) from public.submissions s join public.profiles p on p.id = s.user_id
                        where p.role = 'participant' and s.status = 'pending'),
    'newSignupsThisWeek', (select count(*) from public.profiles where role = 'participant' and created_at >= v_wk),
    'prize', public.prize_status(),
    'nearGoal', coalesce((
       select json_agg(json_build_object('rank', r.rank, 'userId', r.user_id, 'displayName', r.display_name,
                                         'campus', r.campus, 'avatar', r.avatar, 'points', r.points)
                       order by r.points desc, r.display_name)
         from (select * from public.leaderboard(1000, null) lb
                where lb.points >= cfg.prize_goal - 75
                  and not exists (select 1 from public.prize_claims c
                                   where c.cycle_id = v_cycle and c.user_id = lb.user_id and c.status <> 'revoked')
                order by lb.points desc, lb.display_name
                limit 10) r), '[]'::json)
  );
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Weekly email "close to the prize" range: 150 → 75
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.report_settings alter column near_goal_points set default 75;
update public.report_settings set near_goal_points = 75 where near_goal_points = 150;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants (create or replace keeps them; restated so a partial run can't leak)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.badges_for(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.admin_overview() from public, anon;
grant  execute on function public.admin_overview() to authenticated;

-- Done.

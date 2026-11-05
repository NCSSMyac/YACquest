-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 — Quest extras: badges, unlockable looks, Adventurer of the Week.
--
--   • Badges (purely for fun, never award points): my_badges() computes the
--     caller's badges for the current cycle. Ids/order mirror src/lib/badges.ts.
--   • Looks: profiles.hat / accessory / background + table `cosmetics`
--     (mirrors src/lib/cosmetics.ts). my_unlocks() lists what the caller has
--     unlocked; equip_look() equips (server is the gatekeeper).
--   • leaderboard() / my_rank() also return hat, accessory, background.
--   • weekly_shoutout(): "Adventurer of the Week" (most points in the last 7 days).
--     The weekly committee email names them, and the winner gets a notification
--     when this week's report is queued.
--
-- RE-RUN NOTE: 0001 (re-)creates leaderboard(int, text) and my_rank() with the
-- old 6-column result. Postgres cannot change a function's result type in place,
-- so the new versions use a slightly different argument list —
-- leaderboard(p_limit int, p_campus varchar) and my_rank(p_campus text default null) —
-- and this file drops the old ones. Callers (RPC/SQL) don't notice: same
-- parameter names, same defaults. That way the whole 0001…0009 set stays safe to re-run.
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0008. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Profile look columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists hat text;
alter table public.profiles add column if not exists accessory text;
alter table public.profiles add column if not exists background text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cosmetics catalogue (mirrors src/lib/cosmetics.ts — keep both in sync)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.cosmetics (
  id         text primary key,
  slot       text not null check (slot in ('hat', 'accessory', 'background')),
  name       text not null,
  rule_type  text not null check (rule_type in ('free', 'points', 'badge', 'badges')),
  rule_value text,              -- points/badges: minimum as text; badge: badge id; free: null
  sort_order int  not null default 0
);
alter table public.cosmetics enable row level security;
drop policy if exists cosmetics_read on public.cosmetics;
create policy cosmetics_read on public.cosmetics for select to anon, authenticated using (true);

insert into public.cosmetics (id, slot, name, rule_type, rule_value, sort_order) values
  -- Hats
  ('party_hat',    'hat',        'Party Hat',       'badge',  'first_checkin', 1),
  ('flower_crown', 'hat',        'Flower Crown',    'points', '100',           2),
  ('explorer_cap', 'hat',        'Explorer Cap',    'badge',  'explorer',      3),
  ('wizard_hat',   'hat',        'Star Wizard Hat', 'badge',  'digital',       4),
  ('crown',        'hat',        'Golden Crown',    'badge',  'legend',        5),
  -- Accessories / jewelry
  ('bowtie',       'accessory',  'Bow Tie',         'badge',  'recruiter',     6),
  ('pearls',       'accessory',  'Pearl Necklace',  'badge',  'giver',         7),
  ('medal',        'accessory',  'Champion Medal',  'badge',  'champion',      8),
  ('gold_chain',   'accessory',  'Gold Chain',      'points', '250',           9),
  ('sparkles',     'accessory',  'Sparkle Aura',    'points', '500',          10),
  -- Backgrounds
  ('meadow',       'background', 'Meadow',          'free',   null,           11),
  ('campus',       'background', 'Campus Colors',   'free',   null,           12),
  ('sunset',       'background', 'Sunset',          'points', '50',           13),
  ('night_sky',    'background', 'Starry Night',    'points', '200',          14),
  ('castle',       'background', 'Castle',          'badge',  'veteran',      15),
  ('rainbow',      'background', 'Rainbow',         'badges', '6',            16),
  ('treasure',     'background', 'Treasure Hoard',  'badge',  'legend',       17)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, rule_type = excluded.rule_type,
      rule_value = excluded.rule_value, sort_order = excluded.sort_order;
delete from public.cosmetics where id not in
  ('party_hat','flower_crown','explorer_cap','wizard_hat','crown','bowtie','pearls','medal','gold_chain',
   'sparkles','meadow','campus','sunset','night_sky','castle','rainbow','treasure');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Badges (mirrors src/lib/badges.ts order). Current cycle only.
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal: badges for any user (not callable through the API).
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
      coalesce((select c.prize_goal from public.app_config c where c.id = 1), 650) as prize_goal
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
    union all select 13, 'halfway',       s.pts,         325         from s
    union all select 14, 'legend',        s.pts,         s.prize_goal from s
  )
  select raw.bid, raw.val >= raw.bgoal, least(greatest(raw.val, 0), raw.bgoal), raw.bgoal
    from raw order by raw.ord;
$$;

-- Participant: the caller's badges, in display order.
create or replace function public.my_badges()
returns table (id text, earned boolean, progress int, goal int)
language sql stable security definer set search_path = public, extensions as $$
  select b.id, b.earned, b.progress, b.goal
    from public.badges_for(public.require_user()) with ordinality as b (id, earned, progress, goal, ord)
   order by b.ord;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Unlocks + equipping a look
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal: cosmetic ids a user has unlocked (catalogue order).
create or replace function public.unlocks_for(p_user uuid)
returns text[] language sql stable security definer set search_path = public, extensions as $$
  with b as materialized (select * from public.badges_for(p_user)),
  me as (select coalesce((select p.points from public.profiles p where p.id = p_user), 0) as pts)
  select coalesce(array_agg(c.id order by c.sort_order, c.id), '{}'::text[])
    from public.cosmetics c, me
   where case c.rule_type
           when 'free'   then true
           when 'points' then me.pts >= c.rule_value::int
           when 'badge'  then exists (select 1 from b where b.id = c.rule_value and b.earned)
           when 'badges' then (select count(*) from b where b.earned) >= c.rule_value::int
           else false
         end;
$$;

create or replace function public.my_unlocks()
returns text[] language sql stable security definer set search_path = public, extensions as $$
  select public.unlocks_for(public.require_user());
$$;

-- Equip a look. '' or null clears a slot. Returns {hat, accessory, background}.
create or replace function public.equip_look(p_hat text default null, p_accessory text default null, p_background text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid    uuid := public.require_user();
  v_unl    text[] := public.unlocks_for(v_uid);
  v_hat    text := nullif(trim(coalesce(p_hat, '')), '');
  v_acc    text := nullif(trim(coalesce(p_accessory, '')), '');
  v_bg     text := nullif(trim(coalesce(p_background, '')), '');
  v_slot   text;
  v_item   text;
begin
  foreach v_slot in array array['hat', 'accessory', 'background'] loop
    v_item := case v_slot when 'hat' then v_hat when 'accessory' then v_acc else v_bg end;
    continue when v_item is null;
    if not exists (select 1 from public.cosmetics c where c.id = v_item and c.slot = v_slot) then
      perform public.api_error('look', 'That item doesn’t go there.');
    end if;
    if not (v_item = any (v_unl)) then
      perform public.api_error('locked', 'Unlock this first!');
    end if;
  end loop;
  update public.profiles set hat = v_hat, accessory = v_acc, background = v_bg where id = v_uid;
  return json_build_object('hat', v_hat, 'accessory', v_acc, 'background', v_bg);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Leaderboard + my_rank with looks (see RE-RUN NOTE at the top)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.leaderboard(int, text);
drop function if exists public.my_rank();

-- Leaderboard of participants. Ties share a rank (1, 2, 2, 4).
create or replace function public.leaderboard(p_limit int default 10, p_campus varchar default null)
returns table (rank int, user_id uuid, display_name text, campus text, avatar text, points int,
               hat text, accessory text, background text)
language sql stable security definer set search_path = public, extensions as $$
  select (rank() over (order by p.points desc))::int, p.id, p.display_name, p.campus, p.avatar, p.points,
         p.hat, p.accessory, p.background
    from public.profiles p
   where p.role = 'participant' and (p_campus is null or p.campus = p_campus::text)
   order by p.points desc, p.display_name asc, p.id
   limit greatest(1, least(coalesce(p_limit, 10), 1000));
$$;

-- The caller's row in the overall leaderboard (0 rows if not a participant).
-- Optional p_campus: rank within that campus (0 rows if the caller is not on it).
create or replace function public.my_rank(p_campus text default null)
returns table (rank int, user_id uuid, display_name text, campus text, avatar text, points int,
               hat text, accessory text, background text)
language sql stable security definer set search_path = public, extensions as $$
  select (1 + (select count(*) from public.profiles o
                where o.role = 'participant' and o.points > p.points
                  and (p_campus is null or o.campus = p_campus)))::int,
         p.id, p.display_name, p.campus, p.avatar, p.points, p.hat, p.accessory, p.background
    from public.profiles p
   where p.id = auth.uid() and p.role = 'participant' and (p_campus is null or p.campus = p_campus);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Adventurer of the Week
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal: the participant with the most points gained in the last 7 days
-- (positive ledger rows, active cycle). Ties → display_name. null if nobody.
create or replace function public.weekly_shoutout_data()
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object('userId', p.id, 'displayName', p.display_name, 'campus', p.campus, 'avatar', p.avatar,
                           'hat', p.hat, 'accessory', p.accessory, 'background', p.background,
                           'look', json_build_object('hat', p.hat, 'accessory', p.accessory, 'background', p.background),
                           'pointsThisWeek', g.pts)
    from (select l.user_id, sum(l.amount)::int as pts
            from public.ledger l
           where l.cycle_id = public.active_cycle_id() and l.amount > 0
             and l.created_at >= now() - interval '7 days'
           group by l.user_id) g
    join public.profiles p on p.id = g.user_id and p.role = 'participant'
   order by g.pts desc, p.display_name asc, p.id
   limit 1;
$$;

create or replace function public.weekly_shoutout()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_user();
  return public.weekly_shoutout_data();
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Weekly committee report
-- ─────────────────────────────────────────────────────────────────────────────
-- Weekly report: same as 0008 plus "⭐ Adventurer of the week" after the headline.
create or replace function public.build_weekly_report()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  cfg       public.app_config;
  rs        public.report_settings;
  cyc       public.cycles;
  v_cycle   uuid := public.active_cycle_id();
  v_wk      timestamptz := public.week_start();
  v_taken   int;
  v_left    int;
  v_days    int;
  v_active  int;
  v_points  int;
  v_signups int;
  v_pending int;
  v_date    text := trim(to_char(now() at time zone 'America/New_York', 'Mon FMDD, YYYY'));
  v_subject text;
  t         text := '';
  h         text := '';
  r         record;
  td        constant text := '<td style="padding:6px 8px;border-bottom:1px solid #eef1f6;">';
  tdr       constant text := '<td style="padding:6px 8px;border-bottom:1px solid #eef1f6;text-align:right;white-space:nowrap;">';
  th        constant text := '<th style="padding:6px 8px;text-align:left;font-size:12px;color:#5b6475;text-transform:uppercase;border-bottom:2px solid #e3e7ef;">';
  thr       constant text := '<th style="padding:6px 8px;text-align:right;font-size:12px;color:#5b6475;text-transform:uppercase;border-bottom:2px solid #e3e7ef;">';
  tbl       constant text := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">';
  n         int;
  sh        json := public.weekly_shoutout_data();
begin
  select * into cfg from public.app_config where id = 1;
  select * into rs from public.report_settings where id = 1;
  select * into cyc from public.cycles where id = v_cycle;

  v_taken := (select count(*) from public.prize_claims where cycle_id = v_cycle and status <> 'revoked');
  v_left  := greatest(0, cfg.prize_count - v_taken);
  v_days  := greatest(0, ceil(extract(epoch from (cyc.ends_at - now())) / 86400.0))::int;
  v_active := (select count(distinct l.user_id) from public.ledger l join public.profiles p on p.id = l.user_id
                where p.role = 'participant' and l.cycle_id = v_cycle and l.created_at >= v_wk);
  v_points := (select coalesce(sum(greatest(0, l.amount)), 0) from public.ledger l join public.profiles p on p.id = l.user_id
                where p.role = 'participant' and l.cycle_id = v_cycle and l.created_at >= v_wk);
  v_signups := (select count(*) from public.profiles where role = 'participant' and created_at >= v_wk);
  v_pending := (select count(*) from public.submissions s join public.profiles p on p.id = s.user_id
                 where p.role = 'participant' and s.status = 'pending');

  v_subject := format('YACquest weekly report · %s · %s of %s prize spots left', v_date, v_left, cfg.prize_count);

  -- Headline
  t := format(E'YACquest weekly report — %s\n\n', v_date)
    || format(E'PRIZE SPOTS: %s of %s left ($%s gift cards, goal %s points)\n', v_left, cfg.prize_count, cfg.prize_value_usd, cfg.prize_goal)
    || format(E'DAYS LEFT IN CYCLE (%s): %s\n', coalesce(cyc.name, '—'), v_days);
  h := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    || '<td style="width:50%;padding:4px;"><div style="background:#0b2a5b;border-radius:10px;padding:14px;text-align:center;">'
    || '<div style="color:#f2b33d;font-size:30px;font-weight:800;line-height:1;">' || v_left || ' of ' || cfg.prize_count || '</div>'
    || '<div style="color:#ffffff;font-size:13px;margin-top:6px;">prize spots left</div></div></td>'
    || '<td style="width:50%;padding:4px;"><div style="background:#fff6e3;border:1px solid #f2b33d;border-radius:10px;padding:14px;text-align:center;">'
    || '<div style="color:#0b2a5b;font-size:30px;font-weight:800;line-height:1;">' || v_days || '</div>'
    || '<div style="color:#0b2a5b;font-size:13px;margin-top:6px;">days left in ' || public.html_escape(coalesce(cyc.name, 'the cycle')) || '</div></div></td>'
    || '</tr></table>'
    || '<p style="margin:12px 0 0;color:#5b6475;font-size:13px;">Goal: <b>' || cfg.prize_goal || ' points</b> · Prize: <b>$'
    || cfg.prize_value_usd || ' gift card</b> each.</p>';

  -- Adventurer of the week (0009): most points gained in the last 7 days
  t := t || E'\n⭐ ADVENTURER OF THE WEEK\n';
  h := h || public.email_h2('⭐ Adventurer of the week');
  if sh is null then
    t := t || E'  No points earned this week yet.\n';
    h := h || '<p style="margin:0;">No points earned this week yet.</p>';
  else
    t := t || format(E'  %s (%s) — %s points in the last 7 days. Give them a shout-out!\n',
                     sh->>'displayName', public.campus_label(sh->>'campus'), sh->>'pointsThisWeek');
    h := h || '<div style="background:#fff6e3;border:1px solid #f2b33d;border-radius:10px;padding:12px 14px;">'
           || '<div style="font-size:17px;font-weight:700;color:#0b2a5b;">⭐ ' || public.html_escape(sh->>'displayName')
           || ' <span style="font-weight:400;color:#5b6475;font-size:14px;">(' || public.campus_label(sh->>'campus') || ')</span></div>'
           || '<div style="font-size:14px;margin-top:4px;"><b>' || (sh->>'pointsThisWeek') || ' points</b> in the last 7 days. Give them a shout-out!</div></div>';
  end if;

  -- Winners so far
  if v_taken > 0 then
    t := t || E'\nWINNERS SO FAR\n';
    h := h || public.email_h2('Winners so far') || tbl;
    for r in select spot, display_name, campus, status from public.prize_claims
              where cycle_id = v_cycle and status <> 'revoked' order by spot loop
      t := t || format(E'  #%s %s (%s) — %s\n', r.spot, r.display_name, public.campus_label(r.campus),
                       case r.status when 'qualified' then 'waiting for delivery info'
                                     when 'info_submitted' then 'info received, send the gift card'
                                     else 'delivered' end);
      h := h || '<tr>' || td || '<b>#' || r.spot || '</b> ' || public.html_escape(r.display_name)
             || ' <span style="color:#5b6475;">(' || public.campus_label(r.campus) || ')</span></td>' || tdr
             || case r.status when 'qualified' then '<span style="color:#b26a00;">waiting for info</span>'
                              when 'info_submitted' then '<span style="color:#c0392b;font-weight:700;">send gift card</span>'
                              else '<span style="color:#1e8449;">delivered</span>' end
             || '</td></tr>';
    end loop;
    h := h || '</table>';
  end if;

  -- Close to the prize
  t := t || format(E'\nCLOSE TO THE PRIZE (within %s points of %s)\n', rs.near_goal_points, cfg.prize_goal);
  h := h || public.email_h2('🔥 Close to the prize')
         || '<p style="margin:0 0 8px;color:#5b6475;font-size:13px;">Within ' || rs.near_goal_points || ' points of '
         || cfg.prize_goal || ' and no spot yet. Give them a shout-out!</p>';
  n := 0;
  for r in select p.display_name, p.campus, p.points, greatest(0, cfg.prize_goal - p.points) as to_go
             from public.profiles p
            where p.role = 'participant'
              and p.points >= cfg.prize_goal - rs.near_goal_points
              and not exists (select 1 from public.prize_claims c
                               where c.cycle_id = v_cycle and c.user_id = p.id and c.status <> 'revoked')
            order by p.points desc, p.display_name
            limit 25 loop
    if n = 0 then
      h := h || tbl || '<tr>' || th || 'Name</th>' || th || 'Campus</th>' || thr || 'Points</th>' || thr || 'To go</th></tr>';
    end if;
    n := n + 1;
    t := t || format(E'  %s (%s) — %s pts, %s to go\n', r.display_name, public.campus_label(r.campus), r.points, r.to_go);
    h := h || '<tr>' || td || '<b>' || public.html_escape(r.display_name) || '</b></td>' || td || public.campus_label(r.campus)
           || '</td>' || tdr || r.points || '</td>' || tdr
           || '<span style="background:#fff6e3;color:#0b2a5b;border-radius:10px;padding:2px 8px;font-weight:700;">' || r.to_go || '</span></td></tr>';
  end loop;
  if n = 0 then
    t := t || E'  Nobody yet.\n';
    h := h || '<p style="margin:0;">Nobody yet.</p>';
  else
    h := h || '</table>';
  end if;

  -- Top 5
  t := t || E'\nTOP 5 OVERALL\n';
  h := h || public.email_h2('Top 5 overall');
  n := 0;
  for r in select * from public.leaderboard(5, null) loop
    if n = 0 then h := h || tbl; end if;
    n := n + 1;
    t := t || format(E'  %s. %s (%s) — %s pts\n', r.rank, r.display_name, public.campus_label(r.campus), r.points);
    h := h || '<tr>' || td || r.rank || '. ' || public.html_escape(r.display_name)
           || ' <span style="color:#5b6475;">(' || public.campus_label(r.campus) || ')</span></td>' || tdr || '<b>' || r.points || '</b> pts</td></tr>';
  end loop;
  if n = 0 then
    t := t || E'  No participants yet.\n';
    h := h || '<p style="margin:0;">No participants yet.</p>';
  else
    h := h || '</table>';
  end if;

  -- Campus Cup
  t := t || E'\nCAMPUS CUP (points per member)\n';
  h := h || public.email_h2('Campus Cup (points per member)') || tbl;
  for r in select * from public.campus_cup() loop
    t := t || format(E'  %s — %s per member (%s members, %s pts)\n', public.campus_label(r.campus), r.per_capita, r.members, r.total_points);
    h := h || '<tr>' || td || '<b>' || public.campus_label(r.campus) || '</b> <span style="color:#5b6475;">(' || r.members
           || ' members)</span></td>' || tdr || r.per_capita || ' / member</td></tr>';
  end loop;
  h := h || '</table>';

  -- Feedback (last 7 days): general feedback + prize suggestions (0008)
  t := t || E'\nFEEDBACK (last 7 days)\n';
  h := h || public.email_h2('💬 Feedback (last 7 days)');
  n := 0;
  for r in select * from (
             select f.created_at, f.category as cat, f.message as msg, p.display_name, p.campus
               from public.feedback f join public.profiles p on p.id = f.user_id
              where f.created_at >= now() - interval '7 days'
             union all
             select s.created_at, 'prize'::text, s.idea, p.display_name, p.campus
               from public.prize_suggestions s join public.profiles p on p.id = s.user_id
              where s.created_at >= now() - interval '7 days'
           ) x
           order by x.created_at desc
           limit 30 loop
    n := n + 1;
    t := t || format(E'  [%s] %s (%s): %s\n', public.feedback_label(r.cat), r.display_name, public.campus_label(r.campus), r.msg);
    h := h || '<div style="border-left:4px solid #f2b33d;padding:6px 10px;margin:0 0 8px;background:#fffaf0;">'
           || '<div style="font-size:12px;color:#5b6475;"><b>' || public.feedback_label(r.cat) || '</b> · '
           || public.html_escape(r.display_name) || ' (' || public.campus_label(r.campus) || ')</div>'
           || '<div style="font-size:14px;white-space:pre-wrap;">' || public.html_escape(r.msg) || '</div></div>';
  end loop;
  if n = 0 then
    t := t || E'  No new feedback this week.\n';
    h := h || '<p style="margin:0;">No new feedback this week.</p>';
  else
    h := h || '<p style="margin:4px 0 0;font-size:13px;">See and mark reviewed in YACquest → Admin → Feedback.</p>';
  end if;

  -- This week
  t := t || E'\nTHIS WEEK (since Monday)\n'
         || format(E'  Active participants: %s\n  Points awarded: %s\n  New sign-ups: %s\n', v_active, v_points, v_signups)
         || format(E'\nPENDING REVIEWS: %s\n', v_pending);
  h := h || public.email_h2('This week (since Monday)') || tbl
         || '<tr>' || td || 'Active participants</td>' || tdr || '<b>' || v_active || '</b></td></tr>'
         || '<tr>' || td || 'Points awarded</td>' || tdr || '<b>' || v_points || '</b></td></tr>'
         || '<tr>' || td || 'New sign-ups</td>' || tdr || '<b>' || v_signups || '</b></td></tr>'
         || '<tr>' || td || 'Pending reviews</td>' || tdr
         || case when v_pending > 0 then '<b style="color:#c0392b;">' || v_pending || '</b>' else '<b>0</b>' end || '</td></tr>'
         || '</table>';
  if v_pending > 0 then
    h := h || '<p style="margin:12px 0 0;">Please open YACquest → Admin → Review to clear the queue.</p>';
  end if;

  return json_build_object('subject', v_subject, 'text', t, 'html', public.email_layout('Weekly committee report · ' || v_date, h));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Weekly report queueing + winner notification
-- ─────────────────────────────────────────────────────────────────────────────
-- Called by the Edge Function (service_role) or pg_cron. Queues this week's report once
-- and (0009) notifies the Adventurer of the Week when it does.
create or replace function public.enqueue_weekly_report_if_due()
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  rs     public.report_settings;
  v_now  timestamp := now() at time zone 'America/New_York';
  v_due  timestamp;
  v_to   text[];
  rep    json;
  v_new  boolean;
  sh     json;
begin
  perform public.require_service_role();
  select * into rs from public.report_settings where id = 1;
  if rs.id is null or not rs.weekly_enabled then
    return false;
  end if;
  -- ISO week starts Monday; weekly_day 0 = Sunday = last day of the ISO week.
  v_due := date_trunc('week', v_now) + make_interval(days => (rs.weekly_day + 6) % 7, hours => rs.weekly_hour);
  if v_now < v_due then
    return false;
  end if;
  v_to := public.report_recipients();
  if cardinality(v_to) = 0 then
    return false;
  end if;
  if exists (select 1 from public.email_outbox where dedupe_key = 'weekly:' || to_char(v_now, 'IYYY-IW')) then
    return false;
  end if;
  rep := public.build_weekly_report();
  v_new := public.enqueue_email('weekly_report', v_to, rep->>'subject', rep->>'text', rep->>'html',
                                'weekly:' || to_char(v_now, 'IYYY-IW'));
  -- 0009: this week's report was really queued → tell the Adventurer of the Week (once per week).
  if v_new then
    sh := public.weekly_shoutout_data();
    if sh is not null then
      perform public.notify((sh->>'userId')::uuid, 'announcement', '⭐ You’re Adventurer of the Week!',
        format('You earned %s points in the last 7 days — more than any other adventurer. Keep questing!',
               sh->>'pointsThisWeek'));
    end if;
  end if;
  return v_new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
grant select on public.cosmetics to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.cosmetics from anon, authenticated;

-- internal helpers: nobody through the API
revoke execute on function
  public.badges_for(uuid), public.unlocks_for(uuid), public.weekly_shoutout_data(),
  public.build_weekly_report(), public.enqueue_weekly_report_if_due()
from public, anon, authenticated, service_role;

-- user-callable RPCs
revoke execute on function
  public.my_badges(), public.my_unlocks(), public.equip_look(text, text, text), public.weekly_shoutout(),
  public.leaderboard(int, varchar), public.my_rank(text)
from public, anon;
grant execute on function
  public.my_badges(), public.my_unlocks(), public.equip_look(text, text, text), public.weekly_shoutout(),
  public.leaderboard(int, varchar), public.my_rank(text)
to authenticated;

-- Edge Function `send-emails` (service_role key) only, as in 0004
grant execute on function public.enqueue_weekly_report_if_due() to service_role;

-- Done.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 — Event RSVPs, monthly check-in streaks, "My Quest Card" recap.
--   Everything here is ADDITIVE: no existing rule, point value or cap changes.
--
--   • RSVPs: table event_rsvps (event_id, user_id, created_at; PK both). RLS on; people can
--     read their own rows; all writes go through set_rsvp(). No points for RSVPs.
--       - set_rsvp(p_event_id, p_going) → json {eventId, going, goingCount}. Any signed-in
--         person (participants + staff), events of the active cycle only. Toggling (on OR off)
--         closes when the event starts ('closed'). Idempotent.
--       - event_rsvp_summary() → json [{eventId, goingCount, myRsvp}] for the active cycle's
--         events (counts only — participant-safe). The Quests screen merges it into the list.
--       - admin_event_rsvps(p_event_id) (admins + chairs; participants 'forbidden') → who is
--         going: name, handle, campus, email, RSVP time, and whether they checked in.
--       - admin_event_rsvp_counts() (admins + chairs) → per event: going, and how many of
--         those checked in ("RSVP'd but didn't come" = going − going_came, for past events).
--   • Monthly streaks: checkin_streak(user) (internal). A streak = consecutive America/New_York
--     calendar months of the active cycle with at least one event check-in (ledger
--     source 'checkin'). The current streak counts back from this month; if this month has no
--     check-in yet it still counts through last month (this_month = false → "keep it going").
--     best = longest run this cycle. my_streak() → json {current, best, checkedInThisMonth}.
--   • New participant badge "Hot Streak" (hot_streak, 16th, goal 3, progress = best streak):
--     badges_for() is a copy of 0018's + that one row. Staff Council badges are unchanged.
--     (Rainbow still needs 6 badges; Hot Streak counts toward it like any other badge.)
--   • my_recap(): the caller's own stats for the shareable "My Quest Card" (no user argument,
--     so nobody can read someone else's). Participants get campus/overall rank; staff get
--     their Council badge count instead (and no rank).
--   • build_weekly_report(): copy of 0015 + one line: events in the next 7 days with RSVP
--     counts ("📅 NEXT 7 DAYS (RSVPs): …"), just before "This week".
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0021. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RSVP table (RLS: read your own rows; writes only through set_rsvp)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_rsvps_user on public.event_rsvps (user_id);

alter table public.event_rsvps enable row level security;
revoke all on public.event_rsvps from anon, authenticated;
grant select on public.event_rsvps to authenticated;
drop policy if exists event_rsvps_read_own on public.event_rsvps;
create policy event_rsvps_read_own on public.event_rsvps for select to authenticated using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RSVP API
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_rsvp(p_event_id uuid, p_going boolean)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  e     public.events;
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null or e.cycle_id is distinct from public.active_cycle_id() then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  if p_going is null then
    perform public.api_error('going', 'Say whether you’re going.');
  end if;
  if now() >= e.starts_at then
    perform public.api_error('closed', 'RSVPs close when the event starts.');
  end if;
  if p_going then
    insert into public.event_rsvps (event_id, user_id) values (e.id, v_uid) on conflict do nothing;
  else
    delete from public.event_rsvps where event_id = e.id and user_id = v_uid;
  end if;
  return json_build_object('eventId', e.id, 'going', p_going,
                           'goingCount', (select count(*) from public.event_rsvps r where r.event_id = e.id));
end $$;

create or replace function public.event_rsvp_summary()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare v_uid uuid := public.require_user();
begin
  return (
    select coalesce(json_agg(json_build_object(
             'eventId', e.id,
             'goingCount', (select count(*) from public.event_rsvps r where r.event_id = e.id),
             'myRsvp', exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = v_uid))
           order by e.starts_at, e.id), '[]'::json)
      from public.events e
     where e.cycle_id = public.active_cycle_id());
end $$;

create or replace function public.admin_event_rsvps(p_event_id uuid)
returns table (user_id uuid, display_name text, handle text, campus text, email text, rsvp_at timestamptz, checked_in boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    perform public.require_user();
    perform public.api_error('forbidden', 'Only YAC admins and chairs can see who’s going.');
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  return query
    select r.user_id, p.display_name, p.handle::text, p.campus, p.email::text, r.created_at,
           exists (select 1 from public.ledger l where l.user_id = r.user_id and l.source = 'checkin' and l.ref_id = p_event_id::text)
      from public.event_rsvps r join public.profiles p on p.id = r.user_id
     where r.event_id = p_event_id
     order by r.created_at, p.display_name, r.user_id;
end $$;

create or replace function public.admin_event_rsvp_counts()
returns table (event_id uuid, going int, going_came int)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
    select r.event_id, count(*)::int,
           count(*) filter (where exists (select 1 from public.ledger l
                                           where l.user_id = r.user_id and l.source = 'checkin' and l.ref_id = r.event_id::text))::int
      from public.event_rsvps r
     group by r.event_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Monthly check-in streaks
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal. Months are America/New_York calendar months, as an index (year*12 + month-1).
create or replace function public.checkin_streak(p_user uuid)
returns table (current_streak int, best_streak int, this_month boolean)
language sql stable security definer set search_path = public, extensions as $$
  with m as (
    select distinct (extract(year from l.created_at at time zone 'America/New_York')::int * 12
                     + extract(month from l.created_at at time zone 'America/New_York')::int - 1) as idx
      from public.ledger l
     where l.user_id = p_user and l.cycle_id = public.active_cycle_id()
       and l.source = 'checkin' and l.amount > 0
  ),
  runs as (
    select min(g.idx) as lo, max(g.idx) as hi, count(*)::int as len
      from (select m.idx, m.idx - row_number() over (order by m.idx) as grp from m) g
     group by g.grp
  ),
  cur as (
    select extract(year from now() at time zone 'America/New_York')::int * 12
           + extract(month from now() at time zone 'America/New_York')::int - 1 as idx
  )
  select
    coalesce((select runs.len from runs, cur where runs.hi in (cur.idx, cur.idx - 1) order by runs.hi desc limit 1), 0),
    coalesce((select max(runs.len) from runs), 0),
    exists (select 1 from m, cur where m.idx = cur.idx);
$$;

create or replace function public.my_streak()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  s     record;
begin
  select * into s from public.checkin_streak(v_uid);
  return json_build_object('current', s.current_streak, 'best', s.best_streak, 'checkedInThisMonth', s.this_month);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Badges: copy of 0018's badges_for() + "Hot Streak" (16th, best streak ≥ 3)
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
        where ms.user_id = p_user and ms.place = 1 and ms.final)::int as month_wins,
      (select cs.best_streak from public.checkin_streak(p_user) cs) as best_streak   -- 0022
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
    union all select 16, 'hot_streak',    s.best_streak, 3           from s   -- 0022
  )
  select raw.bid, raw.val >= raw.bgoal, least(greatest(raw.val, 0), raw.bgoal), raw.bgoal
    from raw order by raw.ord;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. "My Quest Card" recap: the caller's own stats only
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.my_recap()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := public.require_user();
  v_cycle uuid := public.active_cycle_id();
  me      public.profiles;
  cyc     public.cycles;
  s       record;
  r       jsonb;
begin
  select * into me from public.profiles where id = v_uid;
  select * into cyc from public.cycles where id = v_cycle;
  select * into s from public.checkin_streak(v_uid);
  r := jsonb_build_object(
    'displayName', me.display_name, 'handle', me.handle, 'campus', me.campus, 'role', me.role,
    'avatar', me.avatar, 'hat', me.hat, 'accessory', me.accessory, 'background', me.background,
    'points', me.points,
    'earnedBadgeIds', (select coalesce(jsonb_agg(b.id order by b.ord), '[]'::jsonb)
                         from public.badges_for(v_uid) with ordinality as b (id, earned, progress, goal, ord) where b.earned),
    'badgeTotal', (select count(*) from public.badges_for(v_uid)),
    'eventsAttended', (select count(distinct l.ref_id) from public.ledger l
                        where l.user_id = v_uid and l.cycle_id = v_cycle and l.source = 'checkin' and l.amount > 0),
    'currentStreak', s.current_streak, 'bestStreak', s.best_streak,
    'monthWins', (select count(*) from public.monthly_standings() ms where ms.user_id = v_uid and ms.place = 1 and ms.final),
    'cycleName', cyc.name, 'cycleEndsAt', cyc.ends_at);
  r := r || jsonb_build_object('badgesEarned', jsonb_array_length(r->'earnedBadgeIds'));
  if me.role = 'participant' then
    r := r || jsonb_build_object(
      'rankOverall', 1 + (select count(*) from public.profiles o where o.role = 'participant' and o.points > me.points),
      'rankCampus', 1 + (select count(*) from public.profiles o where o.role = 'participant' and o.campus = me.campus and o.points > me.points),
      'participants', (select count(*) from public.profiles o where o.role = 'participant'),
      'campusParticipants', (select count(*) from public.profiles o where o.role = 'participant' and o.campus = me.campus));
  else
    -- staff-only info stays on staff cards
    r := r || jsonb_build_object('councilBadges', (select count(*) from public.staff_badges_for(v_uid) b where b.earned));
  end if;
  return r::json;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Weekly committee report: copy of 0015 + one "next 7 days (RSVPs)" line
-- ─────────────────────────────────────────────────────────────────────────────
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
  sh        json := public.monthly_shoutout_data();
  v_month   text;
  v_next_t  text;  -- 0022
  v_next_h  text;  -- 0022
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

  -- Adventurer of the month (0012): last completed month's winner, else this month's leader so far
  t := t || E'\n⭐ ADVENTURER OF THE MONTH\n';
  h := h || public.email_h2('⭐ Adventurer of the month');
  if sh is null then
    t := t || E'  No points earned this month yet.\n';
    h := h || '<p style="margin:0;">No points earned this month yet.</p>';
  else
    v_month := public.month_label(sh->>'month');
    if (sh->>'final')::boolean then
      t := t || format(E'  %s (%s) — %s points in %s. Give them a shout-out!\n',
                       sh->>'displayName', public.campus_label(sh->>'campus'), sh->>'pointsThisMonth', v_month);
    else
      t := t || format(E'  Leading %s so far: %s (%s) — %s points. Give them a shout-out!\n',
                       v_month, sh->>'displayName', public.campus_label(sh->>'campus'), sh->>'pointsThisMonth');
    end if;
    h := h || '<div style="background:#fff6e3;border:1px solid #f2b33d;border-radius:10px;padding:12px 14px;">'
           || case when (sh->>'final')::boolean then ''
                   else '<div style="font-size:12px;color:#5b6475;text-transform:uppercase;">Leading ' || v_month || ' so far</div>' end
           || '<div style="font-size:17px;font-weight:700;color:#0b2a5b;">⭐ ' || public.html_escape(sh->>'displayName')
           || ' <span style="font-weight:400;color:#5b6475;font-size:14px;">(' || public.campus_label(sh->>'campus') || ')</span></div>'
           || '<div style="font-size:14px;margin-top:4px;"><b>' || (sh->>'pointsThisMonth') || ' points</b> in ' || v_month
           || case when (sh->>'final')::boolean then '' else ' so far' end || '. Give them a shout-out!</div></div>';
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
             -- 0013: anonymous feedback never carries the sender's name or campus into the email
             select f.created_at, f.category as cat, f.message as msg, f.anonymous as anon,
                    case when f.anonymous then null else p.display_name end as display_name,
                    case when f.anonymous then null else p.campus end as campus
               from public.feedback f join public.profiles p on p.id = f.user_id
              where f.created_at >= now() - interval '7 days'
             union all
             select s.created_at, 'prize'::text, s.idea, false, p.display_name, p.campus
               from public.prize_suggestions s join public.profiles p on p.id = s.user_id
              where s.created_at >= now() - interval '7 days'
           ) x
           order by x.created_at desc
           limit 30 loop
    n := n + 1;
    if r.anon then
      t := t || format(E'  [%s] Anonymous: %s\n', public.feedback_label(r.cat), r.msg);
    else
      t := t || format(E'  [%s] %s (%s): %s\n', public.feedback_label(r.cat), r.display_name, public.campus_label(r.campus), r.msg);
    end if;
    h := h || '<div style="border-left:4px solid #f2b33d;padding:6px 10px;margin:0 0 8px;background:#fffaf0;">'
           || '<div style="font-size:12px;color:#5b6475;"><b>' || public.feedback_label(r.cat) || '</b> · '
           || case when r.anon then 'Anonymous'
                   else public.html_escape(r.display_name) || ' (' || public.campus_label(r.campus) || ')' end || '</div>'
           || '<div style="font-size:14px;white-space:pre-wrap;">' || public.html_escape(r.msg) || '</div></div>';
  end loop;
  if n = 0 then
    t := t || E'  No new feedback this week.\n';
    h := h || '<p style="margin:0;">No new feedback this week.</p>';
  else
    h := h || '<p style="margin:4px 0 0;font-size:13px;">See and mark reviewed in YACquest → Admin → Feedback.</p>';
  end if;

  -- 0022: one line — events in the next 7 days with their RSVP counts
  select string_agg(format('%s (%s) · %s going', e.title, trim(to_char(e.starts_at at time zone 'America/New_York', 'Dy Mon FMDD')), x.n), '; ' order by e.starts_at, e.id),
         string_agg('<b>' || public.html_escape(e.title) || '</b> (' || trim(to_char(e.starts_at at time zone 'America/New_York', 'Dy Mon FMDD'))
                    || ') · ' || x.n || ' going', '; ' order by e.starts_at, e.id)
    into v_next_t, v_next_h
    from public.events e
    cross join lateral (select count(*)::int as n from public.event_rsvps rv where rv.event_id = e.id) x
   where e.cycle_id = v_cycle and e.starts_at >= now() and e.starts_at < now() + interval '7 days';
  t := t || E'\n📅 NEXT 7 DAYS (RSVPs): ' || coalesce(v_next_t, 'No events scheduled.') || E'\n';
  h := h || '<p style="margin:16px 0 0;font-size:14px;">📅 <b>Next 7 days (RSVPs):</b> ' || coalesce(v_next_h, 'No events scheduled.') || '</p>';

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

  -- 0015: Yak of the week (footer line)
  t := t || E'\n🐂 Yak of the week: ' || public.yak_pun_of_the_week() || E'\n';
  h := h || '<p style="margin:18px 0 0;color:#5b6475;font-size:13px;font-style:italic;">🐂 Yak of the week: ' || public.html_escape(public.yak_pun_of_the_week()) || '</p>';

  return json_build_object('subject', v_subject, 'text', t, 'html', public.email_layout('Weekly committee report · ' || v_date, h));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.badges_for(uuid), public.checkin_streak(uuid), public.build_weekly_report()
from public, anon, authenticated, service_role;

revoke execute on function
  public.set_rsvp(uuid, boolean), public.event_rsvp_summary(), public.admin_event_rsvps(uuid),
  public.admin_event_rsvp_counts(), public.my_streak(), public.my_recap()
from public, anon;
grant execute on function
  public.set_rsvp(uuid, boolean), public.event_rsvp_summary(), public.admin_event_rsvps(uuid),
  public.admin_event_rsvp_counts(), public.my_streak(), public.my_recap()
to authenticated;

-- Done.

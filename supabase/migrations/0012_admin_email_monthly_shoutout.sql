-- ═══════════════════════════════════════════════════════════════════════════
-- 0012 — Admins can email everyone; Adventurer of the Month (+ badge).
--
--   • send_announcement(): admins (not only chairs) may send audience 'all' with
--     email. Participants still can't send announcements at all.
--   • monthly_shoutout() replaces weekly_shoutout(): "Adventurer of the Month".
--     Calendar months in America/New_York, participants only, positive ledger rows
--     of the ACTIVE cycle only.
--       – Shows the winner of the most recent COMPLETED month (last month) → final = true.
--       – If nobody earned points last month in this cycle (e.g. the cycle started this
--         month), falls back to this month's leader so far → final = false.
--       – Ties: whoever reached their month total first (earliest time of their last
--         positive row that month), then display name, then id.
--   • New badge 'monthly_star' (Adventurer of the Month): final winner of any
--     completed month in this cycle, same rule. The badge list is now 15 long.
--   • The weekly committee email stays weekly but shows the monthly shout-out. When a
--     report is queued and last month is final, the winner is notified (once a month).
-- Run AFTER 0011. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. send_announcement — admin or chair; either may email everyone.
--    Same signature and rules as 0006 except the chair-only email check.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.send_announcement(
  p_title text, p_body text, p_audience text,
  p_campus text default null, p_user_id uuid default null, p_send_email boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin    uuid := public.require_admin();
  v_title    text := trim(coalesce(p_title, ''));
  v_body     text := trim(coalesce(p_body, ''));
  v_id       uuid;
  v_targets  uuid[];
  v_emails   text[];
  v_count    int;
  v_emailed  int := 0;
  v_chunk    text[];
  v_i        int := 0;
  v_html     text;
  v_today    int;
begin
  if char_length(v_title) < 3 or char_length(v_title) > 80 then
    perform public.api_error('title', 'Title: 3–80 characters.');
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    perform public.api_error('body', 'Message: 1–1000 characters.');
  end if;
  if p_audience not in ('all', 'campus', 'user') then
    perform public.api_error('audience', 'Choose who gets this message.');
  end if;
  if p_audience = 'campus' and coalesce(p_campus, '') not in ('duke', 'unc', 'ncsu') then
    perform public.api_error('campus', 'Pick a campus.');
  end if;
  if p_audience = 'user' and not exists (select 1 from public.profiles where id = p_user_id) then
    perform public.api_error('user', 'Pick the person to message.');
  end if;
  -- 0012: admins and chairs may email everyone (require_admin above keeps participants out).

  -- Simple spam guard: 20 announcements per sender per day.
  select count(*) into v_today from public.announcements
   where created_by = v_admin and created_at > now() - interval '1 day';
  if v_today >= 20 then
    perform public.api_error('limit', 'You''ve sent 20 messages today. Try again tomorrow.');
  end if;

  select coalesce(array_agg(p.id), '{}') into v_targets
    from public.profiles p
   where case p_audience
           when 'all'    then true
           when 'campus' then p.campus = p_campus
           else p.id = p_user_id
         end;
  v_count := cardinality(v_targets);
  if v_count = 0 then
    perform public.api_error('audience', 'Nobody matches that audience yet.');
  end if;

  insert into public.announcements (title, body, audience, campus, target_user_id, send_email, recipient_count, created_by)
  values (v_title, v_body, p_audience,
          case when p_audience = 'campus' then p_campus end,
          case when p_audience = 'user' then p_user_id end,
          coalesce(p_send_email, false), v_count, v_admin)
  returning id into v_id;

  insert into public.notifications (user_id, kind, title, body)
  select t, 'announcement', v_title, v_body from unnest(v_targets) t;

  if coalesce(p_send_email, false) then
    select coalesce(array_agg(distinct lower(u.email::text)), '{}') into v_emails
      from public.profiles p join auth.users u on u.id = p.id
     where p.id = any (v_targets)
       and u.email_confirmed_at is not null and u.email is not null
       and (p.email_opt_in or p_audience = 'user');   -- a direct message always emails that person
    v_emailed := cardinality(v_emails);
    v_html := public.email_layout(v_title,
      '<p style="font-size:16px;line-height:1.5;white-space:pre-wrap;margin:0 0 16px">' || public.html_escape(v_body) || '</p>'
      || '<p style="font-size:13px;color:#4a5672;margin:0">Sent by ' || public.html_escape(coalesce(public.display_name_of(v_admin), 'YAC'))
      || ' via YACquest. Change email updates in the app under Me → Settings.</p>');
    while v_i * 90 < v_emailed loop
      v_chunk := v_emails[v_i * 90 + 1 : (v_i + 1) * 90];
      perform public.enqueue_email('announcement', v_chunk, '📣 YACquest: ' || v_title,
        v_body || E'\n\n— Sent via YACquest. Change email updates in the app under Me → Settings.',
        v_html, 'announcement:' || v_id || ':' || v_i);
      v_i := v_i + 1;
    end loop;
    update public.announcements set email_count = v_emailed where id = v_id;
  end if;

  perform public.log_admin_action(v_admin, 'announcement_sent',
    case when p_audience = 'user' then p_user_id end,
    jsonb_build_object('title', v_title, 'audience', p_audience, 'campus', p_campus,
                       'recipients', v_count, 'emailed', v_emailed));

  return json_build_object('id', v_id, 'recipients', v_count, 'emailed', v_emailed);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Monthly standings + Adventurer of the Month
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal: 'YYYY-MM' → 'November'.
create or replace function public.month_label(p_month text)
returns text language sql immutable set search_path = public, extensions as $$
  select trim(to_char(to_date(p_month || '-01', 'YYYY-MM-DD'), 'FMMonth'));
$$;

-- Internal: each participant's positive points per NY calendar month in the active cycle.
-- place 1 = that month's leader (ties → reached the total first, then name, then id).
-- final = the month is over (before the current NY month).
create or replace function public.monthly_standings()
returns table (month text, user_id uuid, pts int, reached_at timestamptz, place int, final boolean)
language sql stable security definer set search_path = public, extensions as $$
  with cur as (select date_trunc('month', now() at time zone 'America/New_York') as m0),
  g as (
    select date_trunc('month', l.created_at at time zone 'America/New_York') as m, l.user_id,
           sum(l.amount)::int as pts, max(l.created_at) as reached_at
      from public.ledger l
      join public.profiles p on p.id = l.user_id and p.role = 'participant'
     where l.cycle_id = public.active_cycle_id() and l.amount > 0
     group by 1, 2
  )
  select to_char(g.m, 'YYYY-MM'), g.user_id, g.pts, g.reached_at,
         (row_number() over (partition by g.m order by g.pts desc, g.reached_at asc, p.display_name asc, g.user_id))::int,
         g.m < cur.m0
    from g cross join cur
    join public.profiles p on p.id = g.user_id;
$$;

-- Internal: last month's winner (final) or, if nobody earned points last month,
-- this month's leader so far (not final). null if nobody earned points in either.
create or replace function public.monthly_shoutout_data()
returns json language sql stable security definer set search_path = public, extensions as $$
  with cur as (select date_trunc('month', now() at time zone 'America/New_York') as m0),
  w as (
    select s.* from public.monthly_standings() s, cur
     where s.place = 1
       and s.month in (to_char(cur.m0 - interval '1 month', 'YYYY-MM'), to_char(cur.m0, 'YYYY-MM'))
     order by s.final desc
     limit 1
  )
  select json_build_object('userId', p.id, 'displayName', p.display_name, 'campus', p.campus, 'avatar', p.avatar,
                           'hat', p.hat, 'accessory', p.accessory, 'background', p.background,
                           'look', json_build_object('hat', p.hat, 'accessory', p.accessory, 'background', p.background),
                           'pointsThisMonth', w.pts, 'month', w.month, 'final', w.final)
    from w join public.profiles p on p.id = w.user_id;
$$;

-- Any logged-in user.
create or replace function public.monthly_shoutout()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_user();
  return public.monthly_shoutout_data();
end $$;

-- The weekly shout-out is gone (a full re-run of 0009 re-creates it; this drops it again).
drop function if exists public.weekly_shoutout();
drop function if exists public.weekly_shoutout_data();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Badges: 0009's 14 (unchanged) + 'monthly_star' (15th, order of src/lib/badges.ts)
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal: badges for any user (not callable through the API). my_badges() /
-- unlocks_for() from 0009 call this, so they pick the new badge up automatically.
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
      coalesce((select c.prize_goal from public.app_config c where c.id = 1), 650) as prize_goal,
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
    union all select 13, 'halfway',       s.pts,         325         from s
    union all select 14, 'legend',        s.pts,         s.prize_goal from s
    union all select 15, 'monthly_star',  s.month_wins,  1           from s
  )
  select raw.bid, raw.val >= raw.bgoal, least(greatest(raw.val, 0), raw.bgoal), raw.bgoal
    from raw order by raw.ord;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Weekly committee report (still weekly) with the monthly shout-out
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
-- 5. Weekly report queueing + Adventurer of the Month notification
-- ─────────────────────────────────────────────────────────────────────────────
-- Called by the Edge Function (service_role) or pg_cron. Queues this week's report once.
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
  -- 0012: when a report is really queued and last month is final, tell the Adventurer of the Month
  -- (once per calendar month: the winner of month M is announced during month M+1).
  if v_new then
    sh := public.monthly_shoutout_data();
    if sh is not null and (sh->>'final')::boolean
       and not exists (select 1 from public.notifications n
                        where n.user_id = (sh->>'userId')::uuid and n.kind = 'announcement'
                          and n.title = '⭐ You’re Adventurer of the Month!'
                          and n.created_at >= date_trunc('month', v_now) at time zone 'America/New_York') then
      perform public.notify((sh->>'userId')::uuid, 'announcement', '⭐ You’re Adventurer of the Month!',
        format('You earned %s points in %s — more than any other adventurer. Keep questing!',
               sh->>'pointsThisMonth', public.month_label(sh->>'month')));
    end if;
  end if;
  return v_new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
-- internal helpers: nobody through the API
revoke execute on function
  public.month_label(text), public.monthly_standings(), public.monthly_shoutout_data(),
  public.badges_for(uuid), public.build_weekly_report(), public.enqueue_weekly_report_if_due()
from public, anon, authenticated, service_role;

-- user-callable RPCs
revoke execute on function
  public.send_announcement(text, text, text, text, uuid, boolean), public.monthly_shoutout()
from public, anon;
grant execute on function
  public.send_announcement(text, text, text, text, uuid, boolean), public.monthly_shoutout()
to authenticated;

-- Edge Function `send-emails` (service_role key) only, as in 0004
grant execute on function public.enqueue_weekly_report_if_due() to service_role;

-- Done.

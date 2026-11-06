-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — Consistency pass (no rule changes).
--   Brings the last stale values in the database in line with the app (src/config.ts):
--   • app_config column defaults: tier1_points 35 (was 40 from 0001; the row has been 35
--     since 0003) and max_chairs 6 (was 5 from 0011; the row has been 6 since 0011).
--   • badges_for(): copy of 0014; only the fallback goal used when app_config has no row
--     changes from 350 to 300. Halfway stays half the goal (150), Quest Legend = the goal (300).
--   • handle_new_user(): copy of 0013; only the chair-bootstrap fallback limit (used if
--     app_config.max_chairs were null) changes from 5 to 6.
--   • send_announcement(): copy of 0012; only the email footer changes. It now names the
--     real setting, “Email me announcements from YAC” (there is no participant weekly email).
--   Nothing else changes: same signatures, same rules, same grants.
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0016. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Column defaults (the existing row already has these values)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.app_config alter column tier1_points set default 35;
alter table public.app_config alter column max_chairs set default 6;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Badges: copy of 0014's badges_for(); fallback goal 350 → 300
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
      coalesce((select c.prize_goal from public.app_config c where c.id = 1), 300) as prize_goal,
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
-- 3. Sign-up trigger: copy of 0013's handle_new_user(); bootstrap fallback 5 → 6
--    (the on_auth_user_created trigger from 0001 keeps pointing at this function)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_handle    text  := nullif(trim(meta->>'handle'), '');
  v_name      text  := nullif(trim(meta->>'display_name'), '');
  v_campus    text  := coalesce(nullif(meta->>'campus', ''), 'unc');
  v_avatar    text  := coalesce(nullif(meta->>'avatar', ''), 'yak');
  v_code      text  := nullif(upper(trim(meta->>'friend_code')), '');
  -- 0013: the sign-up checkbox "Email me announcements from YAC". Missing → on (as before).
  v_opt_in    boolean := coalesce(lower(trim(meta->>'email_opt_in')), 'true') not in ('false', 'f', '0', 'no', 'off');
  v_local     text  := split_part(coalesce(new.email, ''), '@', 1);
  v_referrer  uuid;
  v_role      text  := 'participant';
  cfg         public.app_config;
begin
  select * into cfg from public.app_config where id = 1;

  if v_handle is null then
    -- fallback: email local part, cleaned, plus digits if taken
    v_handle := left(regexp_replace(v_local, '[^a-zA-Z0-9_.]', '', 'g'), 15);
    if length(v_handle) < 3 then v_handle := 'user' || v_handle; end if;
    if not public.name_is_clean(v_handle) then
      v_handle := 'player' || floor(random() * 10000)::int;
    end if;
    while exists (select 1 from public.profiles where handle = v_handle::citext) loop
      v_handle := left(v_handle, 15) || floor(random() * 10000)::int;
    end loop;
  elsif v_handle !~ '^[a-zA-Z0-9_.]{3,20}$' then
    perform public.api_error('handle', 'Username: 3–20 letters, numbers, dots or underscores.');
  elsif not public.name_is_clean(v_handle) then
    perform public.api_error('handle', 'Please pick a different name — keep it friendly for everyone.');
  elsif exists (select 1 from public.profiles where handle = v_handle::citext) then
    perform public.api_error('handle', 'That username is taken.');
  end if;

  if v_name is not null and not public.name_is_clean(v_name) then
    perform public.api_error('displayName', 'Please pick a different name — keep it friendly for everyone.');
  end if;
  v_name := coalesce(v_name, left(v_local, 24));
  -- fallback name from the email must be clean too; the handle always is.
  if char_length(v_name) < 2 or not public.name_is_clean(v_name) then v_name := v_handle; end if;
  if char_length(v_name) > 24 then
    perform public.api_error('displayName', 'Display name: 2–24 characters.');
  end if;
  if v_campus not in ('duke','unc','ncsu') then
    perform public.api_error('campus', 'Pick your campus.');
  end if;
  if v_avatar not in ('yak','unicorn','dragon','knight','mage','ranger') then
    v_avatar := 'yak';
  end if;

  if v_code is not null then
    select id into v_referrer from public.profiles where friend_code = v_code;
    if v_referrer is null then
      perform public.api_error('friendCode', 'We couldn’t find that friend code.');
    end if;
  end if;

  -- Bootstrap chairs (never more than app_config.max_chairs chairs).
  if exists (select 1 from public.chair_bootstrap where email = new.email::citext)
     and (select count(*) from public.profiles where role = 'chair') < coalesce(cfg.max_chairs, 6) then
    v_role := 'chair';
  end if;

  insert into public.profiles (id, handle, display_name, email, campus, role, avatar, friend_code, referred_by, email_opt_in)
  values (new.id, v_handle, v_name, new.email, v_campus, v_role, v_avatar, public.make_friend_code(), v_referrer, v_opt_in);

  perform public.notify(new.id, 'announcement', 'Welcome to YACquest!',
    format('Earn points all year. The first %s people to reach %s win a $%s gift card.',
           cfg.prize_count, cfg.prize_goal, cfg.prize_value_usd));
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Announcements: copy of 0012's send_announcement(); email footer names the setting
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
      || ' via YACquest. To stop announcement emails, turn off “Email me announcements from YAC” in the app under Me → Settings.</p>');
    while v_i * 90 < v_emailed loop
      v_chunk := v_emails[v_i * 90 + 1 : (v_i + 1) * 90];
      perform public.enqueue_email('announcement', v_chunk, '📣 YACquest: ' || v_title,
        v_body || E'\n\n— Sent via YACquest. To stop announcement emails, turn off “Email me announcements from YAC” in the app under Me → Settings.',
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
-- 5. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.badges_for(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.send_announcement(text, text, text, text, uuid, boolean) from public, anon;
grant  execute on function public.send_announcement(text, text, text, text, uuid, boolean) to authenticated;

-- Done.

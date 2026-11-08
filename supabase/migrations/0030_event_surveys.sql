-- =============================================================================
-- YACquest 0030 — in-app event feedback survey (+5 for attendees)
-- =============================================================================
-- ADDITIVE and safe to re-run. No downtime: one new table, a new activity row, two widened CHECK
-- constraints (added NOT VALID, then validated), new functions, and four functions re-created with
-- small additions. Nothing is dropped or renamed; no existing rows change.
--
--   • Activity 'event_survey' — "Event feedback survey", Tier 3 (tier_points(3) = 5), method
--     'event_survey' (activities.method check widened). Once per person per event. It is NOT a
--     screenshot quest, so it never counts toward the weekly digital cap (that cap only counts
--     tier-3 SUBMISSIONS). The existing screenshot quest 'survey' ("Complete a Feedback Survey")
--     is unchanged and still covers external surveys (events.survey_url, emails…).
--   • ledger.source gets 'survey' (check widened). Unique index ledger_one_survey (user_id, ref_id)
--     where source = 'survey' — ref_id = the event id — so points can never be paid twice.
--   • Table event_surveys (id, event_id, user_id, rating 1–5, favorite ≤300, least_favorite ≤300,
--     comments ≤1000, anonymous, created_at; unique (event_id, user_id)).
--     RLS: a signed-in user can SELECT only their own rows. No direct writes. Staff read results
--     only through admin_event_survey(), which hides the name of anonymous responses.
--   • Window: anyone who CHECKED IN can answer from their check-in moment until 14 days after the
--     event ends (survey_window_open(ends_at, now)).
--   • RPCs (signed in):
--       submit_event_survey(p_event_id, p_rating, p_favorite, p_least_favorite, p_comments, p_anonymous)
--         → {eventId, points, surveyId}. Saves the response AND awards the points in one transaction.
--         Errors: not_found, not_attended, closed, rating, favorite, least_favorite, comments, duplicate.
--       my_survey_status(p_event_id) → {eventId, title, startsAt, endsAt, checkedIn, done, closesAt, open, points}
--   • RPCs (admins + YACquest Chairs):
--       admin_event_survey(p_event_id) → {eventId, title, startsAt, attendees, responses, average,
--         distribution [n1..n5], rows [{name|null, campus|null, anonymous, rating, favorite,
--         leastFavorite, comments, createdAt}]} — anonymous rows carry no name, campus or id.
--       admin_event_survey_counts() → table (event_id, responses, average) for the Admin → Events cards.
--   • Re-created with additions (otherwise exact copies of their latest versions):
--       send_followup_for_event  (0026) — the "Thanks for coming" note now links to the in-app survey
--         (#/survey/<id>) and the email to <app_config.app_url>#/survey/<id>; an event's survey_url is
--         still mentioned ("Or fill out the YAC survey here: …") for the separate screenshot quest.
--         queue_event_followups / send_event_followup_now are unchanged and call it as before.
--       admin_stats              (0025) — sources.survey + ratings [{id, title, startsAt, came, responses, average}].
--       build_weekly_report      (0027) — one line: new event survey responses this week + average rating.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Activity + ledger source (widened checks, NOT VALID then VALIDATE = short locks)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.activities'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%method%'
       and pg_get_constraintdef(oid) not ilike '%event_survey%'
  loop
    execute format('alter table public.activities drop constraint %I', c);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.activities'::regclass and conname = 'activities_method_check') then
    alter table public.activities add constraint activities_method_check
      check (method in ('event_password','screenshot','photo','lead_award','referral','event_survey')) not valid;
  end if;

  for c in
    select conname from pg_constraint
     where conrelid = 'public.ledger'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%source%'
       and pg_get_constraintdef(oid) not ilike '%survey%'
  loop
    execute format('alter table public.ledger drop constraint %I', c);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.ledger'::regclass and conname = 'ledger_source_check') then
    alter table public.ledger add constraint ledger_source_check
      check (source in ('checkin','submission','manual','referral','survey')) not valid;
  end if;
end $$;
alter table public.activities validate constraint activities_method_check;
alter table public.ledger validate constraint ledger_source_check;

insert into public.activities (id, tier, title, method) values ('event_survey', 3, 'Event feedback survey', 'event_survey')
on conflict (id) do update set tier = excluded.tier, title = excluded.title, method = excluded.method;

create unique index if not exists ledger_one_survey on public.ledger (user_id, ref_id) where source = 'survey';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.event_surveys (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  rating         int  not null check (rating between 1 and 5),
  favorite       text not null check (char_length(favorite) between 1 and 300),
  least_favorite text not null default '' check (char_length(least_favorite) <= 300),
  comments       text not null default '' check (char_length(comments) <= 1000),
  anonymous      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists event_surveys_created on public.event_surveys (created_at);
create index if not exists event_surveys_user on public.event_surveys (user_id);

alter table public.event_surveys enable row level security;
revoke all on public.event_surveys from anon, authenticated;
grant select on public.event_surveys to authenticated;
drop policy if exists event_surveys_read_own on public.event_surveys;
create policy event_surveys_read_own on public.event_surveys for select to authenticated using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Participant RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- Open from check-in until 14 days after the event ends (the app mirrors this in src/lib/eventSurvey.ts).
create or replace function public.survey_window_open(p_ends_at timestamptz, p_now timestamptz)
returns boolean language sql immutable set search_path = public, extensions as $$
  select p_now <= p_ends_at + interval '14 days';
$$;

-- Trim + drop control characters (keeps line breaks in comments).
create or replace function public.survey_text(p text)
returns text language sql immutable set search_path = public, extensions as $$
  select btrim(regexp_replace(coalesce(p, ''), '[\x00-\x09\x0B-\x1F\x7F]', '', 'g'), E' \n\r\t');
$$;

create or replace function public.submit_event_survey(
  p_event_id uuid, p_rating int, p_favorite text, p_least_favorite text default '', p_comments text default '',
  p_anonymous boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := public.require_user();
  e       public.events;
  a       public.activities;
  v_fav   text := public.survey_text(p_favorite);
  v_least text := public.survey_text(p_least_favorite);
  v_comm  text := public.survey_text(p_comments);
  v_pts   int;
  v_id    uuid;
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  if not exists (select 1 from public.ledger where user_id = v_uid and source = 'checkin' and ref_id = e.id::text) then
    perform public.api_error('not_attended', 'Only people who checked in to this event can rate it.');
  end if;
  if not public.survey_window_open(e.ends_at, now()) then
    perform public.api_error('closed', 'This survey closed 14 days after the event. Thanks anyway!');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    perform public.api_error('rating', 'Pick 1 to 5 stars.');
  end if;
  if v_fav = '' then
    perform public.api_error('favorite', 'Tell us your favorite part (a few words is plenty).');
  end if;
  if char_length(v_fav) > 300 then
    perform public.api_error('favorite', 'Keep your favorite part to 300 characters.');
  end if;
  if char_length(v_least) > 300 then
    perform public.api_error('least_favorite', 'Keep your least favorite part to 300 characters.');
  end if;
  if char_length(v_comm) > 1000 then
    perform public.api_error('comments', 'Keep suggestions and comments to 1000 characters.');
  end if;

  -- two taps at once: the second waits, then sees the first
  perform pg_advisory_xact_lock(hashtext('event_survey:' || e.id::text || ':' || v_uid::text));
  if exists (select 1 from public.event_surveys where event_id = e.id and user_id = v_uid) then
    perform public.api_error('duplicate', 'You already rated this event. Thanks!');
  end if;

  select * into a from public.activities where id = 'event_survey';
  v_pts := public.tier_points(coalesce(a.tier, 3));
  begin
    insert into public.event_surveys (event_id, user_id, rating, favorite, least_favorite, comments, anonymous)
    values (e.id, v_uid, p_rating, v_fav, v_least, v_comm, coalesce(p_anonymous, false))
    returning id into v_id;
    -- Same transaction: the response and the points are saved together or not at all.
    insert into public.ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason)
    values (public.active_cycle_id(), v_uid, v_pts, 'survey', 'event_survey', e.id::text,
            coalesce(a.title, 'Event feedback survey') || ': ' || e.title);
  exception when unique_violation then
    perform public.api_error('duplicate', 'You already rated this event. Thanks!');
  end;
  return json_build_object('eventId', e.id, 'points', v_pts, 'surveyId', v_id);
end $$;

create or replace function public.my_survey_status(p_event_id uuid)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_uid  uuid := public.require_user();
  e      public.events;
  v_came boolean;
  v_done boolean;
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  v_came := exists (select 1 from public.ledger where user_id = v_uid and source = 'checkin' and ref_id = e.id::text);
  v_done := exists (select 1 from public.event_surveys where event_id = e.id and user_id = v_uid);
  return json_build_object(
    'eventId', e.id, 'title', e.title, 'startsAt', e.starts_at, 'endsAt', e.ends_at,
    'checkedIn', v_came, 'done', v_done, 'closesAt', e.ends_at + interval '14 days',
    'open', v_came and not v_done and public.survey_window_open(e.ends_at, now()),
    'points', public.tier_points(coalesce((select tier from public.activities where id = 'event_survey'), 3)));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Staff RPCs (admins + YACquest Chairs). Anonymous responses never carry a name.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_event_survey(p_event_id uuid)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  e      public.events;
  v_came int;
begin
  perform public.require_admin();
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  v_came := greatest(e.attendee_count,
                     (select count(distinct l.user_id) from public.ledger l where l.source = 'checkin' and l.ref_id = e.id::text and l.amount > 0)::int);
  return (
    select json_build_object(
      'eventId', e.id, 'title', e.title, 'startsAt', e.starts_at,
      'attendees', v_came,
      'responses', count(s.id),
      'average', case when count(s.id) = 0 then null else round(avg(s.rating)::numeric, 1) end,
      'distribution', json_build_array(count(*) filter (where s.rating = 1), count(*) filter (where s.rating = 2),
                                       count(*) filter (where s.rating = 3), count(*) filter (where s.rating = 4),
                                       count(*) filter (where s.rating = 5)),
      'rows', coalesce(json_agg(json_build_object(
                'name', case when s.anonymous then null else p.display_name end,
                'campus', case when s.anonymous then null else p.campus end,
                'anonymous', s.anonymous, 'rating', s.rating, 'favorite', s.favorite,
                'leastFavorite', s.least_favorite, 'comments', s.comments, 'createdAt', s.created_at)
                order by s.created_at desc, s.id) filter (where s.id is not null), '[]'::json))
      from public.event_surveys s join public.profiles p on p.id = s.user_id
     where s.event_id = e.id);
end $$;

create or replace function public.admin_event_survey_counts()
returns table (event_id uuid, responses int, average numeric)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
    select s.event_id, count(*)::int, round(avg(s.rating)::numeric, 1)
      from public.event_surveys s
     group by s.event_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Follow-up: send_followup_for_event (0026) + the in-app survey link
-- ─────────────────────────────────────────────────────────────────────────────
-- Latest definition was in 0026_participant_extras.sql. Changes are marked 0030.
create or replace function public.send_followup_for_event(p_event_id uuid, p_now timestamptz, p_by uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  e        public.events;
  v_act    text;
  v_pts    int;
  r        record;
  nx       record;
  v_att    int := 0;
  v_miss   int := 0;
  v_mail   int := 0;
  v_title  text;
  v_body   text;
  v_text   text;
  v_html   text;
  v_footer text := 'You get this because you have email updates on in YACquest (turn them off in Me → Settings).';
  v_spts   int;   -- 0030: in-app event survey points
  v_link   text;  -- 0030: <app_url>#/survey/<event id>
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    return null;
  end if;
  insert into public.event_followups_sent (event_id, sent_at, sent_by) values (e.id, p_now, p_by)
  on conflict do nothing;
  if not found then
    return null;   -- already sent (or another run got there first)
  end if;
  select coalesce(a.title, 'Complete a Feedback Survey'), public.tier_points(coalesce(a.tier, 3))
    into v_act, v_pts
    from (select 1) one left join public.activities a on a.id = 'survey';
  -- 0030: the in-app event survey (+5, once per attendee) — link in the note and the email.
  v_spts := public.tier_points(coalesce((select tier from public.activities where id = 'event_survey'), 3));
  v_link := rtrim(coalesce(nullif(trim((select app_url from public.app_config where id = 1)), ''), 'https://ncssmyac.github.io/YACquest/'), '/')
            || '/#/survey/' || e.id::text;

  -- (a) everyone who checked in
  for r in
    select distinct on (l.user_id) l.user_id, p.email_opt_in,
           case when u.email_confirmed_at is not null then lower(trim(u.email::text)) end as email
      from public.ledger l
      join public.profiles p on p.id = l.user_id
      left join auth.users u on u.id = p.id
     where l.source = 'checkin' and l.ref_id = e.id::text
     order by l.user_id
  loop
    v_title := 'Thanks for coming to ' || e.title || '! 🐂';
    -- 0030: in-app survey first (#/survey/<id> becomes a button in Notifications), then the external one if set.
    v_body := 'How was it? Rate it in the app for +' || v_spts || ' points (takes a minute): #/survey/' || e.id::text;
    if e.survey_url is not null then
      v_body := v_body || ' Or fill out the YAC survey here: ' || e.survey_url
                || ' It counts as the “' || v_act || '” digital quest: send a screenshot of the confirmation in Quests for '
                || v_pts || ' points.';
    end if;
    perform public.notify(r.user_id, 'event_followup', v_title, v_body);
    v_att := v_att + 1;
    if r.email_opt_in and r.email is not null and r.email <> '' then
      v_text := 'Thanks for coming to ' || e.title || '!' || chr(10) || chr(10)
                || 'How was it? Rate it in YACquest for +' || v_spts || ' points (takes a minute):' || chr(10) || v_link
                || case when e.survey_url is not null
                        then chr(10) || chr(10) || 'Or fill out the YAC survey here: ' || e.survey_url || chr(10)
                             || 'Completing it counts as the "' || v_act || '" digital quest: send a screenshot of the confirmation in YACquest → Quests for ' || v_pts || ' points.'
                        else '' end
                || chr(10) || chr(10) || v_footer;
      v_html := public.email_layout('Thanks for coming to ' || e.title || '!',
        '<p style="font-size:16px;margin:0 0 10px">Thanks for coming to <b>' || public.html_escape(e.title) || '</b>! 🐂</p>'
        || '<p style="margin:0 0 6px">How was it? Rate it in YACquest for <b>+' || v_spts || ' points</b> (takes a minute):</p>'
        || '<p style="margin:0 0 12px"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">⭐ Rate this event</a></p>'
        || case when e.survey_url is not null
                then '<p style="margin:0 0 12px">Or fill out the YAC survey here: <a href="' || public.html_escape(e.survey_url) || '">'
                     || public.html_escape(e.survey_url) || '</a>. Completing it counts as the <b>' || public.html_escape(v_act)
                     || '</b> digital quest: send a screenshot of the confirmation in YACquest → Quests for <b>' || v_pts || ' points</b>.</p>'
                else '' end
        || '<p style="font-size:12px;color:#4a5672;margin:0">' || public.html_escape(v_footer) || '</p>');
      if public.enqueue_email('event_followup', array[r.email], 'Thanks for coming to ' || e.title || '!', v_text, v_html,
                              'followup:' || e.id::text || ':' || r.user_id::text) then
        v_mail := v_mail + 1;
      end if;
    end if;
  end loop;

  -- (b) RSVP'd but didn't check in
  for r in
    select rv.user_id, p.campus, p.email_opt_in,
           case when u.email_confirmed_at is not null then lower(trim(u.email::text)) end as email
      from public.event_rsvps rv
      join public.profiles p on p.id = rv.user_id
      left join auth.users u on u.id = p.id
     where rv.event_id = e.id
       and not exists (select 1 from public.ledger l
                        where l.user_id = rv.user_id and l.source = 'checkin' and l.ref_id = e.id::text)
     order by rv.created_at
  loop
    -- (no row → nx is a row of nulls)
    select n.title, n.starts_at, n.location into nx
      from public.events n
     where n.starts_at > p_now and n.id <> e.id and n.campus in (r.campus, 'all')
     order by n.starts_at limit 1;
    if nx.title is null then
      select n.title, n.starts_at, n.location into nx
        from public.events n
       where n.starts_at > p_now and n.id <> e.id
       order by n.starts_at limit 1;
    end if;
    v_title := 'Sorry we missed you at ' || e.title;
    v_body := case when nx.title is not null
                   then 'Hope to see you next time! Next up: ' || nx.title || ' — ' || public.followup_when(nx.starts_at)
                        || ' at ' || nx.location || '. RSVP in Quests.'
                   else 'Hope to see you next time! New events show up in Quests.' end;
    perform public.notify(r.user_id, 'event_followup', v_title, v_body);
    v_miss := v_miss + 1;
    if r.email_opt_in and r.email is not null and r.email <> '' then
      v_html := public.email_layout(v_title,
        '<p style="font-size:16px;margin:0 0 10px">We missed you at <b>' || public.html_escape(e.title) || '</b>. Hope to see you next time!</p>'
        || case when nx.title is not null
                then '<p style="margin:0 0 12px">Next up: <b>' || public.html_escape(nx.title) || '</b><br>🕒 '
                     || public.html_escape(public.followup_when(nx.starts_at)) || '<br>📍 ' || public.html_escape(nx.location)
                     || '</p><p style="margin:0 0 12px">RSVP in YACquest → Quests.</p>'
                else '<p style="margin:0 0 12px">New events show up in YACquest → Quests.</p>' end
        || '<p style="font-size:12px;color:#4a5672;margin:0">' || public.html_escape(v_footer) || '</p>');
      if public.enqueue_email('event_followup', array[r.email], v_title, v_body || chr(10) || chr(10) || v_footer, v_html,
                              'followup:' || e.id::text || ':' || r.user_id::text) then
        v_mail := v_mail + 1;
      end if;
    end if;
  end loop;

  update public.event_followups_sent set attended = v_att, missed = v_miss, emailed = v_mail where event_id = e.id;
  perform public.log_admin_action(p_by, 'event_followup_sent', null,
    jsonb_build_object('eventId', e.id, 'title', e.title, 'attended', v_att, 'missed', v_miss, 'emailed', v_mail,
                       'automatic', p_by is null));
  return json_build_object('eventId', e.id, 'sentAt', p_now, 'attended', v_att, 'missed', v_miss, 'emailed', v_mail,
                           'automatic', p_by is null);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Stats: admin_stats (0025) + survey points + per-event ratings
-- ─────────────────────────────────────────────────────────────────────────────
-- Latest definition was in 0025_admin_tools.sql. Changes are marked 0030.
create or replace function public.admin_stats(p_now timestamptz default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_now   timestamptz := coalesce(p_now, now());
  v_cycle uuid := public.active_cycle_id();
  cyc     public.cycles;
  cfg     public.app_config;
  v_goal  int;
  r       jsonb;
begin
  perform public.require_admin();
  select * into cyc from public.cycles where id = v_cycle;
  select * into cfg from public.app_config where id = 1;
  v_goal := coalesce(cfg.prize_goal, 350);

  with
  parts as (select * from public.profiles where role = 'participant'),
  led as (
    select l.* from public.ledger l join parts p on p.id = l.user_id where l.cycle_id = v_cycle
  ),
  weeks as (
    select w::date as wk
      from generate_series(date_trunc('week', cyc.starts_at at time zone 'America/New_York'),
                           date_trunc('week', least(v_now, cyc.ends_at) at time zone 'America/New_York'),
                           interval '7 days') w
  ),
  signups as (
    select date_trunc('week', p.created_at at time zone 'America/New_York')::date as wk, count(*)::int as n
      from parts p where p.created_at >= cyc.starts_at and p.created_at <= v_now group by 1
  ),
  ev as (
    select e.id, e.title, e.campus, e.kind, e.starts_at, e.ends_at,
           (select count(*) from public.event_rsvps rv join parts p on p.id = rv.user_id where rv.event_id = e.id)::int as going,
           (select count(*) from led l where l.source = 'checkin' and l.ref_id = e.id::text and l.amount > 0)::int as came
      from public.events e
     where e.cycle_id = v_cycle and e.starts_at <= v_now
  ),
  camp as (
    select c.campus,
           (select count(*) from parts p where p.campus = c.campus)::int as members,
           (select count(distinct l.user_id) from led l join parts p on p.id = l.user_id
             where p.campus = c.campus and l.amount > 0 and l.created_at > v_now - interval '30 days' and l.created_at <= v_now)::int as active,
           (select coalesce(sum(p.points), 0) from parts p where p.campus = c.campus)::int as points
      from (values ('duke', 1), ('unc', 2), ('ncsu', 3)) as c (campus, ord)
  ),
  marks as (
    select m.pts, m.ord from (values (50, 1), (100, 2), ((v_goal + 1) / 2, 3), (250, 4), (v_goal, 5)) as m (pts, ord)
  ),
  buckets as (
    select b.lo, b.hi, b.label, b.ord
      from (values (0, 0, '0', 1), (1, 49, '1–49', 2), (50, 99, '50–99', 3),
                   (100, (v_goal + 1) / 2 - 1, '100–' || ((v_goal + 1) / 2 - 1), 4),
                   ((v_goal + 1) / 2, 249, ((v_goal + 1) / 2) || '–249', 5),
                   (250, v_goal - 1, '250–' || (v_goal - 1), 6),
                   (v_goal, 2147483647, v_goal || '+', 7)) as b (lo, hi, label, ord)
  ),
  badge_rows as (
    select b.id, b.ord, count(*) filter (where b.earned)::int as n
      from parts p cross join lateral public.badges_for(p.id) with ordinality as b (id, earned, progress, goal, ord)
     group by b.id, b.ord
  )
  select jsonb_build_object(
    'generatedAt', v_now,
    'goal', v_goal,
    'cycle', jsonb_build_object('name', cyc.name, 'startsAt', cyc.starts_at, 'endsAt', cyc.ends_at),
    'totals', jsonb_build_object(
      'participants', (select count(*) from parts),
      'active30', (select count(distinct l.user_id) from led l
                    where l.amount > 0 and l.created_at > v_now - interval '30 days' and l.created_at <= v_now),
      'points', (select coalesce(sum(points), 0) from parts),
      'checkins', (select count(*) from led where source = 'checkin' and amount > 0),
      'approvals', (select count(*) from led where source = 'submission' and amount > 0)),
    'signupsBefore', (select count(*) from parts p where p.created_at < cyc.starts_at),
    'signupsByWeek', (select coalesce(jsonb_agg(jsonb_build_object('week', w.wk, 'count', coalesce(s.n, 0)) order by w.wk), '[]'::jsonb)
                        from weeks w left join signups s on s.wk = w.wk),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', ev.id, 'title', ev.title, 'campus', ev.campus, 'kind', ev.kind,
                                                            'startsAt', ev.starts_at, 'going', ev.going, 'came', ev.came)
                                         order by ev.starts_at, ev.id), '[]'::jsonb) from ev),
    'campuses', (select jsonb_agg(jsonb_build_object('campus', c.campus, 'members', c.members, 'active', c.active, 'points', c.points,
                                                     'perMember', case when c.members = 0 then 0 else round(c.points::numeric / c.members, 1) end)
                                  order by c.campus = 'duke' desc, c.campus = 'unc' desc) from camp c),
    'milestones', (select jsonb_agg(jsonb_build_object('points', m.pts, 'count', (select count(*) from parts p where p.points >= m.pts)) order by m.ord) from marks m),
    'distribution', (select jsonb_agg(jsonb_build_object('label', b.label, 'min', b.lo,
                                                         'count', (select count(*) from parts p where greatest(p.points, 0) between b.lo and b.hi))
                                      order by b.ord) from buckets b),
    'sources', jsonb_build_object(
      'event',    (select coalesce(sum(amount), 0) from led where source = 'checkin' and amount > 0),
      'digital',  (select coalesce(sum(amount), 0) from led where source = 'submission' and amount > 0),
      'referral', (select coalesce(sum(amount), 0) from led where source = 'referral' and amount > 0),
      'staff',    (select coalesce(sum(amount), 0) from led where source = 'manual' and amount > 0),
      'survey',   (select coalesce(sum(amount), 0) from led where source = 'survey' and amount > 0),  -- 0030
      'removed',  (select coalesce(-sum(amount), 0) from led where amount < 0)),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'count', b.n) order by b.n desc, b.ord), '[]'::jsonb) from badge_rows b),
    -- 0030: in-app event survey ratings per event of this cycle (all responses, staff included: it's feedback, not points)
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at, 'came', ev.came,
                                                             'responses', sv.n, 'average', sv.avg)
                                          order by ev.starts_at, ev.id), '[]'::jsonb)
                  from ev join (select s.event_id, count(*)::int as n, round(avg(s.rating)::numeric, 1) as avg
                                  from public.event_surveys s group by s.event_id) sv on sv.event_id = ev.id)
  ) into r;
  return r::json;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Weekly committee report: build_weekly_report (0027) + one line — event surveys this week
-- ─────────────────────────────────────────────────────────────────────────────
-- Latest definition was in 0027_privacy_reliability.sql. Changes are marked 0030.
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
  v_bugs    int;   -- 0027
  v_bugs_ctx int;  -- 0027
  v_surv    int;      -- 0030
  v_surv_avg numeric; -- 0030
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
  -- 0027: how many of these were "Report a problem" bug reports (technical details are in Admin → Feedback)
  select count(*), count(*) filter (where f.context is not null) into v_bugs, v_bugs_ctx
    from public.feedback f where f.category = 'bug' and f.created_at >= now() - interval '7 days';
  t := t || format(E'  Bug reports this week: %s%s\n', v_bugs,
                   case when v_bugs_ctx > 0 then format(' (%s with technical details in Admin → Feedback)', v_bugs_ctx) else '' end);
  h := h || '<p style="margin:0 0 8px;font-size:14px;">🐞 <b>Bug reports this week: ' || v_bugs || '</b>'
         || case when v_bugs_ctx > 0 then ' <span style="color:#5b6475;">(' || v_bugs_ctx || ' with technical details in Admin → Feedback)</span>' else '' end
         || '</p>';
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

  -- 0030: one line — in-app event survey responses this week + their average rating
  select count(*), round(avg(s.rating)::numeric, 1) into v_surv, v_surv_avg
    from public.event_surveys s where s.created_at >= v_wk;
  t := t || E'\n📝 EVENT SURVEYS THIS WEEK: '
         || case when v_surv = 0 then 'No new responses.'
                 else format('%s new response%s · average %s★', v_surv, case when v_surv = 1 then '' else 's' end, v_surv_avg) end
         || E' (results in Admin → Events → Survey)\n';
  h := h || '<p style="margin:12px 0 0;font-size:14px;">📝 <b>Event surveys this week:</b> '
         || case when v_surv = 0 then 'No new responses.'
                 else v_surv || ' new response' || case when v_surv = 1 then '' else 's' end || ' · average <b>' || v_surv_avg || '★</b>' end
         || ' <span style="color:#5b6475;">(results in Admin → Events → Survey)</span></p>';

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
-- 8. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal helpers + re-created internals: nobody calls these through the API.
revoke execute on function
  public.survey_window_open(timestamptz, timestamptz), public.survey_text(text),
  public.send_followup_for_event(uuid, timestamptz, uuid), public.build_weekly_report()
from public, anon, authenticated, service_role;

revoke execute on function
  public.submit_event_survey(uuid, int, text, text, text, boolean), public.my_survey_status(uuid),
  public.admin_event_survey(uuid), public.admin_event_survey_counts(), public.admin_stats(timestamptz)
from public, anon;
grant execute on function
  public.submit_event_survey(uuid, int, text, text, text, boolean), public.my_survey_status(uuid),
  public.admin_event_survey(uuid), public.admin_event_survey_counts(), public.admin_stats(timestamptz)
to authenticated;

-- Done.

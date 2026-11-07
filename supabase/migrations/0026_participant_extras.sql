-- =============================================================================
-- YACquest 0026 — participant extras (additive; safe to re-run; no points-rule changes)
--
--   • Automatic follow-up after events
--       - events.survey_url (optional; http(s) only, ≤ 500 chars; checked by clean_survey_url()).
--         create_event / update_event (re-created from 0001, otherwise unchanged) read "surveyUrl"
--         from the event JSON; event_json() returns it.
--       - table event_followups_sent (one row per event = the "sent" marker) with who sent it
--         (null = automatic) and how many people got it.
--       - queue_event_followups(p_now default now()) → int (events followed up). For every event whose
--         check-in window closed (ends_at + grace) in the last 3 days and that has no marker yet:
--           · everyone who checked in: notification (kind 'event_followup') "Thanks for coming to
--             <title>! 🐂" pointing to the feedback survey (the event's survey link if it has one) and
--             saying it counts as the "Complete a Feedback Survey" digital quest (screenshot → Tier 3
--             points). Email too if they have email updates on (and a confirmed email).
--           · everyone who RSVP'd but didn't check in: "Sorry we missed you at <title>" + the next
--             upcoming event (their campus or all campuses first) if there is one. Email only if opted in.
--         Older events (closed more than 3 days ago, e.g. before 0026 was installed) are never sent
--         automatically: staff use "Send follow-up now" for those.
--         Service role / pg_cron only. Rides on the existing every-10-minutes send-emails run:
--         enqueue_weekly_report_if_due() is re-created below (exact copy of 0024) with one more
--         guarded call. A follow-up failure only raises a warning.
--       - send_event_followup_now(p_event_id) → {eventId, sentAt, attended, missed, emailed}
--         Admins + chairs, for an event whose check-in closed. Once per event ('already_sent').
--       - admin_event_followups() → follow-up status per event (Admin → Events). Staff only.
--       - Both kinds are logged in the admin action log ('event_followup_sent'; actor System when
--         automatic). email_outbox.kind also allows 'event_followup'.
--
--   • Welcome tour: profiles.tour_done_at + mark_tour_done() → timestamptz (set once, first value kept).
--
--   • Event photo wall (opt-in, privacy enforced here, not in the app):
--       - submissions.share_on_wall (default false) — set by the owner with
--         set_submission_wall_share(p_id, p_share) (own event-photo submissions only).
--       - profiles.photo_wall_opt_out (default false) — set_photo_wall_opt_out(p_opt_out); true hides
--         ALL of that person's photos from every wall.
--       - submissions.wall_hidden_at / wall_hidden_by — staff moderation:
--         set_photo_wall_hidden(p_id, p_hidden default true), logged ('photo_hidden' / 'photo_unhidden').
--       - A photo is ON THE WALL only if: approved AND share_on_wall AND not hidden by staff AND the
--         owner hasn't opted out (photo_on_wall(image_path)).
--       - event_photos(p_event_id) → only on-the-wall photos (path, first part of display name… see
--         below), event_photo_counts() → per-event counts. Any signed-in user.
--       - Storage: the `proofs` bucket stays PRIVATE. One extra SELECT policy (proofs_read_wall) lets a
--         signed-in user read an object only while photo_on_wall(name) is true, so the app can sign
--         those URLs with the user's own session (storage.createSignedUrls checks SELECT access).
--         Turning sharing off, opting out or a staff hide revokes access for new URLs immediately
--         (already-issued signed URLs expire after 1 hour).
--
--   • my_friends() → the people who signed up with YOUR friend code (display name, campus, character,
--     look, joined date, whether they came to an event, whether you got the referral bonus for them).
--     No emails, handles or ids.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.events      add column if not exists survey_url text;
alter table public.profiles    add column if not exists tour_done_at timestamptz;
alter table public.profiles    add column if not exists photo_wall_opt_out boolean not null default false;
alter table public.submissions add column if not exists share_on_wall boolean not null default false;
alter table public.submissions add column if not exists wall_hidden_at timestamptz;
alter table public.submissions add column if not exists wall_hidden_by uuid references public.profiles (id) on delete set null;

alter table public.events drop constraint if exists events_survey_url_check;
alter table public.events add constraint events_survey_url_check
  check (survey_url is null or (char_length(survey_url) <= 500 and survey_url ~* '^https?://[^[:space:]]+$'));

create index if not exists submissions_image_path on public.submissions (image_path);
create index if not exists submissions_event_wall on public.submissions (event_id) where share_on_wall and status = 'approved';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Email kind 'event_followup'
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.email_outbox'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.email_outbox drop constraint %I', c);
  end loop;
end $$;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('weekly_report', 'prize_qualified', 'prize_info', 'test', 'announcement', 'event_reminder', 'event_followup'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Survey link on events
-- ─────────────────────────────────────────────────────────────────────────────
-- '' / null → null. Otherwise http(s)://host.tld[/…], no spaces, ≤ 500 chars (same rule as src/lib/validate.ts).
create or replace function public.clean_survey_url(p_url text)
returns text language plpgsql immutable set search_path = public, extensions as $$
declare v text := trim(coalesce(p_url, ''));
begin
  if v = '' then
    return null;
  end if;
  if char_length(v) > 500 then
    perform public.api_error('surveyUrl', 'The survey link is too long (500 characters max).');
  end if;
  if v !~* '^https?://[a-z0-9.-]+\.[a-z]{2,}(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
    perform public.api_error('surveyUrl', 'The survey link must be a web address starting with https:// (or http://).');
  end if;
  return v;
end $$;

-- event_json: latest definition in 0001, plus surveyUrl.
create or replace function public.event_json(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', e.id,
    'cycleId', e.cycle_id,
    'title', e.title,
    'campus', e.campus,
    'crossCampus', e.cross_campus,
    'kind', e.kind,
    'location', e.location,
    'startsAt', e.starts_at,
    'endsAt', e.ends_at,
    'checkInGraceMinutes', e.check_in_grace_minutes,
    'activityId', e.activity_id,
    'attendeeCount', e.attendee_count,
    'createdBy', e.created_by,
    'createdAt', e.created_at,
    'password', s.password,
    'surveyUrl', e.survey_url
  )
  from public.events e left join public.event_secrets s on s.event_id = e.id
  where e.id = p_id;
$$;

-- create_event / update_event: latest definitions in 0001 (validation in 0005), plus survey_url.
create or replace function public.create_event(p_event jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin  uuid := public.require_admin();
  v        record;
  v_id     uuid;
  v_survey text;
begin
  select * into v from public.validate_event(p_event);
  v_survey := public.clean_survey_url(p_event->>'surveyUrl');
  insert into public.events (cycle_id, title, campus, cross_campus, kind, location, starts_at, ends_at,
                             check_in_grace_minutes, activity_id, created_by, survey_url)
  values (public.active_cycle_id(), v.v_title, v.v_campus, v.v_cross, v.v_kind, v.v_location, v.v_starts, v.v_ends,
          v.v_grace, public.event_activity(v.v_campus, v.v_cross, v.v_kind), v_admin, v_survey)
  returning id into v_id;
  insert into public.event_secrets (event_id, password) values (v_id, v.v_password);
  return public.event_json(v_id);
end $$;

create or replace function public.update_event(p_id uuid, p_event jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v record; v_survey text;
begin
  perform public.require_admin();
  if not exists (select 1 from public.events where id = p_id) then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  select * into v from public.validate_event(p_event);
  v_survey := public.clean_survey_url(p_event->>'surveyUrl');
  update public.events
     set title = v.v_title, campus = v.v_campus, cross_campus = v.v_cross, kind = v.v_kind,
         location = v.v_location, starts_at = v.v_starts, ends_at = v.v_ends,
         check_in_grace_minutes = v.v_grace,
         activity_id = public.event_activity(v.v_campus, v.v_cross, v.v_kind),
         survey_url = v_survey
   where id = p_id;
  insert into public.event_secrets (event_id, password) values (p_id, v.v_password)
  on conflict (event_id) do update set password = excluded.password;
  return public.event_json(p_id);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Automatic follow-up after events
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.event_followups_sent (
  event_id uuid primary key references public.events (id) on delete cascade,
  sent_at  timestamptz not null default now(),
  sent_by  uuid references public.profiles (id) on delete set null,   -- null = automatic
  attended int not null default 0,
  missed   int not null default 0,
  emailed  int not null default 0
);
alter table public.event_followups_sent enable row level security;
revoke all on public.event_followups_sent from anon, authenticated;

-- "Sat, Nov 21 at 6:00 PM" (Eastern), like the app's src/lib/followups.ts.
create or replace function public.followup_when(p_at timestamptz)
returns text language sql stable set search_path = public, extensions as $$
  select to_char(p_at at time zone 'America/New_York', 'Dy, Mon FMDD') || ' at '
         || to_char(p_at at time zone 'America/New_York', 'FMHH12:MI AM');
$$;

-- Does the follow-up for one event. Returns null when it was already sent (the marker row exists).
-- Internal: only called by queue_event_followups / send_event_followup_now.
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
    if e.survey_url is not null then
      v_body := 'Tell us how it went in the feedback survey: ' || e.survey_url
                || ' It counts as the “' || v_act || '” digital quest: send a screenshot of the confirmation in Quests for '
                || v_pts || ' points.';
    else
      v_body := 'Tell us how it went! When YAC shares the feedback survey, filling it out counts as the “' || v_act
                || '” digital quest: send a screenshot of the confirmation in Quests for ' || v_pts || ' points.';
    end if;
    perform public.notify(r.user_id, 'event_followup', v_title, v_body);
    v_att := v_att + 1;
    if r.email_opt_in and r.email is not null and r.email <> '' then
      v_text := 'Thanks for coming to ' || e.title || '!' || chr(10) || chr(10)
                || case when e.survey_url is not null
                        then 'Tell us how it went: ' || e.survey_url || chr(10) || chr(10)
                             || 'Completing the survey counts as the "' || v_act || '" digital quest: send a screenshot of the confirmation in YACquest → Quests for ' || v_pts || ' points.'
                        else 'When YAC shares the feedback survey, completing it counts as the "' || v_act || '" digital quest: send a screenshot of the confirmation in YACquest → Quests for ' || v_pts || ' points.'
                   end
                || chr(10) || chr(10) || v_footer;
      v_html := public.email_layout('Thanks for coming to ' || e.title || '!',
        '<p style="font-size:16px;margin:0 0 10px">Thanks for coming to <b>' || public.html_escape(e.title) || '</b>! 🐂</p>'
        || case when e.survey_url is not null
                then '<p style="margin:0 0 12px"><a href="' || public.html_escape(e.survey_url) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Take the feedback survey</a></p>'
                else '' end
        || '<p style="margin:0 0 12px">Completing the feedback survey counts as the <b>' || public.html_escape(v_act)
        || '</b> digital quest: send a screenshot of the confirmation in YACquest → Quests for <b>' || v_pts || ' points</b>.</p>'
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

-- Service role / pg_cron: every event whose check-in closed in the last 3 days, once.
create or replace function public.queue_event_followups(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  e   record;
  v_n int := 0;
begin
  perform public.require_service_role();
  for e in
    select ev.id
      from public.events ev
     where ev.ends_at + make_interval(mins => ev.check_in_grace_minutes) <= p_now
       and ev.ends_at + make_interval(mins => ev.check_in_grace_minutes) > p_now - interval '3 days'
       and not exists (select 1 from public.event_followups_sent s where s.event_id = ev.id)
     order by ev.ends_at
  loop
    if public.send_followup_for_event(e.id, p_now, null) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Staff button on past events (Admin → Events): "Send follow-up now".
create or replace function public.send_event_followup_now(p_event_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.require_admin();
  e       public.events;
  r       json;
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  if exists (select 1 from public.event_followups_sent s where s.event_id = e.id) then
    perform public.api_error('already_sent', 'The follow-up for this event was already sent.');
  end if;
  if e.ends_at + make_interval(mins => e.check_in_grace_minutes) > now() then
    perform public.api_error('not_ended', 'Check-in for this event is still open. Send the follow-up after it closes.');
  end if;
  perform pg_advisory_xact_lock(hashtext('followup:' || e.id::text));
  r := public.send_followup_for_event(e.id, now(), v_admin);
  if r is null then
    perform public.api_error('already_sent', 'The follow-up for this event was already sent.');
  end if;
  return r;
end $$;

-- Admin → Events: follow-up status of every event that has one.
create or replace function public.admin_event_followups()
returns table (event_id uuid, sent_at timestamptz, sent_by_name text, automatic boolean, attended int, missed int, emailed int)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
    select s.event_id, s.sent_at, case when s.sent_by is null then null else coalesce(public.display_name_of(s.sent_by), 'Former staff') end,
           s.sent_by is null, s.attended, s.missed, s.emailed
      from public.event_followups_sent s
     order by s.sent_at desc;
end $$;

-- enqueue_weekly_report_if_due: latest definition was in 0024_small_improvements.sql.
-- Unchanged except step 0b, so the every-10-minutes send-emails run also queues event follow-ups.
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
  -- 0. (0024) RSVP reminders ride along on this call. A failure here never blocks the report / emails.
  begin
    perform public.queue_event_reminders();
  exception when others then
    raise warning 'queue_event_reminders failed: %', sqlerrm;
  end;
  -- 0b. (0026) Event follow-ups ride along too. A failure here never blocks the report / emails.
  begin
    perform public.queue_event_followups();
  exception when others then
    raise warning 'queue_event_followups failed: %', sqlerrm;
  end;
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
-- 5. Welcome tour
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mark_tour_done()
returns timestamptz language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := public.require_user(); v timestamptz;
begin
  update public.profiles set tour_done_at = coalesce(tour_done_at, now()) where id = v_uid
  returning tour_done_at into v;
  return v;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Event photo wall
-- ─────────────────────────────────────────────────────────────────────────────
-- THE privacy rule (used by event_photos, event_photo_counts and the storage policy).
create or replace function public.photo_on_wall(p_image_path text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.submissions s join public.profiles p on p.id = s.user_id
     where s.image_path = p_image_path
       and s.event_id is not null
       and s.status = 'approved'
       and s.share_on_wall
       and s.wall_hidden_at is null
       and not p.photo_wall_opt_out);
$$;

-- Owner: show / stop showing one of my event photos on the wall (it still needs approval to appear).
create or replace function public.set_submission_wall_share(p_id uuid, p_share boolean)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := public.require_user(); s public.submissions;
begin
  select * into s from public.submissions where id = p_id;
  if s.id is null or s.user_id <> v_uid then
    perform public.api_error('not_found', 'That photo wasn’t found.');
  end if;
  if s.event_id is null or s.activity_id <> 'event_photos' then
    perform public.api_error('not_photo', 'Only event photos can go on the photo wall.');
  end if;
  update public.submissions set share_on_wall = coalesce(p_share, false) where id = p_id;
  return coalesce(p_share, false);
end $$;

-- Me → Settings: true hides every one of my photos from every wall.
create or replace function public.set_photo_wall_opt_out(p_opt_out boolean)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := public.require_user();
begin
  update public.profiles set photo_wall_opt_out = coalesce(p_opt_out, false) where id = v_uid;
  return coalesce(p_opt_out, false);
end $$;

-- The wall for one event: only photos that pass photo_on_wall. Oldest first.
create or replace function public.event_photos(p_event_id uuid)
returns table (id uuid, image_path text, display_name text, campus text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_uid uuid := public.require_user();
begin
  return query
    select s.id, s.image_path, p.display_name, p.campus, s.created_at, s.user_id = v_uid
      from public.submissions s join public.profiles p on p.id = s.user_id
     where s.event_id = p_event_id
       and s.status = 'approved'
       and s.share_on_wall
       and s.wall_hidden_at is null
       and not p.photo_wall_opt_out
     order by s.created_at, s.id;
end $$;

create or replace function public.event_photo_counts()
returns table (event_id uuid, photos int)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_user();
  return query
    select s.event_id, count(*)::int
      from public.submissions s join public.profiles p on p.id = s.user_id
     where s.event_id is not null
       and s.status = 'approved'
       and s.share_on_wall
       and s.wall_hidden_at is null
       and not p.photo_wall_opt_out
     group by s.event_id;
end $$;

-- Staff moderation: hide (or bring back) one photo. Logged.
create or replace function public.set_photo_wall_hidden(p_id uuid, p_hidden boolean default true)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.require_admin();
  s       public.submissions;
  v_title text;
begin
  select * into s from public.submissions where id = p_id;
  if s.id is null or s.event_id is null then
    perform public.api_error('not_found', 'That photo wasn’t found.');
  end if;
  if coalesce(p_hidden, true) then
    update public.submissions set wall_hidden_at = coalesce(wall_hidden_at, now()), wall_hidden_by = coalesce(wall_hidden_by, v_admin) where id = p_id;
  else
    update public.submissions set wall_hidden_at = null, wall_hidden_by = null where id = p_id;
  end if;
  select title into v_title from public.events where id = s.event_id;
  perform public.log_admin_action(v_admin, case when coalesce(p_hidden, true) then 'photo_hidden' else 'photo_unhidden' end, s.user_id,
    jsonb_build_object('submissionId', s.id, 'eventId', s.event_id, 'title', v_title));
  return coalesce(p_hidden, true);
end $$;

-- Storage: the bucket stays private. Signed-in users may also read (and so sign) wall photos.
drop policy if exists proofs_read_wall on storage.objects;
create policy proofs_read_wall on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and public.photo_on_wall(name));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. My friends (people who joined with my code)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.my_friends()
returns table (display_name text, campus text, avatar text, hat text, accessory text, background text,
               joined_at timestamptz, came boolean, bonus boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_uid uuid := public.require_user();
begin
  return query
    select f.display_name, f.campus, f.avatar, f.hat, f.accessory, f.background, f.created_at,
           exists (select 1 from public.ledger l where l.user_id = f.id and l.source = 'checkin'),
           exists (select 1 from public.ledger l
                    where l.user_id = v_uid and l.source = 'referral' and l.activity_id = 'bring_new_alum'
                      and l.ref_id = f.id::text and l.cycle_id = public.active_cycle_id())
      from public.profiles f
     where f.referred_by = v_uid
     order by f.created_at desc;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function
  public.clean_survey_url(text), public.followup_when(timestamptz),
  public.send_followup_for_event(uuid, timestamptz, uuid)
from public, anon, authenticated, service_role;

revoke execute on function
  public.send_event_followup_now(uuid), public.admin_event_followups(), public.mark_tour_done(),
  public.photo_on_wall(text), public.set_submission_wall_share(uuid, boolean), public.set_photo_wall_opt_out(boolean),
  public.event_photos(uuid), public.event_photo_counts(), public.set_photo_wall_hidden(uuid, boolean), public.my_friends()
from public, anon;
grant execute on function
  public.send_event_followup_now(uuid), public.admin_event_followups(), public.mark_tour_done(),
  public.photo_on_wall(text), public.set_submission_wall_share(uuid, boolean), public.set_photo_wall_opt_out(boolean),
  public.event_photos(uuid), public.event_photo_counts(), public.set_photo_wall_hidden(uuid, boolean), public.my_friends()
to authenticated;

-- Edge Function `send-emails` (service_role key) / pg_cron only
revoke execute on function public.queue_event_followups(timestamptz), public.enqueue_weekly_report_if_due()
from public, anon, authenticated, service_role;
grant execute on function public.queue_event_followups(timestamptz), public.enqueue_weekly_report_if_due() to service_role;

-- Done.

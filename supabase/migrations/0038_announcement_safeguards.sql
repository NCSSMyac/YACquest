-- ═══════════════════════════════════════════════════════════════════════════
-- 0038 — Announcement safeguards: a weekly cap on all-member announcement
--        EMAILS, a recipient count before sending, and a 10-minute cancel window.
--
--   • WEEKLY CAP. At most app_config.announce_all_email_weekly_cap (default 3)
--     announcements to EVERYONE ('all') may be sent WITH EMAIL per calendar week
--     (Monday 00:00 → Sunday 23:59, America/New_York), all senders combined.
--     Campus and one-person announcements are never capped, and the in-app
--     message never is: a send with email ticked past the cap is refused with
--     code 'email_cap' ("3 all-member announcement emails have already gone out
--     this week (resets Monday). You can still post it in the app, or send the
--     email to one campus.") and nothing is posted, so staff can untick email
--     and post it in the app. Cancelled announcements and ones that emailed
--     nobody don't count. send_announcement() takes a transaction-level advisory
--     lock before counting, so two staff sending at once can't both get the last
--     slot. announcement_email_cap() → {cap, used, left, resetsAt, holdMinutes}
--     (admins + chairs, for the Announce screen). set_announcement_email_settings()
--     changes the cap / window: YACquest Chairs only (Admin → System).
--   • RECIPIENT COUNT. announcement_audience_count(audience, campus, user) →
--     {inApp, email, emailReason}: in-app = everyone in the audience; email =
--     the people who would really be queued (emails on, address confirmed in
--     Supabase AND in the app, not bouncing) — the same rules as
--     send_announcement() + email_expand_outbox(). For one person, emailReason
--     says why not: 'emails_off' | 'not_confirmed' | 'bouncing'. Admins + chairs.
--     send_announcement()'s "emailed" (and announcements.email_count) is now
--     that same number (emails actually queued), not the number of addresses.
--   • CANCEL WINDOW. An announcement sent WITH email holds its emails for
--     app_config.announce_email_hold_minutes (default 10): email_messages.not_before
--     = sent + 10 min, and claim_email_messages() skips rows whose not_before is
--     in the future. send_before is unchanged (3 days from creation, or the start
--     of an event it names). cancel_announcement(id): the sender or a YACquest
--     Chair, while the window is open and no email has been claimed yet. It marks
--     the still-queued emails 'skipped_cancelled' (shown as "Cancelled"; not sent,
--     not failed), deletes the in-app notifications (notifications.announcement_id),
--     sets announcements.cancelled_at / cancelled_by, logs 'announcement_cancelled'
--     and frees the weekly-cap slot. In-app-only announcements have no cancel
--     (there is no delete for announcements either).
--   • recent_announcements(limit): list_announcements + emailHoldUntil,
--     cancelledAt/By, emailsStarted, canCancel (for the caller). list_announcements
--     is unchanged, so an app that isn't updated yet keeps working.
--   • email_stats(): campaigns + totals also report "cancelled" (still inside
--     "skipped", never "sent" or "failed").
--
-- ADDITIVE (new nullable columns, new defaulted settings, a wider status check,
-- new functions, re-created functions with the same signatures; nothing dropped):
-- no downtime. Run AFTER 0037. Safe to run more than once.
-- No Edge Function re-deploy is needed: the hold lives in claim_email_messages()
-- (SQL). send-emails / email-track only gained an unused helper field in their
-- emailCore copy (planBatch mirrors the hold for the demo) — re-deploying is optional.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Settings + columns (additive)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.app_config add column if not exists announce_all_email_weekly_cap int not null default 3;
alter table public.app_config add column if not exists announce_email_hold_minutes   int not null default 10;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.app_config'::regclass and conname = 'app_config_announce_cap_range') then
    alter table public.app_config add constraint app_config_announce_cap_range check (announce_all_email_weekly_cap between 0 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.app_config'::regclass and conname = 'app_config_announce_hold_range') then
    alter table public.app_config add constraint app_config_announce_hold_range check (announce_email_hold_minutes between 0 and 60);
  end if;
end $$;

alter table public.announcements add column if not exists email_hold_until timestamptz;
alter table public.announcements add column if not exists cancelled_at     timestamptz;
alter table public.announcements add column if not exists cancelled_by     uuid references public.profiles (id) on delete set null;
create index if not exists announcements_all_email on public.announcements (created_at)
  where audience = 'all' and send_email and cancelled_at is null;

-- Which announcement an in-app notification came from (so cancelling can remove exactly those).
alter table public.notifications add column if not exists announcement_id uuid references public.announcements (id) on delete set null;
create index if not exists notifications_announcement on public.notifications (announcement_id) where announcement_id is not null;

-- Emails held back until this time (the cancel window).
alter table public.email_messages add column if not exists not_before timestamptz;

-- New status 'skipped_cancelled'. NOT VALID + VALIDATE: no long lock on the table.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.email_messages'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%skipped_bouncing%'
  loop
    execute format('alter table public.email_messages drop constraint %I', c);
  end loop;
end $$;
alter table public.email_messages add constraint email_messages_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'bounced', 'skipped_expired', 'skipped_opted_out', 'skipped_bouncing',
                    'skipped_unverified', 'skipped_cancelled')) not valid;
alter table public.email_messages validate constraint email_messages_status_check;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Weekly cap helpers
-- ─────────────────────────────────────────────────────────────────────────────
-- Monday 00:00 America/New_York of the week containing p_now.
create or replace function public.announce_week_start(p_now timestamptz default now())
returns timestamptz language sql stable set search_path = public, extensions as $$
  select date_trunc('week', coalesce(p_now, now()) at time zone 'America/New_York') at time zone 'America/New_York';
$$;

-- The next Monday 00:00 America/New_York (computed in New York time, so a DST change in between is handled).
create or replace function public.announce_week_end(p_now timestamptz default now())
returns timestamptz language sql stable set search_path = public, extensions as $$
  select (date_trunc('week', coalesce(p_now, now()) at time zone 'America/New_York') + interval '7 days') at time zone 'America/New_York';
$$;

-- All-member announcements emailed this week (not cancelled, and they emailed at least one person).
create or replace function public.announce_all_emails_used(p_now timestamptz default now())
returns int language sql stable security definer set search_path = public, extensions as $$
  select count(*)::int from public.announcements a
   where a.audience = 'all' and a.send_email and a.email_count > 0 and a.cancelled_at is null
     and a.created_at >= public.announce_week_start(p_now)
     and a.created_at <  public.announce_week_end(p_now);
$$;

create or replace function public.announce_cap_json(p_now timestamptz default now())
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'cap', c.cap,
    'used', u.used,
    'left', greatest(0, c.cap - u.used),
    'resetsAt', public.announce_week_end(p_now),
    'holdMinutes', c.hold)
  from (select coalesce(announce_all_email_weekly_cap, 3) as cap, coalesce(announce_email_hold_minutes, 10) as hold
          from public.app_config where id = 1) c,
       (select public.announce_all_emails_used(p_now) as used) u;
$$;

-- The friendly refusal (also used by the app, word for word).
create or replace function public.announce_cap_message(p_cap int)
returns text language sql immutable set search_path = public, extensions as $$
  select case when coalesce(p_cap, 0) <= 0
              then 'All-member announcement emails are turned off (weekly limit 0). You can still post it in the app, or send the email to one campus.'
              else p_cap || ' all-member announcement email' || case when p_cap = 1 then ' has' else 's have' end
                   || ' already gone out this week (resets Monday). You can still post it in the app, or send the email to one campus.'
         end;
$$;

-- Announce screen: {cap, used, left, resetsAt, holdMinutes}. Admins + chairs.
create or replace function public.announcement_email_cap(p_now timestamptz default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return public.announce_cap_json(coalesce(p_now, now()));
end $$;

-- Admin → System: YACquest Chairs only. Logged.
create or replace function public.set_announcement_email_settings(p_weekly_cap int, p_hold_minutes int)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_chair();
  v_old public.app_config;
begin
  if p_weekly_cap is null or p_weekly_cap < 0 or p_weekly_cap > 20 then
    perform public.api_error('weekly_cap', 'All-member emails per week: 0–20.');
  end if;
  if p_hold_minutes is null or p_hold_minutes < 0 or p_hold_minutes > 60 then
    perform public.api_error('hold_minutes', 'Cancel window: 0–60 minutes.');
  end if;
  select * into v_old from public.app_config where id = 1 for update;
  update public.app_config set announce_all_email_weekly_cap = p_weekly_cap, announce_email_hold_minutes = p_hold_minutes where id = 1;
  if v_old.announce_all_email_weekly_cap is distinct from p_weekly_cap or v_old.announce_email_hold_minutes is distinct from p_hold_minutes then
    perform public.log_admin_action(v_uid, 'announcement_settings_changed', null,
      jsonb_build_object('weeklyCap', p_weekly_cap, 'holdMinutes', p_hold_minutes,
                         'fromWeeklyCap', v_old.announce_all_email_weekly_cap, 'fromHoldMinutes', v_old.announce_email_hold_minutes));
  end if;
  return public.announce_cap_json(now());
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Recipient count (same rules as send_announcement + email_expand_outbox)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.announcement_audience_count(p_audience text, p_campus text default null, p_user uuid default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_in     int;
  v_email  int;
  v_reason text;
  p        public.profiles;
  v_conf   boolean;
begin
  perform public.require_admin();
  if coalesce(p_audience, '') not in ('all', 'campus', 'user') then
    perform public.api_error('audience', 'Choose who gets this message.');
  end if;
  if p_audience = 'campus' and coalesce(p_campus, '') not in ('duke', 'unc', 'ncsu') then
    perform public.api_error('campus', 'Pick a campus.');
  end if;
  if p_audience = 'user' then
    select * into p from public.profiles where id = p_user;
    if p.id is null then
      return json_build_object('inApp', 0, 'email', 0, 'emailReason', null);
    end if;
    select u.email_confirmed_at is not null and u.email is not null and p.email_verified_at is not null into v_conf
      from auth.users u where u.id = p.id;
    v_reason := case when not p.email_opt_in then 'emails_off'
                     when not coalesce(v_conf, false) then 'not_confirmed'
                     when p.email_bounced then 'bouncing' end;
    return json_build_object('inApp', 1, 'email', case when v_reason is null then 1 else 0 end, 'emailReason', v_reason);
  end if;

  select count(*) into v_in from public.profiles p2
   where p_audience = 'all' or p2.campus = p_campus;
  select count(distinct lower(u.email::text)) into v_email
    from public.profiles p2 join auth.users u on u.id = p2.id
   where (p_audience = 'all' or p2.campus = p_campus)
     and u.email_confirmed_at is not null and u.email is not null
     and p2.email_opt_in and p2.email_verified_at is not null and not p2.email_bounced;
  return json_build_object('inApp', v_in, 'email', v_email, 'emailReason', null);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. send_announcement: copy of 0032 + the weekly cap (advisory lock), the hold
--    (not_before), notifications.announcement_id, and "emailed" = emails queued.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.send_announcement(
  p_title text, p_body text, p_audience text,
  p_campus text default null, p_user_id uuid default null, p_send_email boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin    uuid := public.require_admin();
  v_title    text := trim(coalesce(p_title, ''));
  v_body     text := trim(coalesce(p_body, ''));
  v_email_on boolean := coalesce(p_send_email, false);
  v_id       uuid;
  v_targets  uuid[];
  v_emails   text[];
  v_count    int;
  v_emailed  int := 0;
  v_html     text;
  v_today    int;
  v_unknown  text[];
  v_before   timestamptz;
  v_link     text;
  v_cap      int;
  v_hold_min int;
  v_hold     timestamptz;
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
  -- 0032: every {token} must be a fill-in
  v_unknown := public.email_unknown_tokens(v_title || ' ' || v_body);
  if cardinality(v_unknown) > 0 then
    perform public.api_error('fill_in', 'Fill in or remove: ' || (select string_agg('{' || x || '}', ' ') from unnest(v_unknown) x)
                             || '. Use Insert ▾ for fill-ins.');
  end if;

  select count(*) into v_today from public.announcements
   where created_by = v_admin and created_at > now() - interval '1 day';
  if v_today >= 20 then
    perform public.api_error('limit', 'You''ve sent 20 messages today. Try again tomorrow.');
  end if;

  select coalesce(announce_all_email_weekly_cap, 3), coalesce(announce_email_hold_minutes, 10)
    into v_cap, v_hold_min from public.app_config where id = 1;
  v_cap := coalesce(v_cap, 3);
  v_hold_min := coalesce(v_hold_min, 10);

  -- 0038: weekly cap on all-member EMAILS. One sender at a time past this point (released at commit),
  -- and the count below sees every send that committed before us.
  if v_email_on and p_audience = 'all' then
    perform pg_advisory_xact_lock(hashtext('yacquest_announce_all_email'));
    if public.announce_all_emails_used(now()) >= v_cap then
      perform public.api_error('email_cap', public.announce_cap_message(v_cap));
    end if;
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

  -- 0032: if it names an upcoming event, the email must not go out after that event starts.
  select min(e.starts_at) into v_before
    from public.events e
   where e.starts_at > now() and char_length(trim(e.title)) >= 4
     and position(lower(trim(e.title)) in lower(v_title || ' ' || v_body)) > 0;

  v_hold := case when v_email_on then now() + make_interval(mins => v_hold_min) end;

  insert into public.announcements (title, body, audience, campus, target_user_id, send_email, recipient_count, created_by,
                                    email_send_before, email_hold_until)
  values (v_title, v_body, p_audience,
          case when p_audience = 'campus' then p_campus end,
          case when p_audience = 'user' then p_user_id end,
          v_email_on, v_count, v_admin, v_before, v_hold)
  returning id into v_id;

  -- in-app: filled in per person (0038: tagged with the announcement, so a cancel can remove them)
  insert into public.notifications (user_id, kind, title, body, announcement_id)
  select t, 'announcement',
         public.email_fill(v_title, public.email_fill_values(t, 'announcement:' || v_id)),
         public.email_fill(v_body, public.email_fill_values(t, 'announcement:' || v_id)),
         v_id
    from unnest(v_targets) t;

  if v_email_on then
    select coalesce(array_agg(distinct lower(u.email::text)), '{}') into v_emails
      from public.profiles p join auth.users u on u.id = p.id
     where p.id = any (v_targets)
       and u.email_confirmed_at is not null and u.email is not null
       and p.email_opt_in;    -- 0032: direct messages too
    v_link := public.email_app_url() || '/';
    -- One outbox row; the 0032 trigger renders one email per person (fill-ins, greeting, footer).
    v_html := public.email_layout(v_title,
      '<p style="font-size:16px;line-height:1.5;white-space:pre-wrap;margin:0 0 16px">'
      || regexp_replace(public.html_escape(v_body), '(https?://[^\s<]*[^\s<.,!?;:)])', '<a href="\1" style="color:#0b2a5b;">\1</a>', 'g')
      || '</p>'
      || '<p style="margin:0 0 16px"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Open YACquest</a></p>'
      || '<p style="font-size:13px;color:#4a5672;margin:0">Sent by ' || public.html_escape(coalesce(public.display_name_of(v_admin), 'YAC'))
      || ' via YACquest.</p>');
    perform public.enqueue_email('announcement', v_emails, 'YACquest: ' || v_title,
      v_body || E'\n\nOpen YACquest: ' || v_link || E'\n\n— Sent by ' || coalesce(public.display_name_of(v_admin), 'YAC') || ' via YACquest.',
      v_html, 'announcement:' || v_id);
    -- 0038: the cancel window. Same transaction as the insert, so the sender never sees these rows un-held.
    update public.email_messages set not_before = v_hold
     where campaign_id = 'announcement:' || v_id and status = 'queued' and v_hold_min > 0;
    select count(*) into v_emailed from public.email_messages where campaign_id = 'announcement:' || v_id and status = 'queued';
    update public.announcements set email_count = v_emailed where id = v_id;
  end if;

  perform public.log_admin_action(v_admin, 'announcement_sent',
    case when p_audience = 'user' then p_user_id end,
    jsonb_build_object('title', v_title, 'audience', p_audience, 'campus', p_campus,
                       'recipients', v_count, 'emailed', v_emailed, 'emailHoldUntil', v_hold));

  return json_build_object('id', v_id, 'recipients', v_count, 'emailed', v_emailed,
                           'emailHoldUntil', case when v_email_on and v_hold_min > 0 then v_hold end,
                           'holdMinutes', case when v_email_on then v_hold_min end);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Sending: copy of 0032's claim_email_messages + "not_before in the future → wait"
--    (planBatch() in emailCore.ts has the same rule for the demo).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_email_messages(p_limit int default 5, p_now timestamptz default now())
returns table (id uuid, kind text, email text, subject text, body_text text, body_html text,
               unsub_token text, attempts int, priority int)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  cfg      public.app_config;
  v_limit  int := greatest(1, least(coalesce(p_limit, 5), 50));
  v_left   int;
  v_high   uuid[];
  v_low    uuid[];
  v_room   int;
  v_ids    uuid[];
  v_touch  uuid[];
begin
  perform public.require_service_role();
  select * into cfg from public.app_config where id = 1;

  -- stuck in 'sending' after the 5th try → give up
  update public.email_messages m
     set status = 'failed', error = coalesce(m.error, 'Timed out while sending')
   where m.status = 'sending' and m.attempts >= 5 and coalesce(m.claimed_at, m.created_at) < p_now - interval '15 minutes';

  -- too late → skipped, never sent late
  with x as (
    update public.email_messages m
       set status = 'skipped_expired', error = 'Too late to send (daily email budget was used up).', body_text = '', body_html = ''
     where (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5)
            or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < p_now - interval '15 minutes'))
       and m.send_before is not null and m.send_before <= p_now
    returning m.outbox_id)
  select array_agg(distinct outbox_id) into v_touch from x;

  -- turned email off (or started bouncing) after it was queued
  with x as (
    update public.email_messages m
       set status = case when p.email_bounced then 'skipped_bouncing' else 'skipped_opted_out' end,
           error = case when p.email_bounced then 'Paused: emails to this address bounce.' else 'Email updates are off for this person.' end,
           body_text = '', body_html = ''
      from public.profiles p
     where p.id = m.user_id
       and (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5))
       and (p.email_bounced or (public.email_is_participant_kind(m.kind) and not p.email_opt_in))
    returning m.outbox_id)
  select coalesce(v_touch, '{}') || coalesce(array_agg(distinct outbox_id), '{}') into v_touch from x;

  -- rolling 24 h budget: sent + in flight
  v_left := coalesce(cfg.email_daily_budget, 450)
            - (select count(*) from public.email_messages m
                where (m.status in ('sent', 'bounced') and m.sent_at > p_now - interval '24 hours')
                   or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) >= p_now - interval '15 minutes'))::int;

  select coalesce(array_agg(q.id), '{}') into v_high from (
    select m.id from public.email_messages m
     where m.priority <= 2
       and (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5)
            or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < p_now - interval '15 minutes'))
       and (m.not_before is null or m.not_before <= p_now)     -- 0038: still in its cancel window → wait
     order by m.priority, m.created_at, m.id
     limit greatest(0, least(v_limit, v_left))
     for update skip locked) q;
  v_room := greatest(0, least(v_limit - cardinality(v_high), v_left - coalesce(cfg.email_reserve, 50) - cardinality(v_high)));
  select coalesce(array_agg(q.id), '{}') into v_low from (
    select m.id from public.email_messages m
     where m.priority > 2
       and (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5)
            or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < p_now - interval '15 minutes'))
       and (m.not_before is null or m.not_before <= p_now)     -- 0038: still in its cancel window → wait
     order by m.priority, m.created_at, m.id
     limit v_room
     for update skip locked) q;
  v_ids := v_high || v_low;

  if cardinality(v_touch) > 0 then
    perform public.email_outbox_rollup(t) from unnest(v_touch) t where t is not null;
  end if;

  return query
    with upd as (
      update public.email_messages m
         set status = 'sending', attempts = m.attempts + 1, claimed_at = p_now
       where m.id = any (v_ids)
      returning m.*)
    select u.id, u.kind, u.email, u.subject, u.body_text, u.body_html,
           case when public.email_is_participant_kind(u.kind) then t.token end,
           u.attempts, u.priority
      from upd u left join public.email_unsub_tokens t on t.user_id = u.user_id
     order by u.priority, u.created_at, u.id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Cancel (sender or YACquest Chair, inside the window, before any email left)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_announcement(p_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := public.require_admin();
  a       public.announcements;
  v_camp  text := 'announcement:' || p_id;
  v_name  text;
  v_mail  int;
  v_notes int;
  v_touch uuid[];
begin
  select * into a from public.announcements where id = p_id for update;
  if a.id is null then
    perform public.api_error('not_found', 'Announcement not found.');
  end if;
  if a.created_by is distinct from v_uid and not public.is_chair() then
    perform public.api_error('forbidden', 'Only the person who sent it or a YACquest Chair can cancel it.');
  end if;
  if a.cancelled_at is not null then
    perform public.api_error('already_cancelled', 'This announcement was already cancelled.');
  end if;
  if not a.send_email or a.email_hold_until is null then
    perform public.api_error('not_cancellable', 'Only announcements sent with email can be cancelled (before the emails go out).');
  end if;
  -- lock its emails: a sender run that claimed one first wins, and we see it below
  perform 1 from public.email_messages where campaign_id = v_camp for update;
  if exists (select 1 from public.email_messages
              where campaign_id = v_camp and (status in ('sending', 'sent', 'bounced', 'failed') or attempts > 0)) then
    perform public.api_error('already_sending', 'Already sending — can’t cancel.');
  end if;
  if now() >= a.email_hold_until then
    perform public.api_error('window_closed', 'Too late to cancel: the emails are on their way.');
  end if;

  v_name := coalesce(public.display_name_of(v_uid), 'staff');
  with x as (
    update public.email_messages
       set status = 'skipped_cancelled', error = 'Cancelled by ' || v_name || '.', body_text = '', body_html = ''
     where campaign_id = v_camp and status = 'queued'
    returning outbox_id)
  select count(*), array_agg(distinct outbox_id) into v_mail, v_touch from x;
  if cardinality(v_touch) > 0 then
    perform public.email_outbox_rollup(t) from unnest(v_touch) t where t is not null;
  end if;

  delete from public.notifications where announcement_id = p_id;
  get diagnostics v_notes = row_count;

  update public.announcements set cancelled_at = now(), cancelled_by = v_uid where id = p_id;

  perform public.log_admin_action(v_uid, 'announcement_cancelled', a.target_user_id,
    jsonb_build_object('title', a.title, 'audience', a.audience, 'campus', a.campus, 'announcementId', a.id,
                       'sentBy', public.display_name_of(a.created_by), 'emailsCancelled', v_mail, 'notificationsRemoved', v_notes));
  return json_build_object('cancelled', true, 'emailsCancelled', v_mail, 'notificationsRemoved', v_notes);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Recently sent (list_announcements + cancel state). Admins + chairs.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.recent_announcements(p_limit int default 20)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := public.require_admin();
  v_chair boolean := public.is_chair();
begin
  return (
    select coalesce(json_agg(r order by r."createdAt" desc), '[]'::json)
      from (
        select a.id, a.title, a.body, a.audience, a.campus,
               public.display_name_of(a.target_user_id) as "targetName",
               a.send_email as "sendEmail", a.recipient_count as "recipientCount", a.email_count as "emailCount",
               coalesce(public.display_name_of(a.created_by), 'Unknown') as "senderName",
               a.created_at as "createdAt",
               a.email_hold_until as "emailHoldUntil",
               a.cancelled_at as "cancelledAt",
               case when a.cancelled_at is not null then coalesce(public.display_name_of(a.cancelled_by), 'Unknown') end as "cancelledByName",
               s.started as "emailsStarted",
               (a.send_email and a.cancelled_at is null and a.email_hold_until is not null and now() < a.email_hold_until
                and not s.started and (a.created_by = v_uid or v_chair)) as "canCancel"
          from public.announcements a
          cross join lateral (
            select exists (select 1 from public.email_messages m
                            where m.campaign_id = 'announcement:' || a.id
                              and (m.status in ('sending', 'sent', 'bounced', 'failed') or m.attempts > 0)) as started) s
         order by a.created_at desc
         limit least(greatest(coalesce(p_limit, 20), 1), 100)
      ) r);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Stats: copy of 0032's email_stats + "cancelled" (still part of "skipped")
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.email_stats(p_days int default 30, p_now timestamptz default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_now   timestamptz := coalesce(p_now, now());
  v_days  int := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz := v_now - make_interval(days => v_days);
  v_tot   json;
  v_daily json;
  v_camps json;
begin
  perform public.require_admin();
  with m as (
    select m.*,
           exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'open') as opened,
           exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'click') as clicked
      from public.email_messages m
     where coalesce(m.sent_at, m.created_at) >= v_since and coalesce(m.sent_at, m.created_at) <= v_now
  ), t as (
    select count(*) filter (where status in ('sent', 'bounced')) as sent,
           count(*) filter (where status = 'sent') as delivered,
           count(*) filter (where status = 'sent' and opened) as opened,
           count(*) filter (where status = 'sent' and clicked) as clicked,
           count(*) filter (where status = 'bounced') as bounced,
           count(*) filter (where status like 'skipped%') as skipped,
           count(*) filter (where status = 'skipped_expired') as expired,
           count(*) filter (where status = 'skipped_cancelled') as cancelled,
           count(*) filter (where status = 'failed' and attempts >= 5) as failed
      from m
  )
  select json_build_object(
           'sent', t.sent, 'delivered', t.delivered, 'opened', t.opened, 'clicked', t.clicked,
           'openRate', case when t.delivered > 0 then round(100.0 * t.opened / t.delivered) else 0 end,
           'ctr', case when t.delivered > 0 then round(100.0 * t.clicked / t.delivered) else 0 end,
           'bounced', t.bounced, 'skipped', t.skipped, 'expired', t.expired, 'cancelled', t.cancelled, 'failed', t.failed,
           'unsubscribed', (select count(distinct coalesce(e.user_id::text, e.id::text)) from public.email_events e
                             where e.type = 'unsubscribe' and e.created_at >= v_since and e.created_at <= v_now))
    into v_tot from t;

  select coalesce(json_agg(json_build_object('day', d.day, 'sent', d.sent, 'opened', d.opened, 'clicked', d.clicked) order by d.day), '[]'::json)
    into v_daily
    from (
      select to_char(g.day, 'YYYY-MM-DD') as day,
             count(m.id) filter (where m.status in ('sent', 'bounced')) as sent,
             count(m.id) filter (where m.status = 'sent' and exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'open')) as opened,
             count(m.id) filter (where m.status = 'sent' and exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'click')) as clicked
        from generate_series(date_trunc('day', v_since at time zone 'America/New_York') + interval '1 day',
                             date_trunc('day', v_now at time zone 'America/New_York'), interval '1 day') g(day)
        left join public.email_messages m
               on m.sent_at is not null and date_trunc('day', m.sent_at at time zone 'America/New_York') = g.day
       group by g.day) d;

  select coalesce(json_agg(c order by c."firstAt" desc), '[]'::json) into v_camps
    from (
      select m.campaign_id as id, max(m.campaign_label) as label, min(m.kind) as kind,
             min(m.created_at) as "firstAt",
             count(*) as recipients,
             count(*) filter (where m.status in ('sent', 'bounced')) as sent,
             count(*) filter (where m.status = 'sent' and exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'open')) as opened,
             count(*) filter (where m.status = 'sent' and exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'click')) as clicked,
             count(*) filter (where m.status = 'bounced') as bounced,
             count(*) filter (where exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'unsubscribe')) as unsubscribed,
             count(*) filter (where m.status like 'skipped%') as skipped,
             count(*) filter (where m.status = 'skipped_cancelled') as cancelled,
             count(*) filter (where m.status in ('queued', 'sending') or (m.status = 'failed' and m.attempts < 5)) as waiting,
             count(*) filter (where m.status = 'failed' and m.attempts >= 5) as failed
        from public.email_messages m
       where m.created_at >= v_since and m.created_at <= v_now
       group by m.campaign_id
       order by min(m.created_at) desc
       limit 100) c;

  return json_build_object('days', v_days, 'since', v_since, 'totals', v_tot, 'daily', v_daily, 'campaigns', v_camps);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function
  public.announce_week_start(timestamptz), public.announce_week_end(timestamptz), public.announce_all_emails_used(timestamptz), public.announce_cap_json(timestamptz),
  public.announce_cap_message(int)
from public, anon, authenticated;

-- Staff (admins + chairs; checked inside; settings: chairs only)
revoke execute on function
  public.announcement_email_cap(timestamptz), public.set_announcement_email_settings(int, int),
  public.announcement_audience_count(text, text, uuid), public.cancel_announcement(uuid), public.recent_announcements(int),
  public.send_announcement(text, text, text, text, uuid, boolean), public.email_stats(int, timestamptz)
from public, anon;
grant execute on function
  public.announcement_email_cap(timestamptz), public.set_announcement_email_settings(int, int),
  public.announcement_audience_count(text, text, uuid), public.cancel_announcement(uuid), public.recent_announcements(int),
  public.send_announcement(text, text, text, text, uuid, boolean), public.email_stats(int, timestamptz)
to authenticated;

-- send-emails (service_role key) only — unchanged
revoke execute on function public.claim_email_messages(int, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_email_messages(int, timestamptz) to service_role;

-- Done.

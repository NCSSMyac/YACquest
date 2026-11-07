-- =============================================================================
-- YACquest 0024 — small improvements (additive; safe to re-run; no rule changes)
--
--   • award_game_win(p_event_id, p_user_id, p_note default null) → {points, eventId, userId}
--       Admins + chairs (participants: 'forbidden'). Admin → Events → Who came → "🏆 Game win".
--       The person must have checked in to that event ('not_checked_in'); once per (event, person)
--       ('duplicate', also enforced by the unique index ledger_one_game_win). Awards the game_win
--       activity at its tier value (Tier 2) through the ledger like award_activity: source 'manual',
--       created_by = the admin, ref_id = the event id, reason "Win a Game or Competition: <note>"
--       (default note "Won a game at <event title>"). The person is notified; the 0004 ledger trigger
--       logs it in the admin action log ('points_added') like every other award.
--
--   • RSVP reminders, ~1 hour before an event:
--       - table event_reminders_sent (event_id, user_id) — one row per reminder ever sent, so nobody
--         gets two. Deleting an event removes its rows (and its RSVPs).
--       - queue_event_reminders(p_now default now()) → int (how many reminders were queued). For each
--         RSVP to an event starting in the next 70 minutes, not yet reminded, whose person hasn't
--         checked in: an in-app notification (kind 'event_reminder', "⏰ Starts in 1 hour: <title> at
--         <location>") and, if they have email updates on and a confirmed email, a queued email
--         (kind 'event_reminder', "Reminder: <title> starts at <time>"). Staff are included like anyone
--         who RSVP'd. Service role / pg_cron only. Idempotent: safe to call every 10 minutes.
--       - Triggered with NO new setup: the send-emails Edge Function already calls
--         enqueue_weekly_report_if_due() at the start of every run (Supabase Cron, every 10 minutes);
--         that function is re-created below (copy of 0012) with one extra step that calls
--         queue_event_reminders() first. A reminder failure never blocks the weekly report or emails.
--       - email_outbox.kind also allows 'event_reminder'.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Email kind 'event_reminder'
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
  check (kind in ('weekly_report', 'prize_qualified', 'prize_info', 'test', 'announcement', 'event_reminder'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Quick game-win award from Who came
-- ─────────────────────────────────────────────────────────────────────────────
-- One game win per (person, event) from this button. Older award_activity rows have ref_id null.
create unique index if not exists ledger_one_game_win on public.ledger (user_id, ref_id)
  where source = 'manual' and activity_id = 'game_win' and ref_id is not null;

create or replace function public.award_game_win(p_event_id uuid, p_user_id uuid, p_note text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin  uuid := public.require_admin();
  e        public.events;
  a        public.activities;
  v_name   text;
  v_note   text := trim(coalesce(p_note, ''));
  v_points int;
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  select display_name into v_name from public.profiles where id = p_user_id;
  if v_name is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if not exists (select 1 from public.ledger
                  where user_id = p_user_id and source = 'checkin' and ref_id = e.id::text) then
    perform public.api_error('not_checked_in', v_name || ' didn’t check in to this event.');
  end if;
  if char_length(v_note) > 120 then
    perform public.api_error('note', 'Keep the note under 120 characters.');
  end if;
  if v_note = '' then
    v_note := 'Won a game at ' || e.title;
  end if;
  select * into a from public.activities where id = 'game_win';
  if a.id is null then
    perform public.api_error('activity', 'Unknown activity.');
  end if;
  v_points := public.tier_points(a.tier);

  -- two admins tapping at once: the second waits, then sees the first award
  perform pg_advisory_xact_lock(hashtext('game_win:' || e.id::text || ':' || p_user_id::text));
  if exists (select 1 from public.ledger
              where user_id = p_user_id and source = 'manual' and activity_id = 'game_win' and ref_id = e.id::text) then
    perform public.api_error('duplicate', v_name || ' already got a game win for this event.');
  end if;
  begin
    insert into public.ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason, created_by)
    values (public.active_cycle_id(), p_user_id, v_points, 'manual', a.id, e.id::text, a.title || ': ' || v_note, v_admin);
  exception when unique_violation then
    perform public.api_error('duplicate', v_name || ' already got a game win for this event.');
  end;
  perform public.notify(p_user_id, 'points_adjusted', format('+%s pts — %s', v_points, a.title), v_note);
  return json_build_object('points', v_points, 'eventId', e.id, 'userId', p_user_id);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RSVP reminders
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.event_reminders_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  sent_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_reminders_sent enable row level security;
revoke all on public.event_reminders_sent from anon, authenticated;

create or replace function public.queue_event_reminders(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  r       record;
  v_n     int := 0;
  v_time  text;
  v_mins  numeric;
  v_title text;
  v_body  text;
  v_html  text;
begin
  perform public.require_service_role();
  for r in
    select e.id as event_id, e.title, e.location, e.starts_at,
           coalesce(public.tier_points((select ac.tier from public.activities ac where ac.id = e.activity_id)), public.tier_points(2)) as pts,
           rv.user_id, p.email_opt_in,
           case when u.email_confirmed_at is not null then lower(trim(u.email::text)) end as email
      from public.events e
      join public.event_rsvps rv on rv.event_id = e.id
      join public.profiles p on p.id = rv.user_id
      left join auth.users u on u.id = p.id
     where e.starts_at > p_now
       and e.starts_at <= p_now + interval '70 minutes'
       and not exists (select 1 from public.event_reminders_sent s where s.event_id = e.id and s.user_id = rv.user_id)
       and not exists (select 1 from public.ledger l
                        where l.user_id = rv.user_id and l.source = 'checkin' and l.ref_id = e.id::text)
     order by e.starts_at, rv.created_at
  loop
    insert into public.event_reminders_sent (event_id, user_id) values (r.event_id, r.user_id)
    on conflict do nothing;
    if not found then
      continue;   -- another run got there first
    end if;
    v_time := to_char(r.starts_at at time zone 'America/New_York', 'FMHH12:MI AM');
    v_mins := extract(epoch from (r.starts_at - p_now)) / 60;
    v_title := '⏰ Starts in ' || case when v_mins >= 45 then '1 hour' else greatest(1, round(v_mins))::int || ' min' end
               || ': ' || r.title || ' at ' || r.location;
    v_body := r.title || ' starts at ' || v_time || ' at ' || r.location
              || '. Check in at the event to earn ' || r.pts || ' points.';
    perform public.notify(r.user_id, 'event_reminder', v_title, v_body);
    if r.email_opt_in and r.email is not null and r.email <> '' then
      v_html := public.email_layout('Reminder: ' || r.title,
        '<p style="font-size:16px;margin:0 0 8px"><b>' || public.html_escape(r.title) || '</b> starts at <b>'
        || public.html_escape(v_time) || '</b>.</p>'
        || '<p style="margin:0 0 8px">📍 ' || public.html_escape(r.location) || '</p>'
        || '<p style="margin:0 0 12px">Check in at the event to earn <b>' || r.pts || ' points</b>.</p>'
        || '<p style="font-size:12px;color:#4a5672;margin:0">You get this because you RSVP’d in YACquest and have email updates on (turn them off in Me).</p>');
      perform public.enqueue_email('event_reminder', array[r.email],
        'Reminder: ' || r.title || ' starts at ' || v_time,
        r.title || ' starts at ' || v_time || '.' || chr(10) || 'Where: ' || r.location || chr(10) || chr(10)
          || 'Check in at the event to earn ' || r.pts || ' points.' || chr(10) || chr(10)
          || 'You get this because you RSVP''d in YACquest and have email updates on (turn them off in Me).',
        v_html,
        'reminder:' || r.event_id::text || ':' || r.user_id::text);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- enqueue_weekly_report_if_due: latest definition was in 0012_admin_email_monthly_shoutout.sql.
-- Unchanged except step 0, so the every-10-minutes send-emails run also queues RSVP reminders.
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
-- 4. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.award_game_win(uuid, uuid, text) from public, anon;
grant execute on function public.award_game_win(uuid, uuid, text) to authenticated;

-- Edge Function `send-emails` (service_role key) / pg_cron only
revoke execute on function public.queue_event_reminders(timestamptz), public.enqueue_weekly_report_if_due()
from public, anon, authenticated, service_role;
grant execute on function public.queue_event_reminders(timestamptz), public.enqueue_weekly_report_if_due() to service_role;

-- Done.

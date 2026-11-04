-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Event kinds ARE the three point tiers.
--
--   kind          tier  points (app_config)   activity
--   high_impact   1     tier1_points (35)     cross_campus_event  ("High-Impact Event")
--   active        2     tier2_points (20)     home_event          ("Active Event")
--   digital       3     tier3_points (5)      digital_event       ("Digital Event")
--
-- The admin picks the tier when creating an event; campus is chosen separately
-- (duke | unc | ncsu | all). crossCampus is simply campus = 'all'.
-- Replaces the 0002 kinds (home / cross_campus / panel). Safe to run more than once.
-- Run AFTER 0004 (new snippet in the Supabase SQL Editor → paste → Run).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Activities: friendlier titles + the new Digital event activity.
insert into public.activities (id, tier, title, method) values
  ('digital_event', 3, 'Digital Event', 'event_password')
on conflict (id) do update set tier = excluded.tier, title = excluded.title, method = excluded.method;
update public.activities set title = 'High-Impact Event' where id = 'cross_campus_event';
update public.activities set title = 'Active Event'      where id = 'home_event';

-- 2. Swap the allowed kinds, converting existing events.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.events'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.events drop constraint %I', c);
  end loop;
end $$;

update public.events
   set kind = case
                when kind in ('high_impact', 'active', 'digital') then kind
                when kind = 'cross_campus' or cross_campus or campus = 'all' then 'high_impact'
                else 'active'
              end;

alter table public.events
  add constraint events_kind_check check (kind in ('high_impact', 'active', 'digital'));

-- 3. Points come from the kind (= tier). Campus no longer changes the points.
create or replace function public.event_activity(p_campus text, p_cross_campus boolean, p_kind text)
returns text language sql immutable set search_path = public, extensions as $$
  select case p_kind
    when 'high_impact' then 'cross_campus_event'
    when 'digital'     then 'digital_event'
    else 'home_event'
  end
$$;

update public.events
   set activity_id  = public.event_activity(campus, cross_campus, kind),
       cross_campus = (campus = 'all');

-- 4. Validation for create_event / update_event.
create or replace function public.validate_event(p_event jsonb,
  out v_title text, out v_campus text, out v_cross boolean, out v_kind text, out v_location text,
  out v_starts timestamptz, out v_ends timestamptz, out v_grace int, out v_password text)
language plpgsql stable set search_path = public, extensions as $$
begin
  v_title    := trim(coalesce(p_event->>'title', ''));
  v_campus   := coalesce(p_event->>'campus', '');
  v_kind     := coalesce(p_event->>'kind', '');
  v_location := trim(coalesce(p_event->>'location', ''));
  v_grace    := coalesce((p_event->>'checkInGraceMinutes')::int, 60);
  v_password := trim(coalesce(p_event->>'password', ''));
  if char_length(v_title) < 3 then
    perform public.api_error('title', 'Give the event a title.');
  end if;
  if v_kind not in ('high_impact', 'active', 'digital') then
    perform public.api_error('kind', 'Pick the tier for this event.');
  end if;
  if v_campus not in ('duke', 'unc', 'ncsu', 'all') then
    perform public.api_error('campus', 'Pick a campus (or all campuses).');
  end if;
  v_cross := (v_campus = 'all');
  if char_length(v_password) < 4 then
    perform public.api_error('password', 'Event password: at least 4 characters.');
  end if;
  begin
    v_starts := (p_event->>'startsAt')::timestamptz;
    v_ends   := (p_event->>'endsAt')::timestamptz;
  exception when others then
    perform public.api_error('startsAt', 'Enter a valid start and end time.');
  end;
  if v_starts is null or v_ends is null then
    perform public.api_error('startsAt', 'Enter a valid start and end time.');
  end if;
  if v_ends <= v_starts then
    perform public.api_error('endsAt', 'End time must be after the start.');
  end if;
  if v_grace not between 0 and 1440 then
    perform public.api_error('checkInGraceMinutes', 'Grace period: 0–1440 minutes.');
  end if;
end $$;

revoke execute on function public.event_activity(text, boolean, text) from public, anon;
revoke execute on function public.validate_event(jsonb) from public, anon;

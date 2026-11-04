-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — Event kinds follow the proposal's point categories.
--
--   kind            points                      campus
--   cross_campus    Tier 1 (cross_campus_event)  always 'all'
--   home            Tier 2 (home_event)          duke | unc | ncsu
--   panel           Tier 2 (panel_mentorship)    duke | unc | ncsu
--
-- Choosing the kind decides the points automatically; cross_campus is derived
-- from the kind (no separate checkbox). Safe to run more than once.
-- Run AFTER 0001_init.sql (paste into the Supabase SQL Editor and click Run).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Swap the allowed values on events.kind, converting any existing rows.
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
                when kind = 'panel' and campus <> 'all' and not cross_campus then 'panel'
                when kind in ('home', 'panel') and campus <> 'all' and not cross_campus then kind
                when cross_campus or campus = 'all' then 'cross_campus'
                else 'home'
              end
 where kind not in ('home', 'cross_campus', 'panel')
    or (kind <> 'cross_campus' and (cross_campus or campus = 'all'));

update public.events
   set campus = 'all', cross_campus = true
 where kind = 'cross_campus' and (campus <> 'all' or not cross_campus);

update public.events
   set activity_id = case kind when 'cross_campus' then 'cross_campus_event'
                               when 'panel'        then 'panel_mentorship'
                               else 'home_event' end;

alter table public.events
  add constraint events_kind_check check (kind in ('home', 'cross_campus', 'panel'));

-- 2. Points come from the kind.
create or replace function public.event_activity(p_campus text, p_cross_campus boolean, p_kind text)
returns text language sql immutable set search_path = public, extensions as $$
  select case
    when p_kind = 'cross_campus' or p_cross_campus or p_campus = 'all' then 'cross_campus_event'
    when p_kind = 'panel' then 'panel_mentorship'
    else 'home_event'
  end
$$;

-- 3. Validation: kind decides campus rules; crossCampus is derived, not sent.
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
  if v_kind not in ('home', 'cross_campus', 'panel') then
    perform public.api_error('kind', 'Pick the kind of event.');
  end if;
  if v_kind = 'cross_campus' then
    v_campus := 'all';
    v_cross  := true;
  else
    v_cross := false;
    if v_campus not in ('duke', 'unc', 'ncsu') then
      perform public.api_error('campus', 'Pick the host campus.');
    end if;
  end if;
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

-- Supabase grants new/replaced functions to everyone; keep these internal.
revoke execute on function public.event_activity(text, boolean, text) from public, anon;
revoke execute on function public.validate_event(jsonb) from public, anon;

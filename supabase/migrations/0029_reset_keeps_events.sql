-- =============================================================================
-- 0029 — Upcoming events survive a points reset
-- =============================================================================
-- Bug: participants' Quests tab (list_events in the app = events where cycle_id is the active
-- cycle) lost every event created before a reset_cycle(), because reset_cycle() starts a NEW
-- cycle and the events stayed attached to the archived one — even ones that hadn't happened yet.
--
-- This migration:
--   1. move_open_events_to_active_cycle(): moves every event whose check-in hasn't closed yet
--      (ends_at + grace is in the future = upcoming or live) into the active cycle. Finished
--      events stay with their (archived) cycle, so history and stats per cycle are unchanged.
--      event_rsvps has no cycle column (keyed by event_id), so RSVPs follow the event as-is;
--      a moved event has no check-ins yet in the old cycle unless it was live during the reset,
--      and check-ins always land in the ledger's active cycle anyway.
--   2. reset_cycle(): the 0001 version, unchanged, plus a call to (1) right after the new cycle
--      is created.
--   3. One-time repair: runs (1) now, which re-attaches events orphaned by an earlier reset
--      (e.g. an event created while testing, before the points were reset). Idempotent.
--
-- Everything that reads events by cycle (set_rsvp, event_rsvp_summary, RSVP reminders,
-- admin_stats, Wrapped "events hosted") compares events.cycle_id with active_cycle_id(), so a
-- moved event behaves exactly like one created in the new cycle. check_in() never looked at
-- events.cycle_id. Follow-ups key on event id + time only.
--
-- Safe to re-run.

create or replace function public.move_open_events_to_active_cycle()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cycle uuid := public.active_cycle_id();
  v_moved int;
begin
  if v_cycle is null then
    return 0;
  end if;
  update public.events
     set cycle_id = v_cycle
   where cycle_id is distinct from v_cycle
     and ends_at + make_interval(mins => check_in_grace_minutes) > now();
  get diagnostics v_moved = row_count;
  return v_moved;
end $$;

revoke execute on function public.move_open_events_to_active_cycle() from public, anon, authenticated;

-- End-of-cycle reset: archive the active cycle, start a new one, zero everyone.
-- (0001 version + 0029: upcoming/live events move to the new cycle.)
create or replace function public.reset_cycle(p_confirm text, p_name text, p_ends_at timestamptz)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_new uuid;
  r     record;
begin
  perform public.require_chair();
  if p_confirm is distinct from 'RESET' then
    perform public.api_error('confirm', 'Type RESET to confirm.');
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then
    perform public.api_error('name', 'Give the new cycle a name.');
  end if;
  if p_ends_at is null or p_ends_at <= now() then
    perform public.api_error('endsAt', 'The new cycle must end in the future.');
  end if;

  lock table public.cycles in exclusive mode;
  update public.cycles set is_active = false, archived_at = now() where is_active;
  insert into public.cycles (name, starts_at, ends_at, is_active)
  values (trim(p_name), now(), p_ends_at, true) returning id into v_new;
  update public.profiles set points = 0 where points <> 0;

  -- 0029: events that haven't happened yet (or are happening now) belong to the new cycle.
  perform public.move_open_events_to_active_cycle();

  for r in select id from public.profiles where role = 'participant' loop
    perform public.notify(r.id, 'announcement', 'A new cycle has started!', 'Points were reset to 0. Good luck!');
  end loop;
end $$;

revoke execute on function public.reset_cycle(text, text, timestamptz) from public, anon;
grant execute on function public.reset_cycle(text, text, timestamptz) to authenticated;

-- One-time repair (idempotent): re-attach upcoming/live events orphaned by an earlier reset.
--   = update public.events set cycle_id = public.active_cycle_id()
--      where cycle_id <> public.active_cycle_id() and ends_at + make_interval(mins => check_in_grace_minutes) > now();
select public.move_open_events_to_active_cycle();

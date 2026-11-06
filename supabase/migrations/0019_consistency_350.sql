-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Consistency pass for the 350 goal (no rule changes).
--   A final sweep after the goal went 650 → 350 → 300 → 350 (0018). The goal, tier points,
--   cosmetics, badges and every server-built message already use app_config, so the only
--   stale values left in the latest function definitions were chair-count fallbacks:
--   • set_role(): copy of 0011; only the fallback chair limit (used if
--     app_config.max_chairs were null) changes from 5 to 6.
--   • transfer_chair(): copy of 0011; same fallback change, 5 → 6.
--   (app_config.max_chairs is NOT NULL and 6, so behavior is unchanged.)
--   Nothing else changes: same signatures, same rules, same grants.
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0018. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. set_role: copy of 0011; fallback chair limit 5 → 6
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  t       public.profiles;
  v_max   int;
begin
  if p_role is null or p_role not in ('participant','admin','chair') then
    perform public.api_error('forbidden', 'That role isn’t allowed.');
  end if;
  if p_role = 'chair' then
    perform pg_advisory_xact_lock(hashtext('yacquest:chair_seats'));
  end if;
  select * into t from public.profiles where id = p_user_id for update;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role = 'chair' then
    if p_role = 'chair' then
      return;
    end if;
    perform public.api_error('forbidden', 'A chair can’t be demoted. Chairs step down or hand over their seat instead.');
  end if;
  if p_role in ('admin','chair')
     and not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    perform public.api_error('not_verified',
      format('They need to confirm their email before they can be %s.', case p_role when 'chair' then 'a chair' else 'an admin' end));
  end if;
  if t.role = p_role then
    return;
  end if;
  if p_role = 'chair' then
    select coalesce(max_chairs, 6) into v_max from public.app_config where id = 1;
    v_max := coalesce(v_max, 6);
    if (select count(*) from public.profiles where role = 'chair') >= v_max then
      perform public.api_error('chair_limit', format('YAC already has %s chairs.', v_max));
    end if;
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if p_role = 'chair' then
    perform public.notify(p_user_id, 'announcement', 'You’re now a YAC chair',
      'You can now manage the team, prizes and the cycle. Thanks for leading!');
  elsif p_role = 'admin' then
    perform public.notify(p_user_id, 'announcement', 'You’re now a YACquest admin',
      'You can review submissions, award points and run events. Thanks for helping!');
  else
    perform public.notify(p_user_id, 'announcement', 'Your admin access was removed',
      'You’re back in the game as a participant.');
  end if;
  -- a new participant may already qualify for an open prize spot
  perform public.refresh_prize_race(public.active_cycle_id());
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. transfer_chair: copy of 0011; fallback chair limit 5 → 6
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.transfer_chair(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  t       public.profiles;
  v_name  text;
  v_max   int;
begin
  perform pg_advisory_xact_lock(hashtext('yacquest:chair_seats'));
  if p_user_id = v_chair then
    perform public.api_error('forbidden', 'You already hold a chair seat.');
  end if;
  select * into t from public.profiles where id = p_user_id for update;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role = 'chair' then
    perform public.api_error('forbidden', 'They are already a chair.');
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    perform public.api_error('not_verified', 'They need to confirm their email before they can be a chair.');
  end if;

  update public.profiles set role = 'admin' where id = v_chair;
  update public.profiles set role = 'chair' where id = p_user_id;
  select max_chairs into v_max from public.app_config where id = 1;
  v_max := coalesce(v_max, 6);
  if (select count(*) from public.profiles where role = 'chair') > v_max then
    perform public.api_error('chair_limit', format('YAC already has %s chairs.', v_max));
  end if;

  select display_name into v_name from public.profiles where id = v_chair;
  perform public.notify(p_user_id, 'announcement', 'You’re now a YAC chair',
    v_name || ' handed you their chair seat. You can now manage the team, prizes and the cycle.');
  perform public.notify(v_chair, 'announcement', 'You handed over your chair seat',
    t.display_name || ' is now a chair. You stay on as an admin.');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.set_role(uuid, text) from public, anon;
grant  execute on function public.set_role(uuid, text) to authenticated;
revoke execute on function public.transfer_chair(uuid) from public, anon;
grant  execute on function public.transfer_chair(uuid) to authenticated;

-- Done.

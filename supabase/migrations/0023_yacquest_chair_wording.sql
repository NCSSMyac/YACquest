-- ═══════════════════════════════════════════════════════════════════════════
-- 0023 — Wording only: the 'chair' role is called "YACquest Chair" everywhere people read it.
--   The people with role 'chair' run THIS APP (YACquest); they are not chairs of the YAC
--   organization. No behavior, rule, role value, error CODE or grant changes: each function
--   below is its LATEST definition copied exactly, with only the human-readable text changed
--   (error messages after the code, notification titles/bodies).
--
--   Functions re-created (latest source in brackets):
--     require_chair [0001], set_role [0019], transfer_chair [0019], step_down_chair [0011],
--     crown_hero [0020], grant_staff_reward [0020], admin_event_attendees [0013],
--     admin_event_rsvps [0022].
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- require_chair: latest definition was in 0001_init.sql
create or replace function public.require_chair()
returns uuid language plpgsql stable security definer set search_path = public, extensions as $$
declare v uuid := public.require_user();
begin
  if not public.is_chair() then
    perform public.api_error('forbidden', 'Only a YACquest Chair can do that.');
  end if;
  return v;
end $$;

-- set_role: latest definition was in 0019_consistency_350.sql
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
    perform public.api_error('forbidden', 'A YACquest Chair can’t be demoted. YACquest Chairs step down or hand over their seat instead.');
  end if;
  if p_role in ('admin','chair')
     and not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    perform public.api_error('not_verified',
      format('They need to confirm their email before they can be %s.', case p_role when 'chair' then 'a YACquest Chair' else 'an admin' end));
  end if;
  if t.role = p_role then
    return;
  end if;
  if p_role = 'chair' then
    select coalesce(max_chairs, 6) into v_max from public.app_config where id = 1;
    v_max := coalesce(v_max, 6);
    if (select count(*) from public.profiles where role = 'chair') >= v_max then
      perform public.api_error('chair_limit', format('There are already %s YACquest Chairs.', v_max));
    end if;
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if p_role = 'chair' then
    perform public.notify(p_user_id, 'announcement', 'You’re now a YACquest Chair',
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

-- transfer_chair: latest definition was in 0019_consistency_350.sql
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
    perform public.api_error('forbidden', 'You already hold a YACquest Chair seat.');
  end if;
  select * into t from public.profiles where id = p_user_id for update;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role = 'chair' then
    perform public.api_error('forbidden', 'They are already a YACquest Chair.');
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    perform public.api_error('not_verified', 'They need to confirm their email before they can be a YACquest Chair.');
  end if;

  update public.profiles set role = 'admin' where id = v_chair;
  update public.profiles set role = 'chair' where id = p_user_id;
  select max_chairs into v_max from public.app_config where id = 1;
  v_max := coalesce(v_max, 6);
  if (select count(*) from public.profiles where role = 'chair') > v_max then
    perform public.api_error('chair_limit', format('There are already %s YACquest Chairs.', v_max));
  end if;

  select display_name into v_name from public.profiles where id = v_chair;
  perform public.notify(p_user_id, 'announcement', 'You’re now a YACquest Chair',
    v_name || ' handed you their YACquest Chair seat. You can now manage the team, prizes and the cycle.');
  perform public.notify(v_chair, 'announcement', 'You handed over your YACquest Chair seat',
    t.display_name || ' is now a YACquest Chair. You stay on as an admin.');
end $$;

-- step_down_chair: latest definition was in 0011_five_chairs.sql
create or replace function public.step_down_chair()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
begin
  perform pg_advisory_xact_lock(hashtext('yacquest:chair_seats'));
  if (select count(*) from public.profiles where role = 'chair') <= 1 then
    perform public.api_error('last_chair', 'You’re the only YACquest Chair — make someone else a YACquest Chair first.');
  end if;
  update public.profiles set role = 'admin' where id = v_chair;
  perform public.notify(v_chair, 'announcement', 'You stepped down as YACquest Chair',
    'You stay on as an admin. A current YACquest Chair can make you a YACquest Chair again any time.');
end $$;

-- crown_hero: latest definition was in 0020_staff_rewards.sql
create or replace function public.crown_hero(p_user_id uuid, p_note text default '')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  v_note  text := trim(coalesce(p_note, ''));
  t       public.profiles;
  cur     public.hero_reigns;
begin
  perform pg_advisory_xact_lock(hashtext('yacquest:hero'));
  select * into t from public.profiles where id = p_user_id;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role not in ('admin', 'chair') then
    perform public.api_error('not_staff', 'Only admins and YACquest Chairs can be Hero of the Week.');
  end if;
  if char_length(v_note) > 120 then
    perform public.api_error('note', 'Keep the note to 120 characters.');
  end if;
  select * into cur from public.hero_reigns where ended_at is null for update;
  if cur.id is not null then
    update public.hero_reigns set ended_at = now(), ended_by = v_chair where id = cur.id;
    if cur.user_id <> p_user_id then
      perform public.strip_staff_look(cur.user_id, true);
    end if;
  end if;
  insert into public.hero_reigns (user_id, note, crowned_by) values (p_user_id, v_note, v_chair);
  perform public.notify(p_user_id, 'hero_crowned', 'You’re Hero of the Week!',
    case when v_note <> '' then v_note
         else coalesce(public.display_name_of(v_chair), 'A YACquest Chair') || ' crowned you at the YAC meeting. Thank you!' end);
  perform public.log_admin_action(v_chair, 'hero_crowned', p_user_id, jsonb_build_object('note', nullif(v_note, '')));
end $$;

-- grant_staff_reward: latest definition was in 0020_staff_rewards.sql
create or replace function public.grant_staff_reward(p_user_id uuid, p_reward text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  t       public.profiles;
  v_name  text := case p_reward
                    when 'wizard_council_hat' then 'Wizard Council Hat'
                    when 'royal_scepter'      then 'Royal Scepter'
                    when 'starlit_throne'     then 'Starlit Throne Room'
                    when 'council_mvp'        then 'Council MVP'
                  end;
begin
  if v_name is null then
    perform public.api_error('reward', 'Pick one of the Council rewards.');
  end if;
  select * into t from public.profiles where id = p_user_id;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role not in ('admin', 'chair') then
    perform public.api_error('not_staff', 'Only admins and YACquest Chairs can get Council rewards.');
  end if;
  insert into public.staff_grants (user_id, reward_id, granted_by) values (p_user_id, p_reward, v_chair)
  on conflict (user_id, reward_id) do nothing;
  if not found then
    perform public.api_error('already', format('%s already has the %s.', t.display_name, v_name));
  end if;
  if p_reward = 'council_mvp' then
    perform public.notify(p_user_id, 'staff_reward', 'Council MVP: the Golden Yak is yours!',
      'Pick the Legendary Golden Yak under Me → Edit profile.');
  else
    perform public.notify(p_user_id, 'staff_reward', 'New Council look: ' || v_name,
      coalesce(public.display_name_of(v_chair), 'A YACquest Chair') || ' gave you the ' || v_name || '. Find it in the Wardrobe.');
  end if;
  perform public.log_admin_action(v_chair, 'staff_reward_granted', p_user_id, jsonb_build_object('reward', p_reward, 'name', v_name));
end $$;

-- admin_event_attendees: latest definition was in 0013_launch_extras.sql
create or replace function public.admin_event_attendees(p_event_id uuid)
returns table (user_id uuid, display_name text, handle text, campus text, checked_in_at timestamptz, points int)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    perform public.require_user();
    perform public.api_error('forbidden', 'Only admins and YACquest Chairs can see who came.');
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  return query
    select l.user_id, p.display_name, p.handle::text, p.campus, l.created_at, l.amount
      from public.ledger l join public.profiles p on p.id = l.user_id
     where l.source = 'checkin' and l.ref_id = p_event_id::text
     order by l.created_at, l.id;
end $$;

-- admin_event_rsvps: latest definition was in 0022_rsvp_streaks.sql
create or replace function public.admin_event_rsvps(p_event_id uuid)
returns table (user_id uuid, display_name text, handle text, campus text, email text, rsvp_at timestamptz, checked_in boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    perform public.require_user();
    perform public.api_error('forbidden', 'Only admins and YACquest Chairs can see who’s going.');
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  return query
    select r.user_id, p.display_name, p.handle::text, p.campus, p.email::text, r.created_at,
           exists (select 1 from public.ledger l where l.user_id = r.user_id and l.source = 'checkin' and l.ref_id = p_event_id::text)
      from public.event_rsvps r join public.profiles p on p.id = r.user_id
     where r.event_id = p_event_id
     order by r.created_at, p.display_name, r.user_id;
end $$;

-- Grants (Supabase auto-grants new functions to anon + authenticated; same as before)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function
  public.require_chair(), public.set_role(uuid, text), public.transfer_chair(uuid), public.step_down_chair(),
  public.crown_hero(uuid, text), public.grant_staff_reward(uuid, text),
  public.admin_event_attendees(uuid), public.admin_event_rsvps(uuid)
from public, anon;
grant execute on function
  public.require_chair(), public.set_role(uuid, text), public.transfer_chair(uuid), public.step_down_chair(),
  public.crown_hero(uuid, text), public.grant_staff_reward(uuid, text),
  public.admin_event_attendees(uuid), public.admin_event_rsvps(uuid)
to authenticated;

-- Done.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 — Harder prize race + friend codes reward BOTH people.
--
--   • Tier 1 (High-Impact) = 35 pts, Tier 2 (Active) = 20, Tier 3 (Digital) = 5,
--     prize goal 650. Simulated with 300 people, Nov 8 → May 1: about 3 people
--     reach 650, the first around mid-April. (scripts/simulate-points.py)
--   • When someone who signed up with a friend code checks in to their first
--     event, the friend who shared the code AND the new member each get Tier 1.
--   • Manual adjustments: add at most one Tier 1 (35) per entry; remove up to the goal.
--   • Wrong-password message no longer mentions "campus leads".
-- Run AFTER 0002. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- The goal is no longer set here (it was 650 at the time). 0018 sets the current goal (350);
-- leaving it out means re-running this file never puts a stale goal back, even briefly.
update public.app_config set tier1_points = 35, tier2_points = 20, tier3_points = 5 where id = 1;

insert into public.activities (id, tier, title, method)
values ('joined_with_code', 1, 'Joined With a Friend Code', 'referral')
on conflict (id) do update set tier = excluded.tier, title = excluded.title, method = excluded.method;

create or replace function public.check_in(p_event_id uuid, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid    uuid := public.require_user();
  v_cycle  uuid := public.active_cycle_id();
  me       public.profiles;
  e        public.events;
  v_pw     text;
  v_act    text;
  v_points int;
  v_ref_id bigint;
  cfg      public.app_config;
begin
  select * into cfg from public.app_config where id = 1;
  select * into me from public.profiles where id = v_uid;
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  if now() < e.starts_at - interval '30 minutes' then
    perform public.api_error('not_open', 'Check-in opens 30 minutes before the event starts.');
  end if;
  if now() > e.ends_at + make_interval(mins => e.check_in_grace_minutes) then
    perform public.api_error('expired', 'Check-in for this event has closed.');
  end if;
  if exists (select 1 from public.ledger where user_id = v_uid and source = 'checkin' and ref_id = e.id::text) then
    perform public.api_error('duplicate', 'You already checked in to this event.');
  end if;
  select password into v_pw from public.event_secrets where event_id = e.id;
  if coalesce(trim(p_password), '') = '' or lower(trim(p_password)) <> lower(trim(coalesce(v_pw, ''))) then
    perform public.api_error('wrong_password', 'Wrong password. Use the password announced at the event.');
  end if;

  v_act := public.event_activity(e.campus, e.cross_campus, e.kind);
  v_points := public.tier_points((select tier from public.activities where id = v_act));

  begin
    insert into public.ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason)
    values (v_cycle, v_uid, v_points, 'checkin', v_act, e.id::text, 'Checked in: ' || e.title);
  exception when unique_violation then
    perform public.api_error('duplicate', 'You already checked in to this event.');
  end;
  update public.events set attendee_count = attendee_count + 1 where id = e.id;

  -- Friend-code bonus (first check-in of the cycle only, so fake accounts that never
  -- show up earn nothing). BOTH people earn Tier 1:
  --   • the referrer (activity bring_new_alum), up to referrals_per_cycle friends;
  --   • the new member (activity joined_with_code), once.
  if me.referred_by is not null
     and (select count(*) from public.ledger where user_id = v_uid and source = 'checkin' and cycle_id = v_cycle) = 1
  then
    if (select count(*) from public.ledger
         where user_id = me.referred_by and source = 'referral' and activity_id = 'bring_new_alum' and cycle_id = v_cycle)
       < cfg.referrals_per_cycle
    then
      insert into public.ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason)
      values (v_cycle, me.referred_by, cfg.tier1_points, 'referral', 'bring_new_alum', v_uid::text,
              'Brought a new alum: ' || me.display_name)
      on conflict (ref_id) where source = 'referral' do nothing
      returning id into v_ref_id;
      if v_ref_id is not null then
        perform public.notify(me.referred_by, 'points_adjusted',
          format('+%s for bringing a friend', cfg.tier1_points),
          me.display_name || ' checked in to their first YAC event.');
      end if;
    end if;
    v_ref_id := null;
    insert into public.ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason)
    values (v_cycle, v_uid, cfg.tier1_points, 'referral', 'joined_with_code', 'joined:' || v_uid::text,
            'Joined with a friend code')
    on conflict (ref_id) where source = 'referral' do nothing
    returning id into v_ref_id;
    if v_ref_id is not null then
      perform public.notify(v_uid, 'points_adjusted',
        format('+%s for joining with a friend code', cfg.tier1_points),
        'Welcome bonus for coming to your first YAC event!');
    end if;
  end if;

  return json_build_object('points', v_points, 'activityId', v_act);
end $$;

create or replace function public.dashboard_stats()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  me public.profiles;
  v_cycle uuid := public.active_cycle_id();
begin
  perform public.require_user();
  select * into me from public.profiles where id = auth.uid();
  return json_build_object(
    'points', me.points,
    'rankOverall', case when me.role = 'participant' then
        1 + (select count(*) from public.profiles o where o.role = 'participant' and o.points > me.points) else 0 end,
    'rankCampus', case when me.role = 'participant' then
        1 + (select count(*) from public.profiles o where o.role = 'participant' and o.campus = me.campus and o.points > me.points) else 0 end,
    'participants', (select count(*) from public.profiles where role = 'participant'),
    'referralsUsed', (select count(*) from public.ledger where user_id = me.id and source = 'referral' and activity_id = 'bring_new_alum' and cycle_id = v_cycle),
    'unreadCount', (select count(*) from public.notifications where user_id = me.id and not read)
  );
end $$;

create or replace function public.adjust_points(p_user_id uuid, p_amount int, p_reason text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.require_admin();
  v_name  text;
  cfg     public.app_config;
begin
  select * into cfg from public.app_config where id = 1;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  -- Additions are capped at one High-Impact action so manual awards can't skip the race.
  -- Removals can go as low as the prize goal, to fully correct mistakes or cheating.
  if p_amount is null or p_amount = 0 or p_amount > cfg.tier1_points or p_amount < -cfg.prize_goal then
    perform public.api_error('amount', format('Add at most %s points at a time (one High-Impact action), or remove up to %s. Not 0.', cfg.tier1_points, cfg.prize_goal));
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    perform public.api_error('reason', 'A reason is required.');
  end if;
  select display_name into v_name from public.profiles where id = v_admin;
  insert into public.ledger (cycle_id, user_id, amount, source, reason, created_by)
  values (public.active_cycle_id(), p_user_id, p_amount, 'manual', trim(p_reason), v_admin);
  perform public.notify(p_user_id, 'points_adjusted',
    format('%s%s pts from %s', case when p_amount > 0 then '+' else '' end, p_amount, v_name), trim(p_reason));
end $$;

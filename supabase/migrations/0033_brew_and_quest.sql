-- ═══════════════════════════════════════════════════════════════════════════
-- 0033 — "Brew & Quest": limited reward events (reusable for future promos)
--
--   • event_rewards (one row per special event): the limited free item ("free
--     coffee"), how many (limit_count), venue, a staff-only SECRET WORD the café
--     checks, the reward outfit set and the countdown message. RPC only: the
--     secret word is readable by staff (admin_event_rewards / admin_event_passes)
--     and by a pass holder for their own pass while it is valid. Participants get
--     everything else from event_rewards_public() (never the secret, never counts).
--   • check_in(): copy of 0003 + one call to grant_event_reward() after a
--     successful check-in. Everyone who checks in (participants AND staff) keeps
--     the event's limited-edition outfit forever (event_unlocks, cosmetics rule
--     'event'). The first limit_count PARTICIPANTS get a pass number
--     (reward_passes), assigned under a row lock on the event's reward row so two
--     phones can never get the same number or overshoot the limit. One free item
--     per person per series (= outfit set) across ALL events of that series.
--     check_in() returns {points, activityId, reward:{outfitSet, items, badge?, pass?}};
--     `pass` is present ONLY for the person who just got one.
--   • Pass valid for 30 minutes after check-in. The holder can mark it used
--     (mark_my_pass_used); staff can mark used / undo (admin_mark_pass_used).
--   • "Early Bird ☕" special badge: badges_for() = copy of 0022 + a 17th row
--     (earned by holding any reward pass). The app keeps showing the 16 core
--     badges as "x / 16" and lists Early Bird under "Special badges".
--   • New-outfit alert: event_unlocks.seen_at; my_event_rewards() returns the
--     unseen item ids + my passes; mark_event_unlocks_seen() clears them.
--   • Latte Night Scholar set: cozy_beanie (hat), latte_aplus (accessory),
--     moonlit_nook (background). Never obtainable any other way.
--
-- Contract: docs/BACKEND.md, section "0033". Run AFTER 0032. Safe to run more than once
-- (additive: new tables/columns/functions; check_in, unlocks_for, badges_for re-created).
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables (RLS on, no policies, no grants: RPC only)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.event_rewards (
  event_id    uuid primary key references public.events (id) on delete cascade,
  item_label  text not null default 'free coffee' check (char_length(item_label) between 1 and 40),
  limit_count int  not null check (limit_count between 1 and 500),
  venue       text not null default 'TBD' check (char_length(venue) between 1 and 80),
  secret_word text not null check (char_length(secret_word) between 3 and 30),
  outfit_set  text not null default 'latte_night_scholar' check (char_length(outfit_set) between 1 and 60),
  message     text not null check (char_length(message) between 1 and 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.event_rewards enable row level security;
revoke all on public.event_rewards from anon, authenticated;

create table if not exists public.reward_passes (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- one free item per person per series (the event's outfit set) across ALL its events
  series     text not null,
  pass_no    int  not null check (pass_no >= 1),
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  used_by    text check (used_by in ('self', 'staff')),
  primary key (event_id, user_id),
  unique (event_id, pass_no),
  check ((used_at is null) = (used_by is null))
);
create unique index if not exists reward_passes_one_per_series on public.reward_passes (series, user_id);
alter table public.reward_passes enable row level security;
revoke all on public.reward_passes from anon, authenticated;

-- Owned event outfit items (forever; no FK to cosmetics so re-running 0009 can't wipe them).
create table if not exists public.event_unlocks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  item_id     text not null,
  event_id    uuid references public.events (id) on delete set null,
  unlocked_at timestamptz not null default now(),
  seen_at     timestamptz,
  primary key (user_id, item_id)
);
alter table public.event_unlocks enable row level security;
revoke all on public.event_unlocks from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cosmetics: rule_type 'event' (rule_value = outfit set id) + Latte Night Scholar
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.cosmetics'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%rule_type%'
  loop
    execute format('alter table public.cosmetics drop constraint %I', c);
  end loop;
end $$;
alter table public.cosmetics
  add constraint cosmetics_rule_type_check check (rule_type in ('free', 'points', 'badge', 'badges', 'seasonal', 'event'));

insert into public.cosmetics (id, slot, name, rule_type, rule_value, sort_order) values
  ('cozy_beanie',  'hat',        'Cozy Knit Beanie',   'event', 'latte_night_scholar', 201),
  ('latte_aplus',  'accessory',  'A+ Latte',           'event', 'latte_night_scholar', 202),
  ('moonlit_nook', 'background', 'Moonlit Study Nook', 'event', 'latte_night_scholar', 203)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, rule_type = excluded.rule_type,
      rule_value = excluded.rule_value, sort_order = excluded.sort_order;

-- Item ids of an outfit set, in catalogue order.
create or replace function public.event_outfit_items(p_set text)
returns text[] language sql stable security definer set search_path = public, extensions as $$
  select coalesce(array_agg(c.id order by c.sort_order, c.id), '{}'::text[])
    from public.cosmetics c where c.rule_type = 'event' and c.rule_value = p_set;
$$;

-- unlocks_for: copy of 0028 + owned event items.
create or replace function public.unlocks_for(p_user uuid)
returns text[] language sql stable security definer set search_path = public, extensions as $$
  with b as materialized (select * from public.badges_for(p_user)),
  me as (select coalesce((select p.points from public.profiles p where p.id = p_user), 0) as pts)
  select coalesce(array_agg(c.id order by c.sort_order, c.id), '{}'::text[])
    from public.cosmetics c, me
   where case c.rule_type
           when 'free'     then true
           when 'points'   then me.pts >= c.rule_value::int
           when 'badge'    then exists (select 1 from b where b.id = c.rule_value and b.earned)
           when 'badges'   then (select count(*) from b where b.earned) >= c.rule_value::int
           when 'seasonal' then exists (select 1 from public.seasonal_unlocks su where su.user_id = p_user and su.item_id = c.id)
           when 'event'    then exists (select 1 from public.event_unlocks eu where eu.user_id = p_user and eu.item_id = c.id)
           else false
         end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Badges: copy of 0022's badges_for() + "Early Bird ☕" (17th row, special)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.badges_for(p_user uuid)
returns table (id text, earned boolean, progress int, goal int)
language sql stable security definer set search_path = public, extensions as $$
  with l as (
    select l.* from public.ledger l
     where l.user_id = p_user and l.cycle_id = public.active_cycle_id() and l.amount > 0
  ),
  ci as (
    select l.created_at, e.campus, e.kind
      from l left join public.events e on e.id::text = l.ref_id
     where l.source = 'checkin'
  ),
  s as (
    select
      (select count(*) from ci)::int as checkins,
      (select count(distinct ci.campus) from ci where ci.campus in ('duke', 'unc', 'ncsu'))::int as campuses,
      (select count(*) from ci where ci.kind = 'high_impact')::int as high_impact,
      (select count(distinct to_char(ci.created_at at time zone 'America/New_York', 'YYYY-MM')) from ci)::int as months,
      (select count(*) from l join public.activities a on a.id = l.activity_id
        where l.source = 'submission' and a.tier = 3)::int as digital,
      (select count(*) from l where l.activity_id = 'event_photos')::int as photos,
      (select count(*) from l where l.activity_id = 'bring_new_alum')::int as recruits,
      (select count(*) from l where l.activity_id = 'annual_fund')::int as gifts,
      (select count(*) from l where l.activity_id = 'game_win')::int as wins,
      ((select count(*) from public.feedback f where f.user_id = p_user)
       + (select count(*) from public.prize_suggestions ps where ps.user_id = p_user))::int as voices,
      coalesce((select p.points from public.profiles p where p.id = p_user), 0) as pts,
      coalesce((select c.prize_goal from public.app_config c where c.id = 1), 350) as prize_goal,
      (select count(*) from public.monthly_standings() ms
        where ms.user_id = p_user and ms.place = 1 and ms.final)::int as month_wins,
      (select cs.best_streak from public.checkin_streak(p_user) cs) as best_streak,  -- 0022
      (select count(*) from public.reward_passes rp where rp.user_id = p_user)::int as passes  -- 0033
  ),
  raw (ord, bid, val, bgoal) as (
              select  1, 'first_checkin', s.checkins,    1           from s
    union all select  2, 'regular',       s.checkins,    5           from s
    union all select  3, 'veteran',       s.checkins,    10          from s
    union all select  4, 'explorer',      s.campuses,    3           from s
    union all select  5, 'big_moment',    s.high_impact, 1           from s
    union all select  6, 'seasons',       s.months,      3           from s
    union all select  7, 'digital',       s.digital,     3           from s
    union all select  8, 'shutterbug',    s.photos,      1           from s
    union all select  9, 'recruiter',     s.recruits,    1           from s
    union all select 10, 'giver',         s.gifts,       1           from s
    union all select 11, 'champion',      s.wins,        1           from s
    union all select 12, 'voice',         s.voices,      1           from s
    union all select 13, 'halfway',       s.pts,         (s.prize_goal + 1) / 2 from s
    union all select 14, 'legend',        s.pts,         s.prize_goal from s
    union all select 15, 'monthly_star',  s.month_wins,  1           from s
    union all select 16, 'hot_streak',    s.best_streak, 3           from s   -- 0022
    union all select 17, 'early_bird',    s.passes,      1           from s   -- 0033 special (not one of the 16)
  )
  select raw.bid, raw.val >= raw.bgoal, least(greatest(raw.val, 0), raw.bgoal), raw.bgoal
    from raw order by raw.ord;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helpers
-- ─────────────────────────────────────────────────────────────────────────────
-- A friendly secret word like MOCHA-42 (staff can type their own).
create or replace function public.gen_secret_word()
returns text language sql volatile set search_path = public, extensions as $$
  select (array['MOCHA','LATTE','CHAI','BREW','BEAN','FOAM','CREMA','COCOA','HONEY','MAPLE','TOFFEE','CHURRO'])[1 + floor(random() * 12)::int]
         || '-' || (10 + floor(random() * 90)::int)::text;
$$;

create or replace function public.reward_pass_minutes()
returns int language sql immutable as $$ select 30 $$;

-- One pass as JSON (the secret word only when asked for).
create or replace function public.reward_pass_json(rp public.reward_passes, p_with_secret boolean)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'eventId', rp.event_id, 'eventTitle', e.title, 'campus', e.campus,
    'passNo', rp.pass_no, 'limit', r.limit_count, 'venue', r.venue, 'item', r.item_label,
    'checkedInAt', rp.created_at,
    'validUntil', rp.created_at + make_interval(mins => public.reward_pass_minutes()),
    'usedAt', rp.used_at, 'usedBy', rp.used_by)
    || case when p_with_secret then jsonb_build_object('secretWord', r.secret_word) else '{}'::jsonb end
    from public.events e join public.event_rewards r on r.event_id = e.id
   where e.id = rp.event_id;
$$;

-- Internal: called by check_in() right after a successful check-in. Unlocks the outfit for everyone;
-- the first limit_count participants (one per person per series) get a pass number. Null = normal event.
create or replace function public.grant_event_reward(p_event uuid, p_user uuid, p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r      public.event_rewards;
  v_items text[];
  v_n    int;
  v_pass public.reward_passes;
  v_out  jsonb;
  v_had  int;
begin
  -- Row lock per event: concurrent check-ins to the same event queue here, so pass numbers are
  -- handed out strictly in order and never beyond limit_count.
  select * into r from public.event_rewards where event_id = p_event for update;
  if r.event_id is null then
    return null;
  end if;
  v_items := public.event_outfit_items(r.outfit_set);
  -- already owned every piece (a second event of the same series) → the app says so instead of "NEW OUTFIT"
  select count(*) into v_had from public.event_unlocks where user_id = p_user and item_id = any (v_items);
  insert into public.event_unlocks (user_id, item_id, event_id, unlocked_at)
  select p_user, i, p_event, p_at from unnest(v_items) i
  on conflict (user_id, item_id) do nothing;

  v_out := jsonb_build_object('outfitSet', r.outfit_set, 'items', to_jsonb(v_items),
                             'alreadyOwned', v_had >= coalesce(array_length(v_items, 1), 0));

  -- Staff earn points + the outfit but never use up a pass.
  if not public.is_staff_user(p_user)
     and not exists (select 1 from public.reward_passes where series = r.outfit_set and user_id = p_user)
  then
    select count(*) into v_n from public.reward_passes where event_id = p_event;
    if v_n < r.limit_count then
      begin
        insert into public.reward_passes (event_id, user_id, series, pass_no, created_at)
        values (p_event, p_user, r.outfit_set, v_n + 1, p_at)
        returning * into v_pass;
      exception when unique_violation then
        v_pass := null;  -- a pass for this series at another event at the same moment: no second pass
      end;
      if v_pass.event_id is not null then
        v_out := v_out || jsonb_build_object('badge', 'early_bird', 'pass', public.reward_pass_json(v_pass, true));
      end if;
    end if;
  end if;
  return v_out;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. check_in(): copy of 0003 + the reward hook (unchanged rules otherwise)
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_reward jsonb;
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

  -- 0033: limited reward events (outfit for everyone, pass for the first N participants)
  v_reward := public.grant_event_reward(e.id, v_uid, now());

  return json_build_object('points', v_points, 'activityId', v_act, 'reward', v_reward);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Staff: set up / read special reward events, passes, mark used
-- ─────────────────────────────────────────────────────────────────────────────
-- p_reward = {itemLabel, limit, venue, secretWord, outfitSet, message}; null or {} removes the reward
-- (only while no passes were handed out).
create or replace function public.set_event_reward(p_event_id uuid, p_reward jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me     uuid := public.require_admin();
  e        public.events;
  v_issued int;
  v_item   text := trim(coalesce(p_reward->>'itemLabel', ''));
  v_venue  text := trim(coalesce(p_reward->>'venue', ''));
  v_word   text := upper(trim(coalesce(p_reward->>'secretWord', '')));
  v_set    text := trim(coalesce(p_reward->>'outfitSet', ''));
  v_msg    text := trim(coalesce(p_reward->>'message', ''));
  v_limit  int;
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  select count(*) into v_issued from public.reward_passes where event_id = p_event_id;
  if p_reward is null or p_reward = '{}'::jsonb or jsonb_typeof(p_reward) <> 'object' then
    if v_issued > 0 then
      perform public.api_error('has_passes', 'Passes were already handed out for this event, so the special reward can’t be removed.');
    end if;
    delete from public.event_rewards where event_id = p_event_id;
    if found then
      perform public.log_admin_action(v_me, 'event_reward_removed', null, jsonb_build_object('title', e.title));
    end if;
    return null;
  end if;
  begin
    v_limit := (p_reward->>'limit')::int;
  exception when others then
    v_limit := null;
  end;
  if v_limit is null or v_limit < 1 or v_limit > 500 then
    perform public.api_error('limit', 'Limit: a number from 1 to 500.');
  end if;
  if v_limit < v_issued then
    perform public.api_error('limit', format('%s passes were already handed out, so the limit can’t go below %s.', v_issued, v_issued));
  end if;
  if v_item = '' then v_item := 'free coffee'; end if;
  if char_length(v_item) > 40 then
    perform public.api_error('itemLabel', 'Free item: at most 40 characters.');
  end if;
  if v_venue = '' then v_venue := 'TBD'; end if;
  if char_length(v_venue) > 80 then
    perform public.api_error('venue', 'Venue: at most 80 characters.');
  end if;
  if v_word = '' then v_word := public.gen_secret_word(); end if;
  if char_length(v_word) < 3 or char_length(v_word) > 30 then
    perform public.api_error('secretWord', 'Secret word: 3 to 30 characters.');
  end if;
  if v_set = '' then v_set := 'latte_night_scholar'; end if;
  if cardinality(public.event_outfit_items(v_set)) = 0 then
    perform public.api_error('outfitSet', 'Pick a reward outfit set.');
  end if;
  if v_msg = '' or char_length(v_msg) > 300 then
    perform public.api_error('message', 'Countdown message: 1 to 300 characters.');
  end if;
  insert into public.event_rewards (event_id, item_label, limit_count, venue, secret_word, outfit_set, message)
  values (p_event_id, v_item, v_limit, v_venue, v_word, v_set, v_msg)
  on conflict (event_id) do update
    set item_label = excluded.item_label, limit_count = excluded.limit_count, venue = excluded.venue,
        secret_word = excluded.secret_word, outfit_set = excluded.outfit_set, message = excluded.message,
        updated_at = now();
  perform public.log_admin_action(v_me, 'event_reward_set', null,
    jsonb_build_object('title', e.title, 'limit', v_limit, 'venue', v_venue, 'item', v_item));
  return json_build_object('eventId', p_event_id, 'itemLabel', v_item, 'limit', v_limit, 'venue', v_venue,
                           'secretWord', v_word, 'outfitSet', v_set, 'message', v_msg, 'issued', v_issued);
end $$;

-- Every special event with its secret word + pass counts (staff).
create or replace function public.admin_event_rewards()
returns table (event_id uuid, item_label text, limit_count int, venue text, secret_word text, outfit_set text,
               message text, issued int, used int)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
    select r.event_id, r.item_label, r.limit_count, r.venue, r.secret_word, r.outfit_set, r.message,
           (select count(*) from public.reward_passes p where p.event_id = r.event_id)::int,
           (select count(*) from public.reward_passes p where p.event_id = r.event_id and p.used_at is not null)::int
      from public.event_rewards r;
end $$;

-- Door mode: the pass list for one event (staff).
create or replace function public.admin_event_passes(p_event_id uuid)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare r public.event_rewards;
begin
  perform public.require_admin();
  select * into r from public.event_rewards where event_id = p_event_id;
  if r.event_id is null then
    perform public.api_error('not_found', 'This event has no special reward.');
  end if;
  return json_build_object(
    'eventId', r.event_id, 'limit', r.limit_count, 'itemLabel', r.item_label, 'venue', r.venue,
    'secretWord', r.secret_word, 'outfitSet', r.outfit_set,
    'issued', (select count(*) from public.reward_passes p where p.event_id = r.event_id),
    'used', (select count(*) from public.reward_passes p where p.event_id = r.event_id and p.used_at is not null),
    'passes', (select coalesce(json_agg(json_build_object(
                  'passNo', p.pass_no, 'userId', p.user_id, 'displayName', pr.display_name, 'handle', pr.handle,
                  'campus', pr.campus, 'createdAt', p.created_at, 'usedAt', p.used_at, 'usedBy', p.used_by,
                  'validUntil', p.created_at + make_interval(mins => public.reward_pass_minutes()))
                  order by p.pass_no), '[]'::json)
                 from public.reward_passes p join public.profiles pr on pr.id = p.user_id
                where p.event_id = r.event_id));
end $$;

-- Staff: mark a pass used (or undo a mistaken tap).
create or replace function public.admin_mark_pass_used(p_event_id uuid, p_user_id uuid, p_used boolean default true)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := public.require_admin();
  v_p  public.reward_passes;
begin
  update public.reward_passes
     set used_at = case when p_used then coalesce(used_at, now()) end,
         used_by = case when p_used then coalesce(used_by, 'staff') end
   where event_id = p_event_id and user_id = p_user_id
  returning * into v_p;
  if v_p.event_id is null then
    perform public.api_error('not_found', 'That pass wasn’t found.');
  end if;
  perform public.log_admin_action(v_me, case when p_used then 'reward_pass_used' else 'reward_pass_unused' end, p_user_id,
    jsonb_build_object('title', (select title from public.events where id = p_event_id), 'passNo', v_p.pass_no));
  return json_build_object('passNo', v_p.pass_no, 'usedAt', v_p.used_at, 'usedBy', v_p.used_by);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Participants (and staff for themselves)
-- ─────────────────────────────────────────────────────────────────────────────
-- What the countdown banners need. Never the secret word, never how many passes are left.
create or replace function public.event_rewards_public()
returns table (event_id uuid, item_label text, limit_count int, venue text, outfit_set text, message text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_user();
  return query
    select r.event_id, r.item_label, r.limit_count, r.venue, r.outfit_set, r.message
      from public.event_rewards r join public.events e on e.id = r.event_id
     where e.cycle_id = public.active_cycle_id();
end $$;

-- My passes (newest first; the secret word only while the pass is valid and unused) + unseen outfit items.
create or replace function public.my_event_rewards()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare v_uid uuid := public.require_user();
begin
  return json_build_object(
    'unseen', (select coalesce(json_agg(eu.item_id order by eu.unlocked_at, eu.item_id), '[]'::json)
                 from public.event_unlocks eu where eu.user_id = v_uid and eu.seen_at is null),
    'passes', (select coalesce(json_agg(public.reward_pass_json(p,
                   p.used_at is null and now() < p.created_at + make_interval(mins => public.reward_pass_minutes()))
                   order by p.created_at desc), '[]'::json)
                 from public.reward_passes p where p.user_id = v_uid));
end $$;

create or replace function public.mark_event_unlocks_seen()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_n int;
begin
  update public.event_unlocks set seen_at = now() where user_id = public.require_user() and seen_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- "Slide to mark as used" on my own pass (optional; the café doesn't need to do anything).
create or replace function public.mark_my_pass_used(p_event_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  v_p   public.reward_passes;
begin
  select * into v_p from public.reward_passes where event_id = p_event_id and user_id = v_uid for update;
  if v_p.event_id is null then
    perform public.api_error('not_found', 'You don’t have a pass for this event.');
  end if;
  if v_p.used_at is null then
    if now() > v_p.created_at + make_interval(mins => public.reward_pass_minutes()) then
      perform public.api_error('expired', 'This pass has expired.');
    end if;
    update public.reward_passes set used_at = now(), used_by = 'self'
     where event_id = p_event_id and user_id = v_uid returning * into v_p;
  end if;
  return json_build_object('passNo', v_p.pass_no, 'usedAt', v_p.used_at, 'usedBy', v_p.used_by);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal helpers: nobody calls these through the API.
revoke execute on function
  public.event_outfit_items(text), public.unlocks_for(uuid), public.badges_for(uuid), public.gen_secret_word(),
  public.reward_pass_minutes(), public.reward_pass_json(public.reward_passes, boolean),
  public.grant_event_reward(uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;

-- Logged-in users (staff checks happen inside).
revoke execute on function
  public.check_in(uuid, text), public.set_event_reward(uuid, jsonb), public.admin_event_rewards(),
  public.admin_event_passes(uuid), public.admin_mark_pass_used(uuid, uuid, boolean), public.event_rewards_public(),
  public.my_event_rewards(), public.mark_event_unlocks_seen(), public.mark_my_pass_used(uuid)
from public, anon;
grant execute on function
  public.check_in(uuid, text), public.set_event_reward(uuid, jsonb), public.admin_event_rewards(),
  public.admin_event_passes(uuid), public.admin_mark_pass_used(uuid, uuid, boolean), public.event_rewards_public(),
  public.my_event_rewards(), public.mark_event_unlocks_seen(), public.mark_my_pass_used(uuid)
to authenticated;

-- Done.

-- =============================================================================
-- YACquest — database setup (Supabase / Postgres)
-- =============================================================================
-- HOW TO USE: open your Supabase project → SQL Editor → New query → paste this
-- whole file → Run. Run it once on a new project. It is written so that running
-- it a second time does no harm (tables are only created if missing, functions
-- and policies are replaced, seed rows are only added if missing).
--
-- The contract for everything in here is docs/BACKEND.md. If you change a
-- function name, parameter or return shape, update that file and src/api/live.ts.
--
-- Sections:
--   0. Extensions
--   1. Tables + indexes
--   2. Helper functions (is_admin, is_chair, active_cycle_id, …)
--   3. Prize race (refresh_prize_race)
--   4. Triggers (new auth user → profile, ledger → points + prize race)
--   5. RPC functions — public (anon)
--   6. RPC functions — participant
--   7. RPC functions — admin
--   8. RPC functions — chair
--   9. Row Level Security policies
--  10. Grants
--  11. Storage bucket `proofs`
--  12. Seed data
--
-- Error convention (the front end relies on it):
--   raise exception using errcode = 'P0001', message = '<code>: <friendly message>'
-- =============================================================================


-- =============================================================================
-- 0. EXTENSIONS
-- =============================================================================
-- Supabase keeps extensions in the `extensions` schema. Every function below
-- uses `set search_path = public, extensions` so citext's case-insensitive
-- operators are found (with only `public`, handle/email comparisons would
-- silently become case-sensitive).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
set search_path = public, extensions;


-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- One-row settings table. Defaults match src/config.ts — keep them in sync.
create table if not exists public.app_config (
  id                   int primary key default 1 check (id = 1),
  prize_goal           int  not null default 650,
  prize_count          int  not null default 5,
  prize_value_usd      int  not null default 50,
  fulfill_by           date not null default '2027-05-15',
  tier1_points         int  not null default 40,
  tier2_points         int  not null default 20,
  tier3_points         int  not null default 5,
  digital_per_week     int  not null default 1,
  social_tag_per_month int  not null default 2,
  referrals_per_cycle  int  not null default 3,
  photos_per_event     int  not null default 1,
  photos_per_cycle     int  not null default 4
);

-- Points cycles (school years). Exactly one is active at a time.
create table if not exists public.cycles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  is_active   boolean not null default false,
  archived_at timestamptz
);
create unique index if not exists cycles_one_active on public.cycles (is_active) where is_active;

-- Emails that start out as chair when they sign up.
create table if not exists public.chair_bootstrap (
  email citext primary key
);

-- Catalog of ways to earn points (mirrors src/lib/activities.ts).
create table if not exists public.activities (
  id     text primary key,
  tier   int  not null check (tier between 1 and 3),
  title  text not null,
  method text not null check (method in ('event_password','screenshot','photo','lead_award','referral'))
);

-- One row per person. Created automatically when someone signs up (see trigger).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  handle       citext not null unique check (handle::text ~ '^[a-zA-Z0-9_.]{3,20}$'),
  display_name text   not null check (char_length(display_name) between 2 and 24),
  email        citext,
  campus       text   not null check (campus in ('duke','unc','ncsu')),
  role         text   not null default 'participant' check (role in ('participant','admin','chair')),
  avatar       text   not null default 'yak' check (avatar in ('yak','knight','mage','ranger')),
  friend_code  text   not null unique check (friend_code ~ '^YAC-[A-Z0-9]{4}$'),
  referred_by  uuid   references public.profiles (id) on delete set null,
  email_opt_in boolean not null default true,
  points       int    not null default 0,   -- current-cycle total, maintained by the ledger trigger
  created_at   timestamptz not null default now()
);
create index if not exists profiles_role_points on public.profiles (role, points desc);
create index if not exists profiles_referred_by on public.profiles (referred_by);

create table if not exists public.events (
  id                     uuid primary key default gen_random_uuid(),
  cycle_id               uuid references public.cycles (id),
  title                  text not null,
  campus                 text not null check (campus in ('duke','unc','ncsu','all')),
  cross_campus           boolean not null default false,
  kind                   text not null check (kind in ('social','panel','service','game_night')),
  location               text not null default '',
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  check_in_grace_minutes int not null default 60 check (check_in_grace_minutes between 0 and 1440),
  activity_id            text not null references public.activities (id),
  attendee_count         int not null default 0,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now()
);
create index if not exists events_starts_at on public.events (starts_at desc);

-- Event passwords live apart from events so participants can never read them.
create table if not exists public.event_secrets (
  event_id uuid primary key references public.events (id) on delete cascade,
  password text not null
);

create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  cycle_id      uuid not null references public.cycles (id),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  activity_id   text not null references public.activities (id),
  event_id      uuid references public.events (id) on delete set null,
  image_path    text not null,           -- path inside storage bucket `proofs`
  note          text not null default '' check (char_length(note) <= 280),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id   uuid references public.profiles (id) on delete set null,
  review_reason text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists submissions_user on public.submissions (user_id, created_at desc);
create index if not exists submissions_status on public.submissions (status, created_at);

-- THE source of truth for points. Append-only; corrections are new rows.
create table if not exists public.ledger (
  id          bigint generated always as identity primary key,
  cycle_id    uuid not null references public.cycles (id),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  amount      int  not null check (amount <> 0),
  source      text not null check (source in ('checkin','submission','manual','referral')),
  activity_id text references public.activities (id),
  ref_id      text,
  reason      text not null default '',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists ledger_user_cycle on public.ledger (user_id, cycle_id, id);
create index if not exists ledger_cycle_created on public.ledger (cycle_id, created_at);
-- Safety nets against double-taps / races:
create unique index if not exists ledger_one_checkin   on public.ledger (user_id, ref_id) where source = 'checkin';
create unique index if not exists ledger_one_approval  on public.ledger (ref_id) where source = 'submission';
create unique index if not exists ledger_one_referral  on public.ledger (ref_id) where source = 'referral';

create table if not exists public.prize_claims (
  id            uuid primary key default gen_random_uuid(),
  cycle_id      uuid not null references public.cycles (id),
  spot          int  not null check (spot >= 1),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  display_name  text not null,
  campus        text not null,
  qualified_at  timestamptz not null default now(),
  status        text not null default 'qualified' check (status in ('qualified','info_submitted','fulfilled','revoked')),
  reference     text,
  contact       jsonb,   -- {fullName, email, preference, notes}
  fulfilled_at  timestamptz,
  revoked_at    timestamptz,
  revoke_reason text
);
create unique index if not exists prize_claims_spot on public.prize_claims (cycle_id, spot)    where status <> 'revoked';
create unique index if not exists prize_claims_user on public.prize_claims (cycle_id, user_id) where status <> 'revoked';

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

create table if not exists public.prize_suggestions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  idea       text not null check (char_length(idea) <= 300),
  created_at timestamptz not null default now()
);

create table if not exists public.sync_status (
  id           int primary key default 1 check (id = 1),
  last_sync_at timestamptz,
  rows_pushed  int not null default 0,
  rows_pulled  int not null default 0,
  conflicts    int not null default 0,
  state        text not null default 'not_configured',
  sheet_url    text
);


-- =============================================================================
-- 2. HELPER FUNCTIONS
-- =============================================================================

-- Raise an error in the format the front end understands ("code: message").
create or replace function public.api_error(p_code text, p_message text)
returns void language plpgsql volatile set search_path = public, extensions as $$
begin
  raise exception using errcode = 'P0001', message = p_code || ': ' || p_message;
end $$;

-- True if the caller is an admin or a chair.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','chair'));
$$;

-- True if the caller is a chair.
create or replace function public.is_chair()
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'chair');
$$;

-- The id of the one active cycle.
create or replace function public.active_cycle_id()
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select id from public.cycles where is_active limit 1;
$$;

-- Points for a tier (1/2/3), read from app_config.
create or replace function public.tier_points(p_tier int)
returns int language sql stable security definer set search_path = public, extensions as $$
  select case p_tier when 1 then tier1_points when 2 then tier2_points else tier3_points end
  from public.app_config where id = 1;
$$;

-- Which activity an event check-in earns.
create or replace function public.event_activity(p_campus text, p_cross_campus boolean, p_kind text)
returns text language sql immutable set search_path = public, extensions as $$
  select case
    when p_cross_campus or p_campus = 'all' then 'cross_campus_event'
    when p_kind = 'panel' then 'panel_mentorship'
    else 'home_event'
  end;
$$;

-- Start of the current week (Monday 00:00 America/New_York) as timestamptz.
create or replace function public.week_start()
returns timestamptz language sql stable set search_path = public, extensions as $$
  select date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York';
$$;

-- Start of the current calendar month (America/New_York) as timestamptz.
create or replace function public.month_start()
returns timestamptz language sql stable set search_path = public, extensions as $$
  select date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York';
$$;

-- The calling user's id, or an `unauthenticated` error.
create or replace function public.require_user()
returns uuid language plpgsql stable security definer set search_path = public, extensions as $$
declare v uuid := auth.uid();
begin
  if v is null or not exists (select 1 from public.profiles where id = v) then
    perform public.api_error('unauthenticated', 'Please log in again.');
  end if;
  return v;
end $$;

create or replace function public.require_admin()
returns uuid language plpgsql stable security definer set search_path = public, extensions as $$
declare v uuid := public.require_user();
begin
  if not public.is_admin() then
    perform public.api_error('forbidden', 'You do not have access to that.');
  end if;
  return v;
end $$;

create or replace function public.require_chair()
returns uuid language plpgsql stable security definer set search_path = public, extensions as $$
declare v uuid := public.require_user();
begin
  if not public.is_chair() then
    perform public.api_error('forbidden', 'Only a YAC chair can do that.');
  end if;
  return v;
end $$;

-- Add a notification for a user.
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text)
returns void language sql security definer set search_path = public, extensions as $$
  insert into public.notifications (user_id, kind, title, body) values (p_user, p_kind, p_title, coalesce(p_body, ''));
$$;

-- New random friend code like YAC-7Q2K (no 0/O/1/I to avoid confusion).
create or replace function public.make_friend_code()
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := 'YAC-';
    for i in 1..4 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end $$;

-- JSON shape of a prize claim (camelCase, matches PrizeClaim in src/types.ts).
create or replace function public.claim_json(c public.prize_claims, p_with_contact boolean default true)
returns json language sql stable set search_path = public, extensions as $$
  select json_strip_nulls(json_build_object(
    'id', c.id,
    'spot', c.spot,
    'userId', c.user_id,
    'displayName', c.display_name,
    'campus', c.campus,
    'qualifiedAt', c.qualified_at,
    'status', c.status,
    'reference', case when p_with_contact then c.reference end,
    'contact', case when p_with_contact then c.contact end,
    'fulfilledAt', c.fulfilled_at,
    'revokedAt', c.revoked_at,
    'revokeReason', c.revoke_reason
  ));
$$;

-- JSON shape of an event incl. password (admin views).
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
    'password', s.password
  )
  from public.events e left join public.event_secrets s on s.event_id = e.id
  where e.id = p_id;
$$;


-- =============================================================================
-- 3. PRIZE RACE
-- =============================================================================
-- Called after every ledger insert. Under a table lock (so two people crossing
-- at the same moment can't both take the last spot) it:
--   a) revokes active, unfulfilled claims whose owner fell below the goal;
--   b) fills free spots (lowest numbers first) with eligible participants,
--      ordered by when they MOST RECENTLY crossed the goal.
create or replace function public.refresh_prize_race(p_cycle_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  cfg   public.app_config;
  r     record;
  spots int[];
  i     int := 0;
begin
  if p_cycle_id is null or p_cycle_id is distinct from public.active_cycle_id() then
    return;  -- only the active cycle has a live race
  end if;
  select * into cfg from public.app_config where id = 1;

  lock table public.prize_claims in share row exclusive mode;

  -- a) revoke
  for r in
    update public.prize_claims c
       set status = 'revoked',
           revoked_at = now(),
           revoke_reason = 'Points fell below the goal after a correction'
      from public.profiles p
     where p.id = c.user_id
       and c.cycle_id = p_cycle_id
       and c.status in ('qualified','info_submitted')
       and p.points < cfg.prize_goal
    returning c.user_id, c.spot
  loop
    perform public.notify(r.user_id, 'prize_update', 'Your prize spot was released',
      format('A points correction put you below %s, so spot #%s went to the next person. Reach %s again to get back in the race if a spot is open.',
             cfg.prize_goal, r.spot, cfg.prize_goal));
  end loop;

  -- b) fill
  select array_agg(s order by s) into spots
    from generate_series(1, cfg.prize_count) s
   where not exists (select 1 from public.prize_claims c
                      where c.cycle_id = p_cycle_id and c.spot = s and c.status <> 'revoked');
  if spots is null then
    return;
  end if;

  for r in
    with candidates as (
      select p.id, p.display_name, p.campus
        from public.profiles p
       where p.role = 'participant'
         and p.points >= cfg.prize_goal
         and not exists (select 1 from public.prize_claims c
                          where c.cycle_id = p_cycle_id and c.user_id = p.id and c.status <> 'revoked')
    ), running as (
      select l.user_id, l.id, l.created_at,
             sum(l.amount) over (partition by l.user_id order by l.id) as total
        from public.ledger l
       where l.cycle_id = p_cycle_id and l.user_id in (select id from candidates)
    ), crossings as (
      select user_id, id, created_at, total,
             lag(total, 1, 0::bigint) over (partition by user_id order by id) as prev
        from running
    ), last_cross as (
      select distinct on (user_id) user_id, id as ledger_id, created_at as crossed_at
        from crossings
       where total >= cfg.prize_goal and prev < cfg.prize_goal
       order by user_id, id desc
    )
    select c.id as user_id, c.display_name, c.campus, x.crossed_at
      from candidates c join last_cross x on x.user_id = c.id
     order by x.crossed_at, x.ledger_id
     limit array_length(spots, 1)
  loop
    i := i + 1;
    insert into public.prize_claims (cycle_id, spot, user_id, display_name, campus, qualified_at, status)
    values (p_cycle_id, spots[i], r.user_id, r.display_name, r.campus, r.crossed_at, 'qualified');
    perform public.notify(r.user_id, 'prize_qualified', format('You won spot #%s!', spots[i]),
      format('You reached %s points and claimed a $%s gift card. Open Prize to send your delivery info.',
             cfg.prize_goal, cfg.prize_value_usd));
  end loop;
end $$;


-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

-- 4a. New auth user → profile ------------------------------------------------
-- Reads the sign-up form fields the app puts in user metadata:
--   handle, display_name, campus, avatar, friend_code (the REFERRER's code).
-- If a user is created without metadata (e.g. "Add user" in the dashboard),
-- sensible fallbacks are used so the insert doesn't fail.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_handle    text  := nullif(trim(meta->>'handle'), '');
  v_name      text  := nullif(trim(meta->>'display_name'), '');
  v_campus    text  := coalesce(nullif(meta->>'campus', ''), 'unc');
  v_avatar    text  := coalesce(nullif(meta->>'avatar', ''), 'yak');
  v_code      text  := nullif(upper(trim(meta->>'friend_code')), '');
  v_local     text  := split_part(coalesce(new.email, ''), '@', 1);
  v_referrer  uuid;
  v_role      text  := 'participant';
  cfg         public.app_config;
begin
  select * into cfg from public.app_config where id = 1;

  if v_handle is null then
    -- fallback: email local part, cleaned, plus digits if taken
    v_handle := left(regexp_replace(v_local, '[^a-zA-Z0-9_.]', '', 'g'), 15);
    if length(v_handle) < 3 then v_handle := 'user' || v_handle; end if;
    while exists (select 1 from public.profiles where handle = v_handle::citext) loop
      v_handle := left(v_handle, 15) || floor(random() * 10000)::int;
    end loop;
  elsif v_handle !~ '^[a-zA-Z0-9_.]{3,20}$' then
    perform public.api_error('handle', 'Username: 3–20 letters, numbers, dots or underscores.');
  elsif exists (select 1 from public.profiles where handle = v_handle::citext) then
    perform public.api_error('handle', 'That username is taken.');
  end if;

  v_name := coalesce(v_name, left(v_local, 24));
  if char_length(v_name) < 2 then v_name := v_handle; end if;
  if char_length(v_name) > 24 then
    perform public.api_error('displayName', 'Display name: 2–24 characters.');
  end if;
  if v_campus not in ('duke','unc','ncsu') then
    perform public.api_error('campus', 'Pick your campus.');
  end if;
  if v_avatar not in ('yak','knight','mage','ranger') then
    v_avatar := 'yak';
  end if;

  if v_code is not null then
    select id into v_referrer from public.profiles where friend_code = v_code;
    if v_referrer is null then
      perform public.api_error('friendCode', 'We couldn’t find that friend code.');
    end if;
  end if;

  -- Bootstrap chairs (never more than 2 chairs).
  if exists (select 1 from public.chair_bootstrap where email = new.email::citext)
     and (select count(*) from public.profiles where role = 'chair') < 2 then
    v_role := 'chair';
  end if;

  insert into public.profiles (id, handle, display_name, email, campus, role, avatar, friend_code, referred_by)
  values (new.id, v_handle, v_name, new.email, v_campus, v_role, v_avatar, public.make_friend_code(), v_referrer);

  perform public.notify(new.id, 'announcement', 'Welcome to YACquest!',
    format('Earn points all year. The first %s people to reach %s win a $%s gift card.',
           cfg.prize_count, cfg.prize_goal, cfg.prize_value_usd));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4b. Ledger insert → points + prize race ------------------------------------
create or replace function public.on_ledger_insert()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.profiles p
     set points = coalesce((select sum(l.amount) from public.ledger l
                             where l.user_id = new.user_id and l.cycle_id = public.active_cycle_id()), 0)
   where p.id = new.user_id;
  perform public.refresh_prize_race(new.cycle_id);
  return null;
end $$;

drop trigger if exists ledger_after_insert on public.ledger;
create trigger ledger_after_insert
  after insert on public.ledger
  for each row execute function public.on_ledger_insert();

-- The ledger is append-only: block edits and deletes from everyone (even admins
-- using the dashboard API). Corrections are new rows via adjust_points.
create or replace function public.ledger_append_only()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  raise exception using errcode = 'P0001', message = 'forbidden: The ledger is append-only. Add a correcting entry instead.';
end $$;

drop trigger if exists ledger_no_update on public.ledger;
create trigger ledger_no_update
  before update on public.ledger
  for each row execute function public.ledger_append_only();


-- =============================================================================
-- 5. RPC — PUBLIC (callable before login)
-- =============================================================================

create or replace function public.handle_available(p_handle text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce(trim(p_handle), '') ~ '^[a-zA-Z0-9_.]{3,20}$'
     and not exists (select 1 from public.profiles where handle = trim(p_handle)::citext);
$$;

create or replace function public.friend_code_exists(p_code text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.profiles where friend_code = upper(trim(coalesce(p_code, ''))));
$$;


-- =============================================================================
-- 6. RPC — PARTICIPANT (any logged-in user)
-- =============================================================================

-- Leaderboard of participants. Ties share a rank (1, 2, 2, 4).
create or replace function public.leaderboard(p_limit int default 10, p_campus text default null)
returns table (rank int, user_id uuid, display_name text, campus text, avatar text, points int)
language sql stable security definer set search_path = public, extensions as $$
  select (rank() over (order by p.points desc))::int, p.id, p.display_name, p.campus, p.avatar, p.points
    from public.profiles p
   where p.role = 'participant' and (p_campus is null or p.campus = p_campus)
   order by p.points desc, p.display_name asc, p.id
   limit greatest(1, least(coalesce(p_limit, 10), 1000));
$$;

-- The caller's row in the overall leaderboard (0 rows if not a participant).
create or replace function public.my_rank()
returns table (rank int, user_id uuid, display_name text, campus text, avatar text, points int)
language sql stable security definer set search_path = public, extensions as $$
  select (1 + (select count(*) from public.profiles o where o.role = 'participant' and o.points > p.points))::int,
         p.id, p.display_name, p.campus, p.avatar, p.points
    from public.profiles p
   where p.id = auth.uid() and p.role = 'participant';
$$;

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
    'referralsUsed', (select count(*) from public.ledger where user_id = me.id and source = 'referral' and cycle_id = v_cycle),
    'unreadCount', (select count(*) from public.notifications where user_id = me.id and not read)
  );
end $$;

-- Campus Cup: per-capita points so bigger campuses don't win by size.
create or replace function public.campus_cup()
returns table (campus text, members int, total_points int, per_capita numeric)
language sql stable security definer set search_path = public, extensions as $$
  select c.campus,
         count(p.id)::int,
         coalesce(sum(p.points), 0)::int,
         case when count(p.id) = 0 then 0 else round(sum(p.points)::numeric / count(p.id), 1) end
    from (values ('duke'), ('unc'), ('ncsu')) as c(campus)
    left join public.profiles p on p.campus = c.campus and p.role = 'participant'
   group by c.campus
   order by 4 desc, c.campus;
$$;

-- Public view of the prize race (no contact info).
create or replace function public.prize_status()
returns json language sql stable security definer set search_path = public, extensions as $$
  with cfg as (select * from public.app_config where id = 1),
  cl as (
    select * from public.prize_claims
     where cycle_id = public.active_cycle_id() and status <> 'revoked'
  )
  select json_build_object(
    'goal', cfg.prize_goal,
    'total', cfg.prize_count,
    'remaining', greatest(0, cfg.prize_count - (select count(*) from cl)),
    'claims', coalesce((select json_agg(json_build_object(
                 'spot', spot, 'userId', user_id, 'displayName', display_name,
                 'campus', campus, 'qualifiedAt', qualified_at, 'status', status) order by spot)
               from cl), '[]'::json)
  ) from cfg;
$$;

-- Check in to an event with its password.
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
    perform public.api_error('wrong_password', 'Wrong password. Ask your campus lead for the event code.');
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

  -- Referral bonus: the referrer earns Tier 1 when their friend attends a first event.
  if me.referred_by is not null
     and (select count(*) from public.ledger where user_id = v_uid and source = 'checkin' and cycle_id = v_cycle) = 1
     and (select count(*) from public.ledger where user_id = me.referred_by and source = 'referral' and cycle_id = v_cycle) < cfg.referrals_per_cycle
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

  return json_build_object('points', v_points, 'activityId', v_act);
end $$;

-- Why the caller can't submit this activity right now (null = they can).
create or replace function public.can_submit(p_activity_id text, p_event_id uuid default null)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := public.require_user();
  v_cycle uuid := public.active_cycle_id();
  a       public.activities;
  cfg     public.app_config;
begin
  select * into cfg from public.app_config where id = 1;
  select * into a from public.activities where id = p_activity_id;
  if a.id is null or a.method not in ('screenshot','photo') then
    return 'That quest can’t be submitted with a screenshot.';
  end if;

  -- "mine" = this cycle's submissions that weren't rejected
  if a.id in ('annual_fund','follow_ig') and exists (
       select 1 from public.submissions
        where user_id = v_uid and cycle_id = v_cycle and status <> 'rejected' and activity_id = a.id) then
    return 'You already submitted this one for this cycle.';
  end if;

  if a.tier = 3 and (
       select count(*) from public.submissions s join public.activities sa on sa.id = s.activity_id
        where s.user_id = v_uid and s.status <> 'rejected' and sa.tier = 3
          and s.created_at >= public.week_start()) >= cfg.digital_per_week then
    return format('Digital quests are limited to %s per week. Come back Monday!', cfg.digital_per_week);
  end if;

  if a.id = 'social_tag' and (
       select count(*) from public.submissions
        where user_id = v_uid and status <> 'rejected' and activity_id = 'social_tag'
          and created_at >= public.month_start()) >= cfg.social_tag_per_month then
    return format('Social tags are limited to %s per month.', cfg.social_tag_per_month);
  end if;

  if a.id = 'event_photos' then
    if p_event_id is null then
      return 'Pick the event the photo is from.';
    end if;
    if not exists (select 1 from public.ledger
                    where user_id = v_uid and source = 'checkin' and ref_id = p_event_id::text) then
      return 'You can only upload photos from events you checked in to.';
    end if;
    if (select count(*) from public.submissions
         where user_id = v_uid and status <> 'rejected' and activity_id = 'event_photos'
           and event_id = p_event_id) >= cfg.photos_per_event then
      return 'You already uploaded a photo for that event.';
    end if;
    if (select count(*) from public.submissions
         where user_id = v_uid and cycle_id = v_cycle and status <> 'rejected'
           and activity_id = 'event_photos') >= cfg.photos_per_cycle then
      return format('Photo points are limited to %s per cycle.', cfg.photos_per_cycle);
    end if;
  end if;

  return null;
end $$;

-- Submit proof (after uploading the image to storage at <uid>/<uuid>.jpg).
create or replace function public.submit_proof(p_activity_id text, p_event_id uuid, p_image_path text, p_note text)
returns public.submissions language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid     uuid := public.require_user();
  v_blocked text;
  s         public.submissions;
begin
  -- one submission at a time per user, so caps can't be raced
  perform pg_advisory_xact_lock(hashtext('submit_proof:' || v_uid::text));

  v_blocked := public.can_submit(p_activity_id, p_event_id);
  if v_blocked is not null then
    perform public.api_error('limit', v_blocked);
  end if;
  if p_image_path is null or left(p_image_path, length(v_uid::text) + 1) <> v_uid::text || '/'
     or p_image_path like '%..%' then
    perform public.api_error('file_type', 'Unsupported file. Please upload a JPG, PNG or WebP image.');
  end if;
  if char_length(coalesce(p_note, '')) > 280 then
    perform public.api_error('note', 'Keep the note under 280 characters.');
  end if;

  insert into public.submissions (cycle_id, user_id, activity_id, event_id, image_path, note)
  values (public.active_cycle_id(), v_uid, p_activity_id,
          case when p_activity_id = 'event_photos' then p_event_id end,
          p_image_path, trim(coalesce(p_note, '')))
  returning * into s;
  return s;
end $$;

-- Winner sends delivery info for their prize.
create or replace function public.submit_claim_info(p_full_name text, p_email text, p_preference text default '', p_notes text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  c     public.prize_claims;
begin
  select * into c from public.prize_claims
   where user_id = v_uid and cycle_id = public.active_cycle_id() and status <> 'revoked'
   for update;
  if c.id is null then
    perform public.api_error('no_claim', 'You haven’t won a spot yet.');
  end if;
  if c.status = 'fulfilled' then
    perform public.api_error('fulfilled', 'This prize was already delivered.');
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then
    perform public.api_error('fullName', 'Enter your full name.');
  end if;
  if coalesce(trim(p_email), '') !~ '^\S+@\S+\.\S+$' then
    perform public.api_error('email', 'Enter a valid email.');
  end if;

  update public.prize_claims
     set contact = jsonb_strip_nulls(jsonb_build_object(
           'fullName', trim(p_full_name), 'email', trim(p_email),
           'preference', coalesce(p_preference, ''), 'notes', nullif(trim(coalesce(p_notes, '')), ''))),
         status = 'info_submitted',
         reference = coalesce(reference,
           'YQ-' || extract(year from now() at time zone 'America/New_York')::int || '-' ||
           lpad(spot::text, 2, '0') ||
           upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)))
   where id = c.id
   returning * into c;
  return public.claim_json(c);
end $$;

create or replace function public.suggest_prize(p_idea text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := public.require_user();
begin
  if char_length(trim(coalesce(p_idea, ''))) < 3 then
    perform public.api_error('idea', 'Tell us a bit more about your idea.');
  end if;
  if char_length(trim(p_idea)) > 300 then
    perform public.api_error('idea', 'Keep it under 300 characters.');
  end if;
  insert into public.prize_suggestions (user_id, idea) values (v_uid, trim(p_idea));
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := public.require_user();
begin
  update public.notifications set read = true
   where user_id = v_uid and not read and (p_ids is null or id = any (p_ids));
end $$;

-- Update your own display name / avatar / email opt-in (null = unchanged).
create or replace function public.update_profile(p_display_name text default null, p_avatar text default null, p_email_opt_in boolean default null)
returns public.profiles language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  p     public.profiles;
begin
  if p_display_name is not null and char_length(trim(p_display_name)) not between 2 and 24 then
    perform public.api_error('displayName', 'Display name: 2–24 characters.');
  end if;
  if p_avatar is not null and p_avatar not in ('yak','knight','mage','ranger') then
    perform public.api_error('avatar', 'Pick one of the avatars.');
  end if;
  update public.profiles
     set display_name = coalesce(trim(p_display_name), display_name),
         avatar       = coalesce(p_avatar, avatar),
         email_opt_in = coalesce(p_email_opt_in, email_opt_in)
   where id = v_uid
   returning * into p;
  update public.prize_claims set display_name = p.display_name where user_id = v_uid;
  return p;
end $$;


-- =============================================================================
-- 7. RPC — ADMIN (admins and chairs)
-- =============================================================================

create or replace function public.review_submission(p_id uuid, p_decision text, p_reason text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin    uuid := public.require_admin();
  v_decision text := case lower(coalesce(p_decision, ''))
                       when 'approve' then 'approved' when 'approved' then 'approved'
                       when 'reject'  then 'rejected' when 'rejected' then 'rejected' end;
  s          public.submissions;
  a          public.activities;
  v_points   int;
begin
  if v_decision is null then
    perform public.api_error('decision', 'Decision must be approved or rejected.');
  end if;
  select * into s from public.submissions where id = p_id for update;
  if s.id is null then
    perform public.api_error('not_found', 'Submission not found.');
  end if;
  if s.user_id = v_admin then
    perform public.api_error('forbidden', 'You can’t review your own submission.');
  end if;
  if s.status <> 'pending' then
    perform public.api_error('already_reviewed', 'Someone already reviewed this one.');
  end if;
  if v_decision = 'rejected' and char_length(trim(coalesce(p_reason, ''))) = 0 then
    perform public.api_error('reason', 'Add a reason so the participant knows what to fix.');
  end if;

  select * into a from public.activities where id = s.activity_id;
  update public.submissions
     set status = v_decision, reviewer_id = v_admin,
         review_reason = nullif(trim(coalesce(p_reason, '')), ''), reviewed_at = now()
   where id = s.id;

  if v_decision = 'approved' then
    v_points := public.tier_points(a.tier);
    insert into public.ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason, created_by)
    values (s.cycle_id, s.user_id, v_points, 'submission', a.id, s.id::text, 'Approved: ' || a.title, v_admin);
    perform public.notify(s.user_id, 'submission_approved', format('+%s pts — %s', v_points, a.title),
                          'Your submission was approved.');
  else
    perform public.notify(s.user_id, 'submission_rejected', 'Not approved — ' || a.title, trim(p_reason));
  end if;
end $$;

-- Manual add/remove. The reason is shown to the participant.
create or replace function public.adjust_points(p_user_id uuid, p_amount int, p_reason text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.require_admin();
  v_name  text;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 500 then
    perform public.api_error('amount', 'Enter a whole number between -500 and 500 (not 0).');
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

-- Award a lead-verified activity (e.g. winning a game) at its tier value.
create or replace function public.award_activity(p_user_id uuid, p_activity_id text, p_note text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin  uuid := public.require_admin();
  a        public.activities;
  v_points int;
  v_note   text := trim(coalesce(p_note, ''));
  v_name   text;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  select * into a from public.activities where id = p_activity_id;
  if a.id is null then
    perform public.api_error('activity', 'Unknown activity.');
  end if;
  select display_name into v_name from public.profiles where id = v_admin;
  v_points := public.tier_points(a.tier);
  insert into public.ledger (cycle_id, user_id, amount, source, activity_id, reason, created_by)
  values (public.active_cycle_id(), p_user_id, v_points, 'manual', a.id,
          case when v_note = '' then a.title else a.title || ': ' || v_note end, v_admin);
  perform public.notify(p_user_id, 'points_adjusted', format('+%s pts — %s', v_points, a.title),
                        coalesce(nullif(v_note, ''), 'Awarded by ' || v_name));
end $$;

create or replace function public.search_users(p_query text default '', p_limit int default 20)
returns table (id uuid, handle text, display_name text, email text, campus text, role text, points int)
language plpgsql stable security definer set search_path = public, extensions as $$
declare q text := lower(trim(coalesce(p_query, '')));
begin
  perform public.require_admin();
  return query
    select p.id, p.handle::text, p.display_name, p.email::text, p.campus, p.role, p.points
      from public.profiles p
     where q = ''
        or strpos(lower(p.display_name), q) > 0
        or strpos(lower(p.handle::text), q) > 0
        or strpos(lower(coalesce(p.email::text, '')), q) > 0
     order by p.display_name, p.id
     limit greatest(1, least(coalesce(p_limit, 20), 500));
end $$;

create or replace function public.admin_list_events()
returns table (id uuid, cycle_id uuid, title text, campus text, cross_campus boolean, kind text, location text,
               starts_at timestamptz, ends_at timestamptz, check_in_grace_minutes int, activity_id text,
               attendee_count int, created_by uuid, created_at timestamptz, password text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
    select e.id, e.cycle_id, e.title, e.campus, e.cross_campus, e.kind, e.location, e.starts_at, e.ends_at,
           e.check_in_grace_minutes, e.activity_id, e.attendee_count, e.created_by, e.created_at, s.password
      from public.events e left join public.event_secrets s on s.event_id = e.id
     order by e.starts_at desc;
end $$;

-- Shared validation for create_event / update_event. Returns cleaned values.
create or replace function public.validate_event(p_event jsonb,
  out v_title text, out v_campus text, out v_cross boolean, out v_kind text, out v_location text,
  out v_starts timestamptz, out v_ends timestamptz, out v_grace int, out v_password text)
language plpgsql stable set search_path = public, extensions as $$
begin
  v_title    := trim(coalesce(p_event->>'title', ''));
  v_campus   := coalesce(p_event->>'campus', '');
  v_cross    := coalesce((p_event->>'crossCampus')::boolean, false);
  v_kind     := coalesce(p_event->>'kind', '');
  v_location := trim(coalesce(p_event->>'location', ''));
  v_grace    := coalesce((p_event->>'checkInGraceMinutes')::int, 60);
  v_password := trim(coalesce(p_event->>'password', ''));
  if char_length(v_title) < 3 then
    perform public.api_error('title', 'Give the event a title.');
  end if;
  if v_campus not in ('duke','unc','ncsu','all') then
    perform public.api_error('campus', 'Pick a campus (or all campuses).');
  end if;
  if v_kind not in ('social','panel','service','game_night') then
    perform public.api_error('kind', 'Pick the kind of event.');
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

create or replace function public.create_event(p_event jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.require_admin();
  v       record;
  v_id    uuid;
begin
  select * into v from public.validate_event(p_event);
  insert into public.events (cycle_id, title, campus, cross_campus, kind, location, starts_at, ends_at,
                             check_in_grace_minutes, activity_id, created_by)
  values (public.active_cycle_id(), v.v_title, v.v_campus, v.v_cross, v.v_kind, v.v_location, v.v_starts, v.v_ends,
          v.v_grace, public.event_activity(v.v_campus, v.v_cross, v.v_kind), v_admin)
  returning id into v_id;
  insert into public.event_secrets (event_id, password) values (v_id, v.v_password);
  return public.event_json(v_id);
end $$;

create or replace function public.update_event(p_id uuid, p_event jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v record;
begin
  perform public.require_admin();
  if not exists (select 1 from public.events where id = p_id) then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  select * into v from public.validate_event(p_event);
  update public.events
     set title = v.v_title, campus = v.v_campus, cross_campus = v.v_cross, kind = v.v_kind,
         location = v.v_location, starts_at = v.v_starts, ends_at = v.v_ends,
         check_in_grace_minutes = v.v_grace,
         activity_id = public.event_activity(v.v_campus, v.v_cross, v.v_kind)
   where id = p_id;
  insert into public.event_secrets (event_id, password) values (p_id, v.v_password)
  on conflict (event_id) do update set password = excluded.password;
  return public.event_json(p_id);
end $$;

create or replace function public.delete_event(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare e public.events;
begin
  perform public.require_admin();
  select * into e from public.events where id = p_id for update;
  if e.id is null then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  if e.attendee_count > 0 then
    perform public.api_error('has_attendees', 'People already checked in — this event can’t be deleted.');
  end if;
  delete from public.events where id = p_id;
end $$;

create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_cycle uuid := public.active_cycle_id();
  v_wk    timestamptz := public.week_start();
  cfg     public.app_config;
begin
  perform public.require_admin();
  select * into cfg from public.app_config where id = 1;
  return json_build_object(
    'participants', (select count(*) from public.profiles where role = 'participant'),
    'activeThisWeek', (select count(distinct l.user_id) from public.ledger l join public.profiles p on p.id = l.user_id
                        where p.role = 'participant' and l.cycle_id = v_cycle and l.created_at >= v_wk),
    'pointsThisWeek', (select coalesce(sum(greatest(0, l.amount)), 0) from public.ledger l join public.profiles p on p.id = l.user_id
                        where p.role = 'participant' and l.cycle_id = v_cycle and l.created_at >= v_wk),
    'pendingReviews', (select count(*) from public.submissions s join public.profiles p on p.id = s.user_id
                        where p.role = 'participant' and s.status = 'pending'),
    'newSignupsThisWeek', (select count(*) from public.profiles where role = 'participant' and created_at >= v_wk),
    'prize', public.prize_status(),
    'nearGoal', coalesce((
       select json_agg(json_build_object('rank', r.rank, 'userId', r.user_id, 'displayName', r.display_name,
                                         'campus', r.campus, 'avatar', r.avatar, 'points', r.points)
                       order by r.points desc, r.display_name)
         from (select * from public.leaderboard(1000, null) lb
                where lb.points >= cfg.prize_goal - 100
                  and not exists (select 1 from public.prize_claims c
                                   where c.cycle_id = v_cycle and c.user_id = lb.user_id and c.status <> 'revoked')
                order by lb.points desc, lb.display_name
                limit 10) r), '[]'::json)
  );
end $$;


-- =============================================================================
-- 8. RPC — CHAIR
-- =============================================================================

create or replace function public.list_team()
returns table (id uuid, display_name text, handle text, email text, role text, email_verified boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_chair();
  return query
    select p.id, p.display_name, p.handle::text, p.email::text, p.role, (u.email_confirmed_at is not null)
      from public.profiles p join auth.users u on u.id = p.id
     where p.role in ('admin','chair')
     order by (p.role = 'chair') desc, p.display_name;
end $$;

-- Make someone an admin, or back to participant. Chairs are only made via transfer_chair.
create or replace function public.set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  t       public.profiles;
begin
  if p_role is null or p_role not in ('participant','admin') then
    perform public.api_error('forbidden', 'Chairs can only be added by handing over a chair seat.');
  end if;
  select * into t from public.profiles where id = p_user_id for update;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role = 'chair' then
    perform public.api_error('forbidden', 'A chair can’t be demoted. Chairs hand over their seat instead.');
  end if;
  if p_role = 'admin' and not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    perform public.api_error('not_verified', 'They need to confirm their email before they can be an admin.');
  end if;
  if t.role = p_role then
    return;
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if p_role = 'admin' then
    perform public.notify(p_user_id, 'announcement', 'You’re now a YACquest admin',
      'You can review submissions, award points and run events. Thanks for helping!');
  else
    perform public.notify(p_user_id, 'announcement', 'Your admin access was removed',
      'You’re back in the game as a participant.');
  end if;
  -- a new participant may already qualify for an open prize spot
  perform public.refresh_prize_race(public.active_cycle_id());
end $$;

-- Hand your chair seat to someone else (you become an admin).
create or replace function public.transfer_chair(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  t       public.profiles;
  v_name  text;
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
  if (select count(*) from public.profiles where role = 'chair') > 2 then
    perform public.api_error('chair_limit', 'There can be at most 2 chairs.');
  end if;

  select display_name into v_name from public.profiles where id = v_chair;
  perform public.notify(p_user_id, 'announcement', 'You’re now a YAC chair',
    v_name || ' handed you their chair seat. You can now manage the team, prizes and the cycle.');
  perform public.notify(v_chair, 'announcement', 'You handed over your chair seat',
    t.display_name || ' is now a chair. You stay on as an admin.');
end $$;

create or replace function public.list_claims()
returns setof public.prize_claims
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_chair();
  return query
    select * from public.prize_claims
     where cycle_id = public.active_cycle_id()
     order by (status = 'revoked'), spot, qualified_at;
end $$;

create or replace function public.mark_fulfilled(p_spot int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  c   public.prize_claims;
  cfg public.app_config;
begin
  perform public.require_chair();
  select * into cfg from public.app_config where id = 1;
  select * into c from public.prize_claims
   where cycle_id = public.active_cycle_id() and spot = p_spot and status <> 'revoked' for update;
  if c.id is null then
    perform public.api_error('not_found', 'Claim not found.');
  end if;
  update public.prize_claims set status = 'fulfilled', fulfilled_at = now() where id = c.id;
  perform public.notify(c.user_id, 'prize_update', 'Your prize is on the way!',
    format('Your $%s gift card has been sent. Reference %s.', cfg.prize_value_usd, coalesce(c.reference, '—')));
end $$;

-- End-of-cycle reset: archive the active cycle, start a new one, zero everyone.
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

  for r in select id from public.profiles where role = 'participant' loop
    perform public.notify(r.id, 'announcement', 'A new cycle has started!', 'Points were reset to 0. Good luck!');
  end loop;
end $$;

create or replace function public.archives()
returns table (cycle text, archived_at timestamptz, ledger_rows bigint, winners json)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_chair();
  return query
    select c.name, c.archived_at,
           (select count(*) from public.ledger l where l.cycle_id = c.id),
           coalesce((select json_agg(public.claim_json(pc) order by pc.spot)
                       from public.prize_claims pc where pc.cycle_id = c.id and pc.status <> 'revoked'), '[]'::json)
      from public.cycles c
     where not c.is_active and c.archived_at is not null
     order by c.archived_at desc;
end $$;


-- =============================================================================
-- 9. ROW LEVEL SECURITY
-- =============================================================================
-- RLS is on for every table. Only SELECT policies exist: all writes go through
-- the RPC functions above (which run as the table owner).

alter table public.app_config        enable row level security;
alter table public.cycles            enable row level security;
alter table public.chair_bootstrap   enable row level security;
alter table public.activities        enable row level security;
alter table public.profiles          enable row level security;
alter table public.events            enable row level security;
alter table public.event_secrets     enable row level security;
alter table public.submissions       enable row level security;
alter table public.ledger            enable row level security;
alter table public.prize_claims      enable row level security;
alter table public.notifications     enable row level security;
alter table public.prize_suggestions enable row level security;
alter table public.sync_status       enable row level security;

drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);

drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to anon, authenticated using (true);

drop policy if exists cycles_read on public.cycles;
create policy cycles_read on public.cycles for select to authenticated using (true);

-- chair_bootstrap: no policies → nobody reads it through the API.

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using (true);

drop policy if exists event_secrets_read on public.event_secrets;
create policy event_secrets_read on public.event_secrets for select to authenticated using (public.is_admin());

drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists ledger_read on public.ledger;
create policy ledger_read on public.ledger for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists prize_claims_read on public.prize_claims;
create policy prize_claims_read on public.prize_claims for select to authenticated
  using (user_id = (select auth.uid()) or public.is_chair());

drop policy if exists prize_suggestions_read on public.prize_suggestions;
create policy prize_suggestions_read on public.prize_suggestions for select to authenticated using (public.is_admin());

drop policy if exists sync_status_read on public.sync_status;
create policy sync_status_read on public.sync_status for select to authenticated using (public.is_chair());


-- =============================================================================
-- 10. GRANTS
-- =============================================================================
-- Tables: the API roles may only SELECT (RLS then filters rows).
revoke all on all tables in schema public from anon, authenticated;
grant select on public.app_config, public.activities to anon;
grant select on public.app_config, public.cycles, public.activities, public.profiles, public.events,
                public.event_secrets, public.submissions, public.ledger, public.prize_claims,
                public.notifications, public.prize_suggestions, public.sync_status
  to authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Functions: logged-in users may call the RPCs; anon only the two sign-up checks.
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on function public.handle_available(text), public.friend_code_exists(text) to anon;
-- Internal plumbing, not meant to be called through the API:
revoke execute on function public.refresh_prize_race(uuid), public.handle_new_user(), public.on_ledger_insert(),
                           public.ledger_append_only(), public.notify(uuid, text, text, text),
                           public.make_friend_code(), public.event_json(uuid)
  from authenticated;


-- =============================================================================
-- 11. STORAGE — private bucket `proofs` for screenshots and event photos
-- =============================================================================
-- Path convention: <user id>/<uuid>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists proofs_upload_own on storage.objects;
create policy proofs_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists proofs_read_own_or_admin on storage.objects;
create policy proofs_read_own_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));


-- =============================================================================
-- 12. SEED DATA (only added if missing)
-- =============================================================================
insert into public.app_config (id) values (1) on conflict (id) do nothing;
insert into public.sync_status (id) values (1) on conflict (id) do nothing;

insert into public.cycles (name, starts_at, ends_at, is_active)
select '2026–27 Pilot',
       timestamp '2026-10-15 00:00:00' at time zone 'America/New_York',
       timestamp '2027-05-01 23:59:59' at time zone 'America/New_York',
       true
where not exists (select 1 from public.cycles);

insert into public.chair_bootstrap (email) values
  ('iesha.landis.yac@ncssm.edu'),
  ('jacob.rodriguez.yac@ncssm.edu')
on conflict (email) do nothing;

insert into public.activities (id, tier, title, method) values
  ('annual_fund',        1, 'Give to the Annual Fund',     'screenshot'),
  ('bring_new_alum',     1, 'Bring a New Young Alum',      'referral'),
  ('cross_campus_event', 1, 'Cross-Campus Event',          'event_password'),
  ('event_photos',       1, 'Upload Event Photos',         'photo'),
  ('home_event',         2, 'Home-Campus Event',           'event_password'),
  ('game_win',           2, 'Win a Game or Competition',   'lead_award'),
  ('social_tag',         2, 'Tag YAC in a Post',           'screenshot'),
  ('panel_mentorship',   2, 'Panel or Mentorship Circle',  'event_password'),
  ('survey',             3, 'Complete a Feedback Survey',  'screenshot'),
  ('follow_ig',          3, 'Follow YAC on Instagram',     'screenshot'),
  ('repost',             3, 'Repost a YAC Post',           'screenshot'),
  ('poll',               3, 'Vote in a Community Poll',    'screenshot'),
  ('story_game',         3, 'Play an Insta Story Game',    'screenshot')
on conflict (id) do update set tier = excluded.tier, title = excluded.title, method = excluded.method;

-- Done! Next: Authentication settings (see SETUP.md).

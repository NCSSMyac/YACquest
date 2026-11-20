-- ═══════════════════════════════════════════════════════════════════════════
-- 0034 — Quick start sign-ups (the app's own email verification), promo tools
--        (mystery teaser, campus scoreboard, recap cards), the Finals Study Break
--        quest and reusable limited reward campaigns.
--
--   QUICK START. Supabase "Confirm email" gets turned OFF after this runs (docs/SETUP.md), so a new
--   account is logged in right away. The app then verifies the address itself:
--   • profiles.email_verified_at (null until verified). Backfill: accounts that existed when 0034 first
--     ran and had confirmed through Supabase → their confirmation time (cut-off kept in
--     app_config.quickstart_since, so re-running never verifies anyone new).
--   • email_verify_tokens: single-use, SHA-256 hashed, 7 days. A new account gets one automatically
--     (trigger on auth.users) through the email outbox (kind 'verify_email', priority 1, never skipped
--     for "email updates off"). resend_verification_email(): 3 per hour per person; plus a global
--     cap (app_config.verify_emails_per_hour) so a sign-up flood can't eat the Gmail budget.
--   • verify_email_token(token): anon OK, needs the token only. Marks the email verified, restores a
--     held-back staff role (below), refreshes the prize race.
--   • Until verified people play fully, BUT: refresh_prize_race() skips them (when they verify, the race
--     refills open spots in crossing-time order, with their real crossing time as qualified_at);
--     set_role()/transfer_chair()/list_team() use email_verified_at (not Supabase's flag, which is always
--     set once "Confirm email" is off); participant emails (announcements, reminders, follow-ups,
--     Wrapped) are written as 'skipped_unverified' (in-app notifications still arrive).
--   • A bootstrap-chair email that signs up unverified starts as a participant; the YACquest Chair seat
--     is given when the email is verified (quickstart_pending_roles).
--   • A Supabase confirmation that happens later than 20 s after the account was created (the
--     "Confirm email ON" window, or a staff "Confirm user" in the dashboard) also verifies.
--
--   PROMO. reward_teaser() (anon OK: series name, emoji, outfit set, start times, campuses — no venue,
--   no secret, no counts) · reward_scoreboard() (check-ins of PARTICIPANTS per campus for the live
--   series: 3 days before its first event → 1 day after its last) · admin_event_recap() (staff: counts
--   + up to 12 characters, no names).
--
--   CAMPAIGNS. reward_campaigns (one per outfit set = one "series"): name, item label, pass name, emoji,
--   default countdown message. Brew & Quest 2026 is seeded. reward_pass_json() also returns
--   outfitSet / passName / emoji.
--
--   FINALS QUEST. Activity 'finals_study_break' (Tier 3 screenshot, counts toward the weekly digital
--   limit like every Tier 3 quest) + quest_windows (New York dates); can_submit() = copy of 0001 + the
--   window check.
--
-- Contract: docs/BACKEND.md, section "0034". Run AFTER 0033. Safe to run more than once (additive).
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns + tables
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles   add column if not exists email_verified_at timestamptz;
alter table public.app_config add column if not exists quickstart_since timestamptz;
alter table public.app_config add column if not exists verify_resends_per_hour int not null default 3;
alter table public.app_config add column if not exists verify_emails_per_hour int not null default 150;
update public.app_config set quickstart_since = now() where id = 1 and quickstart_since is null;

create table if not exists public.email_verify_tokens (
  token_hash text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  email      text not null,
  reason     text not null default 'signup' check (reason in ('signup', 'resend')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists email_verify_tokens_user on public.email_verify_tokens (user_id, created_at desc);
create index if not exists email_verify_tokens_created on public.email_verify_tokens (created_at desc);

-- A bootstrap staff role held back until the email is verified.
create table if not exists public.quickstart_pending_roles (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       text not null check (role in ('admin', 'chair')),
  created_at timestamptz not null default now()
);

create table if not exists public.reward_campaigns (
  id         text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name       text not null check (char_length(name) between 2 and 60),
  item_label text not null default 'free coffee' check (char_length(item_label) between 1 and 40),
  pass_name  text not null default 'Coffee Pass' check (char_length(pass_name) between 2 and 30),
  emoji      text not null default '☕' check (char_length(emoji) between 1 and 8),
  outfit_set text not null unique check (char_length(outfit_set) between 1 and 60),
  message    text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.reward_campaigns (id, name, item_label, pass_name, emoji, outfit_set, message)
values ('brew_quest_2026', 'Brew & Quest 2026', 'free coffee', 'Coffee Pass', '☕', 'latte_night_scholar',
        'First quest: meet us at {venue}! The first {limit} people to meet us get {item} on us ☕')
on conflict (id) do nothing;

create table if not exists public.quest_windows (
  activity_id text not null references public.activities (id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  primary key (activity_id, starts_on),
  check (ends_on >= starts_on)
);

alter table public.email_verify_tokens      enable row level security;
alter table public.quickstart_pending_roles enable row level security;
alter table public.reward_campaigns         enable row level security;
alter table public.quest_windows            enable row level security;
revoke all on public.email_verify_tokens, public.quickstart_pending_roles, public.reward_campaigns, public.quest_windows
  from anon, authenticated;

-- Email kinds + statuses
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('weekly_report', 'prize_qualified', 'prize_info', 'test', 'announcement', 'event_reminder', 'event_followup', 'wrapped', 'verify_email'));
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
  check (status in ('queued', 'sending', 'sent', 'failed', 'bounced', 'skipped_expired', 'skipped_opted_out', 'skipped_bouncing', 'skipped_unverified',
                    'skipped_cancelled'));  -- 0038's status is listed too, so re-running 0034 after 0038 stays safe

-- Finals Study Break quest (Tier 3, screenshot) + its windows (New York dates; keep in sync with QUEST_WINDOWS in src/config.ts)
insert into public.activities (id, tier, title, method) values ('finals_study_break', 3, 'Finals Study Break', 'screenshot')
on conflict (id) do update set tier = excluded.tier, title = excluded.title, method = excluded.method;
insert into public.quest_windows (activity_id, starts_on, ends_on) values
  ('finals_study_break', '2026-12-01', '2026-12-18'),
  ('finals_study_break', '2027-04-20', '2027-05-01')
on conflict (activity_id, starts_on) do update set ends_on = excluded.ends_on;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill (accounts that existed when 0034 first ran)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.backfill_email_verified(p_before timestamptz)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_n int;
begin
  update public.profiles p
     set email_verified_at = u.email_confirmed_at
    from auth.users u
   where u.id = p.id and p.email_verified_at is null and u.email_confirmed_at is not null
     and u.created_at < p_before;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
select public.backfill_email_verified((select quickstart_since from public.app_config where id = 1));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verification email + tokens
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.email_verify_days()
returns int language sql immutable as $$ select 7 $$;

create or replace function public.email_token_hash(p_token text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(digest(coalesce(trim(p_token), ''), 'sha256'), 'hex');
$$;

-- Queue one verification email (internal). Returns false when nothing was sent (verified, no email, global cap).
create or replace function public.queue_verification_email(p_user uuid, p_reason text default 'signup', p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  p       public.profiles;
  cfg     public.app_config;
  v_email text;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_hash  text;
  v_url   text;
  v_first text;
  v_text  text;
  v_html  text;
  v_out   uuid;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null or p.email_verified_at is not null then
    return false;
  end if;
  select * into cfg from public.app_config where id = 1;
  select lower(trim(u.email::text)) into v_email from auth.users u where u.id = p_user;
  v_email := coalesce(v_email, lower(trim(p.email::text)));
  if coalesce(v_email, '') !~ '^\S+@\S+\.\S+$' then
    return false;
  end if;
  -- global cap (bot sign-up floods): later sends can still go out with "Resend"
  if (select count(*) from public.email_verify_tokens where created_at > p_now - interval '1 hour')
     >= coalesce(cfg.verify_emails_per_hour, 150) then
    return false;
  end if;
  v_hash := public.email_token_hash(v_token);
  insert into public.email_verify_tokens (token_hash, user_id, email, reason, created_at, expires_at)
  values (v_hash, p_user, v_email, case when p_reason = 'resend' then 'resend' else 'signup' end, p_now,
          p_now + make_interval(days => public.email_verify_days()));

  v_url := public.email_app_url() || '/#/verify?t=' || v_token;
  v_first := coalesce(public.email_first_name(p.display_name), 'there');
  v_text := 'Hi ' || v_first || E',\n\n'
    || E'Welcome to YACquest! You can already check in, earn points and play. Tap the link below to confirm this is your email. It locks in your points and makes you eligible for a prize spot.\n\n'
    || 'Confirm my email: ' || v_url || E'\n\n'
    || E'The link works for 7 days. If you didn''t sign up for YACquest, you can ignore this email.\n\n'
    || E'—\nYACquest · NCSSM Young Alumni Council';
  v_html := public.email_layout('Confirm your YACquest email',
      '<p style="margin:0 0 12px;font-size:16px;">Hi ' || public.html_escape(v_first) || ',</p>'
    || '<p style="margin:0 0 12px;">Welcome to YACquest! You can already check in, earn points and play. Tap the button to confirm this is your email. It locks in your points and makes you eligible for a prize spot.</p>'
    || '<p style="margin:18px 0;"><a href="' || public.html_escape(v_url) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;border:2px solid #0b2a5b;">Confirm my email</a></p>'
    || '<p style="margin:0 0 6px;font-size:13px;color:#5b6475;">Or paste this link into your browser:<br><span style="word-break:break-all;">' || public.html_escape(v_url) || '</span></p>'
    || '<p style="margin:12px 0 0;font-size:13px;color:#5b6475;">The link works for 7 days.</p>');
  v_html := regexp_replace(v_html, '<!--yac:footer-->.*<!--/yac:footer-->',
    'You''re getting this because someone signed up for YACquest with this address. If that wasn''t you, you can ignore this email.<br>YACquest · NCSSM Young Alumni Council');

  insert into public.email_outbox (kind, to_emails, subject, body_text, body_html, dedupe_key)
  values ('verify_email', array[v_email], 'Confirm your YACquest email', v_text, v_html, 'verify:' || v_hash)
  returning id into v_out;
  -- The per-person copy (email_messages) was just written by the outbox trigger; don't keep the link here too.
  update public.email_outbox set body_text = '', body_html = '' where id = v_out;
  return true;
end $$;

-- Internal: mark verified (token, or a later Supabase confirmation). True = newly verified.
create or replace function public.mark_email_verified(p_user uuid, p_at timestamptz default now())
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  v_was  timestamptz;
  v_role text;
  v_max  int;
begin
  select email_verified_at into v_was from public.profiles where id = p_user for update;
  if not found then
    return false;
  end if;
  if v_was is not null then
    return false;
  end if;
  update public.profiles set email_verified_at = p_at where id = p_user;
  -- a bootstrap staff role held back at sign-up
  select role into v_role from public.quickstart_pending_roles where user_id = p_user;
  if v_role is not null then
    delete from public.quickstart_pending_roles where user_id = p_user;
    if v_role = 'chair' then
      perform pg_advisory_xact_lock(hashtext('yacquest:chair_seats'));
      select coalesce(max_chairs, 6) into v_max from public.app_config where id = 1;
      if (select count(*) from public.profiles where role = 'chair') < coalesce(v_max, 6) then
        update public.profiles set role = 'chair' where id = p_user and role = 'participant';
      end if;
    else
      update public.profiles set role = 'admin' where id = p_user and role = 'participant';
    end if;
  end if;
  perform public.notify(p_user, 'announcement', 'Email confirmed ✓',
    'Your points are locked in and you’re eligible for a prize spot. Thanks!');
  -- they may already be past the goal: the race refills open spots by crossing time
  perform public.refresh_prize_race(public.active_cycle_id());
  return true;
end $$;

-- #/verify?t=<token> (anon OK). Needs the token only.
create or replace function public.verify_email_token(p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  t       public.email_verify_tokens;
  v_email text;
begin
  if coalesce(trim(p_token), '') !~ '^[0-9a-fA-F]{32,128}$' then
    perform public.api_error('invalid', 'That confirmation link isn’t complete. Open the newest email from YACquest and tap the button again.');
  end if;
  select * into t from public.email_verify_tokens where token_hash = public.email_token_hash(lower(trim(p_token))) for update;
  if t.token_hash is null then
    perform public.api_error('invalid', 'That confirmation link isn’t valid. Open the newest email from YACquest, or send a new link from the app.');
  end if;
  if t.used_at is not null then
    perform public.api_error('used', 'This link was already used, so your email is confirmed. You’re all set!');
  end if;
  if now() > t.expires_at then
    perform public.api_error('expired', 'This link expired (links work for 7 days). Log in and tap “Resend email” in the red bar at the top for a new one.');
  end if;
  select lower(trim(u.email::text)) into v_email from auth.users u where u.id = t.user_id;
  if v_email is distinct from t.email then
    perform public.api_error('invalid', 'This link was sent to a different email address. Log in and tap “Resend email” in the red bar at the top for a new one.');
  end if;
  update public.email_verify_tokens set used_at = now() where token_hash = t.token_hash;
  if not public.mark_email_verified(t.user_id, now()) then
    return json_build_object('status', 'already');
  end if;
  return json_build_object('status', 'verified');
end $$;

-- "Resend email" in the red bar at the top of the app (signed in). 3 per hour.
create or replace function public.resend_verification_email()
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid  uuid := public.require_user();
  p      public.profiles;
  v_max  int;
  v_used int;
begin
  select * into p from public.profiles where id = v_uid;
  if p.email_verified_at is not null then
    perform public.api_error('already_verified', 'Your email is already confirmed.');
  end if;
  perform pg_advisory_xact_lock(hashtext('verify_resend:' || v_uid::text));
  select coalesce(verify_resends_per_hour, 3) into v_max from public.app_config where id = 1;
  select count(*) into v_used from public.email_verify_tokens
   where user_id = v_uid and reason = 'resend' and created_at > now() - interval '1 hour';
  if v_used >= v_max then
    perform public.api_error('rate_limit', format('You can resend %s times an hour. Check Spam or Promotions, or try again a bit later.', v_max));
  end if;
  if not public.queue_verification_email(v_uid, 'resend', now()) then
    perform public.api_error('rate_limit', 'Lots of people are signing up right now. Please try again in a few minutes.');
  end if;
  return json_build_object('sentTo', (select lower(trim(u.email::text)) from auth.users u where u.id = v_uid),
                           'resendsLeft', greatest(0, v_max - v_used - 1));
end $$;

-- New account: hold back a bootstrap staff role until verified, then queue the verification email.
-- (Runs after on_auth_user_created, which made the profile: triggers fire in name order.)
create or replace function public.on_auth_user_quickstart()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = new.id;
  if p.id is null or p.email_verified_at is not null then
    return null;
  end if;
  if p.role in ('admin', 'chair') then
    insert into public.quickstart_pending_roles (user_id, role) values (p.id, p.role) on conflict (user_id) do nothing;
    update public.profiles set role = 'participant' where id = p.id;
  end if;
  begin
    perform public.queue_verification_email(p.id, 'signup', now());
  exception when others then
    raise warning 'YACquest: verification email not queued for %: %', p.id, sqlerrm;  -- never block a sign-up
  end;
  return null;
end $$;
drop trigger if exists on_auth_user_quickstart on auth.users;
create trigger on_auth_user_quickstart after insert on auth.users
  for each row execute function public.on_auth_user_quickstart();

-- A Supabase confirmation that happens later (a real click, or "Confirm user" in the dashboard) also verifies.
-- With "Confirm email" OFF, Supabase confirms within the sign-up itself (< 20 s), which does NOT count.
create or replace function public.on_auth_user_email_confirmed()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null
     and new.email_confirmed_at > coalesce(new.created_at, new.email_confirmed_at) + interval '20 seconds' then
    perform public.mark_email_verified(new.id, new.email_confirmed_at);
  end if;
  return null;
end $$;
drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed after update of email_confirmed_at on auth.users
  for each row execute function public.on_auth_user_email_confirmed();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Prize race: copy of 0001 + "verified only" (+ a one-time nudge for unverified people past the goal)
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- 0034: past the goal but email not confirmed → one friendly nudge (they can't hold a spot yet)
  for r in
    select p.id from public.profiles p
     where p.role = 'participant' and p.points >= cfg.prize_goal and p.email_verified_at is null
       and not exists (select 1 from public.notifications n where n.user_id = p.id and n.title = 'Confirm your email to claim a prize spot')
  loop
    perform public.notify(r.id, 'prize_update', 'Confirm your email to claim a prize spot',
      format('You reached %s points! Tap the link in your YACquest confirmation email (or “Resend email” in the red bar at the top of the app) to claim an open spot.', cfg.prize_goal));
  end loop;

  for r in
    with candidates as (
      select p.id, p.display_name, p.campus
        from public.profiles p
       where p.role = 'participant'
         and p.points >= cfg.prize_goal
         and p.email_verified_at is not null   -- 0034
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Staff roles need a verified email: set_role / transfer_chair (copies of 0023) + list_team (copy of 0001)
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
    perform public.api_error('forbidden', 'A YACquest Chair can’t be demoted. YACquest Chairs step down or hand over their seat instead.');
  end if;
  if p_role in ('admin','chair') and t.email_verified_at is null then   -- 0034
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
  if t.email_verified_at is null then   -- 0034
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

create or replace function public.list_team()
returns table (id uuid, display_name text, handle text, email text, role text, email_verified boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_chair();
  return query
    select p.id, p.display_name, p.handle::text, p.email::text, p.role, (p.email_verified_at is not null)
      from public.profiles p
     where p.role in ('admin','chair')
     order by (p.role = 'chair') desc, p.display_name;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Emails: verification kind (priority 1, 7-day expiry) + participant emails skip unverified people
--    email_priority / email_campaign / email_expand_outbox = copies of 0032 + the 0034 lines
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.email_priority(p_kind text)
returns int language sql immutable set search_path = public, extensions as $$
  select case p_kind
    when 'prize_qualified' then 1 when 'prize_info' then 1 when 'test' then 1 when 'weekly_report' then 1
    when 'verify_email' then 1
    when 'event_reminder' then 2 when 'event_followup' then 3 when 'announcement' then 4 when 'wrapped' then 5
    else 4 end;
$$;

create or replace function public.email_campaign(p_kind text, p_dedupe text, p_subject text, p_created timestamptz,
                                                 out campaign_id text, out campaign_label text, out send_before timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_ref uuid := public.email_try_uuid(split_part(coalesce(p_dedupe, ''), ':', 2));
  e     public.events;
  a     public.announcements;
  c     public.cycles;
  v_days int := coalesce((select email_announcement_days from public.app_config where id = 1), 3);
  v_ny  timestamp := p_created at time zone 'America/New_York';
begin
  campaign_label := coalesce(nullif(p_subject, ''), p_kind);
  send_before := null;
  if p_kind = 'announcement' and v_ref is not null then
    select * into a from public.announcements where id = v_ref;
    campaign_id := 'announcement:' || v_ref;
    campaign_label := coalesce(a.title, campaign_label);
    send_before := least(coalesce(a.created_at, p_created) + make_interval(days => v_days), a.email_send_before);
  elsif p_kind in ('event_reminder', 'event_followup') and v_ref is not null then
    select * into e from public.events where id = v_ref;
    campaign_id := p_kind || ':' || v_ref;
    campaign_label := case when p_kind = 'event_reminder' then 'Reminder · ' else 'Follow-up · ' end || coalesce(e.title, 'event');
    send_before := case when p_kind = 'event_reminder' then coalesce(e.starts_at, p_created + interval '1 hour')
                        else coalesce(e.ends_at, p_created) + interval '3 days' end;
  elsif p_kind = 'wrapped' and v_ref is not null then
    select * into c from public.cycles where id = v_ref;
    campaign_id := 'wrapped:' || v_ref;
    campaign_label := 'Wrapped · ' || coalesce(c.name, 'this year');
    send_before := case when c.ends_at > p_created then c.ends_at else p_created + interval '3 days' end;
  elsif p_kind = 'weekly_report' then
    campaign_id := 'weekly_report:' || to_char(v_ny, 'YYYY-MM-DD');
    campaign_label := 'Weekly report · ' || trim(to_char(v_ny, 'Mon FMDD'));
    send_before := (date_trunc('day', v_ny) + interval '1 day') at time zone 'America/New_York';
  elsif p_kind in ('prize_qualified', 'prize_info') then
    campaign_id := 'prize:' || coalesce(v_ref::text, p_dedupe);
  elsif p_kind = 'test' then
    campaign_id := 'test';
    campaign_label := 'Test emails';
  elsif p_kind = 'verify_email' then   -- 0034: one campaign for all confirmation emails; the link lasts 7 days
    campaign_id := 'verify_email';
    campaign_label := 'Email confirmations';
    send_before := p_created + make_interval(days => public.email_verify_days());
  else
    campaign_id := p_kind || ':' || coalesce(p_dedupe, '');
  end if;
  if campaign_id is null then
    campaign_id := p_kind || ':' || coalesce(p_dedupe, '');
  end if;
end $$;

create or replace function public.email_expand_outbox(p_outbox uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  o        public.email_outbox;
  camp     record;
  v_email  text;
  p        public.profiles;
  v_vals   jsonb;
  v_part   boolean;
  v_token  text;
  v_unsub  text;
  v_subj   text;
  v_text   text;
  v_html   text;
  v_greet  text;
  v_pun    text;
  v_status text;
  v_n      int := 0;
begin
  select * into o from public.email_outbox where id = p_outbox;
  if o.id is null or exists (select 1 from public.email_messages m where m.outbox_id = o.id) then
    return 0;
  end if;
  select * into camp from public.email_campaign(o.kind, o.dedupe_key, o.subject, o.created_at);
  v_part := public.email_is_participant_kind(o.kind);

  for v_email in
    select distinct lower(trim(x)) from unnest(o.to_emails) x where trim(coalesce(x, '')) <> ''
  loop
    p := null;
    select pr.* into p
      from public.profiles pr left join auth.users u on u.id = pr.id
     where lower(u.email::text) = v_email or lower(pr.email::text) = v_email
     order by (lower(u.email::text) = v_email) desc nulls last
     limit 1;
    v_subj := o.subject;
    v_text := o.body_text;
    v_html := o.body_html;
    v_status := 'queued';

    if v_part then
      v_vals := case when p.id is not null then public.email_fill_values(p.id, camp.campaign_id, o.created_at) end;
      v_token := case when p.id is not null then public.email_unsub_token(p.id) end;
      v_unsub := case when v_token is not null then public.email_unsub_url(v_token) end;
      v_greet := case when public.email_first_name(p.display_name) is not null
                      then 'Hi ' || public.email_first_name(p.display_name) || ',' else 'Hi there,' end;
      -- the event thank-you and Wrapped sign off with a campus pun
      v_pun := case when p.id is not null and ((o.kind = 'event_followup' and o.subject like 'Thanks for coming%') or o.kind = 'wrapped')
                    then public.campus_pun(p.campus, public.email_seed(camp.campaign_id)) end;
      -- older footers ("You get this because …") are replaced by the new one
      v_text := regexp_replace(v_text, E'\\s*You get this because[^\\n]*$', '');
      v_html := regexp_replace(v_html, '<p style="font-size:12px;color:#4a5672;margin:0">You get this because[^<]*</p>', '', 'g');
      v_subj := public.email_fill(v_subj, v_vals, false);
      v_text := v_greet || E'\n\n' || public.email_fill(v_text, v_vals, false)
                || coalesce(E'\n\n' || v_pun, '') || E'\n\n' || public.email_footer_text(v_unsub);
      v_html := public.email_fill(v_html, v_vals, true);
      v_html := replace(v_html, '<!--yac:greeting-->',
                        '<p style="margin:0 0 12px;font-size:16px;">' || public.html_escape(v_greet) || '</p>');
      if v_pun is not null then
        v_html := replace(v_html, '<!--yac:signoff-->',
                          '<p style="margin:14px 0 0;color:#4a5672;font-style:italic;">' || public.html_escape(v_pun) || '</p>');
      end if;
      v_html := regexp_replace(v_html, '<!--yac:footer-->.*<!--/yac:footer-->', public.email_footer_html(v_unsub));
      if p.id is not null and not p.email_opt_in then
        v_status := 'skipped_opted_out';
      elsif p.id is not null and p.email_verified_at is null then   -- 0034: in-app only until the email is confirmed
        v_status := 'skipped_unverified';
      end if;
    elsif o.kind <> 'verify_email' then   -- 0034: the confirmation email is already complete
      if position('Admin → System' in v_text) = 0 then
        v_text := v_text || E'\n\n—\nYACquest · NCSSM Young Alumni Council. Manage these in Admin → System.';
      end if;
    end if;
    v_html := replace(replace(v_html, '<!--yac:greeting-->', ''), '<!--yac:signoff-->', '');
    if v_status = 'queued' and p.id is not null and p.email_bounced then
      v_status := 'skipped_bouncing';
    end if;

    insert into public.email_messages (outbox_id, kind, campaign_id, campaign_label, user_id, email, subject, body_text, body_html,
                                       priority, send_before, status, error, created_at)
    values (o.id, o.kind, camp.campaign_id, camp.campaign_label, p.id, v_email, v_subj,
            case when v_status like 'skipped%' then '' else v_text end,
            case when v_status like 'skipped%' then '' else v_html end,
            public.email_priority(o.kind), camp.send_before, v_status,
            case v_status when 'skipped_opted_out' then 'Email updates are off for this person.'
                          when 'skipped_bouncing' then 'Paused: emails to this address bounce.'
                          when 'skipped_unverified' then 'Email not confirmed yet: in-app only.' end,
            o.created_at)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  perform public.email_outbox_rollup(o.id);
  return v_n;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Reusable limited reward campaigns
-- ─────────────────────────────────────────────────────────────────────────────
-- One pass as JSON: copy of 0033 + outfitSet / passName / emoji from the campaign (Coffee Pass by default).
create or replace function public.reward_pass_json(rp public.reward_passes, p_with_secret boolean)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'eventId', rp.event_id, 'eventTitle', e.title, 'campus', e.campus,
    'passNo', rp.pass_no, 'limit', r.limit_count, 'venue', r.venue, 'item', r.item_label,
    'checkedInAt', rp.created_at,
    'validUntil', rp.created_at + make_interval(mins => public.reward_pass_minutes()),
    'usedAt', rp.used_at, 'usedBy', rp.used_by,
    'outfitSet', r.outfit_set, 'passName', coalesce(c.pass_name, 'Coffee Pass'), 'emoji', coalesce(c.emoji, '☕'))
    || case when p_with_secret then jsonb_build_object('secretWord', r.secret_word) else '{}'::jsonb end
    from public.events e join public.event_rewards r on r.event_id = e.id
    left join public.reward_campaigns c on c.outfit_set = r.outfit_set
   where e.id = rp.event_id;
$$;

create or replace function public.campaign_json(c public.reward_campaigns)
returns json language sql stable set search_path = public, extensions as $$
  select json_build_object('id', c.id, 'name', c.name, 'itemLabel', c.item_label, 'passName', c.pass_name,
                           'emoji', c.emoji, 'outfitSet', c.outfit_set, 'message', c.message, 'updatedAt', c.updated_at);
$$;

-- Everyone signed in (labels for banners, passes, Collection).
create or replace function public.reward_campaigns_list()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_user();
  return (select coalesce(json_agg(public.campaign_json(c) order by c.created_at, c.id), '[]'::json) from public.reward_campaigns c);
end $$;

-- Staff: create / update. p = {id?, name, itemLabel, passName, emoji, outfitSet, message}
create or replace function public.save_reward_campaign(p jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me    uuid := public.require_admin();
  v_id    text := lower(trim(coalesce(p->>'id', '')));
  v_name  text := trim(coalesce(p->>'name', ''));
  v_item  text := trim(coalesce(p->>'itemLabel', ''));
  v_pass  text := trim(coalesce(p->>'passName', ''));
  v_emoji text := trim(coalesce(p->>'emoji', ''));
  v_set   text := trim(coalesce(p->>'outfitSet', ''));
  v_msg   text := trim(coalesce(p->>'message', ''));
  v_other text;
  c       public.reward_campaigns;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    perform public.api_error('name', 'Campaign name: 2 to 60 characters.');
  end if;
  if v_id = '' then
    v_id := left(trim(both '_' from regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g')), 40);
  end if;
  if v_id !~ '^[a-z0-9_]{2,40}$' then
    perform public.api_error('name', 'Use letters or numbers in the campaign name.');
  end if;
  if v_item = '' then v_item := 'free coffee'; end if;
  if char_length(v_item) > 40 then
    perform public.api_error('itemLabel', 'Free item: at most 40 characters.');
  end if;
  if v_pass = '' then v_pass := 'Coffee Pass'; end if;
  if char_length(v_pass) < 2 or char_length(v_pass) > 30 then
    perform public.api_error('passName', 'Pass name: 2 to 30 characters.');
  end if;
  if v_emoji = '' then v_emoji := '🎁'; end if;
  if char_length(v_emoji) > 8 then
    perform public.api_error('emoji', 'Emoji: one emoji.');
  end if;
  if cardinality(public.event_outfit_items(v_set)) = 0 then
    perform public.api_error('outfitSet', 'Pick a reward outfit set.');
  end if;
  select name into v_other from public.reward_campaigns where outfit_set = v_set and id <> v_id;
  if v_other is not null then
    perform public.api_error('outfitSet', format('That outfit already belongs to “%s”. Each campaign has its own outfit.', v_other));
  end if;
  if v_msg = '' then v_msg := 'First quest: meet us at {venue}! The first {limit} people to meet us get {item} on us ' || v_emoji; end if;
  if char_length(v_msg) > 300 then
    perform public.api_error('message', 'Countdown message: 1 to 300 characters.');
  end if;
  insert into public.reward_campaigns (id, name, item_label, pass_name, emoji, outfit_set, message)
  values (v_id, v_name, v_item, v_pass, v_emoji, v_set, v_msg)
  on conflict (id) do update
    set name = excluded.name, item_label = excluded.item_label, pass_name = excluded.pass_name, emoji = excluded.emoji,
        outfit_set = excluded.outfit_set, message = excluded.message, updated_at = now()
  returning * into c;
  perform public.log_admin_action(v_me, 'reward_campaign_saved', null, jsonb_build_object('name', v_name, 'outfitSet', v_set));
  return public.campaign_json(c);
end $$;

-- Staff: delete a campaign no event uses yet.
create or replace function public.delete_reward_campaign(p_id text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := public.require_admin();
  c    public.reward_campaigns;
begin
  select * into c from public.reward_campaigns where id = p_id;
  if c.id is null then
    perform public.api_error('not_found', 'That campaign wasn’t found.');
  end if;
  if exists (select 1 from public.event_rewards where outfit_set = c.outfit_set) then
    perform public.api_error('in_use', 'Events use this campaign, so it can’t be deleted.');
  end if;
  delete from public.reward_campaigns where id = p_id;
  perform public.log_admin_action(v_me, 'reward_campaign_deleted', null, jsonb_build_object('name', c.name));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Promo: mystery teaser (anon OK), live campus scoreboard, recap card data (staff)
-- ─────────────────────────────────────────────────────────────────────────────
-- Upcoming special series whose next event starts within 14 days. No venue, no secret, no counts.
create or replace function public.reward_teaser(p_now timestamptz default null)
returns json language sql stable security definer set search_path = public, extensions as $$
  with v as (select coalesce(p_now, now()) as now),
  ev as (
    select r.outfit_set, e.campus, e.starts_at, split_part(e.title, ' @ ', 1) as name
      from public.event_rewards r join public.events e on e.id = r.event_id, v
     where e.cycle_id = public.active_cycle_id() and e.ends_at > v.now
  ),
  s as (select outfit_set, min(starts_at) as first_start from ev group by outfit_set)
  select coalesce(json_agg(json_build_object(
           'outfitSet', s.outfit_set,
           'name', (select ev.name from ev where ev.outfit_set = s.outfit_set order by ev.starts_at limit 1),
           'emoji', coalesce(c.emoji, '🎁'),
           'startsAt', s.first_start,
           'events', (select json_agg(json_build_object('campus', ev.campus, 'startsAt', ev.starts_at) order by ev.starts_at)
                        from ev where ev.outfit_set = s.outfit_set))
         order by s.first_start), '[]'::json)
    from s left join public.reward_campaigns c on c.outfit_set = s.outfit_set, v
   where s.first_start <= v.now + interval '14 days';
$$;

-- The live series (3 days before its first event → 1 day after its last): PARTICIPANT check-ins per campus.
create or replace function public.reward_scoreboard(p_now timestamptz default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  s     record;
  c     public.reward_campaigns;
begin
  perform public.require_user();
  select r.outfit_set, min(e.starts_at) as first_start, max(e.ends_at) as last_end, array_agg(e.id::text) as ids
    into s
    from public.event_rewards r join public.events e on e.id = r.event_id
   where e.cycle_id = public.active_cycle_id()
   group by r.outfit_set
  having v_now >= min(e.starts_at) - interval '3 days' and v_now <= max(e.ends_at) + interval '1 day'
   order by min(e.starts_at)
   limit 1;
  if s.outfit_set is null then
    return null;
  end if;
  select * into c from public.reward_campaigns where outfit_set = s.outfit_set;
  return json_build_object(
    'outfitSet', s.outfit_set,
    'name', (select split_part(e.title, ' @ ', 1) from public.events e where e.id::text = any (s.ids) order by e.starts_at limit 1),
    'campaign', c.name,
    'emoji', coalesce(c.emoji, '🎁'),
    'startsAt', s.first_start,
    'endsAt', s.last_end,
    'events', cardinality(s.ids),
    'campuses', (select json_agg(json_build_object('campus', x.campus, 'count', coalesce(n.cnt, 0)) order by x.ord)
                   from (values ('duke', 1), ('unc', 2), ('ncsu', 3)) x(campus, ord)
                   left join (select p.campus, count(*)::int as cnt
                                from public.ledger l join public.profiles p on p.id = l.user_id
                               where l.source = 'checkin' and l.ref_id = any (s.ids) and l.cycle_id = public.active_cycle_id()
                                 and p.role = 'participant'
                               group by p.campus) n on n.campus = x.campus));
end $$;

-- Staff: what the Instagram recap card needs. Characters only (no names), first 12 check-ins.
create or replace function public.admin_event_recap(p_event_id uuid)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  e public.events;
  r public.event_rewards;
  c public.reward_campaigns;
begin
  perform public.require_admin();
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  select * into r from public.event_rewards where event_id = p_event_id;
  if r.event_id is not null then
    select * into c from public.reward_campaigns where outfit_set = r.outfit_set;
  end if;
  return json_build_object(
    'eventId', e.id, 'title', e.title, 'location', e.location, 'campus', e.campus,
    'startsAt', e.starts_at, 'endsAt', e.ends_at,
    'venue', case when r.event_id is not null and r.venue <> 'TBD' then r.venue
                  when upper(trim(e.location)) not in ('', 'TBD') then e.location
                  else case e.campus when 'duke' then 'Duke' when 'unc' then 'UNC' when 'ncsu' then 'NC State' else 'YAC' end end,
    'attendees', (select count(*) from public.ledger l where l.source = 'checkin' and l.ref_id = e.id::text),
    'reward', case when r.event_id is null then null else json_build_object(
                'itemLabel', r.item_label, 'limit', r.limit_count, 'outfitSet', r.outfit_set,
                'given', (select count(*) from public.reward_passes rp where rp.event_id = e.id),
                'passName', coalesce(c.pass_name, 'Coffee Pass'), 'emoji', coalesce(c.emoji, '☕'), 'campaign', c.name) end,
    'characters', (select coalesce(json_agg(json_build_object('avatar', p.avatar, 'hat', p.hat, 'accessory', p.accessory, 'background', p.background)
                                            order by l.created_at, l.id), '[]'::json)
                     from (select * from public.ledger l where l.source = 'checkin' and l.ref_id = e.id::text
                            order by l.created_at, l.id limit 12) l
                     join public.profiles p on p.id = l.user_id));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Finals Study Break: quest windows + can_submit (copy of 0001 + the window check)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.quest_open(p_activity text, p_now timestamptz default now())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select not exists (select 1 from public.quest_windows w where w.activity_id = p_activity)
      or exists (select 1 from public.quest_windows w
                  where w.activity_id = p_activity
                    and (p_now at time zone 'America/New_York')::date between w.starts_on and w.ends_on);
$$;

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

  -- 0034: seasonal quests (Finals Study Break) only during their window
  if not public.quest_open(a.id, now()) then
    return 'This quest is only open during finals season. It’ll be back!';
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal helpers: nobody calls these through the API.
revoke execute on function
  public.backfill_email_verified(timestamptz), public.email_verify_days(), public.email_token_hash(text),
  public.queue_verification_email(uuid, text, timestamptz), public.mark_email_verified(uuid, timestamptz),
  public.on_auth_user_quickstart(), public.on_auth_user_email_confirmed(), public.refresh_prize_race(uuid),
  public.email_priority(text), public.email_campaign(text, text, text, timestamptz), public.email_expand_outbox(uuid),
  public.reward_pass_json(public.reward_passes, boolean), public.campaign_json(public.reward_campaigns),
  public.quest_open(text, timestamptz)
from public, anon, authenticated;

-- The confirmation link works without logging in (it needs the token only).
revoke execute on function public.verify_email_token(text) from public;
grant  execute on function public.verify_email_token(text) to anon, authenticated;
-- The mystery teaser shows on the Login / Sign-up screens too.
revoke execute on function public.reward_teaser(timestamptz) from public;
grant  execute on function public.reward_teaser(timestamptz) to anon, authenticated;

-- Logged-in users (staff checks happen inside).
revoke execute on function
  public.resend_verification_email(), public.set_role(uuid, text), public.transfer_chair(uuid), public.list_team(),
  public.reward_campaigns_list(), public.save_reward_campaign(jsonb), public.delete_reward_campaign(text),
  public.reward_scoreboard(timestamptz), public.admin_event_recap(uuid), public.can_submit(text, uuid)
from public, anon;
grant execute on function
  public.resend_verification_email(), public.set_role(uuid, text), public.transfer_chair(uuid), public.list_team(),
  public.reward_campaigns_list(), public.save_reward_campaign(jsonb), public.delete_reward_campaign(text),
  public.reward_scoreboard(timestamptz), public.admin_event_recap(uuid), public.can_submit(text, uuid)
to authenticated;

-- Done.

-- =============================================================================
-- YACquest database tests. Run by run_tests.sh AFTER stubs.sql + 0001_init.sql.
-- Every assertion raises on failure; psql runs with ON_ERROR_STOP=1, so any
-- failure makes the script exit non-zero.
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Test helpers (schema t)
-- ---------------------------------------------------------------------------
drop schema if exists t cascade;
create schema t;
grant usage on schema t to public;

create table t.users (name text primary key, id uuid not null);
insert into t.users values
  ('chair1', '00000000-0000-0000-0000-0000000000c1'),
  ('chair2', '00000000-0000-0000-0000-0000000000c2'),
  ('admin',  '00000000-0000-0000-0000-0000000000ad'),
  ('alice',  '00000000-0000-0000-0000-0000000000a1'),
  ('bob',    '00000000-0000-0000-0000-0000000000b0'),
  ('ref2',   '00000000-0000-0000-0000-0000000000b2'),
  ('ref3',   '00000000-0000-0000-0000-0000000000b3'),
  ('ref4',   '00000000-0000-0000-0000-0000000000b4'),
  ('carol',  '00000000-0000-0000-0000-000000000ca0'),
  ('dave',   '00000000-0000-0000-0000-000000000da0'),
  ('erin',   '00000000-0000-0000-0000-000000000e70'),
  ('frank',  '00000000-0000-0000-0000-000000000f70'),
  ('unver',  '00000000-0000-0000-0000-000000000099'),
  ('nometa', '00000000-0000-0000-0000-0000000000aa');
grant select on t.users to public;

create function t.u(p_name text) returns uuid language sql stable as $$
  select id from t.users where name = p_name;
$$;

create function t.pass(p_label text) returns void language plpgsql as $$
begin
  perform set_config('t.passed', (coalesce(nullif(current_setting('t.passed', true), ''), '0')::int + 1)::text, false);
  raise notice 'ok - %', p_label;
end $$;

create function t.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  perform t.pass(p_label);
end $$;

create function t.eq(p_got anyelement, p_want anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % (got %, want %)', p_label, p_got, p_want;
  end if;
  perform t.pass(p_label);
end $$;

-- Expect `p_sql` to fail with an API error "<p_code>: ..."
create function t.throws(p_sql text, p_code text, p_label text) returns void language plpgsql as $$
declare v_msg text; v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm; v_state := sqlstate;
  end;
  if v_msg is null then
    raise exception 'FAIL: % (no error raised)', p_label;
  end if;
  if v_msg not like p_code || ': %' or v_state <> 'P0001' then
    raise exception 'FAIL: % (got [%] %)', p_label, v_state, v_msg;
  end if;
  perform t.pass(p_label);
end $$;

-- Expect `p_sql` to be refused by permissions / RLS (42501).
create function t.denied(p_sql text, p_label text) returns void language plpgsql as $$
declare v_msg text; v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm; v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then
    raise exception 'FAIL: % (got [%] %)', p_label, v_state, coalesce(v_msg, 'no error');
  end if;
  perform t.pass(p_label);
end $$;

-- Session switching macros (psql variables expand to SQL text).
\set as_super 'reset role;'
\set as_chair1 'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000c1''; set role authenticated;'
\set as_chair2 'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000c2''; set role authenticated;'
\set as_admin  'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000ad''; set role authenticated;'
\set as_alice  'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000a1''; set role authenticated;'
\set as_bob    'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000b0''; set role authenticated;'
\set as_ref2   'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000b2''; set role authenticated;'
\set as_ref3   'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000b3''; set role authenticated;'
\set as_ref4   'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000000b4''; set role authenticated;'
\set as_carol  'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-000000000ca0''; set role authenticated;'
\set as_erin   'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-000000000e70''; set role authenticated;'
\set as_anon   'reset role; set request.jwt.claim.role = ''anon''; set request.jwt.claim.sub = ''''; set role anon;'
\set as_dave    'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-000000000da0''; set role authenticated;'
-- Edge Function with the service_role key:
\set as_service 'reset role; set request.jwt.claim.role = ''service_role''; set request.jwt.claim.sub = ''''; set role service_role;'
-- pg_cron / SQL Editor: database superuser, no API user, no JWT:
\set as_cron    'reset role; set request.jwt.claim.role = ''''; set request.jwt.claim.sub = '''';'

-- =============================================================================
-- 0. CONFIG (0004: 4 prizes × $75, Sheets sync removed)
-- =============================================================================
do $$ begin
  perform t.eq((select prize_count from app_config), 4, '0004: 4 prize spots');
  perform t.eq((select prize_value_usd from app_config), 75, '0004: $75 prizes');
  perform t.eq((select prize_goal from app_config), 350, '0018: goal 350 after all migrations (0016/0017 run before 0018)');
  perform t.eq((select column_default from information_schema.columns where table_name = 'app_config' and column_name = 'prize_goal'), '350', '0018: prize_goal column default 350');
  perform t.eq((select rule_value from cosmetics where id = 'sparkles'), '300', '0018: Sparkle Aura at 300 points');
  perform t.eq((select near_goal_points from report_settings), 75, '0018: close-to-the-prize range 75');
  perform t.eq((select column_default from information_schema.columns where table_name = 'report_settings' and column_name = 'near_goal_points'), '75', '0018: near_goal_points column default 75');
  perform t.ok(position('), 350) as prize_goal' in pg_get_functiondef('public.badges_for(uuid)'::regprocedure)) > 0, '0018: badges_for fallback goal 350');
  perform t.ok(to_regclass('public.sync_status') is null, '0004: sync_status table dropped');
  perform t.eq((select count(*) from report_settings), 1::bigint, 'report_settings seeded with one row');
  perform t.ok(not exists (select 1 from pg_proc where proname = 'submit_claim_info' and pronargs = 4), 'old 4-arg submit_claim_info dropped');
end $$;

-- =============================================================================
-- 1. SIGN-UP TRIGGER
-- =============================================================================
:as_super
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (t.u('chair1'), 'Iesha.Landis.YAC@ncssm.edu', now(), '{"handle":"iesha","display_name":"Iesha","campus":"unc","avatar":"mage"}'),
  (t.u('chair2'), 'jacob.rodriguez.yac@ncssm.edu', now(), '{"handle":"jacob","display_name":"Jacob","campus":"duke","avatar":"knight"}'),
  (t.u('admin'),  'helper@example.edu', now(), '{"handle":"helper","display_name":"Helper","campus":"ncsu","avatar":"ranger"}'),
  (t.u('alice'),  'alice@example.edu', now(), '{"handle":"alice","display_name":"Alice A.","campus":"duke","avatar":"yak"}'),
  (t.u('unver'),  'unver@example.edu', null,  '{"handle":"unver","display_name":"Unverified","campus":"unc","avatar":"yak"}');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select t.u(n), n || '@example.edu', now(),
       jsonb_build_object('handle', n, 'display_name', initcap(n), 'campus', c, 'avatar', 'yak',
                          'friend_code', lower((select friend_code from public.profiles where id = t.u('alice'))))
  from (values ('bob','unc'), ('ref2','unc'), ('ref3','ncsu'), ('ref4','duke')) v(n, c);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select t.u(n), n || '@example.edu', now(),
       jsonb_build_object('handle', n, 'display_name', initcap(n), 'campus', c, 'avatar', 'knight')
  from (values ('carol','duke'), ('dave','unc'), ('erin','ncsu'), ('frank','unc')) v(n, c);
insert into auth.users (id, email) values (t.u('nometa'), 'no.meta-data@example.edu');

do $$ begin
  perform t.eq((select role from profiles where id = t.u('chair1')), 'chair', 'bootstrap email (mixed case) becomes chair');
  perform t.eq((select role from profiles where id = t.u('chair2')), 'chair', 'second bootstrap email becomes chair');
  perform t.eq((select role from profiles where id = t.u('alice')),  'participant', 'normal email becomes participant');
  perform t.eq((select campus from profiles where id = t.u('alice')), 'duke', 'campus from metadata');
  perform t.eq((select display_name from profiles where id = t.u('alice')), 'Alice A.', 'display name from metadata');
  perform t.ok((select friend_code ~ '^YAC-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$' from profiles where id = t.u('alice')), 'friend code generated');
  perform t.eq((select referred_by from profiles where id = t.u('bob')), t.u('alice'), 'referral metadata sets referred_by (case-insensitive code)');
  perform t.eq((select count(*) from profiles where referred_by = t.u('alice')), 4::bigint, 'four referred friends');
  perform t.ok((select referred_by is null from profiles where id = t.u('carol')), 'no friend code → no referrer');
  perform t.eq((select count(*) from notifications where user_id = t.u('alice') and title = 'Welcome to YACquest!'), 1::bigint, 'welcome notification');
  perform t.eq((select points from profiles where id = t.u('alice')), 0, 'starts with 0 points');
  perform t.ok((select handle::text = 'no.metadata' and campus = 'unc' and display_name = 'no.meta-data' from profiles where id = t.u('nometa')), 'user without metadata gets fallbacks');
  perform t.throws($q$insert into auth.users (email, raw_user_meta_data) values ('x1@example.edu', '{"handle":"a b","display_name":"Xx","campus":"unc"}')$q$, 'handle', 'invalid handle rejected');
  perform t.throws($q$insert into auth.users (email, raw_user_meta_data) values ('x2@example.edu', '{"handle":"ALICE","display_name":"Xx","campus":"unc"}')$q$, 'handle', 'duplicate handle (case-insensitive) rejected');
  perform t.throws($q$insert into auth.users (email, raw_user_meta_data) values ('x3@example.edu', '{"handle":"xthree","display_name":"Xx","campus":"unc","friend_code":"YAC-0000"}')$q$, 'friendCode', 'unknown friend code rejected');
  perform t.throws($q$insert into auth.users (email, raw_user_meta_data) values ('x4@example.edu', '{"handle":"xfour","display_name":"Xx","campus":"mit"}')$q$, 'campus', 'bad campus rejected');
end $$;

-- =============================================================================
-- 2. ANON: handle_available / friend_code_exists
-- =============================================================================
:as_anon
do $$ begin
  perform t.eq(handle_available('alice'), false, 'handle_available: taken');
  perform t.eq(handle_available('Alice'), false, 'handle_available: taken (case-insensitive)');
  perform t.eq(handle_available('newbie_1'), true, 'handle_available: free');
  perform t.eq(handle_available('ab'), false, 'handle_available: too short');
  perform t.eq(handle_available('bad name'), false, 'handle_available: bad chars');
  perform t.eq(friend_code_exists('YAC-0000'), false, 'friend_code_exists: unknown');
  perform t.ok((select count(*) from app_config) = 1, 'anon can read app_config');
  perform t.ok((select count(*) from activities) = 15, 'anon can read 15 activities');
  perform t.denied('select dashboard_stats()', 'anon cannot call dashboard_stats');
  perform t.denied('select count(*) from profiles', 'anon cannot read profiles');
end $$;
:as_super
do $$
declare v_code text := (select friend_code from profiles where id = t.u('alice'));
begin
  perform set_config('t.code', v_code, false);
end $$;
:as_anon
do $$ begin
  perform t.eq(friend_code_exists(lower(' ' || current_setting('t.code') || ' ')), true, 'friend_code_exists: known (trim + case-insensitive)');
end $$;

-- =============================================================================
-- 3. ROLES: set_role
-- =============================================================================
:as_alice
do $$ begin
  perform t.throws(format('select set_role(%L, ''admin'')', t.u('bob')), 'forbidden', 'participant cannot set_role');
end $$;
:as_chair1
do $$ begin
  perform t.throws(format('select set_role(%L, ''admin'')', t.u('unver')), 'not_verified', 'unconfirmed email cannot become admin');
  perform t.throws(format('select set_role(%L, ''participant'')', t.u('chair2')), 'forbidden', 'chair cannot demote the other chair');
  perform t.throws(format('select set_role(%L, ''participant'')', t.u('chair1')), 'forbidden', 'chair cannot demote self via set_role');
  perform t.throws(format('select set_role(%L, ''chair'')', t.u('unver')), 'not_verified', 'unconfirmed email cannot become chair');
  perform t.throws(format('select set_role(%L, ''owner'')', t.u('alice')), 'forbidden', 'set_role rejects unknown roles');
  perform t.throws(format('select set_role(%L, ''admin'')', gen_random_uuid()), 'not_found', 'set_role unknown user');
  perform set_role(t.u('admin'), 'admin');
  perform t.eq((select role from profiles where id = t.u('admin')), 'admin', 'chair makes a confirmed user admin');
  perform t.ok((select count(*) from notifications where user_id = t.u('admin')) = 0, 'chair cannot read other users notifications');
  perform t.ok((select count(*) from list_team()) = 3, 'list_team shows 2 chairs + 1 admin');
  perform t.ok((select email_verified from list_team() where id = t.u('admin')), 'list_team email_verified');
end $$;
:as_super
do $$ begin
  perform t.ok(exists (select 1 from notifications where user_id = t.u('admin') and title like '%admin%'), 'new admin notified');
end $$;
:as_admin
do $$ begin
  perform t.throws('select list_team()', 'forbidden', 'admin cannot list_team');
  perform t.throws(format('select set_role(%L, ''admin'')', t.u('bob')), 'forbidden', 'admin cannot set_role');
end $$;

-- =============================================================================
-- 4. EVENTS (admin)
-- =============================================================================
:as_alice
do $$ begin
  perform t.throws($q$select create_event('{"title":"Nope","campus":"duke","kind":"active","startsAt":"2026-12-01T18:00:00Z","endsAt":"2026-12-01T20:00:00Z","password":"abcd"}')$q$, 'forbidden', 'participant cannot create_event');
end $$;
:as_admin
do $$
declare
  mk jsonb;
  ev json;
begin
  perform t.throws($q$select create_event('{"title":"ab","campus":"duke","kind":"active","startsAt":"2026-12-01T18:00:00Z","endsAt":"2026-12-01T20:00:00Z","password":"abcd"}')$q$, 'title', 'event title too short');
  perform t.throws($q$select create_event('{"title":"Thing","campus":"duke","kind":"active","startsAt":"2026-12-01T18:00:00Z","endsAt":"2026-12-01T20:00:00Z","password":"abc"}')$q$, 'password', 'event password too short');
  perform t.throws($q$select create_event('{"title":"Thing","campus":"duke","kind":"active","startsAt":"2026-12-01T18:00:00Z","endsAt":"2026-12-01T17:00:00Z","password":"abcd"}')$q$, 'endsAt', 'event ends before start');

  ev := create_event(jsonb_build_object('title','Home Live','campus','duke','kind','active','location','Bryan Center',
          'startsAt', now() - interval '1 hour', 'endsAt', now() + interval '2 hours', 'checkInGraceMinutes', 60, 'password', 'Secret1'));
  perform t.eq(ev->>'activityId', 'home_event', 'create_event derives home_event');
  perform t.eq(ev->>'password', 'Secret1', 'create_event returns password');
  perform t.eq((ev->>'attendeeCount')::int, 0, 'create_event camelCase attendeeCount');
  ev := create_event(jsonb_build_object('title','Panel Live','campus','unc','kind','active',
          'startsAt', now() - interval '10 minutes', 'endsAt', now() + interval '1 hour', 'password', 'panel'));
  perform t.eq(ev->>'activityId', 'home_event', 'active tier → home_event (Active Event)');
  ev := create_event(jsonb_build_object('title','Zoom Trivia','campus','all','kind','digital',
          'startsAt', now() + interval '1 day', 'endsAt', now() + interval '1 day 1 hour', 'password', 'zoom'));
  perform t.eq(ev->>'activityId', 'digital_event', 'digital tier → digital_event');
  perform delete_event((ev->>'id')::uuid);
  ev := create_event(jsonb_build_object('title','Cross Live','campus','all','kind','high_impact',
          'startsAt', now() + interval '20 minutes', 'endsAt', now() + interval '3 hours', 'password', 'triangle'));
  perform t.eq(ev->>'activityId', 'cross_campus_event', 'high_impact tier → cross_campus_event');
  perform t.eq(ev->>'campus', 'all', 'campus kept as chosen');
  perform t.ok((ev->>'crossCampus')::boolean, 'campus all sets crossCampus');
  perform t.throws($q$select create_event('{"title":"Thing","campus":"mars","kind":"active","startsAt":"2026-12-01T18:00:00Z","endsAt":"2026-12-01T20:00:00Z","password":"abcd"}')$q$, 'campus', 'invalid campus rejected');
  perform t.throws($q$select create_event('{"title":"Thing","campus":"duke","kind":"social","startsAt":"2026-12-01T18:00:00Z","endsAt":"2026-12-01T20:00:00Z","password":"abcd"}')$q$, 'kind', 'old kinds rejected');
  ev := create_event(jsonb_build_object('title','Social Live 2','campus','ncsu','kind','active',
          'startsAt', now() - interval '3 hours', 'endsAt', now() - interval '30 minutes', 'checkInGraceMinutes', 60, 'password', 'serve'));
  ev := create_event(jsonb_build_object('title','Future Event','campus','duke','kind','active',
          'startsAt', now() + interval '2 hours', 'endsAt', now() + interval '4 hours', 'password', 'future'));
  ev := create_event(jsonb_build_object('title','Past Event','campus','duke','kind','active',
          'startsAt', now() - interval '5 hours', 'endsAt', now() - interval '2 hours', 'checkInGraceMinutes', 60, 'password', 'past'));
  ev := update_event((select id from events where title = 'Future Event'),
          jsonb_build_object('title','Future Event','campus','duke','kind','high_impact',
          'startsAt', now() + interval '2 hours', 'endsAt', now() + interval '4 hours', 'password', 'future2'));
  perform t.eq(ev->>'activityId', 'cross_campus_event', 'update_event re-derives activity');
  perform t.eq(ev->>'password', 'future2', 'update_event updates password');
  perform t.eq((select count(*) from admin_list_events()), 6::bigint, 'admin_list_events lists all');
  perform t.ok((select bool_and(password is not null) from admin_list_events()), 'admin_list_events includes passwords');
  perform t.eq((select count(*) from event_secrets), 6::bigint, 'admin can read event_secrets');
end $$;

-- =============================================================================
-- 5. CHECK-IN + REFERRAL
-- =============================================================================
:as_alice
do $$
declare r json;
begin
  perform t.eq((select count(*) from events), 6::bigint, 'participant can read events');
  perform t.eq((select count(*) from event_secrets), 0::bigint, 'participant cannot read event_secrets');
  perform t.denied(format('select event_json(%L)', (select id from events where title = 'Home Live')), 'participant cannot call internal event_json');
  perform t.throws(format('select check_in(%L, %L)', gen_random_uuid(), 'x'), 'not_found', 'check_in unknown event');
  perform t.throws(format('select check_in(%L, %L)', (select id from events where title = 'Home Live'), 'wrong'), 'wrong_password', 'check_in wrong password');
  perform t.throws(format('select check_in(%L, %L)', (select id from events where title = 'Home Live'), ''), 'wrong_password', 'check_in empty password');
  perform t.throws(format('select check_in(%L, %L)', (select id from events where title = 'Future Event'), 'future2'), 'not_open', 'check_in too early');
  perform t.throws(format('select check_in(%L, %L)', (select id from events where title = 'Past Event'), 'past'), 'expired', 'check_in after grace');

  r := check_in((select id from events where title = 'Home Live'), '  sEcReT1 ');
  perform t.eq((r->>'points')::int, 20, 'home event = tier 2 = 20 (password trimmed, case-insensitive)');
  perform t.eq(r->>'activityId', 'home_event', 'returns activityId');
  perform t.throws(format('select check_in(%L, %L)', (select id from events where title = 'Home Live'), 'Secret1'), 'duplicate', 'check_in duplicate');
  r := check_in((select id from events where title = 'Panel Live'), 'PANEL');
  perform t.eq(r->>'activityId', 'home_event', 'active-tier check-in activity');
  perform t.eq((r->>'points')::int, 20, 'active tier = 20');
  r := check_in((select id from events where title = 'Cross Live'), 'triangle');  -- opens 30 min early
  perform t.eq((r->>'points')::int, 35, 'cross-campus = tier 1 = 35 (30-min early window)');
  r := check_in((select id from events where title = 'Social Live 2'), 'serve');  -- ended, within grace
  perform t.eq((r->>'points')::int, 20, 'check-in within grace period works');
  perform t.eq((select points from profiles where id = auth.uid()), 95, 'profile points maintained by trigger');
  perform t.eq((select attendee_count from events where title = 'Home Live'), 1, 'attendee_count bumped');
  perform t.eq((select count(*) from ledger where source = 'referral'), 0::bigint, 'no referral for non-referred user');
end $$;

:as_bob
do $$ begin
  perform check_in((select id from events where title = 'Home Live'), 'secret1');
  perform check_in((select id from events where title = 'Panel Live'), 'panel');
  perform t.eq((select points from profiles where id = auth.uid()), 75, 'bob has 40 + 35 joined-with-code bonus');
  perform t.eq((select count(*) from ledger where user_id <> auth.uid()), 0::bigint, 'RLS: bob cannot see alice''s ledger (incl. referral row)');
end $$;
:as_ref2
select check_in((select id from events where title = 'Home Live'), 'secret1') \g /dev/null
:as_ref3
select check_in((select id from events where title = 'Home Live'), 'secret1') \g /dev/null
:as_ref4
select check_in((select id from events where title = 'Home Live'), 'secret1') \g /dev/null
:as_super
do $$ begin
  perform t.eq((select count(*) from ledger where source = 'referral' and user_id = t.u('alice')), 3::bigint, 'referral bonus capped at 3 per cycle');
  perform t.eq((select count(*) from ledger where activity_id = 'joined_with_code'), 4::bigint, 'every new member who used a code gets the joined bonus once (even past the referrer cap)');
  perform t.eq((select count(*) from ledger where activity_id = 'joined_with_code' and user_id = t.u('bob')), 1::bigint, 'bob joined bonus only once');
  perform t.eq((select count(*) from ledger where source = 'referral' and ref_id = t.u('bob')::text), 1::bigint, 'only bob''s FIRST check-in pays a referral');
  perform t.ok((select bool_and(amount = 35 and activity_id in ('bring_new_alum','joined_with_code')) from ledger where source = 'referral'), 'referral rows are tier 1 (35)');
  perform t.eq((select points from profiles where id = t.u('alice')), 200, 'alice 95 + 3×35 referral');
  perform t.eq((select count(*) from notifications where user_id = t.u('alice') and title = '+35 for bringing a friend'), 3::bigint, 'referrer notified each time');
  perform t.eq((select attendee_count from events where title = 'Home Live'), 5, 'attendee_count = 5');
end $$;
:as_alice
do $$ begin
  perform t.eq((dashboard_stats()->>'referralsUsed')::int, 3, 'dashboard referralsUsed');
  perform t.eq((dashboard_stats()->>'points')::int, 200, 'dashboard points');
end $$;

-- =============================================================================
-- 6. SUBMISSIONS: can_submit / submit_proof
-- =============================================================================
:as_alice
do $$
declare
  me text := auth.uid()::text;
  s submissions;
begin
  perform t.ok(can_submit('home_event') like 'That quest can%', 'can_submit: event activities are not screenshot quests');
  perform t.ok(can_submit('nope') is not null, 'can_submit: unknown activity');
  perform t.ok(can_submit('survey') is null, 'can_submit: survey OK');
  perform t.throws(format('select submit_proof(%L, null, %L, %L)', 'survey', 'someone-else/x.jpg', ''), 'file_type', 'submit_proof: path must start with own uid');
  perform t.throws(format('select submit_proof(%L, null, %L, %L)', 'survey', me || '/x.jpg', repeat('x', 281)), 'note', 'submit_proof: note > 280');
  s := submit_proof('survey', null, me || '/survey.jpg', '  done ');
  perform t.eq(s.status, 'pending', 'submit_proof returns pending row');
  perform t.eq(s.note, 'done', 'note trimmed');
  perform t.ok(can_submit('poll') like 'Digital quests are limited to 1 per week%', 'can_submit: tier-3 weekly cap (combined)');
  perform t.throws(format('select submit_proof(%L, null, %L, %L)', 'poll', me || '/p.jpg', ''), 'limit', 'submit_proof: weekly cap enforced');

  perform submit_proof('annual_fund', null, me || '/af.jpg', '');
  perform t.ok(can_submit('annual_fund') = 'You already submitted this one for this cycle.', 'can_submit: once per cycle');

  perform submit_proof('social_tag', null, me || '/t1.jpg', '');
  perform submit_proof('social_tag', null, me || '/t2.jpg', '');
  perform t.ok(can_submit('social_tag') = 'Social tags are limited to 2 per month.', 'can_submit: social tag monthly cap');

  perform t.ok(can_submit('event_photos') = 'Pick the event the photo is from.', 'can_submit: photo needs event');
  perform t.ok(can_submit('event_photos', (select id from events where title = 'Past Event')) = 'You can only upload photos from events you checked in to.', 'can_submit: photo needs check-in');
  perform submit_proof('event_photos', (select id from events where title = 'Home Live'), me || '/ph1.jpg', '');
  perform t.ok(can_submit('event_photos', (select id from events where title = 'Home Live')) = 'You already uploaded a photo for that event.', 'can_submit: 1 photo per event');
  perform submit_proof('event_photos', (select id from events where title = 'Panel Live'), me || '/ph2.jpg', '');
  perform submit_proof('event_photos', (select id from events where title = 'Cross Live'), me || '/ph3.jpg', '');
  perform t.ok(can_submit('event_photos', (select id from events where title = 'Social Live 2')) is null, 'can_submit: 4th photo OK');
end $$;
:as_super
update app_config set photos_per_cycle = 3;
:as_alice
do $$ begin
  perform t.ok(can_submit('event_photos', (select id from events where title = 'Social Live 2')) = 'Photo points are limited to 3 per cycle.', 'can_submit: photos per cycle cap (from app_config)');
end $$;
:as_super
update app_config set photos_per_cycle = 4;
:as_bob
do $$ begin
  perform submit_proof('survey', null, auth.uid()::text || '/s.jpg', 'bob survey');
  perform t.eq((select count(*) from submissions), 1::bigint, 'RLS: bob sees only his own submission');
end $$;

-- =============================================================================
-- 7. REVIEW + POINTS (admin)
-- =============================================================================
:as_alice
do $$ begin
  perform t.throws(format('select review_submission(%L, ''approved'', null)', (select id from submissions where activity_id = 'survey' and user_id = auth.uid())), 'forbidden', 'participant cannot review');
  perform t.throws(format('select adjust_points(%L, 10, ''because'')', auth.uid()), 'forbidden', 'participant cannot adjust_points');
  perform t.throws(format('select award_activity(%L, ''game_win'', null)', auth.uid()), 'forbidden', 'participant cannot award_activity');
  perform t.throws('select admin_overview()', 'forbidden', 'participant cannot admin_overview');
  perform t.throws('select search_users(''a'')', 'forbidden', 'participant cannot search_users');
end $$;
:as_admin
do $$
declare v_sub uuid := (select id from submissions where activity_id = 'survey' and user_id = t.u('alice'));
begin
  perform t.eq((select count(*) from submissions), 8::bigint, 'admin sees all submissions');
  perform t.throws(format('select review_submission(%L, ''approved'', null)', gen_random_uuid()), 'not_found', 'review unknown submission');
  perform t.throws(format('select review_submission(%L, ''maybe'', null)', v_sub), 'decision', 'review bad decision');
  perform review_submission(v_sub, 'approved', null);
  perform t.eq((select status from submissions where id = v_sub), 'approved', 'submission approved');
  perform t.eq((select points from profiles where id = t.u('alice')), 205, 'approve adds tier-3 points (5)');
  perform t.ok(exists (select 1 from ledger where source = 'submission' and ref_id = v_sub::text and created_by = t.u('admin')), 'approval ledger row');
  perform t.throws(format('select review_submission(%L, ''approved'', null)', v_sub), 'already_reviewed', 'cannot review twice');
  v_sub := (select id from submissions where activity_id = 'annual_fund' and user_id = t.u('alice'));
  perform t.throws(format('select review_submission(%L, ''rejected'', ''  '')', v_sub), 'reason', 'reject needs a reason');
  perform review_submission(v_sub, 'reject', 'Receipt not readable');
  perform t.eq((select status || '|' || review_reason from submissions where id = v_sub), 'rejected|Receipt not readable', 'submission rejected with reason');
  perform t.eq((select points from profiles where id = t.u('alice')), 205, 'reject adds no points');

  perform t.throws(format('select adjust_points(%L, 0, ''because'')', t.u('alice')), 'amount', 'adjust 0');
  perform t.throws(format('select adjust_points(%L, 36, ''because'')', t.u('alice')), 'amount', 'manual add capped at tier 1 (35)');
  perform t.throws(format('select adjust_points(%L, -351, ''because'')', t.u('alice')), 'amount', 'manual removal capped at the goal (350)');
  perform t.throws(format('select adjust_points(%L, 10, ''ab'')', t.u('alice')), 'reason', 'adjust reason too short');
  perform t.throws(format('select adjust_points(%L, 10, ''because'')', gen_random_uuid()), 'not_found', 'adjust unknown user');
  perform adjust_points(t.u('alice'), -5, 'Duplicate survey');
  perform t.eq((select points from profiles where id = t.u('alice')), 200, 'admin adjust -5');
  perform award_activity(t.u('alice'), 'game_win', 'Cornhole');
  perform t.eq((select points from profiles where id = t.u('alice')), 220, 'award_activity game_win +20');
  perform t.ok(exists (select 1 from ledger where user_id = t.u('alice') and reason = 'Win a Game or Competition: Cornhole'), 'award reason "<title>: <note>"');
  perform t.throws(format('select award_activity(%L, ''nope'', null)', t.u('alice')), 'activity', 'award unknown activity');
  perform t.eq((select count(*) from search_users('ALI')), 1::bigint, 'search_users case-insensitive');
  perform t.eq((select points from search_users('alice')), 220, 'search_users returns points');
  perform t.throws(format('select delete_event(%L)', (select id from events where title = 'Home Live')), 'has_attendees', 'cannot delete event with attendees');
  perform delete_event((select id from events where title = 'Past Event'));
  perform t.ok(not exists (select 1 from events where title = 'Past Event'), 'delete_event');
end $$;
:as_alice
do $$ begin
  perform t.ok(exists (select 1 from notifications where title = '+5 pts — Complete a Feedback Survey'), 'approval notification');
  perform t.ok(exists (select 1 from notifications where title = 'Not approved — Give to the Annual Fund' and body = 'Receipt not readable'), 'rejection notification with reason');
  perform t.ok(exists (select 1 from notifications where title = '-5 pts from Helper' and body = 'Duplicate survey'), 'adjust notification');
  perform t.ok(can_submit('annual_fund') is null, 'rejected once-per-cycle submission can be resubmitted');
end $$;

-- =============================================================================
-- 8. RLS / direct writes
-- =============================================================================
:as_alice
do $$ begin
  perform t.eq((select count(*) from ledger where user_id <> auth.uid()), 0::bigint, 'RLS: no other users'' ledger');
  perform t.eq((select count(*) from submissions where user_id <> auth.uid()), 0::bigint, 'RLS: no other users'' submissions');
  perform t.eq((select count(*) from profiles), 1::bigint, 'RLS: only own profile');
  perform t.eq((select count(*) from notifications where user_id <> auth.uid()), 0::bigint, 'RLS: only own notifications');
  perform t.eq((select count(*) from prize_suggestions), 0::bigint, 'RLS: participant cannot read suggestions');
  perform t.eq((select count(*) from report_settings), 0::bigint, 'RLS: participant cannot read report_settings');
  perform t.denied(format('insert into ledger (cycle_id, user_id, amount, source) values (active_cycle_id(), %L, 999, ''manual'')', auth.uid()), 'participant cannot insert into ledger');
  perform t.denied('update profiles set role = ''chair'' where id = auth.uid()', 'participant cannot update own role');
  perform t.denied('update profiles set points = 9999 where id = auth.uid()', 'participant cannot update own points');
  perform t.denied('insert into prize_claims (cycle_id, spot, user_id, display_name, campus) values (active_cycle_id(), 1, auth.uid(), ''x'', ''duke'')', 'participant cannot insert prize_claims');
  perform t.denied('update submissions set status = ''approved''', 'participant cannot update submissions');
  perform t.denied('delete from notifications', 'participant cannot delete notifications');
  perform t.denied(format('select refresh_prize_race(%L)', active_cycle_id()), 'participant cannot call refresh_prize_race');
  -- storage
  insert into storage.objects (bucket_id, name, owner) values ('proofs', auth.uid()::text || '/a.jpg', auth.uid());
  perform t.pass('storage: upload under own uid folder');
  perform t.denied(format('insert into storage.objects (bucket_id, name) values (''proofs'', %L)', t.u('bob')::text || '/evil.jpg'), 'storage: cannot upload into another user''s folder');
  perform t.eq((select count(*) from storage.objects), 1::bigint, 'storage: reads own files');
end $$;
:as_bob
do $$ begin
  perform t.eq((select count(*) from storage.objects), 0::bigint, 'storage: cannot read others'' files');
end $$;
:as_admin
do $$ begin
  perform t.eq((select count(*) from storage.objects), 1::bigint, 'storage: admin reads all files');
  perform t.ok((select count(*) from ledger) > (select count(*) from ledger where user_id = auth.uid()), 'admin reads all ledger rows');
  perform t.ok((select count(*) from profiles) > 10, 'admin reads all profiles');
  perform t.denied(format('insert into ledger (cycle_id, user_id, amount, source) values (active_cycle_id(), %L, 1, ''manual'')', auth.uid()), 'admin cannot insert into ledger directly');
  perform t.eq((select count(*) from report_settings), 0::bigint, 'admin cannot read report_settings');
end $$;
:as_chair1
do $$ begin
  perform t.eq((select count(*) from report_settings), 1::bigint, 'chair reads report_settings');
end $$;
:as_super
do $$ begin
  perform t.throws('update ledger set amount = 1', 'forbidden', 'ledger is append-only even for the owner');
end $$;

-- =============================================================================
-- 9. PRIZE RACE  (goal 300, 2 spots for the test)
-- =============================================================================
:as_super
-- Big one-step boosts need a higher manual cap just for this section (cap = tier1_points).
update app_config set prize_goal = 300, prize_count = 2, tier1_points = 500;
:as_admin
select adjust_points(t.u('carol'), 300, 'race test') \g /dev/null
select adjust_points(t.u('dave'),  300, 'race test') \g /dev/null
select adjust_points(t.u('erin'),  300, 'race test') \g /dev/null
select adjust_points(t.u('frank'), 300, 'race test') \g /dev/null
select adjust_points(t.u('erin'),  -50, 'race test') \g /dev/null
select adjust_points(t.u('erin'),   50, 'race test: erin re-crosses AFTER frank') \g /dev/null
select adjust_points(t.u('admin'), 400, 'admins are not in the race') \g /dev/null
do $$ declare ps json := prize_status();
begin
  perform t.eq((ps->>'remaining')::int, 0, 'race: both spots taken');
  perform t.eq((ps->'claims'->0->>'userId')::uuid, t.u('carol'), 'race: spot 1 = first to cross (carol)');
  perform t.eq((ps->'claims'->1->>'userId')::uuid, t.u('dave'), 'race: spot 2 = second (dave)');
  perform t.eq((ps->'claims'->0->>'displayName'), 'Carol', 'race: prize_status camelCase displayName');
  perform t.ok((ps->'claims'->0) ->> 'contact' is null, 'race: prize_status has no contact info');
  perform t.ok(not exists (select 1 from prize_claims where user_id = t.u('admin')), 'race: admin never wins a spot');
  perform t.eq((admin_overview()->'prize'->>'remaining')::int, 0, 'admin_overview.prize');
  perform t.ok((select count(*) from json_array_elements(admin_overview()->'nearGoal') x
                 where (x->>'userId')::uuid in (t.u('erin'), t.u('frank'))) = 2, 'admin_overview nearGoal lists unclaimed erin + frank');
  perform t.ok((select count(*) from json_array_elements(admin_overview()->'nearGoal') x
                 where (x->>'userId')::uuid = t.u('carol')) = 0, 'nearGoal excludes claimed carol');

  -- carol drops below → revoked, spot 1 goes to frank (crossed before erin's re-cross)
  perform adjust_points(t.u('carol'), -1, 'correction');
  ps := prize_status();
  perform t.eq((ps->'claims'->0->>'userId')::uuid, t.u('frank'), 'race: revoked spot 1 refilled by next eligible (frank, by most recent crossing)');
  perform t.eq((ps->'claims'->0->>'spot')::int, 1, 'race: refill uses the freed spot number');
  perform t.ok(not exists (select 1 from json_array_elements(ps->'claims') x where (x->>'userId')::uuid = t.u('carol')), 'race: carol no longer in prize_status');
  perform t.eq((select count(*) from prize_claims), 0::bigint, 'RLS: admin (non-chair) cannot read prize_claims');

  perform adjust_points(t.u('dave'), -100, 'correction');
  ps := prize_status();
  perform t.eq((ps->'claims'->1->>'userId')::uuid, t.u('erin'), 'race: spot 2 refilled by erin');

  perform adjust_points(t.u('carol'), 1, 'back to 300');
  perform t.eq((prize_status()->>'remaining')::int, 0, 'race: carol back at goal but no spot left');
end $$;
:as_super
do $$ begin
  perform t.eq((select status from prize_claims where user_id = t.u('carol')), 'revoked', 'race: carol revoked, no active claim after re-crossing');
  perform t.eq((select revoke_reason from prize_claims where user_id = t.u('carol')), 'Points fell below the goal after a correction', 'race: revoke reason');
  perform t.eq((select status from prize_claims where user_id = t.u('dave')), 'revoked', 'race: dave revoked');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('carol') and kind = 'prize_update' and title = 'Your prize spot was released'), 'race: revoked user notified');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('frank') and kind = 'prize_qualified' and title = 'You won spot #1!'), 'race: refill winner notified');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('carol') and title = 'You won spot #1!'), 'race: original winner notified');
end $$;
:as_carol
do $$ begin
  perform t.eq((select count(*) from prize_claims), 1::bigint, 'RLS: carol sees only her own (revoked) claim');
  perform t.throws('select submit_claim_info(''Carol C'', ''carol@example.edu'', ''919-555-0100'', ''1 Main St, Durham NC 27701'', ''Amazon'', null)', 'no_claim', 'submit_claim_info without active claim');
  perform t.throws('select list_claims()', 'forbidden', 'participant cannot list_claims');
end $$;
:as_erin
do $$ declare c json;
begin
  perform t.throws('select submit_claim_info(''E'', ''erin@example.edu'', ''919-555-0100'', ''1 Main St, Durham NC 27701'', ''Amazon'', null)', 'fullName', 'claim info: full name');
  perform t.throws('select submit_claim_info(''Erin E'', ''nope'', ''919-555-0100'', ''1 Main St, Durham NC 27701'', ''Amazon'', null)', 'email', 'claim info: email');
  perform t.throws('select submit_claim_info(''Erin E'', ''erin@example.edu'', ''555-01'', ''1 Main St, Durham NC 27701'', ''Amazon'', null)', 'phone', 'claim info: phone needs 7 digits');
  perform t.throws('select submit_claim_info(''Erin E'', ''erin@example.edu'', ''(919) 555-0100'', ''Durham'', ''Amazon'', null)', 'address', 'claim info: address needs 10 chars');
  perform t.throws(format('select submit_claim_info(''Erin E'', ''erin@example.edu'', ''(919) 555-0100'', ''12 Oak Ave, Raleigh NC'', null, %L)', repeat('x', 281)), 'notes', 'claim info: notes <= 280');
  c := submit_claim_info('Erin E', 'erin@example.edu', '(919) 555-0100', '12 Oak Ave, Raleigh NC 27601', 'Amazon', 'thanks!');
  perform t.eq(c->'contact'->>'phone', '(919) 555-0100', 'claim contact phone');
  perform t.eq(c->'contact'->>'address', '12 Oak Ave, Raleigh NC 27601', 'claim contact address');
  perform t.eq(c->'contact'->>'preference', 'Amazon', 'claim contact preference');
  perform t.eq(c->>'status', 'info_submitted', 'claim info submitted');
  perform t.ok(c->>'reference' ~ ('^YQ-' || extract(year from now() at time zone 'America/New_York')::int || '-02[A-Z0-9]{4}$'), 'claim reference format YQ-<year>-<spot><4>');
  perform t.eq(c->'contact'->>'fullName', 'Erin E', 'claim contact json');
end $$;
:as_chair1
do $$ begin
  perform t.eq((select count(*) from list_claims()), 4::bigint, 'list_claims shows all statuses');
  perform t.eq((select array_agg(status) from list_claims()), array['qualified','info_submitted','revoked','revoked'], 'list_claims: active by spot, revoked last');
  perform mark_fulfilled(1);
  perform t.throws('select mark_fulfilled(5)', 'not_found', 'mark_fulfilled unknown spot');
  perform t.eq((select status from prize_claims where spot = 1 and status <> 'revoked'), 'fulfilled', 'mark_fulfilled');
end $$;
:as_admin
do $$ begin
  perform adjust_points(t.u('frank'), -100, 'post-fulfil correction');
end $$;
:as_super
do $$ begin
  perform t.eq((select status from prize_claims where user_id = t.u('frank') and status <> 'revoked'), 'fulfilled', 'race: fulfilled claims are never revoked');
end $$;

:as_super
update app_config set tier1_points = 35;

-- =============================================================================
-- 10. LEADERBOARD / RANKS
-- =============================================================================
-- points now: carol 300, erin 300, alice 220, dave 200, frank 200, bob 75, ref2..4 55 (joined-with-code bonus)
:as_carol
do $$ begin
  perform t.ok((select rank = 1 from leaderboard(10) where user_id = t.u('carol')), 'leaderboard: carol rank 1');
  perform t.ok((select rank = 1 from leaderboard(10) where user_id = t.u('erin')), 'leaderboard: tie shares rank 1 (erin)');
  perform t.ok((select rank = 3 from leaderboard(10) where user_id = t.u('alice')), 'leaderboard: rank skips after tie (alice 3)');
  perform t.ok((select rank = 4 from leaderboard(10) where user_id = t.u('dave')) and (select rank = 4 from leaderboard(10) where user_id = t.u('frank')), 'leaderboard: dave/frank tie at 4');
  perform t.eq((select array_agg(display_name) from leaderboard(2)), array['Carol','Erin'], 'leaderboard: ties ordered by display_name; limit');
  perform t.ok(not exists (select 1 from leaderboard(100) where user_id in (t.u('admin'), t.u('chair1'))), 'leaderboard: staff excluded');
  perform t.ok((select bool_and(campus = 'unc') from leaderboard(100, 'unc')), 'leaderboard campus filter');
  perform t.ok((select rank = 1 from leaderboard(10, 'unc') where user_id = t.u('dave')), 'campus leaderboard ranks within campus');
  perform t.eq((select rank from my_rank()), 1, 'my_rank');
  perform t.eq((dashboard_stats()->>'rankOverall')::int, 1, 'dashboard rankOverall');
  perform t.eq((dashboard_stats()->>'rankCampus')::int, 1, 'dashboard rankCampus');
  perform t.eq((dashboard_stats()->>'participants')::int, 11, 'dashboard participants count');
  perform t.ok((dashboard_stats()->>'unreadCount')::int > 0, 'dashboard unreadCount');
  perform mark_notifications_read();
  perform t.eq((dashboard_stats()->>'unreadCount')::int, 0, 'mark_notifications_read(all)');
  perform t.eq((select count(*) from campus_cup()), 3::bigint, 'campus_cup has 3 campuses');
  perform t.ok((select per_capita from campus_cup() limit 1) >= (select max(per_capita) from campus_cup()), 'campus_cup ordered per-capita desc');
end $$;
:as_admin
do $$ begin
  perform t.eq((select count(*) from my_rank()), 0::bigint, 'my_rank empty for non-participants');
  perform t.eq((dashboard_stats()->>'rankOverall')::int, 0, 'dashboard rank 0 for staff');
end $$;
:as_erin
do $$ declare p profiles;
begin
  p := update_profile('Erin the Great', 'mage', false);
  perform t.eq(p.display_name, 'Erin the Great', 'update_profile name');
  perform t.eq(p.email_opt_in, false, 'update_profile opt-in');
  perform t.eq((select display_name from prize_claims where status <> 'revoked'), 'Erin the Great', 'update_profile renames own claim');
  p := update_profile(null, null, null);
  perform t.eq(p.avatar, 'mage', 'update_profile nulls unchanged');
  perform t.throws('select update_profile(''E'', null, null)', 'displayName', 'update_profile bad name');
  perform t.throws('select suggest_prize(''hi'')', 'idea', 'suggest_prize too short');
  perform suggest_prize('Chick-fil-A gift cards!');
  perform t.pass('suggest_prize');
end $$;

-- =============================================================================
-- 11. TRANSFER CHAIR
-- =============================================================================
:as_admin
do $$ begin
  perform t.throws(format('select transfer_chair(%L)', t.u('admin')), 'forbidden', 'admin cannot transfer_chair');
end $$;
:as_chair1
do $$ begin
  perform t.throws(format('select transfer_chair(%L)', t.u('chair1')), 'forbidden', 'transfer_chair to self');
  perform t.throws(format('select transfer_chair(%L)', t.u('chair2')), 'forbidden', 'transfer_chair to other chair');
  perform t.throws(format('select transfer_chair(%L)', t.u('unver')), 'not_verified', 'transfer_chair needs confirmed email');
  perform transfer_chair(t.u('admin'));
end $$;
:as_super
do $$ begin
  perform t.eq((select role from profiles where id = t.u('admin')), 'chair', 'transfer_chair: target is chair');
  perform t.eq((select role from profiles where id = t.u('chair1')), 'admin', 'transfer_chair: caller is admin');
  perform t.eq((select count(*) from profiles where role = 'chair'), 2::bigint, 'still exactly 2 chairs');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('admin') and title like '%YACquest Chair%'), 'transfer_chair notifies target');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('chair1') and title like '%YACquest Chair seat%'), 'transfer_chair notifies caller');
end $$;
:as_chair1
do $$ begin
  perform t.throws('select list_team()', 'forbidden', 'former chair lost chair powers');
end $$;
:as_super
-- a bootstrap email signing up again can't go past max_chairs (set to 2 here; the real value is 6)
update app_config set max_chairs = 2 where id = 1;
delete from auth.users where id = t.u('chair2');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (t.u('chair2'), 'jacob.rodriguez.yac@ncssm.edu', now(), '{"handle":"jacob","display_name":"Jacob","campus":"duke"}');
do $$ begin
  perform t.eq((select role from profiles where id = t.u('chair2')), 'chair', 'bootstrap re-signup when a seat is free → chair');
end $$;
delete from auth.users where id = t.u('chair2');
update profiles set role = 'chair' where id = t.u('chair1');   -- seats now: admin + chair1
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (t.u('chair2'), 'jacob.rodriguez.yac@ncssm.edu', now(), '{"handle":"jacob","display_name":"Jacob","campus":"duke"}');
do $$ begin
  perform t.eq((select role from profiles where id = t.u('chair2')), 'participant', 'bootstrap email does not go past max_chairs (2)');
  perform t.eq((select count(*) from profiles where role = 'chair'), 2::bigint, 'chairs capped at max_chairs');
end $$;
update app_config set max_chairs = 6 where id = 1;

-- =============================================================================
-- 12. RESET CYCLE + ARCHIVES
-- =============================================================================
:as_admin
do $$ begin
  perform t.throws('select reset_cycle(''reset'', ''2027–28'', now() + interval ''300 days'')', 'confirm', 'reset_cycle needs RESET');
  perform t.throws('select reset_cycle(''RESET'', ''2027–28'', now() - interval ''1 day'')', 'endsAt', 'reset_cycle end in future');
  perform t.eq((select count(*) from archives()), 0::bigint, 'archives empty before reset');
end $$;
:as_super
do $$ begin perform set_config('t.old_cycle', active_cycle_id()::text, false); perform set_config('t.ledger_rows', (select count(*) from ledger)::text, false); end $$;
:as_alice
do $$ begin
  perform t.throws('select reset_cycle(''RESET'', ''2027–28'', now() + interval ''300 days'')', 'forbidden', 'participant cannot reset_cycle');
end $$;
:as_admin
do $$ begin
  perform reset_cycle('RESET', '2027–28', now() + interval '300 days');
  perform t.ok(active_cycle_id() <> current_setting('t.old_cycle')::uuid, 'reset: new active cycle');
  perform t.eq((select count(*) from cycles where is_active), 1::bigint, 'reset: exactly one active cycle');
  perform t.ok((select archived_at is not null and not is_active from cycles where id = current_setting('t.old_cycle')::uuid), 'reset: old cycle archived');
  perform t.eq((select coalesce(max(points), 0) from profiles), 0, 'reset: everyone at 0');
  perform t.eq((select count(*) from ledger), current_setting('t.ledger_rows')::bigint, 'reset: ledger rows kept');
  perform t.eq((prize_status()->>'remaining')::int, 2, 'reset: all prize spots open again');
  perform t.eq((select count(*) from archives()), 1::bigint, 'archives lists old cycle');
  perform t.eq((select json_array_length(winners) from archives()), 2, 'archives winners (non-revoked claims)');
  perform t.eq((select ledger_rows from archives()), current_setting('t.ledger_rows')::bigint, 'archives ledger_rows');
  perform adjust_points(t.u('alice'), 10, 'new cycle points');
  perform t.eq((select points from profiles where id = t.u('alice')), 10, 'new cycle: points count only the new cycle');
  perform t.eq((select count(*) from leaderboard(100) where points > 0), 1::bigint, 'new cycle leaderboard');
end $$;
:as_alice
do $$ begin
  perform t.ok(exists (select 1 from notifications where title = 'A new cycle has started!'), 'reset notifies participants');
  perform t.ok(can_submit('annual_fund') is null and can_submit('follow_ig') is not null, 'once-per-cycle resets with the cycle (follow_ig still weekly-capped)');
end $$;

-- =============================================================================
-- 13. 0004 — ADMIN ACTION LOG (from everything the sections above did)
-- =============================================================================
-- Display names: chair1 = Iesha, admin = Helper (chair since section 11).
:as_super
do $$
declare a admin_actions;
begin
  perform t.ok(exists (select 1 from admin_actions where action = 'role_changed' and actor_id = t.u('chair1') and actor_name = 'Iesha'
                        and target_user_id = t.u('admin') and target_name = 'Helper' and details = '{"from":"participant","to":"admin"}'),
               'log: role_changed (chair1 made Helper admin)');
  perform t.ok(exists (select 1 from admin_actions where action = 'role_changed' and actor_id = t.u('chair1')
                        and target_user_id = t.u('admin') and details->>'to' = 'chair'), 'log: transfer_chair logs target → chair');
  perform t.ok(exists (select 1 from admin_actions where action = 'role_changed' and actor_id = t.u('chair1')
                        and target_user_id = t.u('chair1') and details->>'to' = 'admin'), 'log: transfer_chair logs caller → admin');
  perform t.ok(exists (select 1 from admin_actions where action = 'event_created' and actor_name = 'Helper' and details->>'title' = 'Home Live'
                        and details->>'kind' = 'active' and details->>'campus' = 'duke'), 'log: event_created with title/kind/campus');
  perform t.eq((select count(*) from admin_actions where action = 'event_created'), 7::bigint, 'log: 7 events created (incl. the deleted Zoom test)');
  perform t.eq((select count(*) from admin_actions where action = 'event_updated'), 1::bigint, 'log: one event_updated (check-in attendee bumps are not logged)');
  perform t.ok(exists (select 1 from admin_actions where action = 'event_updated' and actor_id = t.u('admin') and details->>'title' = 'Future Event' and details->>'kind' = 'high_impact'), 'log: event_updated details');
  perform t.ok(exists (select 1 from admin_actions where action = 'event_deleted' and actor_id = t.u('admin') and details->>'title' = 'Past Event'), 'log: event_deleted');
  perform t.ok(exists (select 1 from admin_actions where action = 'submission_approved' and actor_id = t.u('admin')
                        and target_user_id = t.u('alice') and target_name = 'Alice A.' and details->>'activityId' = 'survey'), 'log: submission_approved');
  perform t.ok(exists (select 1 from admin_actions where action = 'submission_rejected' and actor_id = t.u('admin')
                        and target_user_id = t.u('alice') and details->>'reason' = 'Receipt not readable' and details->>'activityId' = 'annual_fund'), 'log: submission_rejected with reason');
  perform t.ok(not exists (select 1 from admin_actions where action like 'points_%' and target_user_id = t.u('alice') and (details->>'amount')::int = 5), 'log: approval is not double-logged as points_added');
  perform t.eq((select count(*) from admin_actions where action in ('points_added','points_removed')),
               (select count(*) from ledger where source = 'manual' and created_by is not null), 'log: one entry per manual ledger row');
  perform t.ok(exists (select 1 from admin_actions where action = 'points_removed' and actor_name = 'Helper' and target_user_id = t.u('alice')
                        and (details->>'amount')::int = -5 and details->>'reason' = 'Duplicate survey'), 'log: points_removed');
  perform t.ok(exists (select 1 from admin_actions where action = 'points_added' and target_user_id = t.u('alice')
                        and details->>'activityId' = 'game_win' and (details->>'amount')::int = 20), 'log: award_activity → points_added with activityId');
  perform t.ok(not exists (select 1 from admin_actions where action like 'points_%' and details->>'reason' like 'Checked in%'), 'log: check-ins / referrals not logged');
  perform t.ok(exists (select 1 from admin_actions where action = 'prize_fulfilled' and actor_id = t.u('chair1') and target_user_id = t.u('frank')
                        and (details->>'spot')::int = 1), 'log: prize_fulfilled');
  perform t.ok(exists (select 1 from admin_actions where action = 'prize_revoked' and target_user_id = t.u('carol')
                        and details->>'reason' = 'Points fell below the goal after a correction'), 'log: prize_revoked with reason');
  perform t.ok(exists (select 1 from admin_actions where action = 'cycle_reset' and actor_id = t.u('admin') and details->>'name' = '2027–28'), 'log: cycle_reset');
  perform t.throws('update admin_actions set action = ''x''', 'forbidden', 'admin_actions is append-only even for the owner');
  perform t.throws('delete from admin_actions', 'forbidden', 'admin_actions cannot be deleted');
end $$;

-- =============================================================================
-- 14. 0004 — PRIZE ALERTS from the race above (old cycle)
-- =============================================================================
:as_super
do $$
declare c prize_claims;
begin
  perform t.eq((select count(*) from email_outbox where kind = 'prize_qualified'),
               (select count(*) from prize_claims), 'alerts: one prize_qualified email per claim ever created');
  select * into c from prize_claims where user_id = t.u('carol');
  perform t.ok(exists (select 1 from email_outbox where dedupe_key = 'prize_qualified:' || c.id
                        and subject = '🏆 YACquest: Carol won spot #1' and body_text like '%waiting%'), 'alerts: prize_qualified subject + dedupe key');
  perform t.ok((select to_emails from email_outbox where dedupe_key = 'prize_qualified:' || c.id)
               @> array['iesha.landis.yac@ncssm.edu','jacob.rodriguez.yac@ncssm.edu'], 'alerts: sent to the (lower-cased) chairs');
  select * into c from prize_claims where user_id = t.u('erin') and status <> 'revoked';
  perform t.ok(exists (select 1 from email_outbox where kind = 'prize_info' and dedupe_key = 'prize_info:' || c.id || ':' || md5(c.contact::text)
                        and subject = 'URGENT 🎁 YACquest winner info: Erin (spot #2)'
                        and body_text like '%(919) 555-0100%' and body_text like '%12 Oak Ave, Raleigh NC 27601%'
                        and body_text like '%' || c.reference || '%'
                        and body_html like '%12 Oak Ave, Raleigh NC 27601%'), 'alerts: prize_info with phone + address + reference');
end $$;

-- =============================================================================
-- 15. 0004 — REPORT SETTINGS + RECIPIENTS
-- =============================================================================
:as_chair1
do $$ begin
  perform set_role(t.u('bob'), 'admin');   -- bob = a plain admin from here on
end $$;
:as_bob
do $$ begin
  perform t.throws('select get_report_settings()', 'forbidden', 'admin cannot get_report_settings');
  perform t.throws('select update_report_settings(''{"weeklyHour":8}'')', 'forbidden', 'admin cannot update_report_settings');
  perform t.throws('select send_weekly_report_now()', 'forbidden', 'admin cannot send_weekly_report_now');
  perform t.throws('select send_test_email()', 'forbidden', 'admin cannot send_test_email');
  perform t.throws('select email_log()', 'forbidden', 'admin cannot email_log');
  perform t.throws(format('select retry_email(%L)', gen_random_uuid()), 'forbidden', 'admin cannot retry_email');
  perform t.throws('select admin_action_log()', 'forbidden', 'admin cannot admin_action_log');
  perform t.eq((select count(*) from email_outbox), 0::bigint, 'RLS: admin cannot read email_outbox');
  perform t.eq((select count(*) from admin_actions), 0::bigint, 'RLS: admin cannot read admin_actions');
  perform t.eq((select count(*) from report_settings), 0::bigint, 'RLS: admin cannot read report_settings');
  perform t.denied('insert into admin_actions (action) values (''fake'')', 'admin cannot insert admin_actions');
  perform t.denied('select claim_email_batch(10)', 'authenticated cannot call claim_email_batch');
  perform t.denied(format('select mark_email_result(%L, true, null)', gen_random_uuid()), 'authenticated cannot call mark_email_result');
  perform t.denied('select enqueue_weekly_report_if_due()', 'authenticated cannot call enqueue_weekly_report_if_due');
  perform t.denied('select report_recipients()', 'authenticated cannot call internal report_recipients');
  perform t.denied('select build_weekly_report()', 'authenticated cannot call internal build_weekly_report');
end $$;
:as_alice
do $$ begin
  perform t.eq((select count(*) from email_outbox), 0::bigint, 'RLS: participant cannot read email_outbox');
  perform t.eq((select count(*) from admin_actions), 0::bigint, 'RLS: participant cannot read admin_actions');
  perform t.throws('select weekly_report_preview()', 'forbidden', 'participant cannot weekly_report_preview');
  perform t.denied('insert into email_outbox (kind, to_emails, dedupe_key) values (''test'', ''{a@b.co}'', ''x'')', 'participant cannot insert email_outbox');
  perform t.denied('update report_settings set weekly_hour = 3', 'participant cannot update report_settings');
end $$;
:as_anon
do $$ begin
  perform t.denied('select get_report_settings()', 'anon cannot call get_report_settings');
  perform t.denied('select submit_claim_info(''a'',''b'',''c'',''d'',null,null)', 'anon cannot call submit_claim_info');
end $$;
:as_chair1
do $$
declare s json;
begin
  perform t.ok((select count(*) from email_outbox) > 0, 'chair reads email_outbox');
  perform t.ok((select count(*) from admin_actions) > 0, 'chair reads admin_actions');
  s := get_report_settings();
  perform t.ok((s->>'weeklyEnabled')::boolean and (s->>'weeklyDay')::int = 1 and (s->>'weeklyHour')::int = 9
               and (s->>'nearGoalPoints')::int = 75 and json_array_length(s->'recipients') = 0
               and (s->>'includeChairs')::boolean and (s->>'includeAdmins')::boolean and (s->>'prizeAlertsEnabled')::boolean
               and s->>'updatedAt' is not null, 'get_report_settings defaults (camelCase)');
  perform t.throws('select update_report_settings(''{"weeklyDay":7}'')', 'weeklyDay', 'settings: day 0–6');
  perform t.throws('select update_report_settings(''{"weeklyDay":"1"}'')', 'weeklyDay', 'settings: day must be a number');
  perform t.throws('select update_report_settings(''{"weeklyHour":24}'')', 'weeklyHour', 'settings: hour 0–23');
  perform t.throws('select update_report_settings(''{"weeklyHour":-1}'')', 'weeklyHour', 'settings: hour not negative');
  perform t.throws('select update_report_settings(''{"nearGoalPoints":1001}'')', 'nearGoalPoints', 'settings: near goal 0–1000');
  perform t.throws('select update_report_settings(''{"recipients":["ok@example.org","not-an-email"]}'')', 'recipients', 'settings: invalid recipient email');
  perform t.throws('select update_report_settings(''{"recipients":"a@b.co"}'')', 'recipients', 'settings: recipients must be a list');
  perform t.throws(format('select update_report_settings(%L)', jsonb_build_object('recipients', (select jsonb_agg('p' || g || '@example.org') from generate_series(1, 21) g))), 'recipients', 'settings: at most 20 recipients');
  perform t.throws('select update_report_settings(''{"weeklyEnabled":"yes"}'')', 'weeklyEnabled', 'settings: booleans must be booleans');
  perform t.eq((get_report_settings()->>'weeklyHour')::int, 9, 'settings: failed updates change nothing');

  s := update_report_settings('{"recipients":[" Extra@Example.org ","extra@example.org","helper@example.edu",""],"nearGoalPoints":200}');
  perform t.eq((select array_agg(x order by x) from json_array_elements_text(s->'recipients') x), array['extra@example.org','helper@example.edu'], 'settings: recipients trimmed, lower-cased, deduped');
  perform t.eq((s->>'nearGoalPoints')::int, 200, 'settings: partial update applied');
  perform t.eq((s->>'weeklyHour')::int, 9, 'settings: omitted keys unchanged');
end $$;
:as_super
do $$
declare a admin_actions;
begin
  select * into a from admin_actions where action = 'report_settings_changed' order by id desc limit 1;
  perform t.ok(a.actor_id = t.u('chair1') and a.actor_name = 'Iesha', 'log: report_settings_changed actor');
  perform t.ok((a.details->>'nearGoalPoints')::int = 200 and a.details ? 'recipients' and not a.details ? 'weeklyHour', 'log: report_settings_changed details = changed keys only');
  perform t.eq((select updated_by from report_settings), t.u('chair1'), 'settings: updated_by');

  perform t.eq(report_recipients(), array['bob@example.edu','extra@example.org','helper@example.edu','iesha.landis.yac@ncssm.edu'],
               'recipients: chairs + admins + extras, lower-case, deduped');
  update profiles set role = 'admin' where id = t.u('unver');   -- unconfirmed admin (only possible via SQL)
  perform t.ok(not ('unver@example.edu' = any (report_recipients())), 'recipients: unconfirmed email excluded');
  update profiles set role = 'participant' where id = t.u('unver');
  perform t.ok(not ('chair2' = any (report_recipients())) and not ('jacob.rodriguez.yac@ncssm.edu' = any (report_recipients())), 'recipients: participants excluded');
  update report_settings set include_admins = false;
  perform t.eq(report_recipients(), array['extra@example.org','helper@example.edu','iesha.landis.yac@ncssm.edu'], 'recipients: include_admins=false drops admins');
  update report_settings set include_chairs = false;
  perform t.eq(report_recipients(), array['extra@example.org','helper@example.edu'], 'recipients: include_chairs=false leaves only extras');
  update report_settings set include_chairs = true, include_admins = true;
end $$;

-- =============================================================================
-- 16. 0004 — WEEKLY REPORT
-- =============================================================================
:as_super
-- new cycle (goal 300 for the test). Big boosts need a higher manual cap.
update app_config set prize_goal = 300, prize_count = 4, tier1_points = 500;
:as_bob
select adjust_points(t.u('dave'), 150, 'near goal test') \g /dev/null
:as_dave
select update_profile('Dave <b>&', null, null) \g /dev/null
:as_bob
do $$
declare p json := weekly_report_preview();
begin
  perform t.ok(p->>'subject' like 'YACquest weekly report%4 of 4 prize spots left', 'preview: subject has spots left');
  perform t.ok(p->>'text' like '%PRIZE SPOTS: 4 of 4 left%', 'preview: text spots left');
  perform t.ok(p->>'text' like '%CLOSE TO THE PRIZE (within 200 points of 300)%Dave <b>& (UNC) — 150 pts, 150 to go%TOP 5%', 'preview: close-to-prize list with points to go');
  perform t.ok(p->>'text' not like '%Alice A. (Duke) — 10 pts, 290 to go%', 'preview: people far from the goal are not "close"');
  perform t.ok(p->>'text' like '%TOP 5 OVERALL%1. Dave <b>& (UNC) — 150 pts%', 'preview: top 5');
  perform t.ok(p->>'text' like '%CAMPUS CUP%' and p->>'text' like '%THIS WEEK%' and p->>'text' like '%PENDING REVIEWS:%' and p->>'text' like '%DAYS LEFT IN CYCLE (2027–28): 30_%', 'preview: campus cup, this week, pending, days left');
  perform t.ok(p->>'html' like '<!doctype html>%#0b2a5b%#f2b33d%', 'preview: html uses navy/gold');
  perform t.ok(p->>'html' like '%Dave &lt;b&gt;&amp;%' and p->>'html' not like '%Dave <b>%', 'preview: names are HTML-escaped');
  perform t.ok(p->>'html' like '%4 of 4</div>%prize spots left%', 'preview: html spots left');
  perform t.eq((select array_agg(x order by x) from json_array_elements_text(p->'recipients') x),
               array['bob@example.edu','extra@example.org','helper@example.edu','iesha.landis.yac@ncssm.edu'], 'preview: recipients');
end $$;

-- enqueue_weekly_report_if_due: service_role / pg_cron only
:as_alice
reset role;   -- superuser connection, but with a logged-in user's JWT
do $$ begin
  perform t.throws('select enqueue_weekly_report_if_due()', 'forbidden', 'enqueue refused for a logged-in user even with EXECUTE');
  perform t.throws('select claim_email_batch(5)', 'forbidden', 'claim_email_batch refused for a logged-in user even with EXECUTE');
end $$;
:as_super
update report_settings set weekly_day = 0, weekly_hour = 23;   -- Sunday 11 pm NY: not due (except during that hour)
:as_service
do $$ begin
  if not (extract(dow from now() at time zone 'America/New_York') = 0 and extract(hour from now() at time zone 'America/New_York') = 23) then
    perform t.eq(enqueue_weekly_report_if_due(), false, 'enqueue: not due before the scheduled day/hour');
  end if;
end $$;
:as_super
update report_settings set weekly_day = 1, weekly_hour = 0, recipients = '{}', include_chairs = false, include_admins = false;
:as_service
do $$ begin
  perform t.eq(enqueue_weekly_report_if_due(), false, 'enqueue: no recipients → nothing');
end $$;
:as_super
update report_settings set include_chairs = true, include_admins = true, weekly_enabled = false;
:as_service
do $$ begin
  perform t.eq(enqueue_weekly_report_if_due(), false, 'enqueue: disabled → nothing');
end $$;
:as_super
do $$ begin
  perform t.eq((select count(*) from email_outbox where kind = 'weekly_report'), 0::bigint, 'enqueue: nothing queued so far');
end $$;
update report_settings set weekly_enabled = true;   -- Monday 00:00 → always due
:as_service
do $$ begin
  perform t.eq(enqueue_weekly_report_if_due(), true, 'enqueue: due → queued (service_role)');
  perform t.eq(enqueue_weekly_report_if_due(), false, 'enqueue: same week → deduped');
end $$;
:as_cron
do $$ begin
  perform t.eq(enqueue_weekly_report_if_due(), false, 'enqueue: callable by superuser (pg_cron), still deduped');
end $$;
:as_super
do $$ begin
  perform t.eq((select count(*) from email_outbox where kind = 'weekly_report'), 1::bigint, 'enqueue: exactly one weekly row');
  perform t.ok(exists (select 1 from email_outbox where kind = 'weekly_report'
                        and dedupe_key = 'weekly:' || to_char(now() at time zone 'America/New_York', 'IYYY-IW')
                        and to_emails = report_recipients()
                        and status = 'pending' and body_html like '<!doctype html>%' and body_text like '%CLOSE TO THE PRIZE%'),
               'enqueue: dedupe key weekly:<IYYY-IW>, html + text');
end $$;
:as_chair1
do $$ begin
  perform send_weekly_report_now();
  perform send_weekly_report_now();
  perform send_test_email();
end $$;
:as_super
do $$ begin
  perform t.eq((select count(*) from email_outbox where kind = 'weekly_report' and dedupe_key like 'weekly-manual:%'), 2::bigint, 'send_weekly_report_now queues a new report each time');
  perform t.ok(exists (select 1 from email_outbox where kind = 'test' and to_emails = array['iesha.landis.yac@ncssm.edu'] and dedupe_key like 'test:%'), 'send_test_email goes to the caller only');
end $$;

-- =============================================================================
-- 17. 0004 — PRIZE ALERTS (new cycle) + WINNER FORM
-- =============================================================================
:as_bob
select adjust_points(t.u('carol'), 300, 'alert test') \g /dev/null
select adjust_points(t.u('alice'), 1, 'trigger another race refresh') \g /dev/null
:as_super
do $$
declare c prize_claims;
begin
  select * into c from prize_claims where user_id = t.u('carol') and cycle_id = active_cycle_id();
  perform t.eq(c.spot, 1, 'new cycle: carol wins spot 1');
  perform t.eq((select count(*) from email_outbox where dedupe_key = 'prize_qualified:' || c.id), 1::bigint, 'alert: prize_qualified queued once');
  perform t.eq((select count(*) from email_outbox where kind = 'prize_qualified' and subject = '🏆 YACquest: Carol won spot #1'), 2::bigint, 'alert: (old + new cycle) carol alerts');
  perform t.eq((prize_status()->>'total')::int, 4, 'prize_status total = 4');
  perform t.eq((prize_status()->>'remaining')::int, 3, 'prize_status remaining = 3');
  update report_settings set prize_alerts_enabled = false;
end $$;
:as_bob
select adjust_points(t.u('dave'), 150, 'wins with alerts off') \g /dev/null
:as_super
do $$ begin
  perform t.ok(exists (select 1 from prize_claims where user_id = t.u('dave') and cycle_id = active_cycle_id() and status = 'qualified'), 'dave wins spot 2');
  perform t.ok(not exists (select 1 from email_outbox where dedupe_key = 'prize_qualified:' || (select id from prize_claims where user_id = t.u('dave') and cycle_id = active_cycle_id())), 'alert: none when prize alerts are off');
  update report_settings set prize_alerts_enabled = true;
end $$;
:as_carol
do $$ declare c json;
begin
  perform t.throws('select submit_claim_info(''C'', ''carol@example.edu'', ''919 555 0100'', ''1 Main St, Durham NC'')', 'fullName', 'winner form: name');
  perform t.throws('select submit_claim_info(''Carol C'', ''carol@'', ''919 555 0100'', ''1 Main St, Durham NC'')', 'email', 'winner form: email');
  perform t.throws('select submit_claim_info(''Carol C'', ''carol@example.edu'', ''phone'', ''1 Main St, Durham NC'')', 'phone', 'winner form: phone without digits');
  perform t.throws('select submit_claim_info(''Carol C'', ''carol@example.edu'', null, ''1 Main St, Durham NC'')', 'phone', 'winner form: phone required');
  perform t.throws('select submit_claim_info(''Carol C'', ''carol@example.edu'', ''919 555 0100'', ''  Durham  '')', 'address', 'winner form: short address');
  c := submit_claim_info('Carol C', 'carol@example.edu', '919 555 0100', '1 Main St, Durham NC 27701');   -- preference/notes default
  perform t.eq(c->>'status', 'info_submitted', 'winner form: 4-arg call works (defaults)');
  perform t.ok((c->'contact')::jsonb ?& array['fullName','email','phone','address','preference'] and not ((c->'contact')::jsonb ? 'notes'), 'winner form: contact keys');
  perform submit_claim_info('Carol C', 'carol@example.edu', '919 555 0100', '1 Main St, Durham NC 27701');   -- same info again
end $$;
:as_super
do $$ declare c prize_claims;
begin
  select * into c from prize_claims where user_id = t.u('carol') and cycle_id = active_cycle_id();
  perform t.eq((select count(*) from email_outbox where kind = 'prize_info' and dedupe_key like 'prize_info:' || c.id || ':%'), 1::bigint, 'alert: resubmitting the same info sends no second email');
  perform t.ok(exists (select 1 from email_outbox where kind = 'prize_info' and dedupe_key = 'prize_info:' || c.id || ':' || md5(c.contact::text)
                        and subject = 'URGENT 🎁 YACquest winner info: Carol (spot #1)'
                        and body_text like '%Phone: 919 555 0100%' and body_text like '%Mailing address: 1 Main St, Durham NC 27701%'
                        and body_text like '%Campus: Duke%'), 'alert: prize_info body has phone + address + campus');
end $$;
:as_carol
select submit_claim_info('Carol C', 'carol@example.edu', '919 555 0100', '2 Elm St, Durham NC 27701', 'Target', 'moved!') \g /dev/null
:as_super
do $$ begin
  perform t.eq((select count(*) from email_outbox e join prize_claims c on e.dedupe_key like 'prize_info:' || c.id || ':%'
                 where c.user_id = t.u('carol') and c.cycle_id = active_cycle_id()), 2::bigint, 'alert: changed info sends a new prize_info email');
end $$;

-- =============================================================================
-- 18. 0004 — SENDING: claim_email_batch / mark_email_result / retry_email
-- =============================================================================
:as_super
do $$ begin
  perform set_config('t.pending', (select count(*) from email_outbox where status = 'pending')::text, false);
end $$;
:as_service
do $$
declare
  ids uuid[];
  v_fail uuid;
  v_ok uuid;
begin
  select array_agg(id) into ids from claim_email_batch(2);
  perform t.eq(cardinality(ids), 2, 'claim: respects p_limit');
  select array_agg(id) into ids from claim_email_batch(500);
  perform t.eq(cardinality(ids), current_setting('t.pending')::int - 2, 'claim: picks the rest of the pending rows');
  perform t.eq((select count(*) from claim_email_batch()), 0::bigint, 'claim: sending rows are not picked again');
  v_ok := ids[1]; v_fail := ids[2];
  perform set_config('t.fail', v_fail::text, false);
  perform set_config('t.ok', v_ok::text, false);
  perform mark_email_result(v_ok, true, null);
  perform mark_email_result(v_fail, false, repeat('x', 600));
  perform t.throws(format('select mark_email_result(%L, true, null)', gen_random_uuid()), 'not_found', 'mark_email_result unknown id');
end $$;
:as_super
do $$ begin
  perform t.ok((select status = 'sent' and sent_at is not null and last_error is null and attempts = 1 from email_outbox where id = current_setting('t.ok')::uuid), 'mark ok → sent');
  perform t.ok((select status = 'failed' and length(last_error) = 500 and attempts = 1 from email_outbox where id = current_setting('t.fail')::uuid), 'mark failed → failed, error truncated to 500');
  perform t.eq((select count(*) from email_outbox where status = 'sending'), current_setting('t.pending')::bigint - 2, 'others still sending');
end $$;
:as_service
do $$
declare ids uuid[]; i int;
begin
  select array_agg(id) into ids from claim_email_batch(50);
  perform t.eq(ids, array[current_setting('t.fail')::uuid], 'claim: failed row is retried');
  perform t.eq((select attempts from email_outbox where id = ids[1]), 2, 'claim: attempts + 1');
  for i in 1..3 loop
    perform mark_email_result(ids[1], false, 'SMTP down');
    perform claim_email_batch(50);
  end loop;
  perform t.eq((select attempts from email_outbox where id = ids[1]), 5, 'claim: attempt 5');
  perform mark_email_result(ids[1], false, 'SMTP down');
  perform t.eq((select count(*) from claim_email_batch(50)), 0::bigint, 'claim: gives up after 5 attempts');
end $$;
:as_super
update email_outbox set claimed_at = now() - interval '20 minutes'
 where id = (select id from email_outbox where status = 'sending' order by created_at limit 1);
:as_service
do $$ begin
  perform t.eq((select count(*) from claim_email_batch(50)), 1::bigint, 'claim: rows stuck in sending > 15 min are picked again');
end $$;
:as_chair1
do $$
declare l record;
begin
  perform t.ok((select bool_and(a.created_at >= b.created_at)
                  from (select created_at, row_number() over () rn from email_log(1000)) a
                  join (select created_at, row_number() over () rn from email_log(1000)) b on b.rn = a.rn + 1), 'email_log newest first');
  perform t.eq((select count(*) from email_log(3)), 3::bigint, 'email_log limit');
  select * into l from email_log(1000) where id = current_setting('t.fail')::uuid;
  perform t.ok(l.status = 'failed' and l.attempts = 5 and l.last_error = 'SMTP down' and l.kind is not null and l.to_emails is not null, 'email_log fields');
  perform retry_email(current_setting('t.fail')::uuid);
  perform t.throws(format('select retry_email(%L)', gen_random_uuid()), 'not_found', 'retry_email unknown id');
end $$;
:as_super
do $$ begin
  perform t.ok((select status = 'pending' and attempts = 0 from email_outbox where id = current_setting('t.fail')::uuid), 'retry_email → pending, attempts 0');
end $$;
:as_service
do $$ begin
  perform t.ok(exists (select 1 from claim_email_batch(50) where id = current_setting('t.fail')::uuid), 'claim: retried row is picked up again');
end $$;

-- =============================================================================
-- 19. 0004 — admin_action_log (chair, keyset paging)
-- =============================================================================
:as_chair1
do $$
declare
  p1 bigint[];
  p2 bigint[];
  total bigint := (select count(*) from admin_actions);
begin
  select array_agg(id order by id desc) into p1 from admin_action_log(5);
  perform t.eq(cardinality(p1), 5, 'action log: page size');
  perform t.eq(p1[1], (select max(id) from admin_actions), 'action log: newest first');
  select array_agg(id order by id desc) into p2 from admin_action_log(5, p1[5]);
  perform t.ok(cardinality(p2) = 5 and p2[1] < p1[5], 'action log: next page strictly older (p_before)');
  perform t.eq((select count(*) from admin_action_log(1000)), total, 'action log: everything reachable');
  perform t.ok(exists (select 1 from admin_action_log(1000) where action = 'role_changed' and actor_name = 'Iesha' and target_name = 'Bob'
                        and details = '{"from":"participant","to":"admin"}'::jsonb), 'action log: row shape (actor_name, target_name, details)');
  perform t.ok(exists (select 1 from admin_action_log(1000) where action = 'points_added' and actor_name = 'Bob' and target_name = 'Carol'
                        and (details->>'amount')::int = 300 and details->>'reason' = 'alert test'), 'action log: manual add by admin');
end $$;


-- =============================================================================
-- 20. 0006 — ANNOUNCEMENTS
-- =============================================================================
:as_alice
do $$ begin
  perform t.throws('select send_announcement(''Hello all'', ''Hi'', ''all'')', 'forbidden', 'participant cannot send announcements');
  perform t.throws('select * from list_announcements()', 'forbidden', 'participant cannot list announcements');
  perform t.eq((select count(*) from announcements), 0::bigint, 'RLS: participant cannot read announcements table');
end $$;
:as_super
update profiles set role = 'admin' where id = t.u('bob');  -- a plain admin (the seeded 'admin' became a chair earlier)
:as_bob
do $$
declare r json; n_duke bigint := (select count(*) from profiles where campus = 'duke');
begin
  perform t.throws('select send_announcement(''Hi'', ''x'', ''all'')', 'title', 'announcement title too short');
  perform t.throws('select send_announcement(''Hello there'', '''', ''all'')', 'body', 'announcement body required');
  perform t.throws('select send_announcement(''Hello there'', ''x'', ''campus'', ''mars'')', 'campus', 'announcement bad campus');
  perform t.throws('select send_announcement(''Hello there'', ''x'', ''user'', null, gen_random_uuid())', 'user', 'announcement unknown user');
  r := send_announcement('Pickleball Sunday', 'Courts at 2pm!', 'campus', 'duke', null, false);
  perform t.eq((r->>'recipients')::bigint, n_duke, 'campus announcement reaches every duke profile');
  perform t.eq((r->>'emailed')::int, 0, 'in-app only: no emails');
  perform t.eq((select count(*) from email_outbox where kind = 'announcement'), 0::bigint, 'in-app only: outbox untouched');
  perform t.eq((select count(*) from list_announcements() where title = 'Pickleball Sunday'), 1::bigint, 'admin can list announcements');
end $$;
:as_super
do $$ begin
  perform t.eq((select count(*) from notifications where kind = 'announcement' and title = 'Pickleball Sunday'),
               (select count(*) from profiles where campus = 'duke'), 'one notification per duke profile');
  perform t.eq((select count(*) from notifications n join profiles p on p.id = n.user_id where n.title = 'Pickleball Sunday' and p.campus <> 'duke'), 0::bigint, 'no notifications outside the campus');
  perform t.ok(exists (select 1 from admin_actions where action = 'announcement_sent' and actor_id = t.u('bob') and details->>'title' = 'Pickleball Sunday'), 'announcement logged');
end $$;
-- 0012: a plain admin can EMAIL everyone too (rolled back so the chair checks below are unchanged)
select set_config('t.optin', (select count(*) from profiles p join auth.users u on u.id = p.id
                              where p.email_opt_in and u.email_confirmed_at is not null)::text, false) \g /dev/null
begin;
:as_bob
do $$
declare r json; opted_in bigint := current_setting('t.optin')::bigint;
begin
  perform t.eq((select role from profiles where id = auth.uid()), 'admin', 'bob is a plain admin');
  r := send_announcement('Admin news', 'Hello everyone!', 'all', null, null, true);
  perform t.eq((r->>'recipients')::bigint, (select count(*) from profiles), 'admin: everyone gets the in-app message');
  perform t.eq((r->>'emailed')::bigint, opted_in, 'admin can EMAIL everyone (0012): opted-in confirmed people');
end $$;
:as_super
do $$ begin
  perform t.ok(exists (select 1 from email_outbox where kind = 'announcement' and subject = '📣 YACquest: Admin news'), 'admin email to everyone queued');
end $$;
rollback;
:as_alice
do $$ begin
  perform t.throws('select send_announcement(''Hello all'', ''Hi'', ''all'', null, null, true)', 'forbidden', 'participant still cannot send (or email) announcements (0012)');
end $$;
:as_super
select set_config('t.optin', (select count(*) from profiles p join auth.users u on u.id = p.id
                              where p.email_opt_in and u.email_confirmed_at is not null)::text, false) \g /dev/null
:as_chair1
do $$
declare r json; opted_in bigint := current_setting('t.optin')::bigint;
begin
  r := send_announcement('Big news', 'New prize alert!', 'all', null, null, true);
  perform t.eq((r->>'recipients')::bigint, (select count(*) from profiles), 'chair: everyone gets the in-app message');
  perform t.eq((r->>'emailed')::bigint, opted_in, 'chair: email only to opted-in confirmed people');
  perform t.ok(not (select bool_or('erin@example.edu' = any (to_emails)) from email_outbox where kind = 'announcement'), 'opted-out erin not emailed');
  r := send_announcement('Just for you', 'Your prize is ready', 'user', null, t.u('erin'), true);
  perform t.eq((r->>'emailed')::int, 1, 'direct message emails the person even if opted out');
end $$;
:as_super
do $$ begin
  perform t.ok((select bool_and(cardinality(to_emails) <= 90) from email_outbox where kind = 'announcement'), 'announcement emails batched ≤ 90');
  perform t.ok(exists (select 1 from email_outbox where kind = 'announcement' and subject = '📣 YACquest: Big news' and body_html like '%New prize alert!%'), 'announcement email content');
end $$;


-- =============================================================================
-- 21. 0007 — new characters
-- =============================================================================
:as_alice
do $$ declare p profiles;
begin
  p := update_profile(null, 'unicorn', null);
  perform t.eq(p.avatar, 'unicorn', 'can pick the unicorn');
  p := update_profile(null, 'dragon', null);
  perform t.eq(p.avatar, 'dragon', 'can pick the dragon');
  perform t.throws('select update_profile(null, ''griffin'', null)', 'avatar', 'unknown avatar rejected');
end $$;


-- =============================================================================
-- 22. 0008 — feedback
-- =============================================================================
:as_alice
do $$ declare r json;
begin
  perform t.throws('select submit_feedback(''rant'', ''hello there'')', 'category', 'feedback bad category');
  perform t.throws('select submit_feedback(''idea'', ''hi'')', 'message', 'feedback too short');
  r := submit_feedback('idea', 'Can we do a bowling night?');
  perform t.ok((r->>'id') is not null, 'participant can send feedback');
  perform submit_feedback('bug', 'The <b>check-in</b> button was slow');
  perform t.eq((select count(*) from feedback), 0::bigint, 'RLS: participant cannot read feedback table');
  perform t.throws('select * from list_feedback()', 'forbidden', 'participant cannot list feedback');
  perform suggest_prize('Movie tickets please');
end $$;
:as_bob
do $$ declare fid uuid; n bigint;
begin
  perform t.ok((select count(*) from list_feedback() where display_name = 'Alice A.') >= 3, 'admin sees feedback + prize ideas');
  perform t.ok(exists (select 1 from list_feedback() where kind = 'prize' and message = 'Movie tickets please'), 'prize suggestions included');
  select id into fid from list_feedback('new') where message = 'Can we do a bowling night?';
  perform mark_feedback_reviewed('feedback', fid);
  perform t.eq((select status from list_feedback() where id = fid), 'reviewed', 'mark reviewed');
  perform t.eq((select reviewed_by_name from list_feedback() where id = fid), 'Bob', 'reviewer recorded');
  perform t.ok(not exists (select 1 from list_feedback('new') where id = fid), 'filter new excludes reviewed');
  perform t.throws(format('select mark_feedback_reviewed(''feedback'', %L)', gen_random_uuid()), 'not_found', 'unknown feedback');
end $$;
:as_super
do $$ declare rep json := public.build_weekly_report();
begin
  perform t.ok(rep->>'text' like '%FEEDBACK (last 7 days)%' and rep->>'text' like '%bowling night%', 'weekly report text includes feedback');
  perform t.ok(rep->>'html' like '%Prize idea%' and rep->>'html' like '%Movie tickets please%', 'weekly report html includes prize ideas');
  perform t.ok(rep->>'html' like '%&lt;b&gt;check-in&lt;/b&gt;%', 'feedback is HTML-escaped in the email');
  perform t.ok(exists (select 1 from admin_actions where action = 'feedback_reviewed' and actor_id = t.u('bob')), 'review logged');
end $$;

-- =============================================================================
-- 23. 0009 — badges, looks, leaderboard looks (+ 0012 Adventurer of the Month)
-- =============================================================================
\set as_gina   'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000006a0''; set role authenticated;'
:as_super
-- (this section keeps the old 650 goal on purpose: halfway = half of it = 325; section 25 covers 350)
update app_config set prize_goal = 650, tier1_points = 40, tier2_points = 20, tier3_points = 5;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000006a0', 'gina@example.edu', now(),
   '{"handle":"gina","display_name":"Gina <i>G","campus":"ncsu","avatar":"yak"}');
-- an event + check-in from an OLD cycle must not count
insert into events (id, cycle_id, title, campus, kind, starts_at, ends_at, activity_id) values
  ('00000000-0000-0000-0000-00000000e000', (select id from cycles where not is_active order by starts_at limit 1),
   'Old social', 'duke', 'active', now() - interval '1 year', now() - interval '1 year' + interval '2 hours', 'home_event');
insert into ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason, created_at)
values ((select id from cycles where not is_active order by starts_at limit 1), '00000000-0000-0000-0000-0000000006a0',
        20, 'checkin', 'home_event', '00000000-0000-0000-0000-00000000e000', 'old check-in', now() - interval '1 year');

:as_anon
do $$ begin
  perform t.denied('select * from my_badges()', 'anon cannot call my_badges');
  perform t.denied('select monthly_shoutout()', 'anon cannot call monthly_shoutout');
  perform t.eq((select count(*) from cosmetics), 17::bigint, 'anon can read the cosmetics catalogue');
end $$;
:as_gina
do $$
declare ids text[];
begin
  select array_agg(id order by ord) into ids from (select id, row_number() over () ord from my_badges()) x;
  perform t.eq(ids, array['first_checkin','regular','veteran','explorer','big_moment','seasons','digital','shutterbug',
                          'recruiter','giver','champion','voice','halfway','legend','monthly_star','hot_streak'], 'my_badges: 16 badges in badges.ts order (0022: + hot_streak)');
  perform t.ok((select bool_and(not earned and progress = 0) from my_badges()), 'my_badges: fresh player has nothing (old-cycle check-in ignored)');
  perform t.eq((select goal from my_badges() where id = 'legend'), 650, 'legend goal = prize_goal');
  perform t.eq((select goal from my_badges() where id = 'halfway'), 325, 'halfway goal = half of prize_goal 650 (325)');
  perform t.eq(my_unlocks(), array['meadow','campus'], 'my_unlocks: only the free backgrounds at first');
  perform t.denied('select * from badges_for(auth.uid())', 'badges_for is internal');
  perform t.denied('select unlocks_for(auth.uid())', 'unlocks_for is internal');
  perform t.denied('select monthly_shoutout_data()', 'monthly_shoutout_data is internal');
  perform t.denied('select * from monthly_standings()', 'monthly_standings is internal');
  perform t.eq((select count(*) from pg_proc where proname in ('weekly_shoutout', 'weekly_shoutout_data') and pronamespace = 'public'::regnamespace), 0::bigint, 'weekly shout-out functions dropped (0012)');
  perform t.denied('insert into cosmetics (id, slot, name, rule_type) values (''x'', ''hat'', ''X'', ''free'')', 'nobody writes cosmetics');
  perform t.throws('select equip_look(''party_hat'', null, null)', 'locked', 'equip: locked hat refused');
end $$;

-- check-ins at Duke (2 months ago), UNC high-impact (1 month ago), NC State (now), all-campus digital (now)
:as_super
insert into events (id, cycle_id, title, campus, cross_campus, kind, starts_at, ends_at, activity_id) values
  ('00000000-0000-0000-0000-00000000e001', active_cycle_id(), 'Duke social', 'duke', false, 'active', now() - interval '2 months', now() - interval '2 months' + interval '2 hours', 'home_event'),
  ('00000000-0000-0000-0000-00000000e002', active_cycle_id(), 'UNC gala',    'unc',  false, 'high_impact', now() - interval '1 month', now() - interval '1 month' + interval '2 hours', 'cross_campus_event'),
  ('00000000-0000-0000-0000-00000000e003', active_cycle_id(), 'NCSU trivia', 'ncsu', false, 'active', now() - interval '1 hour', now() + interval '1 hour', 'home_event'),
  ('00000000-0000-0000-0000-00000000e004', active_cycle_id(), 'Zoom poll',   'all',  true,  'digital', now() - interval '1 hour', now() + interval '1 hour', 'digital_event');
insert into ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason, created_at)
select active_cycle_id(), '00000000-0000-0000-0000-0000000006a0', 20, 'checkin', e.activity_id, e.id::text, 'Check-in', e.starts_at
  from events e where e.id in ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e002',
                               '00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e004');
-- 0012: Hank out-earns Gina in both earlier months (same timestamps), so Hank is last month's
-- Adventurer of the Month and Gina does NOT get the monthly_star badge from those months.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000006a1', 'hank@example.edu', now(),
   '{"handle":"hank","display_name":"Hank","campus":"duke","avatar":"knight"}');
insert into ledger (cycle_id, user_id, amount, source, reason, created_at)
select active_cycle_id(), '00000000-0000-0000-0000-0000000006a1', 50, 'manual', 'Monthly test', e.starts_at
  from events e where e.id in ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e002');
insert into submissions (cycle_id, user_id, activity_id, image_path, note)
select active_cycle_id(), '00000000-0000-0000-0000-0000000006a0', a, '00000000-0000-0000-0000-0000000006a0/' || a || '.jpg', 'digital'
  from unnest(array['poll','repost','story_game']) a;
:as_gina
do $$ begin
  perform t.ok((select earned and progress = 1 and goal = 1 from my_badges() where id = 'first_checkin'), 'first_checkin earned');
  perform t.ok((select not earned and progress = 4 and goal = 5 from my_badges() where id = 'regular'), 'regular: 4 of 5');
  perform t.ok((select not earned and progress = 4 and goal = 10 from my_badges() where id = 'veteran'), 'veteran: 4 of 10');
  perform t.ok((select earned and progress = 3 and goal = 3 from my_badges() where id = 'explorer'), 'explorer: Duke + UNC + NC State (all-campus ignored)');
  perform t.ok((select earned from my_badges() where id = 'big_moment'), 'big_moment: high-impact check-in');
  perform t.ok((select earned and progress = 3 from my_badges() where id = 'seasons'), 'seasons: 3 different months');
  perform t.ok((select not earned and progress = 0 and goal = 3 from my_badges() where id = 'digital'), 'digital: tier-3 check-ins and pending submissions do not count');
  perform t.eq(my_unlocks(), array['party_hat','explorer_cap','meadow','campus','sunset'], 'my_unlocks: badge + points (80 ≥ 50) rules');
end $$;
:as_bob
do $$ declare s uuid;
begin
  for s in select id from submissions where user_id = '00000000-0000-0000-0000-0000000006a0' and status = 'pending' loop
    perform review_submission(s, 'approve', null);
  end loop;
end $$;
:as_gina
do $$ begin
  perform t.ok((select earned and progress = 3 and goal = 3 from my_badges() where id = 'digital'), 'digital: 3 approved tier-3 submissions');
  -- 0022: check-ins 2 months ago, last month and this month = a 3-month streak → Hot Streak is badge #6
  perform t.ok((select earned and progress = 3 and goal = 3 from my_badges() where id = 'hot_streak'), '0022: hot_streak earned (3 months in a row)');
  perform t.eq((select count(*) from my_badges() where earned), 6::bigint, '6 badges earned (5 + Hot Streak)');
  perform t.ok('rainbow' = any (my_unlocks()) and 'wizard_hat' = any (my_unlocks()), 'rainbow at 6 badges (Hot Streak counts); wizard hat unlocked by digital');
  perform t.ok(not ('flower_crown' = any (my_unlocks())), 'flower crown needs 100 points (has 95)');
  perform t.ok((select not earned and progress = 0 and goal = 1 from my_badges() where id = 'monthly_star'), 'monthly_star: Gina never won a finished month');
end $$;
:as_bob
select award_activity('00000000-0000-0000-0000-0000000006a0', 'game_win', 'Trivia champ') \g /dev/null
select award_activity('00000000-0000-0000-0000-0000000006a0', 'annual_fund', 'Gave') \g /dev/null
:as_gina
do $$ declare r json;
begin
  perform t.ok((select earned from my_badges() where id = 'champion'), 'champion: game_win award');
  perform t.ok((select earned from my_badges() where id = 'giver'), 'giver: annual_fund');
  perform t.ok((select not earned from my_badges() where id = 'voice'), 'voice: not yet');
  perform submit_feedback('idea', 'More trivia please!');
  perform t.ok((select earned from my_badges() where id = 'voice'), 'voice: after sending feedback');
  perform t.ok((select not earned and progress = 0 from my_badges() where id in ('shutterbug')), 'shutterbug not earned');
  perform t.ok((select not earned from my_badges() where id = 'recruiter'), 'recruiter not earned');
  perform t.ok((select not earned and progress = 155 and goal = 325 from my_badges() where id = 'halfway'), 'halfway: progress = points (155)');
  perform t.eq(my_unlocks(), array['party_hat','flower_crown','explorer_cap','wizard_hat','pearls','medal','meadow','campus','sunset','rainbow'],
               'my_unlocks: 9 badges → rainbow; 155 pts → flower crown');
  -- equip_look
  r := equip_look('party_hat', 'medal', 'rainbow');
  perform t.eq(r::jsonb, '{"hat":"party_hat","accessory":"medal","background":"rainbow"}'::jsonb, 'equip_look returns the look');
  perform t.ok((select hat = 'party_hat' and accessory = 'medal' and background = 'rainbow' from profiles where id = auth.uid()), 'equip_look saved on profile');
  perform t.throws('select equip_look(''crown'', null, null)', 'locked', 'equip: legend crown locked');
  perform t.throws('select equip_look(null, ''gold_chain'', null)', 'locked', 'equip: gold chain locked (250 pts)');
  perform t.throws('select equip_look(''meadow'', null, null)', 'look', 'equip: background in the hat slot');
  perform t.throws('select equip_look(null, null, ''nope'')', 'look', 'equip: unknown item');
  perform t.ok((select hat = 'party_hat' from profiles where id = auth.uid()), 'failed equip changes nothing');
  r := equip_look('', null, 'meadow');
  perform t.eq(r::jsonb, '{"hat":null,"accessory":null,"background":"meadow"}'::jsonb, 'equip_look: empty/null clears slots');
  perform equip_look('flower_crown', 'medal', 'rainbow');
end $$;
:as_super
update app_config set tier1_points = 500;   -- big manual boosts for the test (cap = tier-1 points)
:as_bob
select adjust_points('00000000-0000-0000-0000-0000000006a0', 230, 'halfway test') \g /dev/null
:as_gina
do $$ begin
  perform t.ok((select earned and progress = 325 from my_badges() where id = 'halfway'), 'halfway: 385 pts, progress capped at 325');
  perform t.ok((select not earned and progress = 385 and goal = 650 from my_badges() where id = 'legend'), 'legend: 385 of 650');
  perform t.ok('gold_chain' = any (my_unlocks()) and 'night_sky' = any (my_unlocks()) and 'sparkles' = any (my_unlocks()), 'points unlocks at 385 (sparkles at 300)');
end $$;
:as_bob
select adjust_points('00000000-0000-0000-0000-0000000006a0', 400, 'legend test') \g /dev/null
select adjust_points('00000000-0000-0000-0000-0000000006a0', -5, 'small correction') \g /dev/null
:as_super
update app_config set tier1_points = 40;
:as_gina
do $$ declare sh json; me record;
begin
  perform t.ok((select earned and progress = 650 and goal = 650 from my_badges() where id = 'legend'), 'legend: 780 pts, progress capped at goal');
  perform t.ok(array['crown','sparkles','treasure'] <@ my_unlocks(), 'legend unlocks crown + treasure; sparkles still unlocked');
  perform t.ok((select not ('castle' = any (my_unlocks()))), 'castle still needs veteran');
  -- leaderboard / my_rank with looks
  perform t.ok((select rank = 1 and points = 780 and hat = 'flower_crown' and accessory = 'medal' and background = 'rainbow'
                  from leaderboard(10) where user_id = auth.uid()), 'leaderboard: rank 1 with look columns');
  perform t.ok((select rank = 1 from leaderboard(10, 'ncsu') where user_id = auth.uid()) and (select bool_and(campus = 'ncsu') from leaderboard(100, 'ncsu')), 'campus leaderboard still filters + ranks');
  perform t.ok((select bool_and(hat is null) from leaderboard(100) where user_id <> auth.uid()), 'others have no look yet');
  select * into me from my_rank();
  perform t.ok(me.rank = 1 and me.hat = 'flower_crown' and me.background = 'rainbow' and me.points = 780, 'my_rank includes look');
  perform t.eq((select rank from my_rank('ncsu')), 1, 'my_rank(campus)');
  perform t.eq((select count(*) from my_rank('duke')), 0::bigint, 'my_rank for another campus is empty');
  perform t.eq((select count(*) from pg_proc where proname in ('leaderboard', 'my_rank') and pronamespace = 'public'::regnamespace), 2::bigint, 'old leaderboard/my_rank versions dropped');
  -- Adventurer of the Month (0012): Gina leads THIS month (745), but last month is finished → Hank
  sh := monthly_shoutout();
  perform t.eq(sh->>'userId', '00000000-0000-0000-0000-0000000006a1', 'shout-out: last completed month''s winner beats this month''s leader');
  perform t.eq((sh->>'pointsThisMonth')::int, 50, 'shout-out: points in that month');
  perform t.eq((sh->>'final')::boolean, true, 'shout-out: final (completed month)');
  perform t.eq(sh->>'month', (select to_char(starts_at at time zone 'America/New_York', 'YYYY-MM') from events where id = '00000000-0000-0000-0000-00000000e002'), 'shout-out: month key YYYY-MM');
  perform t.ok(sh->>'displayName' = 'Hank' and sh->>'campus' = 'duke' and sh->>'avatar' = 'knight' and (sh::jsonb) ? 'look'
               and (sh::jsonb) ? 'hat' and not ((sh::jsonb) ? 'pointsThisWeek'), 'shout-out keys');
  perform t.ok((select not earned from my_badges() where id = 'monthly_star'), 'monthly_star: leading the current month is not enough');
end $$;
:as_super
do $$ begin
  perform t.ok((select earned and progress = 1 and goal = 1 from badges_for('00000000-0000-0000-0000-0000000006a1') where id = 'monthly_star'), 'monthly_star: Hank won a finished month');
end $$;
:as_bob
do $$ begin
  perform t.ok(json_array_length(admin_overview()->'nearGoal') >= 0 and (admin_overview()->'prize') is not null, 'admin_overview still works with the new leaderboard');
end $$;
:as_super
do $$ declare rep json := public.build_weekly_report();
begin
  perform t.ok(rep->>'text' like '%DAYS LEFT IN CYCLE%⭐ ADVENTURER OF THE MONTH%Hank (Duke) — 50 points in ' || month_label(monthly_shoutout_data()->>'month') || '. Give them a shout-out!%TOP 5 OVERALL%FEEDBACK (last 7 days)%THIS WEEK (since Monday)%',
               'weekly report text: Adventurer of the month near the top (weekly sections kept)');
  perform t.ok(rep->>'html' like '%prize spots left%⭐ Adventurer of the month%Hank%50 points</b> in ' || month_label(monthly_shoutout_data()->>'month') || '. Give%',
               'weekly report html: Adventurer of the month section');
  perform t.ok(rep->>'text' not like '%ADVENTURER OF THE WEEK%', 'weekly report: no weekly shout-out any more');
  delete from email_outbox where dedupe_key = 'weekly:' || to_char(now() at time zone 'America/New_York', 'IYYY-IW');
end $$;
:as_service
do $$ begin
  perform t.eq(enqueue_weekly_report_if_due(), true, 'enqueue (0009): queued');
  perform t.eq(enqueue_weekly_report_if_due(), false, 'enqueue (0009): deduped');
end $$;
:as_cron
do $$ begin
  perform t.eq(enqueue_weekly_report_if_due(), false, 'enqueue (0009): deduped for pg_cron too');
end $$;
:as_super
do $$ begin
  perform t.eq((select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000006a1'
                 and kind = 'announcement' and title = '⭐ You’re Adventurer of the Month!' and body like '%50 points in %'), 1::bigint,
               'Adventurer of the Month notified exactly once');
  perform t.eq((select count(*) from notifications where title = '⭐ You’re Adventurer of the Month!'), 1::bigint,
               'nobody notified while only the current month counts (section 16: leader so far, not final)');
  delete from email_outbox where dedupe_key = 'weekly:' || to_char(now() at time zone 'America/New_York', 'IYYY-IW');
end $$;
:as_service
do $$ begin
  perform t.eq(enqueue_weekly_report_if_due(), true, 'enqueue (0012): queued again');
end $$;
:as_super
do $$ begin
  perform t.eq((select count(*) from notifications where title = '⭐ You’re Adventurer of the Month!'), 1::bigint,
               'Adventurer of the Month: one notification per month even across several weekly reports');
end $$;
-- nobody gained points (fresh cycle, rolled back afterwards)
begin;
update cycles set is_active = false where is_active;
insert into cycles (name, starts_at, ends_at, is_active) values ('Empty test cycle', now(), now() + interval '30 days', true);
:as_gina
select (monthly_shoutout() is null) as sh_null \gset
:as_super
select (build_weekly_report()->>'text' like '%ADVENTURER OF THE MONTH%No points earned this month yet.%') as rep_none,
       (build_weekly_report()->>'html' like '%Adventurer of the month%No points earned this month yet.%') as rep_none_html \gset
rollback;
select t.ok(:'sh_null'::boolean, 'shout-out: null when nobody gained points') \g /dev/null
select t.ok(:'rep_none'::boolean and :'rep_none_html'::boolean, 'weekly report: "No points earned this month yet."') \g /dev/null

-- =============================================================================
-- 24. 0012 — Adventurer of the Month: fallback, ties, roles, cycles, badge
--     (fresh cycle that started 3 months ago; everything rolled back afterwards)
-- =============================================================================
:as_super
-- t.at(k, h): h hours into the NY calendar month k months from now (k = 0 → this month).
create function t.at(k int, h int) returns timestamptz language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/New_York') + make_interval(months => k, hours => h))
         at time zone 'America/New_York';
$$;
create function t.mkey(k int) returns text language sql stable as $$
  select to_char(date_trunc('month', now() at time zone 'America/New_York') + make_interval(months => k), 'YYYY-MM');
$$;
create function t.give(p_user text, p_amount int, p_at timestamptz, p_cycle uuid default null) returns void language sql as $$
  insert into public.ledger (cycle_id, user_id, amount, source, reason, created_at)
  values (coalesce(p_cycle, public.active_cycle_id()), t.u(p_user), p_amount, 'manual', 'monthly test', p_at);
$$;
begin;
update cycles set is_active = false where is_active;
insert into cycles (name, starts_at, ends_at, is_active) values ('Monthly test cycle', now() - interval '100 days', now() + interval '30 days', true);
do $$
declare sh json;
begin
  perform t.ok((select bool_and(role = 'participant') from profiles where id in (t.u('alice'), t.u('carol'), t.u('erin'))), 'section 24: alice, carol, erin are participants');
  perform t.eq((select role from profiles where id = t.u('bob')), 'admin', 'section 24: bob is an admin');
  perform t.ok(monthly_shoutout_data() is null, 'monthly: null when nobody earned points this cycle');

  -- Only the current month has points → leader so far (not final). Admins never count.
  perform t.give('alice', 30, t.at(0, 1));
  perform t.give('carol', 10, t.at(0, 1));
  perform t.give('bob', 999, t.at(0, 1));
  sh := monthly_shoutout_data();
  perform t.eq(sh->>'userId', t.u('alice')::text, 'monthly fallback: current month leader (admin excluded)');
  perform t.eq((sh->>'final')::boolean, false, 'monthly fallback: not final');
  perform t.eq(sh->>'month', t.mkey(0), 'monthly fallback: current month key');
  perform t.eq((sh->>'pointsThisMonth')::int, 30, 'monthly fallback: points so far');

  -- Two months ago doesn't help: last month is still empty → still the current-month fallback.
  perform t.give('carol', 20, t.at(-2, 5));
  sh := monthly_shoutout_data();
  perform t.eq(sh->>'userId', t.u('alice')::text, 'monthly: empty last month → current month (older months ignored)');
  perform t.ok((select earned and progress = 1 from badges_for(t.u('carol')) where id = 'monthly_star'), 'monthly_star: won a finished month (two months ago)');
  perform t.ok((select not earned and progress = 0 from badges_for(t.u('alice')) where id = 'monthly_star'), 'monthly_star: current-month leader has not earned it');
  perform t.eq((select count(*) from badges_for(t.u('carol'))), 16::bigint, '16 badges (0022)');

  -- Last month: carol and erin tie on 40 positive points; carol reached 40 first (8h vs 10h).
  perform t.give('carol', 25, t.at(-1, 3));
  perform t.give('carol', 15, t.at(-1, 8));
  perform t.give('erin', -5, t.at(-1, 1));                 -- corrections don't count
  perform t.give('erin', 40, t.at(-1, 10));
  perform t.give('bob', 500, t.at(-1, 2));                 -- admin: never counts
  perform t.give('dave', 1000, t.at(-1, 2), (select id from cycles where not is_active order by starts_at desc limit 1));  -- other cycle
  sh := monthly_shoutout_data();
  perform t.eq(sh->>'userId', t.u('carol')::text, 'monthly: last completed month''s winner; tie → reached the total first');
  perform t.eq((sh->>'final')::boolean, true, 'monthly: completed month is final');
  perform t.eq(sh->>'month', t.mkey(-1), 'monthly: last month key');
  perform t.eq((sh->>'pointsThisMonth')::int, 40, 'monthly: positive points that month, this cycle only');
  perform t.ok((select not earned from badges_for(t.u('erin')) where id = 'monthly_star'), 'monthly_star: tie loser has not earned it');

  -- Erin earns 1 more point last month (after carol) → erin wins outright.
  perform t.give('erin', 1, t.at(-1, 11));
  perform t.eq(monthly_shoutout_data()->>'userId', t.u('erin')::text, 'monthly: more points beats earlier time');
  perform t.ok((select earned from badges_for(t.u('erin')) where id = 'monthly_star'), 'monthly_star: earned by last month''s winner');
  perform t.ok((select earned from badges_for(t.u('carol')) where id = 'monthly_star'), 'monthly_star: carol keeps hers (two months ago)');
  perform t.ok((select not earned from badges_for(t.u('bob')) where id = 'monthly_star'), 'monthly_star: admins never earn it');
end $$;
:as_alice
do $$ begin
  perform t.eq(monthly_shoutout()->>'userId', t.u('erin')::text, 'participant can call monthly_shoutout()');
  perform t.ok((select not earned from my_badges() where id = 'monthly_star'), 'my_badges: alice has no monthly_star');
end $$;
:as_erin
do $$ begin
  perform t.ok((select earned and progress = 1 and goal = 1 from my_badges() where id = 'monthly_star'), 'my_badges: erin has monthly_star');
end $$;
:as_super
rollback;
drop function t.at(int, int);
drop function t.mkey(int);
drop function t.give(text, int, timestamptz, uuid);

-- =============================================================================
-- 0010. NAME FILTER: name_is_clean, sign-up, update_profile, handle_available, admin_rename_user
-- =============================================================================
:as_super
do $$
declare n text;
begin
  foreach n in array array['Alice A.', 'Cassie', 'Classy Cat', 'Dickens', 'Peacock', 'Hancock', 'Sussex', 'Essex',
                           'Titan', 'Matilda', 'Grape Ape', 'player_42', 'Erin the Great', 'Analyst'] loop
    perform t.ok(name_is_clean(n), format('name_is_clean: %s is clean', n));
  end loop;
  foreach n in array array['f.u.c.k', 'Sh1t', 'big ass', 'ASS', 'b1tch', 'xXslutXx', 'Scunthorpe', 'a.s.s', 'Mr Dick',
                           'peacock cock', 'S3XY', 'p0rn_star', 'hoe', '$h!t'] loop
    perform t.ok(not name_is_clean(n), format('name_is_clean: %s is blocked', n));
  end loop;
  perform t.ok(name_is_clean(''), 'name_is_clean: empty string has nothing blocked');
  perform t.ok(name_is_clean(null), 'name_is_clean: null treated as empty');
  perform t.ok((select provolatile = 'i' from pg_proc where proname = 'name_is_clean'), 'name_is_clean is immutable');

  -- sign-up
  perform t.throws($q$insert into auth.users (email, raw_user_meta_data) values ('nf1@example.edu', '{"handle":"sh1tlord","display_name":"Nice Name","campus":"unc"}')$q$, 'handle', 'sign-up: unclean handle rejected');
  perform t.throws($q$insert into auth.users (email, raw_user_meta_data) values ('nf2@example.edu', '{"handle":"nicehandle","display_name":"big ass","campus":"unc"}')$q$, 'displayName', 'sign-up: unclean display name rejected');
  perform t.ok(not exists (select 1 from profiles where handle in ('sh1tlord', 'nicehandle')), 'sign-up: no profile created for rejected names');
  insert into auth.users (email) values ('fuckface99@example.edu');
  perform t.ok((select handle::text ~ '^player[0-9]{1,4}$' and display_name = handle::text
                  from profiles where email = 'fuckface99@example.edu'), 'sign-up: unclean email fallback → player#### handle and name');
  insert into auth.users (email, raw_user_meta_data) values ('nf3@example.edu', '{"handle":"peacock","display_name":"Classy Cassie","campus":"duke"}');
  perform t.ok(exists (select 1 from profiles where handle = 'peacock' and display_name = 'Classy Cassie'), 'sign-up: tricky-but-clean names accepted');
end $$;

:as_anon
do $$ begin
  perform t.eq(handle_available('b1tch'), false, 'handle_available: unclean handle is not available');
  perform t.eq(handle_available('xXslutXx'), false, 'handle_available: squashed unclean handle is not available');
  perform t.eq(handle_available('dickens'), true, 'handle_available: Dickens is fine');
  perform t.denied('select name_is_clean(''x'')', 'anon cannot call name_is_clean');
  perform t.denied($q$select admin_rename_user('00000000-0000-0000-0000-0000000000a1', 'Hi there')$q$, 'anon cannot call admin_rename_user');
end $$;

:as_carol
do $$ declare v_before text := (select display_name from profiles where id = auth.uid());
begin
  perform t.ok((select role = 'participant' from profiles where id = auth.uid()), 'name filter: carol is a participant');
  perform t.throws('select update_profile(''Sh1t Head'', null, null)', 'displayName', 'update_profile rejects unclean name');
  perform t.throws('select update_profile(''big  ass'', null, null)', 'displayName', 'update_profile rejects unclean whole word');
  perform t.eq((select display_name from profiles where id = auth.uid()), v_before, 'update_profile: name unchanged after rejection');
  perform t.eq((update_profile('Classy Cat', null, null)).display_name, 'Classy Cat', 'update_profile accepts Classy Cat');
  perform t.denied('select name_is_clean(''x'')', 'authenticated cannot call name_is_clean (internal)');
  perform t.throws($q$select admin_rename_user('00000000-0000-0000-0000-000000000e70', 'Hi there')$q$, 'forbidden', 'admin_rename_user: participant forbidden');
end $$;

:as_bob
do $$ begin
  perform t.throws($q$select admin_rename_user('00000000-0000-0000-0000-000000000e70', 'b1tch')$q$, 'displayName', 'admin_rename_user rejects unclean name');
  perform t.throws($q$select admin_rename_user('00000000-0000-0000-0000-000000000e70', ' E ')$q$, 'displayName', 'admin_rename_user rejects too-short name');
  perform t.throws($q$select admin_rename_user('00000000-0000-0000-0000-000000000e70', repeat('x', 25))$q$, 'displayName', 'admin_rename_user rejects too-long name');
  perform t.throws($q$select admin_rename_user('00000000-0000-0000-0000-00000000dead', 'Nice Name')$q$, 'not_found', 'admin_rename_user: unknown user');
  perform admin_rename_user(t.u('erin'), '  Erin the Kind  ');
end $$;

:as_super
do $$ begin
  perform t.eq((select display_name from profiles where id = t.u('erin')), 'Erin the Kind', 'admin_rename_user: profile renamed (trimmed)');
  perform t.eq((select display_name from prize_claims where user_id = t.u('erin') and status <> 'revoked'), 'Erin the Kind', 'admin_rename_user: active claim renamed');
  perform t.eq((select count(*) from notifications where user_id = t.u('erin') and title = 'Your display name was updated'
                  and body like '%Erin the Kind%' and body like '%YAC admin%'), 1::bigint, 'admin_rename_user: user notified');
  perform t.ok(exists (select 1 from admin_actions where action = 'user_renamed' and actor_id = t.u('bob') and target_user_id = t.u('erin')
                         and details = jsonb_build_object('from', 'Erin the Great', 'to', 'Erin the Kind')), 'admin_rename_user: logged with from/to');
  perform t.eq((select count(*) from admin_actions where action = 'user_renamed'), 1::bigint, 'admin_rename_user: rejected renames not logged');
end $$;

-- =============================================================================
-- 0011 — CHAIR LIMIT (max_chairs; tested here with 5, real value 6)
-- =============================================================================
\set as_seat3 'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000110c3''; set role authenticated;'
:as_super
insert into t.users values
  ('seat3', '00000000-0000-0000-0000-0000000110c3'),
  ('seat4', '00000000-0000-0000-0000-0000000110c4'),
  ('seat5', '00000000-0000-0000-0000-0000000110c5'),
  ('seat6', '00000000-0000-0000-0000-0000000110c6'),
  ('seat7', '00000000-0000-0000-0000-0000000110c7'),
  ('seatx', '00000000-0000-0000-0000-0000000110cf');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select t.u(n), n || '@example.edu', case when n = 'seatx' then null else now() end,
       jsonb_build_object('handle', n, 'display_name', initcap(n), 'campus', 'unc', 'avatar', 'yak')
  from unnest(array['seat3','seat4','seat5','seat6','seat7','seatx']) n;
-- start from exactly one chair: chair1
update profiles set role = 'admin' where role = 'chair' and id <> t.u('chair1');
update profiles set role = 'chair' where id = t.u('chair1');
update app_config set max_chairs = 5 where id = 1;   -- a smaller limit for this test (the real value is 6)
do $$ begin
  perform t.eq((select max_chairs from app_config), 5, '0011: max_chairs set to 5 for this test');
  perform t.eq((select count(*) from profiles where role = 'chair'), 1::bigint, '0011: setup has one chair');
end $$;
:as_chair1
do $$
declare v_msg text;
begin
  perform t.throws('select step_down_chair()', 'last_chair', 'step_down_chair refused for the only chair');
  perform t.throws(format('select set_role(%L, ''chair'')', t.u('seatx')), 'not_verified', 'set_role chair: email must be confirmed');
  perform t.throws(format('select set_role(%L, ''chair'')', gen_random_uuid()), 'not_found', 'set_role chair: unknown user');
  perform set_role(t.u('seat3'), 'chair');
  perform set_role(t.u('seat4'), 'admin');
  perform set_role(t.u('seat4'), 'chair');   -- admin → chair
  perform set_role(t.u('seat5'), 'chair');
  perform set_role(t.u('seat6'), 'chair');
  perform t.eq((select count(*) from profiles where role = 'chair'), 5::bigint, 'chairs can make up to 5 chairs');
  perform t.throws(format('select set_role(%L, ''chair'')', t.u('seat7')), 'chair_limit', '6th chair → chair_limit');
  begin
    perform set_role(t.u('seat7'), 'chair');
  exception when others then v_msg := sqlerrm;
  end;
  perform t.eq(v_msg, 'chair_limit: There are already 5 YACquest Chairs.', 'chair_limit message uses max_chairs');
  perform t.eq((select role from profiles where id = t.u('seat7')), 'participant', 'refused 6th chair keeps their role');
  perform set_role(t.u('seat3'), 'chair');   -- already a chair → no-op
  perform t.pass('set_role chair on an existing chair is a no-op');
  perform t.throws(format('select set_role(%L, ''participant'')', t.u('seat3')), 'forbidden', 'chair cannot demote another chair to participant');
  perform t.throws(format('select set_role(%L, ''admin'')', t.u('seat3')), 'forbidden', 'chair cannot demote another chair to admin');
  perform t.ok((select count(*) from list_team() where role = 'chair') = 5, 'list_team shows 5 chairs');
end $$;
:as_seat3
do $$ begin
  perform t.ok(is_chair(), 'new chair has chair powers');
  perform t.throws(format('select set_role(%L, ''participant'')', t.u('chair1')), 'forbidden', 'new chair cannot demote an older chair');
  perform step_down_chair();
  perform t.ok(not is_chair() and is_admin(), 'step_down_chair: caller is now an admin');
  perform t.ok(exists (select 1 from notifications where title = 'You stepped down as YACquest Chair'), 'step_down_chair notifies the caller');
  perform t.throws('select step_down_chair()', 'forbidden', 'admin cannot step_down_chair');
  perform t.throws(format('select set_role(%L, ''chair'')', t.u('seat7')), 'forbidden', 'admin cannot make a chair');
end $$;
:as_alice
do $$ begin
  perform t.throws('select step_down_chair()', 'forbidden', 'participant cannot step_down_chair');
  perform t.throws(format('select set_role(%L, ''chair'')', t.u('alice')), 'forbidden', 'participant cannot make a chair');
end $$;
:as_anon
do $$ begin
  perform t.denied('select step_down_chair()', 'anon cannot call step_down_chair');
end $$;
:as_chair1
do $$ begin
  perform set_role(t.u('seat7'), 'chair');   -- the freed seat can be filled
  perform t.eq((select count(*) from profiles where role = 'chair'), 5::bigint, 'freed chair seat can be filled again');
end $$;
:as_super
do $$ begin
  perform t.eq((select count(*) from notifications where user_id = t.u('seat4') and title = 'You’re now a YACquest Chair'), 1::bigint, 'new chair notified once');
  perform t.eq((select count(*) from admin_actions where action = 'role_changed' and target_user_id = t.u('seat3')
                  and actor_id = t.u('chair1') and details = '{"from":"participant","to":"chair"}'), 1::bigint, 'log: making a chair logged once');
  perform t.eq((select count(*) from admin_actions where action = 'role_changed' and target_user_id = t.u('seat3')
                  and actor_id = t.u('seat3') and details = '{"from":"chair","to":"admin"}'), 1::bigint, 'log: step_down_chair logged once');
  perform t.eq((select count(*) from admin_actions where target_user_id = t.u('seat3')), 2::bigint, 'log: seat3 has exactly 2 entries (no double-logging, no-op not logged)');
  perform t.eq((select count(*) from admin_actions where target_user_id = t.u('seat7')), 1::bigint, 'log: refused chair_limit attempt not logged');

  -- bootstrap honours max_chairs (5 chairs now)
  insert into chair_bootstrap (email) values ('boot.one@example.edu'), ('boot.two@example.edu') on conflict do nothing;
  insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
  values ('boot.one@example.edu', now(), '{"handle":"bootone","display_name":"Boot One","campus":"unc"}');
  perform t.eq((select role from profiles where email = 'boot.one@example.edu'), 'participant', 'bootstrap: no chair seat when 5 chairs');
  update app_config set max_chairs = 6 where id = 1;
  insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
  values ('boot.two@example.edu', now(), '{"handle":"boottwo","display_name":"Boot Two","campus":"unc"}');
  perform t.eq((select role from profiles where email = 'boot.two@example.edu'), 'chair', 'bootstrap: chair when under max_chairs (6)');
  update app_config set max_chairs = 6 where id = 1;   -- back to the real value
  delete from chair_bootstrap where email in ('boot.one@example.edu', 'boot.two@example.edu');
end $$;

-- =============================================================================
-- 0013 — LAUNCH EXTRAS: sign-up email opt-in, anonymous feedback, event attendees
-- =============================================================================
\set as_optin  'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-000000013001''; set role authenticated;'
\set as_optout 'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-000000013002''; set role authenticated;'
:as_super
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000013001', 'optin@example.edu', now(), '{"handle":"optin13","display_name":"Optin Otto","campus":"duke"}'),
  ('00000000-0000-0000-0000-000000013002', 'optout@example.edu', now(), '{"handle":"optout13","display_name":"Optout Olive","campus":"unc","email_opt_in":false}'),
  ('00000000-0000-0000-0000-000000013003', 'optyes@example.edu', now(), '{"handle":"optyes13","display_name":"Optyes Yan","campus":"ncsu","email_opt_in":true}');
do $$ begin
  perform t.eq((select email_opt_in from profiles where handle = 'optin13'), true, '0013: sign-up without email_opt_in → opted in');
  perform t.eq((select email_opt_in from profiles where handle = 'optout13'), false, '0013: sign-up with email_opt_in false → opted out');
  perform t.eq((select email_opt_in from profiles where handle = 'optyes13'), true, '0013: sign-up with email_opt_in true → opted in');
  perform t.ok(not exists (select 1 from pg_proc where proname = 'submit_feedback' and pronargs = 2), '0013: old 2-arg submit_feedback dropped');
  perform t.eq((select count(*) from pg_proc where proname = 'list_feedback'), 1::bigint, '0013: one list_feedback');
end $$;

-- anonymous feedback
:as_optout
do $$ declare r json;
begin
  r := submit_feedback('idea', 'secret anon note about pizza', true);
  perform t.ok((r->>'id') is not null, '0013: anonymous feedback accepted');
  perform submit_feedback('bug', 'named note from olive');            -- 2-arg call still works (not anonymous)
  perform submit_feedback(p_category => 'other', p_message => 'named args note', p_anonymous => false);
  perform t.pass('0013: submit_feedback keeps 2-arg and named-arg calls');
  perform t.ok((select earned from my_badges() where id = 'voice'), '0013: anonymous sender still earns the voice badge');
  perform t.throws('select * from admin_event_attendees(gen_random_uuid())', 'forbidden', '0013: participant cannot list attendees');
end $$;
:as_super
do $$ begin
  perform t.eq((select user_id from feedback where message = 'secret anon note about pizza'), '00000000-0000-0000-0000-000000013002'::uuid, '0013: anonymous feedback still records the sender');
  perform t.eq((select anonymous from feedback where message = 'secret anon note about pizza'), true, '0013: anonymous flag stored');
  perform t.eq((select anonymous from feedback where message = 'named note from olive'), false, '0013: default not anonymous');
end $$;
:as_admin
do $$ declare r record;
begin
  select * into r from list_feedback() where message = 'secret anon note about pizza';
  perform t.ok(r.anonymous and r.display_name = 'Anonymous' and r.handle is null and r.campus is null, '0013: list_feedback hides name/handle/campus for anonymous');
  select * into r from list_feedback('new', 200) where message = 'named note from olive';
  perform t.ok(not r.anonymous and r.display_name = 'Optout Olive' and r.handle = 'optout13' and r.campus = 'unc', '0013: list_feedback shows sender when not anonymous');
end $$;
:as_super
do $$ declare rep json := public.build_weekly_report();
begin
  perform t.ok(rep->>'text' like '%[Idea] Anonymous: secret anon note about pizza%', '0013: weekly text shows Anonymous');
  perform t.ok(rep->>'text' not like '%Optout Olive (UNC): secret anon%', '0013: weekly text hides anonymous sender');
  perform t.ok(rep->>'text' like '%Optout Olive (UNC): named note from olive%', '0013: weekly text still names normal feedback');
  perform t.ok(rep->>'html' like '%Anonymous</div><div style="font-size:14px;white-space:pre-wrap;">secret anon note about pizza%', '0013: weekly html shows Anonymous');
  perform t.ok(rep->>'html' not like '%optout13%', '0013: weekly html never shows the handle');
end $$;

-- event attendees
:as_admin
do $$ begin
  perform create_event(jsonb_build_object('title','Attendance Test','campus','all','kind','active','location','Quad',
          'startsAt', now() - interval '30 minutes', 'endsAt', now() + interval '1 hour', 'password', 'herd13'));
  perform t.eq((select count(*) from admin_event_attendees((select id from events where title = 'Attendance Test'))), 0::bigint, '0013: no attendees yet');
  perform t.throws(format('select * from admin_event_attendees(%L)', gen_random_uuid()), 'not_found', '0013: attendees of unknown event');
end $$;
:as_optin
select check_in((select id from events where title = 'Attendance Test'), 'herd13') \g /dev/null
:as_optout
select check_in((select id from events where title = 'Attendance Test'), 'HERD13') \g /dev/null
:as_admin
do $$ declare r record; v_ev uuid := (select id from events where title = 'Attendance Test');
begin
  perform t.eq((select count(*) from admin_event_attendees(v_ev)), 2::bigint, '0013: admin sees 2 attendees');
  select * into r from admin_event_attendees(v_ev) limit 1;
  perform t.ok(r.user_id = '00000000-0000-0000-0000-000000013001'::uuid and r.display_name = 'Optin Otto' and r.handle = 'optin13'
               and r.campus = 'duke' and r.points = 20 and r.checked_in_at is not null, '0013: attendee row content, oldest first');
  perform t.eq((select array_agg(handle order by checked_in_at) from admin_event_attendees(v_ev)), array['optin13', 'optout13'], '0013: ordered by check-in time');
end $$;
:as_chair1
do $$ begin
  perform t.eq((select count(*) from admin_event_attendees((select id from events where title = 'Attendance Test'))), 2::bigint, '0013: chair sees attendees');
end $$;
:as_anon
do $$ begin
  perform t.denied(format('select * from admin_event_attendees(%L)', gen_random_uuid()), '0013: anon cannot call admin_event_attendees');
  perform t.denied('select submit_feedback(''idea'', ''hello there'', true)', '0013: anon cannot call submit_feedback');
end $$;

-- =============================================================================
-- 25. 0014/0016/0018 — prize goal 350: halfway 175, reaching 350 claims a spot
--     (fresh cycle, real config values; everything rolled back afterwards)
-- =============================================================================
:as_super
begin;
update app_config set prize_goal = 350, prize_count = 4, prize_value_usd = 75, tier1_points = 35, tier2_points = 20, tier3_points = 5;
update cycles set is_active = false where is_active;
insert into cycles (name, starts_at, ends_at, is_active) values ('Goal 350 test cycle', now() - interval '10 days', now() + interval '100 days', true);
update profiles set points = 0 where points <> 0;   -- as reset_cycle() does
do $$
declare ps json;
begin
  perform t.eq((select count(*) from prize_claims where cycle_id = active_cycle_id()), 0::bigint, 'goal 350: fresh cycle has no claims');
  insert into ledger (cycle_id, user_id, amount, source, reason) values (active_cycle_id(), t.u('alice'), 174, 'manual', 'goal 350 test');
  perform t.ok((select not earned and progress = 174 and goal = 175 from badges_for(t.u('alice')) where id = 'halfway'), 'goal 350: halfway not earned at 174');
  insert into ledger (cycle_id, user_id, amount, source, reason) values (active_cycle_id(), t.u('alice'), 1, 'manual', 'goal 350 test');
  perform t.ok((select earned and progress = 175 and goal = 175 from badges_for(t.u('alice')) where id = 'halfway'), 'goal 350: halfway earned at 175');
  perform t.ok((select not earned and progress = 175 and goal = 350 from badges_for(t.u('alice')) where id = 'legend'), 'goal 350: legend 175 of 350');
  insert into ledger (cycle_id, user_id, amount, source, reason) values (active_cycle_id(), t.u('alice'), 124, 'manual', 'goal 350 test');
  perform t.ok(not ('sparkles' = any (unlocks_for(t.u('alice')))), 'goal 350: Sparkle Aura still locked at 299');
  insert into ledger (cycle_id, user_id, amount, source, reason) values (active_cycle_id(), t.u('alice'), 1, 'manual', 'goal 350 test');
  perform t.ok('sparkles' = any (unlocks_for(t.u('alice'))), 'goal 350: Sparkle Aura unlocked at 300');
  insert into ledger (cycle_id, user_id, amount, source, reason) values (active_cycle_id(), t.u('alice'), 49, 'manual', 'goal 350 test');
  perform t.eq((select points from profiles where id = t.u('alice')), 349, 'goal 350: alice at 349');
  perform t.eq((select count(*) from prize_claims where cycle_id = active_cycle_id()), 0::bigint, 'goal 350: 349 does not qualify');
  insert into ledger (cycle_id, user_id, amount, source, reason) values (active_cycle_id(), t.u('alice'), 1, 'manual', 'goal 350 test');
  ps := prize_status();
  perform t.eq((ps->>'goal')::int, 350, 'goal 350: prize_status goal');
  perform t.eq((ps->>'remaining')::int, 3, 'goal 350: 3 of 4 spots left');
  perform t.ok((select spot = 1 and status = 'qualified' from prize_claims
                 where cycle_id = active_cycle_id() and user_id = t.u('alice')), 'goal 350: reaching exactly 350 claims spot #1');
  perform t.ok((select earned and progress = 350 from badges_for(t.u('alice')) where id = 'legend'), 'goal 350: legend earned at 350');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('alice') and kind = 'prize_qualified'
                        and body like 'You reached 350 points%'), 'goal 350: winner notified with the new goal');
  -- admin "Close to the goal": within 75 → 275+ and unclaimed
  insert into ledger (cycle_id, user_id, amount, source, reason) values (active_cycle_id(), t.u('carol'), 275, 'manual', 'goal 350 test');
  insert into ledger (cycle_id, user_id, amount, source, reason) values (active_cycle_id(), t.u('erin'), 270, 'manual', 'goal 350 test');
end $$;
:as_bob
do $$ begin
  perform t.ok((select count(*) from json_array_elements(admin_overview()->'nearGoal') x where (x->>'userId')::uuid = t.u('carol')) = 1
               and (select count(*) from json_array_elements(admin_overview()->'nearGoal') x where (x->>'userId')::uuid in (t.u('erin'), t.u('alice'))) = 0,
               'goal 350: admin nearGoal = within 75, unclaimed (carol 275 yes; erin 270 and winner alice no)');
end $$;
:as_super
rollback;

-- =============================================================================
-- 26. 0015 — yak puns: weekly report + prize alerts get a "Yak of the week" line
-- =============================================================================
:as_super
do $$ declare rep json := public.build_weekly_report(); v_pun text := public.yak_pun_of_the_week();
begin
  perform t.eq((select count(distinct public.yak_pun(i)) from generate_series(0, 39) i), 40::bigint, 'yak: 40 distinct puns');
  perform t.eq(public.yak_pun(0), 'Yak to the future!', 'yak: seed 0 is the first pun');
  perform t.eq(public.yak_pun(40), public.yak_pun(0), 'yak: seed wraps around');
  perform t.eq(public.yak_pun(-5), public.yak_pun(5), 'yak: negative seed uses |seed|');
  perform t.eq(public.yak_pun(null), public.yak_pun(0), 'yak: null seed is seed 0');
  perform t.eq(public.yak_pun(202645), 'That was yak-tually amazing.', 'yak: 202645 mod 40 = 5 (same as yakPun() in the app)');
  perform t.eq(v_pun, public.yak_pun(to_char(now() at time zone 'America/New_York', 'IYYYIW')::int), 'yak: pun of the week seeded by ISO week');
  perform t.ok(exists (select 1 from generate_series(0, 39) i where public.yak_pun(i) = v_pun), 'yak: pun of the week is from the list');
  perform t.ok(rep->>'text' like '%' || E'\n\n🐂 Yak of the week: ' || v_pun || E'\n', 'yak: weekly text ends with the pun line');
  perform t.ok(rep->>'html' like '%🐂 Yak of the week: ' || public.html_escape(v_pun) || '</p>%', 'yak: weekly html has the pun line');
  perform t.ok(rep->>'text' like '%PENDING REVIEWS:%', 'yak: weekly text otherwise unchanged (pending reviews still there)');
  perform t.ok(not exists (select 1 from email_outbox where kind in ('prize_qualified', 'prize_info')
                            and (body_text not like '%🐂 Yak of the week: %' or body_html not like '%🐂 Yak of the week: %'))
               and exists (select 1 from email_outbox where kind in ('prize_qualified', 'prize_info')),
               'yak: every admin prize alert has the pun line');
  perform t.ok(not exists (select 1 from email_outbox where kind = 'announcement' and body_text like '%Yak of the week%'),
               'yak: announcement emails unchanged');
end $$;
:as_anon
do $$ begin
  perform t.denied('select yak_pun(1)', 'yak: anon cannot call yak_pun');
  perform t.denied('select yak_pun_of_the_week()', 'yak: anon cannot call yak_pun_of_the_week');
end $$;
:as_bob
do $$ begin
  perform t.denied('select yak_pun(1)', 'yak: authenticated cannot call internal yak_pun');
end $$;

-- =============================================================================
-- 27. 0017 — consistency: column defaults, announcement email footer names the setting
-- =============================================================================
:as_super
do $$ begin
  perform t.eq((select column_default from information_schema.columns
                 where table_schema = 'public' and table_name = 'app_config' and column_name = 'tier1_points'), '35', '0017: tier1_points default 35');
  perform t.eq((select column_default from information_schema.columns
                 where table_schema = 'public' and table_name = 'app_config' and column_name = 'max_chairs'), '6', '0017: max_chairs default 6');
  perform t.ok(exists (select 1 from email_outbox where kind = 'announcement'), '0017: announcement emails exist to check');
  perform t.ok(not exists (select 1 from email_outbox where kind = 'announcement'
                            and (body_text not like '%turn off “Email me announcements from YAC” in the app under Me → Settings.'
                                 or body_html not like '%turn off “Email me announcements from YAC” in the app under Me → Settings.%')),
               '0017: announcement emails name the “Email me announcements from YAC” setting');
  perform t.ok(not exists (select 1 from email_outbox where kind = 'announcement' and body_text like '%Change email updates%'),
               '0017: old “Change email updates” footer is gone');
end $$;

-- =============================================================================
-- 28. 0019 — consistency pass for the 350 goal: final state + re-run safety
-- =============================================================================
:as_super
do $$ begin
  perform t.eq((select string_agg(id || '=' || rule_value, ',' order by rule_value::int) from cosmetics where rule_type = 'points'),
               'sunset=50,flower_crown=100,night_sky=200,gold_chain=250,sparkles=300', '0019: point cosmetics 50/100/200/250/300 (matches src/lib/cosmetics.ts)');
  perform t.eq((select max_chairs from app_config), 6, '0019: max_chairs 6');
  perform t.ok(position('coalesce(max_chairs, 6)' in pg_get_functiondef('public.set_role(uuid, text)'::regprocedure)) > 0
               and position(', 5)' in pg_get_functiondef('public.set_role(uuid, text)'::regprocedure)) = 0, '0019: set_role chair fallback 6');
  perform t.ok(position('coalesce(v_max, 6)' in pg_get_functiondef('public.transfer_chair(uuid)'::regprocedure)) > 0
               and position(', 5)' in pg_get_functiondef('public.transfer_chair(uuid)'::regprocedure)) = 0, '0019: transfer_chair chair fallback 6');
  perform t.ok(position('cfg.prize_goal - 75' in pg_get_functiondef('public.admin_overview()'::regprocedure)) > 0, '0019: admin nearGoal within 75 (ADMIN_NEAR_GOAL_POINTS)');
  perform t.ok(position('p_amount < -cfg.prize_goal' in pg_get_functiondef('public.adjust_points(uuid, integer, text)'::regprocedure)) > 0, '0019: manual removals down to -prize_goal');
  perform t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~ '\m(650|325)\M'),
               '0019: no public function mentions 650 or 325');
  perform t.eq((select count(*) from pg_proc where proname in ('set_role', 'transfer_chair') and has_function_privilege('anon', oid, 'execute')), 0::bigint, '0019: anon cannot run set_role / transfer_chair');
end $$;

-- Re-running 0003 and 0016 on a live database must not touch the goal or the race.
begin;
update app_config set prize_goal = 350, prize_count = 4, prize_value_usd = 75, tier1_points = 35, tier2_points = 20, tier3_points = 5;
update report_settings set near_goal_points = 75;
update cycles set is_active = false where is_active;
insert into cycles (name, starts_at, ends_at, is_active) values ('Rerun test cycle', now() - interval '10 days', now() + interval '100 days', true);
update profiles set points = 0 where points <> 0;
insert into ledger (cycle_id, user_id, amount, source, reason) values (active_cycle_id(), t.u('carol'), 320, 'manual', 'rerun test');
\ir ../migrations/0003_points_and_referrals.sql
\ir ../migrations/0016_goal_300.sql
do $$ begin
  perform t.eq((select prize_goal from app_config), 350, '0019: re-running 0003 + 0016 keeps the goal at 350');
  perform t.eq((select rule_value from cosmetics where id = 'sparkles'), '300', '0019: re-running 0016 keeps Sparkle Aura at 300');
  perform t.eq((select near_goal_points from report_settings), 75, '0019: re-running 0016 keeps the close-to-the-prize range at 75');
  perform t.eq((select count(*) from prize_claims where cycle_id = active_cycle_id()), 0::bigint, '0019: re-running 0016 gives nobody at 320 a spot');
end $$;
rollback;

-- =============================================================================
-- 29. 0020 — STAFF-ONLY rewards: Hero of the Week, Council wardrobe + badges, Golden Yak
--     Own cast: hc (chair), ha + hb (admins), hp (participant).
-- =============================================================================
\set as_hc 'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-000000020c01''; set role authenticated;'
\set as_ha 'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-000000020a01''; set role authenticated;'
\set as_hb 'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-000000020b01''; set role authenticated;'
\set as_hp 'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-000000020f01''; set role authenticated;'
:as_super
insert into t.users values
  ('hc', '00000000-0000-0000-0000-000000020c01'), ('ha', '00000000-0000-0000-0000-000000020a01'),
  ('hb', '00000000-0000-0000-0000-000000020b01'), ('hp', '00000000-0000-0000-0000-000000020f01');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (t.u('hc'), 'hc20@example.edu', now(), '{"handle":"hc20","display_name":"Hero Chair","campus":"duke","avatar":"mage"}'),
  (t.u('ha'), 'ha20@example.edu', now(), '{"handle":"ha20","display_name":"Hero Admin A","campus":"unc","avatar":"ranger"}'),
  (t.u('hb'), 'hb20@example.edu', now(), '{"handle":"hb20","display_name":"Hero Admin B","campus":"ncsu","avatar":"knight"}'),
  (t.u('hp'), 'hp20@example.edu', now(), '{"handle":"hp20","display_name":"Plain Player","campus":"duke","avatar":"yak"}'),
  ('00000000-0000-0000-0000-000000020f02', 'gy20@example.edu', now(), '{"handle":"gy20","display_name":"Sneaky Gold","campus":"duke","avatar":"golden_yak"}');
update profiles set role = 'chair' where id = t.u('hc');
create table t.staff_items as select id from staff_cosmetics;
grant select on t.staff_items to public;
update profiles set role = 'admin' where id in (t.u('ha'), t.u('hb'));
do $$ begin
  perform t.eq((select avatar from profiles where handle = 'gy20'), 'yak', '0020: sign-up can''t pick the Golden Yak (falls back to yak)');
  perform t.ok(exists (select 1 from pg_constraint where conname = 'profiles_avatar_check' and pg_get_constraintdef(oid) like '%golden_yak%'), '0020: avatar check accepts golden_yak');
  perform t.eq((select count(*) from staff_cosmetics), 10::bigint, '0020: 10 staff cosmetics (7 Council + 3 hero)');
  perform t.eq((select string_agg(id || '=' || coalesce(rule_value::text, rule_type), ',' order by sort_order) from staff_cosmetics),
    'host_top_hat=3,gatekeeper_monocle=25,heralds_horn=5,council_chamber=staff,wizard_council_hat=grant,royal_scepter=grant,starlit_throne=grant,hero_crown=hero,hero_cape=hero,hall_of_heroes=hero',
    '0020: staff cosmetics + rules (matches src/lib/staffRewards.ts)');
  perform t.ok(not exists (select 1 from cosmetics c join staff_cosmetics s on s.id = c.id), '0020: staff items are not in the public cosmetics table');
end $$;
-- a participant: nothing staff-only, anywhere
:as_hp
do $$ begin
  perform t.ok(my_staff_rewards() is null, '0020: participant my_staff_rewards() is null');
  perform t.ok(not exists (select 1 from my_badges() b where b.id in ('gatekeeper', 'town_crier', 'event_host', 'hero_week', 'council_legend')), '0020: participant my_badges() has no Council badges');
  perform t.ok(not exists (select 1 from unnest(my_unlocks()) u join (values ('host_top_hat'),('gatekeeper_monocle'),('heralds_horn'),('council_chamber'),('wizard_council_hat'),('royal_scepter'),('starlit_throne'),('hero_crown'),('hero_cape'),('hall_of_heroes')) v(id) on v.id = u), '0020: participant my_unlocks() has no staff items');
  perform t.throws('select equip_look(''hero_crown'', null, null)', 'look', '0020: participant can''t equip the Hero''s Crown');
  perform t.throws('select equip_look(null, null, ''council_chamber'')', 'look', '0020: participant can''t equip the (free-for-staff) Council Chamber');
  perform t.throws('select update_profile(null, ''golden_yak'', null)', 'avatar', '0020: participant can''t pick the Golden Yak');
  perform t.throws('select hero_board()', 'forbidden', '0020: participant can''t see the hero board');
  perform t.throws(format('select crown_hero(%L, '''')', t.u('ha')), 'forbidden', '0020: participant can''t crown');
  perform t.throws('select clear_hero()', 'forbidden', '0020: participant can''t clear');
  perform t.throws(format('select grant_staff_reward(%L, ''royal_scepter'')', t.u('ha')), 'forbidden', '0020: participant can''t grant');
  perform t.denied('select * from staff_grants', '0020: staff_grants not readable');
  perform t.denied('select * from hero_reigns', '0020: hero_reigns not readable');
  perform t.denied('select * from staff_cosmetics', '0020: staff_cosmetics not readable');
  perform t.denied(format('select staff_stats(%L)', t.u('hp')), '0020: staff_stats internal');
  perform t.denied(format('select staff_unlocks_for(%L)', t.u('hp')), '0020: staff_unlocks_for internal');
  perform t.denied(format('select legendary_for(%L)', t.u('hp')), '0020: legendary_for internal');
end $$;
:as_anon
do $$ begin
  perform t.denied('select my_staff_rewards()', '0020: anon can''t call my_staff_rewards');
  perform t.denied('select hero_board()', '0020: anon can''t call hero_board');
  perform t.denied(format('select crown_hero(%L, '''')', gen_random_uuid()), '0020: anon can''t call crown_hero');
end $$;
-- an admin: Council basics, can't crown or grant
:as_ha
do $$ declare r json;
begin
  r := my_staff_rewards();
  perform t.ok(r is not null and not (r->>'isHero')::boolean and (r->>'heroCount')::int = 0, '0020: admin gets staff rewards (not hero yet)');
  perform t.eq((select string_agg(x->>'id', ',') from json_array_elements(r->'badges') x), 'gatekeeper,town_crier,event_host,hero_week,council_legend', '0020: Council badges in order');
  perform t.eq((select array_agg(x) from json_array_elements_text(r->'unlocks') x), array['council_chamber'], '0020: new admin has just the Council Chamber');
  perform t.throws('select equip_look(''hero_crown'', null, null)', 'locked', '0020: admin can''t wear the Hero''s Crown without being hero');
  perform t.throws('select equip_look(null, ''royal_scepter'', null)', 'locked', '0020: granted item locked until granted');
  perform t.throws('select update_profile(null, ''golden_yak'', null)', 'avatar', '0020: admin without Legend/MVP can''t pick the Golden Yak');
  perform t.throws(format('select crown_hero(%L, '''')', t.u('ha')), 'forbidden', '0020: admin can''t crown');
  perform t.throws('select clear_hero()', 'forbidden', '0020: admin can''t clear');
  perform t.throws(format('select grant_staff_reward(%L, ''royal_scepter'')', t.u('ha')), 'forbidden', '0020: admin can''t grant');
  perform t.ok((hero_board()->'current')::text = 'null', '0020: no hero yet');
  perform equip_look(null, null, 'council_chamber');
  perform t.pass('0020: admin can wear the Council Chamber');
end $$;
-- automatic unlocks at the thresholds (all-time staff work)
:as_super
insert into submissions (cycle_id, user_id, activity_id, image_path, status, reviewer_id, review_reason, reviewed_at)
  select active_cycle_id(), t.u('hp'), 'repost', 'x/' || g || '.jpg', 'rejected', t.u('ha'), 'test', now() from generate_series(1, 24) g;
insert into announcements (title, body, audience, created_by) select 'Hello ' || g, 'body', 'all', t.u('ha') from generate_series(1, 4) g;
insert into events (title, campus, kind, location, starts_at, ends_at, activity_id, attendee_count, created_by)
  select 'Hosted ' || g, 'duke', 'active', 'Quad', now() - interval '3 hours', now() - interval '2 hours', 'home_event', case when g = 3 then 4 else 5 end, t.u('ha')
    from generate_series(1, 3) g;
:as_ha
do $$ declare r json := my_staff_rewards();
begin
  perform t.ok((select (x->>'progress')::int = 24 and not (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'gatekeeper'), '0020: Gatekeeper 24/25 not yet');
  perform t.ok((select (x->>'progress')::int = 4 and not (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'town_crier'), '0020: Town Crier 4/5 not yet');
  perform t.ok((select (x->>'progress')::int = 2 and not (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'event_host'), '0020: Event Host 2/3 (an event with 4 check-ins doesn''t count)');
  perform t.ok(not exists (select 1 from json_array_elements_text(r->'unlocks') x where x in ('gatekeeper_monocle', 'heralds_horn', 'host_top_hat')), '0020: no auto unlocks below the thresholds');
end $$;
:as_super
insert into submissions (cycle_id, user_id, activity_id, image_path, status, reviewer_id, review_reason, reviewed_at)
  values (active_cycle_id(), t.u('hp'), 'repost', 'x/25.jpg', 'approved', t.u('ha'), null, now());
insert into submissions (cycle_id, user_id, activity_id, image_path, status, reviewer_id) values (active_cycle_id(), t.u('hp'), 'repost', 'x/p.jpg', 'pending', t.u('ha'));
insert into announcements (title, body, audience, created_by) values ('Hello 5', 'body', 'all', t.u('ha'));
update events set attendee_count = 5 where title = 'Hosted 3' and created_by = t.u('ha');
:as_ha
do $$ declare r json := my_staff_rewards();
begin
  perform t.ok((select (x->>'progress')::int = 25 and (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'gatekeeper'), '0020: Gatekeeper at 25 reviews (pending ones don''t count)');
  perform t.ok((select (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'town_crier'), '0020: Town Crier at 5 announcements');
  perform t.ok((select (x->>'progress')::int = 3 and (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'event_host'), '0020: Event Host at 3 events with 5+ check-ins');
  perform t.eq((select array_agg(x) from json_array_elements_text(r->'unlocks') x), array['host_top_hat', 'gatekeeper_monocle', 'heralds_horn', 'council_chamber'], '0020: auto unlocks at the thresholds');
  perform t.ok((select (x->>'progress')::int = 3 and not (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'council_legend'), '0020: Council Legend 3/4 before being hero');
  perform t.ok(not (r->>'legendary')::boolean, '0020: no Golden Yak before Council Legend');
  perform equip_look('host_top_hat', 'gatekeeper_monocle', 'council_chamber');
  perform t.pass('0020: admin wears earned Council items');
end $$;
-- the chair crowns heroes
:as_hc
do $$ declare b json;
begin
  perform t.throws(format('select crown_hero(%L, '''')', t.u('hp')), 'not_staff', '0020: participants can''t be crowned');
  perform t.throws(format('select crown_hero(%L, %L)', t.u('ha'), repeat('x', 121)), 'note', '0020: note max 120');
  perform t.throws('select clear_hero()', 'not_found', '0020: nothing to clear yet');
  perform crown_hero(t.u('ha'), '  ran the pickleball check-in table ');
  b := hero_board();
  perform t.ok((b->'current'->>'userId')::uuid = t.u('ha') and b->'current'->>'note' = 'ran the pickleball check-in table'
               and b->'current'->>'displayName' = 'Hero Admin A' and b->'current'->>'crownedByName' = 'Hero Chair', '0020: chair crowned ha (note trimmed)');
  perform t.ok((select (x->>'isHero')::boolean and (x->>'heroCount')::int = 1 from json_array_elements(b->'team') x where (x->>'userId')::uuid = t.u('ha')), '0020: hero_board team row shows the hero');
  perform t.ok(not exists (select 1 from json_array_elements(b->'team') x where (x->>'userId')::uuid = t.u('hp')), '0020: hero_board team lists staff only');
end $$;
:as_super
do $$ begin
  perform t.ok(exists (select 1 from notifications where user_id = t.u('ha') and kind = 'hero_crowned' and title = 'You’re Hero of the Week!' and body = 'ran the pickleball check-in table'), '0020: hero notified');
  perform t.ok(exists (select 1 from admin_actions where action = 'hero_crowned' and actor_id = t.u('hc') and target_user_id = t.u('ha') and details->>'note' = 'ran the pickleball check-in table'), '0020: crowning logged');
end $$;
:as_ha
do $$ declare r json := my_staff_rewards();
begin
  perform t.ok((r->>'isHero')::boolean and (r->>'heroCount')::int = 1, '0020: ha is hero ×1');
  perform t.ok((select count(*) from json_array_elements_text(r->'unlocks') x where x in ('hero_crown', 'hero_cape', 'hall_of_heroes')) = 3, '0020: hero perks unlocked while reigning');
  perform t.ok((r->>'legendary')::boolean and (select (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'council_legend'), '0020: Council Legend earned → Golden Yak unlocked');
  perform equip_look('hero_crown', 'hero_cape', 'hall_of_heroes');
  perform t.pass('0020: hero wears the crown, cape and hall');
  perform t.eq((update_profile(null, 'golden_yak', null)).avatar, 'golden_yak', '0020: Council Legend can pick the Golden Yak');
  perform t.eq((select normal_avatar from profiles where id = auth.uid()), 'ranger', '0020: previous character remembered');
end $$;
-- crowning someone else moves the perks
:as_hc
select crown_hero(t.u('hb'), '') \g /dev/null
:as_super
do $$ begin
  perform t.ok((select hat is null and accessory is null and background is null from profiles where id = t.u('ha')), '0020: old hero''s crown/cape/hall taken off');
  perform t.ok(not ('hero_crown' = any (staff_unlocks_for(t.u('ha')))) and 'hero_crown' = any (staff_unlocks_for(t.u('hb'))), '0020: perks moved to the new hero');
  perform t.eq((select count(*) from hero_reigns where ended_at is null), 1::bigint, '0020: one current hero');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('hb') and kind = 'hero_crowned' and body = 'Hero Chair crowned you at the YAC meeting. Thank you!'), '0020: default hero message');
end $$;
:as_hb
select equip_look('hero_crown', null, null) \g /dev/null
:as_hc
select crown_hero(t.u('ha'), 'again!') \g /dev/null
do $$ declare b json := hero_board();
begin
  perform t.ok((select (x->>'heroCount')::int = 2 from json_array_elements(b->'team') x where (x->>'userId')::uuid = t.u('ha')), '0020: hero count increments (×2)');
  perform t.eq((select string_agg(x->>'displayName', ',') from json_array_elements(b->'history') x), 'Hero Admin A,Hero Admin B,Hero Admin A', '0020: Hall of Heroes newest first');
  perform t.ok((select hat is null from profiles where id = t.u('hb')), '0020: hb''s crown taken off when ha is re-crowned');
  perform clear_hero();
  perform t.ok((hero_board()->'current')::text = 'null', '0020: clear_hero ends the reign');
  perform t.throws('select clear_hero()', 'not_found', '0020: clearing twice');
end $$;
:as_ha
do $$ declare r json := my_staff_rewards();
begin
  perform t.ok(not (r->>'isHero')::boolean and (r->>'heroCount')::int = 2, '0020: after clear: not hero, count kept');
  perform t.ok((select (x->>'progress')::int = 2 and (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'hero_week'), '0020: Hero of the Week badge shows ×2');
  perform t.throws('select equip_look(''hero_crown'', null, null)', 'locked', '0020: hero items locked again after the reign');
  perform t.ok((r->>'legendary')::boolean, '0020: Council Legend (and the Golden Yak) is permanent');
end $$;
:as_super
do $$ begin
  perform t.ok(exists (select 1 from admin_actions where action = 'hero_cleared' and actor_id = t.u('hc') and target_user_id = t.u('ha')), '0020: clear logged');
end $$;
-- Council MVP + chair grants
:as_hc
do $$ begin
  perform t.throws(format('select grant_staff_reward(%L, ''council_mvp'')', t.u('hp')), 'not_staff', '0020: can''t grant to a participant');
  perform t.throws(format('select grant_staff_reward(%L, ''sparkles'')', t.u('hb')), 'reward', '0020: unknown reward');
  perform grant_staff_reward(t.u('hb'), 'council_mvp');
  perform grant_staff_reward(t.u('hb'), 'royal_scepter');
  perform t.throws(format('select grant_staff_reward(%L, ''council_mvp'')', t.u('hb')), 'already', '0020: granting twice');
  perform t.ok((select (x->>'legendary')::boolean and (x->'grants')::jsonb @> '["council_mvp","royal_scepter"]'::jsonb from json_array_elements(hero_board()->'team') x where (x->>'userId')::uuid = t.u('hb')), '0020: hero_board shows grants + legendary');
end $$;
:as_super
do $$ begin
  perform t.ok(exists (select 1 from admin_actions where action = 'staff_reward_granted' and target_user_id = t.u('hb') and details->>'reward' = 'council_mvp'), '0020: MVP grant logged');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('hb') and kind = 'staff_reward' and title = 'Council MVP: the Golden Yak is yours!'), '0020: MVP notified');
end $$;
:as_hb
do $$ declare r json := my_staff_rewards();
begin
  perform t.ok((r->>'legendary')::boolean and not (select (x->>'earned')::boolean from json_array_elements(r->'badges') x where x->>'id' = 'council_legend'), '0020: MVP grant unlocks the Golden Yak without Council Legend');
  perform t.ok('royal_scepter' = any (array(select json_array_elements_text(r->'unlocks'))), '0020: granted item unlocked');
  perform t.eq((update_profile(null, 'golden_yak', null)).avatar, 'golden_yak', '0020: MVP can pick the Golden Yak');
  perform equip_look(null, 'royal_scepter', 'council_chamber');
end $$;
:as_hc
select crown_hero(t.u('hb'), 'MVP week') \g /dev/null
-- staff looks never reach participants
:as_hp
do $$ begin
  perform t.ok(not exists (select 1 from leaderboard(1000) l where l.avatar = 'golden_yak'
                            or l.hat in (select id from t.staff_items) or l.accessory in (select id from t.staff_items) or l.background in (select id from t.staff_items)), '0020: leaderboard never shows staff looks');
  perform t.ok(not exists (select 1 from leaderboard(1000) l join profiles p on p.id = l.user_id where p.role <> 'participant'), '0020: leaderboard lists participants only');
  perform t.ok(coalesce((monthly_shoutout()->>'userId')::uuid, gen_random_uuid()) not in (t.u('ha'), t.u('hb'), t.u('hc')), '0020: shout-out never a staff member');
  perform t.ok(not exists (select 1 from notifications n where n.kind in ('hero_crowned', 'staff_reward')), '0020: participant sees no staff notifications');
end $$;
-- back to participant: looks + Golden Yak off, reign ends, history kept
:as_hc
select set_role(t.u('hb'), 'participant') \g /dev/null
:as_super
do $$ begin
  perform t.ok((select avatar = 'knight' and hat is null and accessory is null and background is null from profiles where id = t.u('hb')), '0020: demoted → Golden Yak back to knight, staff items off');
  perform t.ok(not exists (select 1 from hero_reigns where user_id = t.u('hb') and ended_at is null), '0020: demoted hero''s reign ends');
  perform t.ok(exists (select 1 from admin_actions where action = 'hero_cleared' and target_user_id = t.u('hb') and details->>'reason' = 'role_changed'), '0020: reign end logged');
  perform t.eq((select count(*) from staff_grants where user_id = t.u('hb')), 2::bigint, '0020: grants kept');
end $$;
:as_hb
do $$ begin
  perform t.ok(my_staff_rewards() is null, '0020: demoted → no staff rewards');
  perform t.throws('select equip_look(null, ''royal_scepter'', null)', 'look', '0020: demoted → can''t equip staff items');
  perform t.throws('select update_profile(null, ''golden_yak'', null)', 'avatar', '0020: demoted → can''t pick the Golden Yak');
end $$;
:as_hc
select set_role(t.u('hb'), 'admin') \g /dev/null
:as_hb
do $$ declare r json := my_staff_rewards();
begin
  perform t.ok((r->>'legendary')::boolean and (r->>'heroCount')::int = 2 and 'royal_scepter' = any (array(select json_array_elements_text(r->'unlocks'))), '0020: staff again → everything is back');
end $$;
-- 0021: Council team board (staff only, view-only)
:as_hc
select crown_hero(t.u('hb'), 'board test') \g /dev/null
:as_hb
select equip_look(null, 'royal_scepter', null) \g /dev/null
:as_hp
do $$ begin
  perform t.throws('select council_board()', 'forbidden', '0021: participant can''t read the Council board');
end $$;
:as_anon
do $$ begin
  perform t.denied('select council_board()', '0021: anon can''t call council_board');
end $$;
:as_ha
do $$ declare b json := council_board(); r json; v_first text; v_chairs_before_admins boolean;
begin
  perform t.ok(not exists (select 1 from json_array_elements(b) x join profiles p on p.id = (x->>'userId')::uuid where p.role = 'participant'), '0021: staff only on the board');
  perform t.eq((b->0->>'userId')::uuid, t.u('hb'), '0021: reigning hero first');
  perform t.ok(not exists (
      select 1 from json_array_elements(b) with ordinality a(x, i), json_array_elements(b) with ordinality c(y, j)
       where a.i > 1 and c.j > a.i and a.x->>'role' = 'admin' and c.y->>'role' = 'chair'), '0021: then chairs before admins');
  select x into r from json_array_elements(b) x where (x->>'userId')::uuid = t.u('ha');
  perform t.eq((select string_agg(y->>'id', ',') from json_array_elements(r->'badges') y), 'gatekeeper,town_crier,event_host,hero_week,council_legend', '0021: badges in order');
  perform t.ok((select (y->>'progress')::int = 25 and (y->>'earned')::boolean from json_array_elements(r->'badges') y where y->>'id' = 'gatekeeper'), '0021: Gatekeeper 25/25');
  perform t.ok((select (y->>'progress')::int = 2 from json_array_elements(r->'badges') y where y->>'id' = 'hero_week'), '0021: hero ×2');
  perform t.eq((r->>'unlockCount')::int, 4, '0021: ha has 4 Council items (top hat, monocle, horn, chamber)');
  perform t.ok((r->>'legendary')::boolean and not (r->>'isHero')::boolean and r->>'avatar' = 'golden_yak' and r->>'role' = 'admin', '0021: legendary, look and role');
  select x into r from json_array_elements(b) x where (x->>'userId')::uuid = t.u('hb');
  perform t.ok((r->>'isHero')::boolean and (r->>'unlockCount')::int = 5 and r->>'accessory' = 'royal_scepter', '0021: hb hero with 5 items (chamber, scepter, 3 perks) and look');
end $$;

-- tidy: nobody stays a Golden Yak (0007 re-runs would refuse it)
:as_super
update profiles set avatar = coalesce(normal_avatar, 'yak') where avatar = 'golden_yak';
do $$ begin
  perform t.eq((select count(*) from profiles where avatar = 'golden_yak'), 0::bigint, '0020: test leaves no Golden Yak behind');
end $$;

-- =============================================================================
-- 26. 0022 — Event RSVPs, monthly check-in streaks, Hot Streak badge, my_recap
--     (fresh cycle; everything rolled back afterwards)
-- =============================================================================
:as_super
create function t.at22(k int, h int) returns timestamptz language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/New_York') + make_interval(months => k, hours => h))
         at time zone 'America/New_York';
$$;
-- a check-in ledger row k months from now (k = 0 → this month)
create function t.ci(p_user text, k int, p_cycle uuid default null) returns void language sql as $$
  insert into public.ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason, created_at)
  values (coalesce(p_cycle, public.active_cycle_id()), t.u(p_user), 20, 'checkin', 'home_event', gen_random_uuid()::text, 'streak test', t.at22(k, 30));
$$;
begin;
update profiles set role = 'participant' where id in (t.u('alice'), t.u('carol'), t.u('erin'), t.u('dave')) and role <> 'participant';
update cycles set is_active = false where is_active;
insert into cycles (name, starts_at, ends_at, is_active) values ('RSVP test cycle', now() - interval '200 days', now() + interval '30 days', true);
insert into events (id, cycle_id, title, campus, kind, location, starts_at, ends_at, activity_id) values
  ('00000000-0000-0000-0000-0000000022e1', active_cycle_id(), 'RSVP Mixer',     'duke', 'active', 'Quad', now() + interval '2 days', now() + interval '2 days 2 hours', 'home_event'),
  ('00000000-0000-0000-0000-0000000022e2', active_cycle_id(), 'Started Social', 'unc',  'active', 'Pit',  now() - interval '1 hour', now() + interval '1 hour', 'home_event'),
  ('00000000-0000-0000-0000-0000000022e3', active_cycle_id(), 'Past Panel',     'ncsu', 'active', 'Hall', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 'home_event'),
  ('00000000-0000-0000-0000-0000000022e4', (select id from cycles where not is_active order by starts_at limit 1), 'Old cycle event', 'duke', 'active', 'X', now() + interval '1 day', now() + interval '1 day 1 hour', 'home_event'),
  ('00000000-0000-0000-0000-0000000022e5', active_cycle_id(), 'Soon <Social>',  'unc',  'active', 'Pit',  now() + interval '3 days', now() + interval '3 days 2 hours', 'home_event'),
  ('00000000-0000-0000-0000-0000000022e6', active_cycle_id(), 'Far Gala',       'all',  'high_impact', 'Durham', now() + interval '10 days', now() + interval '10 days 3 hours', 'cross_campus_event');
-- the past event: alice + carol RSVP'd before it started; only alice came
insert into event_rsvps (event_id, user_id, created_at) values
  ('00000000-0000-0000-0000-0000000022e3', t.u('alice'), now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000022e3', t.u('carol'), now() - interval '4 days');
insert into ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason, created_at)
values (active_cycle_id(), t.u('alice'), 20, 'checkin', 'home_event', '00000000-0000-0000-0000-0000000022e3', 'Checked in: Past Panel', now() - interval '3 days');

:as_alice
do $$ declare r json; s json;
begin
  r := set_rsvp('00000000-0000-0000-0000-0000000022e1', true);
  perform t.ok((r->>'going')::boolean and (r->>'goingCount')::int = 1 and (r->>'eventId')::uuid = '00000000-0000-0000-0000-0000000022e1', '0022: RSVP on → going, count 1');
  r := set_rsvp('00000000-0000-0000-0000-0000000022e1', true);
  perform t.eq((r->>'goingCount')::int, 1, '0022: RSVP twice is idempotent');
  perform t.throws('select set_rsvp(''00000000-0000-0000-0000-0000000022e2'', true)', 'closed', '0022: can''t RSVP after the event starts');
  perform t.throws('select set_rsvp(''00000000-0000-0000-0000-0000000022e2'', false)', 'closed', '0022: can''t un-RSVP after the event starts either');
  perform t.throws('select set_rsvp(''00000000-0000-0000-0000-0000000022e4'', true)', 'not_found', '0022: other cycle''s event');
  perform t.throws(format('select set_rsvp(%L, true)', gen_random_uuid()), 'not_found', '0022: unknown event');
  perform t.throws('select set_rsvp(''00000000-0000-0000-0000-0000000022e1'', null)', 'going', '0022: going is required');
  perform t.throws('select * from admin_event_rsvps(''00000000-0000-0000-0000-0000000022e1'')', 'forbidden', '0022: participant can''t see who''s going');
  perform t.throws('select * from admin_event_rsvp_counts()', 'forbidden', '0022: participant can''t read RSVP counts per person');
  s := event_rsvp_summary();
  perform t.eq(json_array_length(s), 5, '0022: summary lists the active cycle''s events only');
  perform t.ok((select (x->>'myRsvp')::boolean and (x->>'goingCount')::int = 1 from json_array_elements(s) x where x->>'eventId' = '00000000-0000-0000-0000-0000000022e1'), '0022: summary: my RSVP + count');
  perform t.ok((select not (x->>'myRsvp')::boolean and (x->>'goingCount')::int = 0 from json_array_elements(s) x where x->>'eventId' = '00000000-0000-0000-0000-0000000022e5'), '0022: summary: not going, 0');
  perform t.eq((select count(*) from event_rsvps), 2::bigint, '0022: participant reads only their own RSVPs (RLS)');
  perform t.denied(format('insert into event_rsvps (event_id, user_id) values (%L, %L)', '00000000-0000-0000-0000-0000000022e5', auth.uid()), '0022: no direct inserts');
  perform t.denied('delete from event_rsvps', '0022: no direct deletes');
end $$;
:as_carol
do $$ declare r json;
begin
  r := set_rsvp('00000000-0000-0000-0000-0000000022e1', true);
  perform t.eq((r->>'goingCount')::int, 2, '0022: second person → 2 going');
  perform t.eq((select count(*) from event_rsvps where user_id = t.u('alice')), 0::bigint, '0022: can''t read someone else''s RSVPs');
  r := set_rsvp('00000000-0000-0000-0000-0000000022e1', false);
  perform t.ok(not (r->>'going')::boolean and (r->>'goingCount')::int = 1, '0022: toggle off → 1 going');
  perform t.ok((select not (x->>'myRsvp')::boolean and (x->>'goingCount')::int = 1 from json_array_elements(event_rsvp_summary()) x where x->>'eventId' = '00000000-0000-0000-0000-0000000022e1'), '0022: summary after toggle off');
end $$;
:as_anon
do $$ begin
  perform t.denied('select set_rsvp(''00000000-0000-0000-0000-0000000022e1'', true)', '0022: anon can''t RSVP');
  perform t.denied('select event_rsvp_summary()', '0022: anon can''t read RSVP counts');
  perform t.denied('select my_recap()', '0022: anon can''t call my_recap');
  perform t.denied('select my_streak()', '0022: anon can''t call my_streak');
end $$;
:as_chair1
do $$ declare rep json; n int;
begin
  perform t.eq((select string_agg(handle || ':' || email || ':' || checked_in, ',') from admin_event_rsvps('00000000-0000-0000-0000-0000000022e1')),
               'alice:alice@example.edu:false', '0022: staff see who''s going (name, email, not checked in yet)');
  perform t.eq((select string_agg(handle || ':' || checked_in, ',' order by rsvp_at) from admin_event_rsvps('00000000-0000-0000-0000-0000000022e3')),
               'alice:true,carol:false', '0022: past event: who came ✓, oldest RSVP first');
  perform t.ok((select going = 2 and going_came = 1 from admin_event_rsvp_counts() where event_id = '00000000-0000-0000-0000-0000000022e3'), '0022: counts: 2 going, 1 came (1 RSVP''d but didn''t come)');
  perform t.throws(format('select * from admin_event_rsvps(%L)', gen_random_uuid()), 'not_found', '0022: admin_event_rsvps unknown event');
  perform t.eq((set_rsvp('00000000-0000-0000-0000-0000000022e1', true)->>'goingCount')::int, 2, '0022: staff can RSVP too');
  perform t.denied('select * from checkin_streak(auth.uid())', '0022: checkin_streak is internal');
  rep := weekly_report_preview();
  perform t.ok(rep->>'text' like '%FEEDBACK (last 7 days)%📅 NEXT 7 DAYS (RSVPs): RSVP Mixer (% · 2 going; Soon <Social> (% · 0 going%THIS WEEK (since Monday)%', '0022: weekly email: next-7-days RSVP line (text, before This week)');
  perform t.ok(rep->>'text' not like '%Far Gala%' and rep->>'text' not like '%Started Social%' and rep->>'text' not like '%Old cycle event%', '0022: weekly line: only events starting in the next 7 days');
  perform t.ok(rep->>'html' like '%Next 7 days (RSVPs):</b> <b>RSVP Mixer</b> (%) · 2 going; <b>Soon &lt;Social&gt;</b>%', '0022: weekly line in HTML (escaped)');
  perform t.ok(rep->>'text' like '%🐂 Yak of the week:%', '0022: rest of the weekly report unchanged (yak footer)');
end $$;

-- Streaks: months are America/New_York calendar months of the active cycle
:as_super
select t.ci('erin', -4), t.ci('erin', -3), t.ci('erin', -1) \g /dev/null
-- don't count: a manual award this month, and a check-in from another cycle this month
insert into ledger (cycle_id, user_id, amount, source, reason, created_at) values (active_cycle_id(), t.u('erin'), 5, 'manual', 'not a check-in', t.at22(0, 30));
select t.ci('erin', 0, (select id from cycles where not is_active order by starts_at limit 1)) \g /dev/null
:as_erin
do $$ declare s json;
begin
  s := my_streak();
  perform t.ok((s->>'current')::int = 1 and (s->>'best')::int = 2 and not (s->>'checkedInThisMonth')::boolean,
               '0022: streak: gap resets; no check-in this month yet → current counts through last month (1), best 2');
  perform t.ok((select not earned and progress = 2 and goal = 3 from my_badges() where id = 'hot_streak'), '0022: hot_streak 2/3');
end $$;
:as_super
select t.ci('erin', 0) \g /dev/null
:as_erin
do $$ declare s json;
begin
  s := my_streak();
  perform t.ok((s->>'current')::int = 2 and (s->>'best')::int = 2 and (s->>'checkedInThisMonth')::boolean, '0022: streak: checked in this month → 2, this month true');
end $$;
:as_super
select t.ci('erin', -2), t.ci('erin', -2) \g /dev/null
:as_erin
do $$ declare s json; r json;
begin
  s := my_streak();
  perform t.ok((s->>'current')::int = 5 and (s->>'best')::int = 5, '0022: filling the gap → 5 months in a row (two check-ins in one month count once)');
  perform t.ok((select earned and progress = 3 and goal = 3 from my_badges() where id = 'hot_streak'), '0022: Hot Streak earned (progress capped at 3)');
  r := my_recap();
  perform t.ok((r->>'currentStreak')::int = 5 and (r->>'bestStreak')::int = 5, '0022: recap streaks');
  perform t.eq((r->>'eventsAttended')::int, 6, '0022: recap: events attended this cycle (other cycle ignored)');
  perform t.ok((r->'earnedBadgeIds')::jsonb ? 'hot_streak' and (r->>'badgesEarned')::int = jsonb_array_length((r->'earnedBadgeIds')::jsonb), '0022: recap badges include Hot Streak');
end $$;
:as_super
select t.ci('dave', -3) \g /dev/null
:as_dave
do $$ declare s json;
begin
  s := my_streak();
  perform t.ok((s->>'current')::int = 0 and (s->>'best')::int = 1 and not (s->>'checkedInThisMonth')::boolean, '0022: streak: last check-in 3 months ago → current 0, best 1');
end $$;

-- my_recap: own stats only, participant vs staff
:as_super
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000022a0', 'newbie22@example.edu', now(), '{"handle":"newbie22","display_name":"Newbie","campus":"unc","avatar":"unicorn"}');
\set as_newbie22 'reset role; set request.jwt.claim.role = ''authenticated''; set request.jwt.claim.sub = ''00000000-0000-0000-0000-0000000022a0''; set role authenticated;'
:as_alice
do $$ declare r json; d json := dashboard_stats();
begin
  r := my_recap();
  perform t.ok(r->>'displayName' = (select display_name from profiles where id = t.u('alice')) and r->>'handle' = 'alice' and r->>'campus' = 'duke' and r->>'role' = 'participant', '0022: recap is the caller''s own');
  perform t.eq((r->>'points')::int, (select points from profiles where id = auth.uid()), '0022: recap points = profile points');
  perform t.ok((r->>'rankOverall')::int = (d->>'rankOverall')::int and (r->>'rankCampus')::int = (d->>'rankCampus')::int, '0022: recap ranks match the dashboard');
  perform t.ok((r->>'participants')::int = (d->>'participants')::int and (r->>'campusParticipants')::int between 1 and (r->>'participants')::int - 1, '0022: recap participant counts');
  perform t.ok(not ((r)::jsonb ? 'councilBadges'), '0022: participant recap has no staff info');
  perform t.ok((r->>'eventsAttended')::int = 1 and (r->>'badgeTotal')::int = 16 and (r->>'badgesEarned')::int = (select count(*) from my_badges() where earned), '0022: recap events + badges');
  perform t.ok(r->>'cycleName' = 'RSVP test cycle' and (r->>'monthWins')::int >= 0, '0022: recap cycle + month wins');
  perform t.eq((select count(*) from pg_proc where proname = 'my_recap' and pronamespace = 'public'::regnamespace and pronargs = 0), 1::bigint, '0022: my_recap takes no user argument');
  perform t.eq((select count(*) from pg_proc where proname = 'my_recap' and pronamespace = 'public'::regnamespace), 1::bigint, '0022: no other my_recap overload (can''t read someone else''s)');
end $$;
:as_newbie22
do $$ declare r json;
begin
  r := my_recap();
  perform t.ok((r->>'points')::int = 0 and (r->>'badgesEarned')::int = 0 and (r->>'eventsAttended')::int = 0
               and (r->>'bestStreak')::int = 0 and (r->>'currentStreak')::int = 0 and json_array_length(r->'earnedBadgeIds') = 0
               and (r->>'rankOverall')::int >= 1, '0022: brand-new user recap works (all zeros)');
  perform t.ok((my_streak()->>'best')::int = 0, '0022: brand-new user streak 0');
end $$;
:as_chair1
do $$ declare r json := my_recap();
begin
  perform t.ok(r->>'role' = 'chair' and (r)::jsonb ? 'councilBadges' and (r->>'councilBadges')::int >= 0, '0022: staff recap shows Council badges');
  perform t.ok(not ((r)::jsonb ? 'rankOverall') and not ((r)::jsonb ? 'rankCampus'), '0022: staff recap has no rank');
end $$;
:as_super
rollback;
drop function t.ci(text, int, uuid);
drop function t.at22(int, int);

-- =============================================================================
-- 27. 0023 — the chair role reads "YACquest Chair" in server messages; error codes unchanged
--     (everything rolled back afterwards)
-- =============================================================================
:as_super
begin;
update profiles set role = 'admin' where id = t.u('admin');
update profiles set role = 'participant' where id = t.u('alice');
:as_admin
do $$ declare v_msg text;
begin
  begin
    perform clear_hero();
  exception when others then v_msg := sqlerrm;
  end;
  perform t.eq(v_msg, 'forbidden: Only a YACquest Chair can do that.', '0023: chair-only call by an admin → forbidden + "YACquest Chair"');
  perform t.ok(split_part(v_msg, ':', 1) = 'forbidden' and v_msg like '%YACquest Chair%', '0023: code kept, message names the YACquest Chair');
  v_msg := null;
  begin
    perform step_down_chair();
  exception when others then v_msg := sqlerrm;
  end;
  perform t.eq(v_msg, 'forbidden: Only a YACquest Chair can do that.', '0023: step_down_chair by an admin → same forbidden message');
end $$;
:as_alice
do $$ declare v_msg text;
begin
  begin
    perform * from admin_event_rsvps(gen_random_uuid());
  exception when others then v_msg := sqlerrm;
  end;
  perform t.eq(v_msg, 'forbidden: Only admins and YACquest Chairs can see who’s going.', '0023: participant RSVP list → forbidden + "YACquest Chairs"');
end $$;
:as_super
do $$
begin
  perform t.eq((select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prosrc ~* 'YAC chair'), 0::bigint,
               '0023: no public function still says "YAC chair"');
end $$;
rollback;

-- =============================================================================
-- 28. 0024 — RSVP reminders (fixed dates) + quick game-win award (everything rolled back afterwards)
-- =============================================================================
:as_super
begin;
update profiles set role = 'participant' where id in (t.u('alice'), t.u('carol'), t.u('erin'), t.u('bob'));
update profiles set role = 'admin' where id = t.u('admin');
update profiles set role = 'chair' where id = t.u('chair1');
update profiles set email_opt_in = true  where id in (t.u('alice'), t.u('carol'), t.u('chair1'), t.u('bob'));
update profiles set email_opt_in = false where id = t.u('erin');
insert into events (id, cycle_id, title, campus, kind, location, starts_at, ends_at, activity_id) values
  ('00000000-0000-0000-0000-0000000024e1', active_cycle_id(), 'Pickleball', 'duke', 'active', 'Wilson Courts', '2030-03-14 14:00-04', '2030-03-14 16:00-04', 'home_event'),
  ('00000000-0000-0000-0000-0000000024e2', active_cycle_id(), 'Late Gala',  'all',  'high_impact', 'Durham', '2030-03-14 15:30-04', '2030-03-14 18:00-04', 'cross_campus_event'),
  ('00000000-0000-0000-0000-0000000024e3', active_cycle_id(), 'Started Mixer', 'unc', 'active', 'Pit', '2030-03-14 12:30-04', '2030-03-14 14:30-04', 'home_event'),
  ('00000000-0000-0000-0000-0000000024e4', active_cycle_id(), 'Gone Social', 'unc', 'active', 'Pit', '2030-03-14 15:40-04', '2030-03-14 17:00-04', 'home_event');
insert into event_rsvps (event_id, user_id) values
  ('00000000-0000-0000-0000-0000000024e1', t.u('alice')),
  ('00000000-0000-0000-0000-0000000024e1', t.u('carol')),
  ('00000000-0000-0000-0000-0000000024e1', t.u('chair1')),
  ('00000000-0000-0000-0000-0000000024e1', t.u('erin')),
  ('00000000-0000-0000-0000-0000000024e2', t.u('alice')),
  ('00000000-0000-0000-0000-0000000024e3', t.u('alice')),
  ('00000000-0000-0000-0000-0000000024e4', t.u('bob'));
-- carol already checked in to Pickleball (check-in opens 30 min early)
insert into ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason)
values (active_cycle_id(), t.u('carol'), 20, 'checkin', 'home_event', '00000000-0000-0000-0000-0000000024e1', 'Checked in: Pickleball');

:as_alice
do $$ begin
  perform t.denied('select queue_event_reminders(''2030-03-14 13:00-04'')', '0024: participants can''t run the reminder job');
end $$;
:as_admin
do $$ begin
  perform t.denied('select queue_event_reminders()', '0024: admins can''t run the reminder job either');
end $$;
:as_service
do $$ begin
  perform t.eq(queue_event_reminders('2030-03-14 11:00-04'), 0, '0024: 90+ min before every event → too early, nothing queued');
  perform t.eq(queue_event_reminders('2030-03-14 13:00-04'), 3, '0024: 1 h before → alice, erin and the chair (staff included); not carol (checked in)');
  perform t.eq(queue_event_reminders('2030-03-14 13:00-04'), 0, '0024: same run again → no duplicates');
  perform t.eq(queue_event_reminders('2030-03-14 13:10-04'), 0, '0024: 10 minutes later → still no duplicates');
end $$;
:as_super
do $$ begin
  perform t.eq((select count(*) from event_reminders_sent where event_id = '00000000-0000-0000-0000-0000000024e1'), 3::bigint, '0024: 3 reminders recorded for Pickleball');
  perform t.eq((select count(*) from notifications where kind = 'event_reminder' and user_id = t.u('alice')), 1::bigint, '0024: alice: one reminder notification');
  perform t.ok((select title = '⏰ Starts in 1 hour: Pickleball at Wilson Courts'
                       and body = 'Pickleball starts at 2:00 PM at Wilson Courts. Check in at the event to earn 20 points.'
                  from notifications where kind = 'event_reminder' and user_id = t.u('alice')), '0024: reminder title + body (Eastern time, event points)');
  perform t.eq((select count(*) from notifications where kind = 'event_reminder' and user_id = t.u('carol')), 0::bigint, '0024: carol checked in → no reminder');
  perform t.eq((select count(*) from notifications where kind = 'event_reminder' and user_id = t.u('chair1')), 1::bigint, '0024: staff who RSVP''d get one too');
  perform t.eq((select count(*) from email_outbox where kind = 'event_reminder'), 2::bigint, '0024: emails only for alice + chair (erin has email updates off)');
  perform t.ok((select to_emails = array['alice@example.edu'] and subject = 'Reminder: Pickleball starts at 2:00 PM'
                       and body_text like '%Where: Wilson Courts%' and body_text like '%Check in at the event to earn 20 points.%'
                       and body_text not ilike '%yak%' and body_html like '%Wilson Courts%' and status = 'pending'
                  from email_outbox where kind = 'event_reminder' and dedupe_key = 'reminder:00000000-0000-0000-0000-0000000024e1:' || t.u('alice')),
               '0024: reminder email: subject, location, points, no yak pun');
  perform t.eq((select count(*) from notifications where kind = 'event_reminder' and body like 'Started Mixer%'), 0::bigint, '0024: an event that already started gets no reminder');
end $$;
-- a deleted event gets nothing (its RSVPs go with it)
delete from events where id = '00000000-0000-0000-0000-0000000024e4';
:as_service
do $$ begin
  perform t.eq(queue_event_reminders('2030-03-14 14:25-04'), 1, '0024: Late Gala 65 min ahead → alice; deleted event skipped');
end $$;
:as_super
do $$ begin
  perform t.eq((select title || ' | ' || body from notifications where kind = 'event_reminder' and user_id = t.u('alice') and title like '%Late Gala%'),
               '⏰ Starts in 1 hour: Late Gala at Durham | Late Gala starts at 3:30 PM at Durham. Check in at the event to earn ' || tier_points(1) || ' points.',
               '0024: high-impact event → Tier 1 points in the reminder');
  perform t.eq((select count(*) from notifications where kind = 'event_reminder' and user_id = t.u('bob')), 0::bigint, '0024: no reminder for a deleted event');
end $$;
-- short notice: an event made 20 minutes ahead says "in 20 min"
insert into events (id, cycle_id, title, campus, kind, location, starts_at, ends_at, activity_id) values
  ('00000000-0000-0000-0000-0000000024e5', active_cycle_id(), 'Pop-up Trivia', 'duke', 'active', 'Bryan Center', '2030-03-15 19:20-04', '2030-03-15 20:00-04', 'home_event');
insert into event_rsvps (event_id, user_id) values ('00000000-0000-0000-0000-0000000024e5', t.u('bob'));
:as_service
do $$ begin
  perform t.eq(queue_event_reminders('2030-03-15 19:00-04'), 1, '0024: short-notice event reminded once');
end $$;
:as_super
do $$ begin
  perform t.eq((select title from notifications where kind = 'event_reminder' and user_id = t.u('bob')), '⏰ Starts in 20 min: Pop-up Trivia at Bryan Center', '0024: short notice → "in 20 min"');
end $$;
-- the send-emails run (enqueue_weekly_report_if_due, every 10 min) queues reminders on its own
insert into events (id, cycle_id, title, campus, kind, location, starts_at, ends_at, activity_id) values
  ('00000000-0000-0000-0000-0000000024e6', active_cycle_id(), 'Cron Social', 'duke', 'active', 'Quad', now() + interval '55 minutes', now() + interval '2 hours', 'home_event');
insert into event_rsvps (event_id, user_id) values ('00000000-0000-0000-0000-0000000024e6', t.u('erin'));
:as_service
select enqueue_weekly_report_if_due() \g /dev/null
:as_super
do $$ begin
  perform t.ok(exists (select 1 from event_reminders_sent where event_id = '00000000-0000-0000-0000-0000000024e6' and user_id = t.u('erin')), '0024: the every-10-minutes send-emails call queues reminders (no new cron)');
  perform t.ok(position('queue_event_reminders' in pg_get_functiondef('public.enqueue_weekly_report_if_due()'::regprocedure)) > 0, '0024: enqueue_weekly_report_if_due calls queue_event_reminders');
end $$;

-- award_game_win
:as_alice
do $$ begin
  perform t.throws('select award_game_win(''00000000-0000-0000-0000-0000000024e1'', ''00000000-0000-0000-0000-000000000ca0'')', 'forbidden', '0024: participants can''t award a game win');
end $$;
:as_anon
do $$ begin
  perform t.denied('select award_game_win(''00000000-0000-0000-0000-0000000024e1'', ''00000000-0000-0000-0000-000000000ca0'')', '0024: anon can''t call award_game_win');
end $$;
:as_admin
do $$ declare r json; v_before int := (select points from profiles where id = t.u('carol'));
begin
  perform t.throws(format('select award_game_win(%L, %L)', '00000000-0000-0000-0000-0000000024e1', t.u('alice')), 'not_checked_in', '0024: game win needs a check-in at that event');
  perform t.throws(format('select award_game_win(%L, %L)', gen_random_uuid(), t.u('carol')), 'not_found', '0024: unknown event');
  perform t.throws(format('select award_game_win(%L, %L)', '00000000-0000-0000-0000-0000000024e1', gen_random_uuid()), 'not_found', '0024: unknown person');
  r := award_game_win('00000000-0000-0000-0000-0000000024e1', t.u('carol'));
  perform t.eq((r->>'points')::int, 20, '0024: game win = Tier 2 points');
  perform t.eq((select points from profiles where id = t.u('carol')), v_before + 20, '0024: points added');
  perform t.throws(format('select award_game_win(%L, %L, %L)', '00000000-0000-0000-0000-0000000024e1', t.u('carol'), 'again'), 'duplicate', '0024: no second game win for the same event');
  perform t.throws(format('select award_game_win(%L, %L, %L)', '00000000-0000-0000-0000-0000000024e1', t.u('carol'), repeat('x', 121)), 'note', '0024: note max 120');
end $$;
:as_super
insert into ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason)
values (active_cycle_id(), t.u('erin'), 20, 'checkin', 'home_event', '00000000-0000-0000-0000-0000000024e1', 'Checked in: Pickleball');
:as_chair1
do $$ begin
  perform t.eq((award_game_win('00000000-0000-0000-0000-0000000024e1', t.u('erin'), '  Cornhole champ ')->>'points')::int, 20, '0024: chairs can award too, with a custom note');
end $$;
:as_super
do $$ begin
  perform t.ok((select created_by = t.u('admin') and amount = 20 and source = 'manual' and activity_id = 'game_win'
                       and reason = 'Win a Game or Competition: Won a game at Pickleball'
                  from ledger where user_id = t.u('carol') and activity_id = 'game_win' and ref_id = '00000000-0000-0000-0000-0000000024e1'),
               '0024: ledger row: manual game_win, ref = event, default note');
  perform t.ok(exists (select 1 from ledger where user_id = t.u('erin') and activity_id = 'game_win' and reason = 'Win a Game or Competition: Cornhole champ'), '0024: custom note trimmed into the reason');
  perform t.ok(exists (select 1 from admin_actions where action = 'points_added' and actor_id = t.u('admin') and target_user_id = t.u('carol')
                        and details->>'activityId' = 'game_win' and (details->>'amount')::int = 20), '0024: logged in the admin action log');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('carol') and kind = 'points_adjusted'
                        and title = '+20 pts — Win a Game or Competition' and body = 'Won a game at Pickleball'), '0024: winner notified');
  perform t.ok(exists (select 1 from pg_indexes where indexname = 'ledger_one_game_win'), '0024: unique index guards (person, event)');
end $$;
rollback;

-- =============================================================================
-- 29. 0025 — admin tools: bulk approve, stats, exports, templates, staff notes, undo
--     Fixed dates: a fresh test cycle from Mon 2030-01-07; admin_stats(p_now = 2030-01-25).
--     Everything is rolled back afterwards.
-- =============================================================================
:as_super
begin;
update profiles set role = 'participant' where id in (t.u('alice'), t.u('carol'), t.u('erin'), t.u('bob'));
update profiles set role = 'admin' where id = t.u('admin');
update profiles set role = 'chair' where id in (t.u('chair1'), t.u('chair2'));
update app_config set prize_goal = 350 where id = 1;
update cycles set is_active = false where is_active;
insert into cycles (id, name, starts_at, ends_at, is_active) values
  ('00000000-0000-0000-0000-000000025c00', 'Test 2030', '2030-01-07 00:00-05', '2030-06-30 00:00-04', true);
update profiles set points = 0 where points <> 0;   -- as reset_cycle() does
-- three sign-ups during the cycle (weeks of Jan 7, Jan 7, Jan 21) + a staff member who must not count
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000025a01', 'stat1@example.edu', now(), '{"handle":"stat1","display_name":"Stat One","campus":"duke","avatar":"yak"}'),
  ('00000000-0000-0000-0000-000000025a02', 'stat2@example.edu', now(), '{"handle":"stat2","display_name":"Stat Two","campus":"unc","avatar":"yak"}'),
  ('00000000-0000-0000-0000-000000025a03', 'stat3@example.edu', now(), '{"handle":"stat3","display_name":"Stat Three","campus":"ncsu","avatar":"yak"}');
update profiles set created_at = '2030-01-08 10:00-05' where id = '00000000-0000-0000-0000-000000025a01';
update profiles set created_at = '2030-01-13 23:30-05' where id = '00000000-0000-0000-0000-000000025a02';  -- Sunday night Eastern = still week of Jan 7
update profiles set created_at = '2030-01-22 10:00-05' where id = '00000000-0000-0000-0000-000000025a03';
update profiles set created_at = '2030-01-09 10:00-05' where id = t.u('chair2');
insert into events (id, cycle_id, title, campus, kind, location, starts_at, ends_at, activity_id) values
  ('00000000-0000-0000-0000-000000025e01', active_cycle_id(), 'Stats Mixer', 'duke', 'active', 'Quad', '2030-01-10 18:00-05', '2030-01-10 20:00-05', 'home_event'),
  ('00000000-0000-0000-0000-000000025e02', active_cycle_id(), 'Future Gala', 'all', 'high_impact', 'Durham', '2030-01-30 18:00-05', '2030-01-30 20:00-05', 'cross_campus_event');
insert into event_rsvps (event_id, user_id) values
  ('00000000-0000-0000-0000-000000025e01', t.u('alice')),
  ('00000000-0000-0000-0000-000000025e01', t.u('bob')),
  ('00000000-0000-0000-0000-000000025e01', t.u('chair1')),     -- staff: not counted
  ('00000000-0000-0000-0000-000000025e02', t.u('alice'));
insert into ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason, created_at) values
  (active_cycle_id(), t.u('alice'), 20, 'checkin', 'home_event', '00000000-0000-0000-0000-000000025e01', 'Checked in: Stats Mixer', '2030-01-10 18:30-05'),
  (active_cycle_id(), t.u('carol'), 20, 'checkin', 'home_event', '00000000-0000-0000-0000-000000025e01', 'Checked in: Stats Mixer', '2030-01-10 18:40-05'),
  (active_cycle_id(), t.u('admin'), 20, 'checkin', 'home_event', '00000000-0000-0000-0000-000000025e01', 'Checked in: Stats Mixer', '2030-01-10 18:50-05'),
  (active_cycle_id(), t.u('alice'),  5, 'submission', 'poll', '00000000-0000-0000-0000-000000025f99', 'Approved: Vote in a Community Poll', '2030-01-12 10:00-05'),
  (active_cycle_id(), t.u('alice'), 40, 'manual', 'annual_fund', null, 'Give to the Annual Fund', '2030-01-15 10:00-05'),
  (active_cycle_id(), t.u('alice'), 40, 'manual', null, null, 'Volunteer table', '2030-01-16 10:00-05'),
  (active_cycle_id(), t.u('carol'), 40, 'referral', 'bring_new_alum', 'ref-25-carol', 'Brought a friend', '2030-01-17 10:00-05'),
  (active_cycle_id(), t.u('bob'),   40, 'manual', null, null, 'Early bird', '2029-12-20 10:00-05'),
  (active_cycle_id(), t.u('bob'),  -10, 'manual', null, null, 'Fix', '2029-12-21 10:00-05');

-- ---- admin_stats: staff only ----
:as_alice
do $$ begin
  perform t.throws('select admin_stats()', 'forbidden', '0025: participants can''t read stats');
  perform t.throws('select admin_participants_export()', 'forbidden', '0025: participants can''t export participants');
  perform t.throws('select admin_event_checkins(''00000000-0000-0000-0000-000000025e01'')', 'forbidden', '0025: participants can''t read check-ins');
end $$;
:as_anon
do $$ begin
  perform t.denied('select admin_stats()', '0025: anon can''t call admin_stats');
  perform t.denied('select review_submissions_bulk(array[]::uuid[])', '0025: anon can''t call review_submissions_bulk');
  perform t.denied('select undo_points_change(1)', '0025: anon can''t call undo_points_change');
  perform t.denied('select list_player_notes(''00000000-0000-0000-0000-0000000000a1'')', '0025: anon can''t list notes');
end $$;
:as_admin
do $$
declare s jsonb := admin_stats('2030-01-25 12:00-05')::jsonb;
        c jsonb;
begin
  perform t.eq((s->>'goal')::int, 350, '0025 stats: goal');
  perform t.eq(s->'cycle'->>'name', 'Test 2030', '0025 stats: active cycle');
  perform t.eq((s->'totals'->>'participants')::int, (select count(*)::int from profiles where role = 'participant'), '0025 stats: participants only');
  perform t.eq(s->'signupsByWeek', '[{"week":"2030-01-07","count":2},{"week":"2030-01-14","count":0},{"week":"2030-01-21","count":1}]'::jsonb, '0025 stats: weekly sign-ups since cycle start (Eastern weeks, zeros filled, staff excluded)');
  perform t.eq((s->>'signupsBefore')::int, (select count(*)::int from profiles where role = 'participant' and created_at < '2030-01-07 00:00-05'), '0025 stats: sign-ups before the cycle');
  perform t.eq(jsonb_array_length(s->'events'), 1, '0025 stats: only events that have started');
  perform t.ok((s->'events'->0->>'title') = 'Stats Mixer' and (s->'events'->0->>'going')::int = 2 and (s->'events'->0->>'came')::int = 2, '0025 stats: going 2 vs came 2 (staff excluded)');
  perform t.eq(s->'sources', '{"event":40,"digital":5,"referral":40,"staff":120,"removed":10}'::jsonb, '0025 stats: points by source');
  perform t.eq((s->'totals'->>'points')::int, 105 + 60 + 30, '0025 stats: total participant points');
  perform t.eq((s->'totals'->>'active30')::int, 2, '0025 stats: active in the last 30 days');
  perform t.eq((s->'totals'->>'checkins')::int, 2, '0025 stats: participant check-ins');
  select x into c from jsonb_array_elements(s->'campuses') x where x->>'campus' = 'duke';
  perform t.ok((c->>'points')::int = 165 and (c->>'active')::int = 2
               and (c->>'members')::int = (select count(*)::int from profiles where role = 'participant' and campus = 'duke')
               and (c->>'perMember')::numeric = round(165::numeric / (c->>'members')::int, 1), '0025 stats: Duke members / active / points / per member');
  select x into c from jsonb_array_elements(s->'campuses') x where x->>'campus' = 'unc';
  perform t.ok((c->>'points')::int = 30 and (c->>'active')::int = 0, '0025 stats: UNC (old rows are not "active")');
  perform t.eq(s->'campuses'->0->>'campus', 'duke', '0025 stats: campuses in fixed order');
  perform t.eq(s->'milestones', '[{"points":50,"count":2},{"points":100,"count":1},{"points":175,"count":0},{"points":250,"count":0},{"points":350,"count":0}]'::jsonb, '0025 stats: milestones 50/100/175/250/350');
  perform t.eq((select (x->>'count')::int from jsonb_array_elements(s->'distribution') x where x->>'label' = '100–174'), 1, '0025 stats: distribution 100–174');
  perform t.eq((select (x->>'count')::int from jsonb_array_elements(s->'distribution') x where x->>'label' = '1–49'), 1, '0025 stats: distribution 1–49');
  perform t.eq((select sum((x->>'count')::int)::int from jsonb_array_elements(s->'distribution') x), (s->'totals'->>'participants')::int, '0025 stats: distribution covers everyone');
  perform t.eq((select (x->>'count')::int from jsonb_array_elements(s->'badges') x where x->>'id' = 'first_checkin'), 2, '0025 stats: First Steps earned by 2 participants');
  perform t.eq((select (x->>'count')::int from jsonb_array_elements(s->'badges') x where x->>'id' = 'giver'), 1, '0025 stats: Giver earned by 1');
  perform t.ok((admin_stats()::jsonb) ? 'signupsByWeek', '0025 stats: default p_now works');
  perform t.throws('select admin_participants_export()', 'forbidden', '0025: admins can''t export all participants (YACquest Chairs only)');
  perform t.eq((select count(*)::int from admin_event_checkins('00000000-0000-0000-0000-000000025e01')), 3, '0025: admin_event_checkins lists every check-in');
  perform t.ok((select email = 'alice@example.edu' and avatar is not null from admin_event_checkins('00000000-0000-0000-0000-000000025e01') where user_id = t.u('alice')), '0025: check-ins include email + avatar');
  perform t.throws(format('select admin_event_checkins(%L)', gen_random_uuid()), 'not_found', '0025: unknown event');
end $$;
:as_chair1
do $$
declare x json; a json;
begin
  x := admin_participants_export();
  perform t.eq(json_array_length(x), (select count(*)::int from profiles where role = 'participant'), '0025 export: one row per participant (no staff)');
  select e into a from json_array_elements(x) e where e->>'handle' = 'alice';
  perform t.ok((a->>'points')::int = 105 and (a->>'eventsAttended')::int = 1 and (a->>'email') = 'alice@example.edu'
               and (a->'badges')::jsonb ? 'first_checkin' and (a->>'emailOptIn') is not null and (a->>'joinedAt') is not null, '0025 export: points, events, badges, email, opt-in, joined');
  perform t.ok(not exists (select 1 from json_array_elements(x) e where e->>'handle' in ('helper', 'iesha', 'jacob')), '0025 export: staff never included');
end $$;

-- ---- bulk approve ----
:as_super
insert into submissions (id, cycle_id, user_id, activity_id, image_path, status, created_at) values
  ('00000000-0000-0000-0000-000000025b01', active_cycle_id(), t.u('alice'), 'survey', 'x/1.jpg', 'pending', '2030-01-20 10:00-05'),
  ('00000000-0000-0000-0000-000000025b02', active_cycle_id(), t.u('bob'),   'social_tag', 'x/2.jpg', 'pending', '2030-01-20 10:01-05'),
  ('00000000-0000-0000-0000-000000025b03', active_cycle_id(), t.u('carol'), 'annual_fund', 'x/3.jpg', 'pending', '2030-01-20 10:02-05'),
  ('00000000-0000-0000-0000-000000025b04', active_cycle_id(), t.u('admin'), 'repost', 'x/4.jpg', 'pending', '2030-01-20 10:03-05'),
  ('00000000-0000-0000-0000-000000025b05', active_cycle_id(), t.u('erin'),  'poll', 'x/5.jpg', 'approved', '2030-01-20 10:04-05');
:as_alice
do $$ begin
  perform t.throws('select review_submissions_bulk(array[''00000000-0000-0000-0000-000000025b02''::uuid])', 'forbidden', '0025 bulk: participants can''t approve');
end $$;
:as_admin
do $$
declare r json;
        a0 int := (select points from profiles where id = t.u('alice'));
        c0 int := (select points from profiles where id = t.u('carol'));
begin
  perform t.throws('select review_submissions_bulk(array[]::uuid[])', 'empty', '0025 bulk: nothing picked');
  perform t.throws('select review_submissions_bulk(array(select gen_random_uuid() from generate_series(1, 101)))', 'too_many', '0025 bulk: at most 100 per call');
  r := review_submissions_bulk(array['00000000-0000-0000-0000-000000025b01', '00000000-0000-0000-0000-000000025b02',
                                     '00000000-0000-0000-0000-000000025b01', '00000000-0000-0000-0000-000000025b03',
                                     '00000000-0000-0000-0000-000000025b04', '00000000-0000-0000-0000-000000025b05',
                                     '00000000-0000-0000-0000-000000025bff']::uuid[]);
  perform t.eq((r->>'approved')::int, 3, '0025 bulk: 3 approved');
  perform t.eq((r->>'skipped')::int, 3, '0025 bulk: 3 skipped (partial success)');
  perform t.eq(json_array_length(r->'results'), 6, '0025 bulk: duplicate ids counted once, one result per id');
  perform t.eq((select string_agg(coalesce(x->>'code', 'ok'), ',' order by n) from json_array_elements(r->'results') with ordinality as e (x, n)),
               'ok,ok,ok,forbidden,already_reviewed,not_found', '0025 bulk: per-id results in order, with review_submission''s own rules');
  perform t.ok((select x->>'message' from json_array_elements(r->'results') x where x->>'code' = 'forbidden') like 'You can’t review your own%', '0025 bulk: friendly message without the code prefix');
  perform t.eq((select points from profiles where id = t.u('alice')), a0 + 5, '0025 bulk: Tier 3 points awarded');
  perform t.eq((select points from profiles where id = t.u('carol')), c0 + 40, '0025 bulk: Tier 1 points awarded');
  perform t.eq((select status from submissions where id = '00000000-0000-0000-0000-000000025b04'), 'pending', '0025 bulk: a skipped one stays pending');
  perform t.eq((select count(*)::int from ledger where source = 'submission' and ref_id = '00000000-0000-0000-0000-000000025b01'), 1, '0025 bulk: one ledger row per approval');
  r := review_submissions_bulk(array['00000000-0000-0000-0000-000000025b01']::uuid[]);
  perform t.ok((r->>'approved')::int = 0 and (r->'results'->0->>'code') = 'already_reviewed', '0025 bulk: re-running is safe (already reviewed)');
end $$;

-- ---- announcement templates ----
:as_super
do $$ begin
  perform t.ok(not has_table_privilege('authenticated', 'public.announcement_templates', 'select'), '0025 templates: no direct table access');
end $$;
:as_alice
do $$ begin
  perform t.throws('select save_announcement_template(''Hi'', ''Body'')', 'forbidden', '0025 templates: participants can''t save');
  perform t.throws('select * from list_announcement_templates()', 'forbidden', '0025 templates: participants can''t list');
  perform t.denied('select * from announcement_templates', '0025 templates: participants can''t read the table');
end $$;
:as_admin
do $$
declare x json;
begin
  x := save_announcement_template('  Pizza night  ', 'Join us at {location} on {date}!');
  perform set_config('t.tpl_admin', x->>'id', false);
  perform t.ok((x->>'title') = 'Pizza night' and (x->>'canDelete')::boolean, '0025 templates: admin saves (trimmed)');
  perform t.throws('select save_announcement_template('''', ''x'')', 'title', '0025 templates: name required');
  perform t.throws(format('select save_announcement_template(%L, %L)', 'x', repeat('y', 1001)), 'body', '0025 templates: body max 1000');
end $$;
:as_chair1
do $$
declare x json;
begin
  x := save_announcement_template('Chair note', 'Thanks for coming to {event}!');
  perform set_config('t.tpl_chair', x->>'id', false);
  perform t.eq((select count(*)::int from list_announcement_templates()), 2, '0025 templates: everyone on staff sees all templates');
  perform t.ok((select bool_and(can_delete) from list_announcement_templates()), '0025 templates: YACquest Chairs can delete any');
end $$;
:as_admin
do $$ begin
  perform t.ok((select not can_delete from list_announcement_templates() where id = current_setting('t.tpl_chair')::uuid), '0025 templates: admins see others'' templates as not deletable');
  perform t.throws(format('select delete_announcement_template(%L)', current_setting('t.tpl_chair')), 'forbidden', '0025 templates: admins can''t delete others''');
  perform delete_announcement_template(current_setting('t.tpl_admin')::uuid);
  perform t.throws(format('select delete_announcement_template(%L)', current_setting('t.tpl_admin')), 'not_found', '0025 templates: admins delete their own');
end $$;
:as_super
insert into announcement_templates (title, body, created_by) values ('Admin two', 'x', t.u('admin'));
:as_chair1
do $$ begin
  perform delete_announcement_template((select id from list_announcement_templates() where title = 'Admin two'));
  perform t.ok(not exists (select 1 from list_announcement_templates() where title = 'Admin two'), '0025 templates: a YACquest Chair deletes an admin''s template');
end $$;

-- ---- staff notes ----
:as_super
do $$ begin
  perform t.ok(not has_table_privilege('authenticated', 'public.player_notes', 'select'), '0025 notes: no table grant to authenticated');
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.player_notes'::regclass), '0025 notes: RLS on');
  perform t.eq((select count(*)::int from pg_policies where tablename = 'player_notes'), 0, '0025 notes: no policies (only staff RPCs read it)');
end $$;
:as_admin
do $$
declare x json;
begin
  x := add_player_note(t.u('alice'), '  Super helpful at check-in.  ');
  perform set_config('t.note_admin', x->>'id', false);
  perform t.eq(x->>'body', 'Super helpful at check-in.', '0025 notes: admin adds a note (trimmed)');
  perform t.throws(format('select add_player_note(%L, %L)', t.u('alice'), repeat('n', 501)), 'body', '0025 notes: max 500 characters');
  perform t.throws(format('select add_player_note(%L, %L)', t.u('alice'), '   '), 'body', '0025 notes: empty note');
  perform t.throws(format('select add_player_note(%L, %L)', gen_random_uuid(), 'x'), 'not_found', '0025 notes: unknown player');
end $$;
-- same transaction = same now(): make the admin's note a minute older so "newest first" doesn't depend on random ids
:as_super
update player_notes set created_at = created_at - interval '1 minute' where id = current_setting('t.note_admin')::uuid;
:as_chair1
do $$
declare x json;
begin
  x := add_player_note(t.u('alice'), 'Asked about volunteering in spring.');
  perform set_config('t.note_chair', x->>'id', false);
  perform t.eq((select string_agg(author_name, ',' order by created_at desc, id) from list_player_notes(t.u('alice'))), 'Iesha,Helper', '0025 notes: newest first with author');
end $$;
:as_alice
do $$ begin
  perform t.denied('select * from player_notes', '0025 notes: participants can''t read the table');
  perform t.throws(format('select * from list_player_notes(%L)', t.u('alice')), 'forbidden', '0025 notes: participants can''t read notes, even about themselves');
  perform t.throws(format('select add_player_note(%L, %L)', t.u('bob'), 'hi'), 'forbidden', '0025 notes: participants can''t add notes');
end $$;
:as_admin
do $$ begin
  perform t.throws(format('select delete_player_note(%L)', current_setting('t.note_chair')), 'forbidden', '0025 notes: admins can''t delete others'' notes');
  perform delete_player_note(current_setting('t.note_admin')::uuid);
  perform t.eq((select count(*)::int from list_player_notes(t.u('alice'))), 1, '0025 notes: admins delete their own');
end $$;
:as_super
insert into player_notes (user_id, author_id, body) values (t.u('alice'), t.u('admin'), 'Another');
:as_chair1
do $$ begin
  perform delete_player_note((select id from list_player_notes(t.u('alice')) where body = 'Another'));
  perform t.ok(not exists (select 1 from list_player_notes(t.u('alice')) where body = 'Another'), '0025 notes: YACquest Chairs delete any note');
end $$;

-- ---- undo a manual points change ----
:as_admin
do $$
declare v_id bigint; v_undo json; a0 int := (select points from profiles where id = t.u('alice'));
        n0 int := (select count(*) from ledger);
begin
  perform adjust_points(t.u('alice'), 30, 'Bonus for helping');
  v_id := (select max(id) from ledger where user_id = t.u('alice') and source = 'manual');
  perform t.eq((select points from profiles where id = t.u('alice')), a0 + 30, '0025 undo: setup +30');
  v_undo := undo_points_change(v_id);
  perform t.eq((v_undo->>'amount')::int, -30, '0025 undo: correcting row is −amount');
  perform t.eq((select points from profiles where id = t.u('alice')), a0, '0025 undo: points back where they were');
  perform t.eq((select count(*)::int from ledger) - n0, 2, '0025 undo: appends a row (ledger stays append-only)');
  perform t.ok((select source = 'manual' and amount = -30 and ref_id = 'undo:' || v_id and reason = 'Undo: Bonus for helping' and created_by = t.u('admin')
                  from ledger where id = (v_undo->>'ledgerId')::bigint), '0025 undo: ledger row links to the original, reason "Undo: …"');
  perform t.throws(format('select undo_points_change(%s)', v_id), 'already_undone', '0025 undo: only once per original');
  perform t.throws(format('select undo_points_change(%s)', v_undo->>'ledgerId'), 'not_manual', '0025 undo: an undo can''t be undone');
  perform t.throws(format('select undo_points_change(%s)', (select id from ledger where user_id = t.u('alice') and source = 'checkin' and cycle_id = active_cycle_id() limit 1)), 'not_manual', '0025 undo: check-ins can''t be undone');
  perform t.throws(format('select undo_points_change(%s)', (select id from ledger where user_id = t.u('alice') and source = 'submission' and cycle_id = active_cycle_id() limit 1)), 'not_manual', '0025 undo: approvals can''t be undone');
  perform t.throws('select undo_points_change(-1)', 'not_found', '0025 undo: unknown row');
  -- undoing a removal gives the points back (an exact reversal, not a new award)
  perform adjust_points(t.u('bob'), -50, 'Duplicate check-in');
  perform t.eq((undo_points_change((select max(id) from ledger where user_id = t.u('bob')))->>'amount')::int, 50, '0025 undo: a removal can be undone (+50)');
  perform set_config('t.undo_id', v_id::text, false);
end $$;
:as_super
do $$
declare v_id bigint := current_setting('t.undo_id')::bigint;
begin
  perform t.eq((select count(*)::int from admin_actions where action = 'submission_approved' and actor_id = t.u('admin') and created_at = now()), 3, '0025 bulk: each approval logged');
  perform t.eq((select count(*)::int from notifications where user_id = t.u('bob') and kind = 'submission_approved' and title like '+20 pts%'), 1, '0025 bulk: participant notified');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('alice') and kind = 'points_adjusted' and title = '-30 pts from Helper' and body = 'Undo: Bonus for helping'), '0025 undo: player notified');
  perform t.ok(exists (select 1 from admin_actions where action = 'player_note_added' and actor_id = t.u('admin') and target_user_id = t.u('alice')
                        and not (details ? 'body')), '0025 notes: adding is logged (without the note text)');
  perform t.ok(exists (select 1 from admin_actions where action = 'player_note_deleted' and actor_id = t.u('chair1') and target_user_id = t.u('alice')), '0025 notes: deleting is logged');
  perform t.ok(exists (select 1 from admin_actions where action = 'points_removed' and actor_id = t.u('admin') and target_user_id = t.u('alice')
                        and (details->>'undoOf')::bigint = v_id and (details->>'amount')::int = -30), '0025 undo: logged with undoOf');
  perform t.ok(exists (select 1 from admin_actions where action = 'points_added' and (details->>'ledgerId')::bigint = v_id), '0025: log rows carry ledgerId (for Undo in the Log)');
end $$;
:as_super
-- a manual row from an earlier cycle
insert into ledger (cycle_id, user_id, amount, source, reason, created_by)
select id, t.u('alice'), 20, 'manual', 'Old bonus', t.u('admin') from cycles where not is_active limit 1;
:as_alice
do $$ begin
  perform t.throws(format('select undo_points_change(%s)', (select max(id) from ledger where user_id = t.u('alice'))), 'forbidden', '0025 undo: participants can''t undo');
end $$;
:as_chair1
do $$ begin
  perform t.throws(format('select undo_points_change(%s)', (select max(id) from ledger where reason = 'Old bonus')), 'old_cycle', '0025 undo: only this cycle');
end $$;
:as_super
do $$
declare v_state text;
begin
  -- race safety net: the unique index blocks a second undo row even outside the RPC
  begin
    insert into ledger (cycle_id, user_id, amount, source, ref_id, reason)
    values (active_cycle_id(), t.u('alice'), 30, 'manual', (select ref_id from ledger where reason = 'Undo: Bonus for helping'), 'x');
  exception when others then
    v_state := sqlstate;
  end;
  perform t.eq(v_state, '23505', '0025 undo: unique index ledger_one_undo blocks a second undo row');
end $$;
rollback;

-- =============================================================================
-- 30. 0026 — participant extras: event follow-ups (fixed dates), survey link, welcome tour,
--     photo wall privacy, my friends. Everything is rolled back afterwards.
-- =============================================================================
:as_super
begin;
update profiles set role = 'participant' where id in (t.u('alice'), t.u('carol'), t.u('erin'), t.u('bob'), t.u('dave'), t.u('ref3'));
update profiles set role = 'admin' where id = t.u('admin');
update profiles set role = 'chair' where id = t.u('chair1');
update profiles set email_opt_in = true  where id in (t.u('alice'), t.u('carol'), t.u('bob'));
update profiles set email_opt_in = false where id in (t.u('erin'), t.u('dave'), t.u('ref3'));
update profiles set photo_wall_opt_out = false;
update profiles set display_name = v.n from (values ('alice', 'Alice A.'), ('bob', 'Bob'), ('carol', 'Carol'), ('dave', 'Dave'), ('erin', 'Erin'),
  ('ref2', 'Ref2'), ('ref3', 'Ref3'), ('ref4', 'Ref4'), ('admin', 'Helper')) v(h, n) where id = t.u(v.h);
insert into events (id, cycle_id, title, campus, kind, location, starts_at, ends_at, activity_id, survey_url) values
  ('00000000-0000-0000-0000-0000000026f1', active_cycle_id(), 'Spring Social', 'duke', 'active', 'Duke Gardens', '2030-04-04 18:00-04', '2030-04-04 20:00-04', 'home_event', 'https://forms.gle/abc123'),
  ('00000000-0000-0000-0000-0000000026f2', active_cycle_id(), 'Panel Night', 'unc', 'active', 'Gerrard Hall', '2030-04-05 18:00-04', '2030-04-05 20:00-04', 'home_event', null),
  ('00000000-0000-0000-0000-0000000026f3', active_cycle_id(), 'Next Mixer', 'duke', 'active', 'Bryan Center', '2030-04-20 18:00-04', '2030-04-20 20:00-04', 'home_event', null),
  ('00000000-0000-0000-0000-0000000026f4', active_cycle_id(), 'Big Gala', 'all', 'high_impact', 'Durham', '2030-04-25 18:00-04', '2030-04-25 21:00-04', 'cross_campus_event', null),
  ('00000000-0000-0000-0000-0000000026f5', active_cycle_id(), 'Old Picnic', 'duke', 'active', 'Quad', '2025-03-01 12:00-05', '2025-03-01 14:00-05', 'home_event', null);
insert into ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason)
select active_cycle_id(), t.u(n), 20, 'checkin', 'home_event', '00000000-0000-0000-0000-0000000026f1', 'Checked in: Spring Social'
  from unnest(array['alice', 'carol', 'erin']) n;
insert into ledger (cycle_id, user_id, amount, source, activity_id, ref_id, reason)
values (active_cycle_id(), t.u('carol'), 20, 'checkin', 'home_event', '00000000-0000-0000-0000-0000000026f5', 'Checked in: Old Picnic');
insert into event_rsvps (event_id, user_id)
select '00000000-0000-0000-0000-0000000026f1', t.u(n) from unnest(array['alice', 'bob', 'dave', 'ref3']) n;

-- ---- follow-ups: who may run them ----
:as_alice
do $$ begin
  perform t.denied('select queue_event_followups(''2030-04-04 21:30-04'')', '0026: participants can''t run the follow-up job');
  perform t.throws('select send_event_followup_now(''00000000-0000-0000-0000-0000000026f5'')', 'forbidden', '0026: participants can''t send a follow-up');
  perform t.throws('select * from admin_event_followups()', 'forbidden', '0026: participants can''t see follow-up status');
end $$;
:as_admin
do $$ begin
  perform t.denied('select queue_event_followups()', '0026: admins can''t run the job directly (they use Send follow-up now)');
end $$;
:as_anon
do $$ begin
  perform t.denied('select send_event_followup_now(''00000000-0000-0000-0000-0000000026f5'')', '0026: anon can''t send a follow-up');
end $$;

-- ---- automatic run (fixed dates) ----
:as_service
do $$ begin
  perform t.eq(queue_event_followups('2030-04-04 20:30-04'), 0, '0026: check-in still open (ends 8 PM + 60 min grace) → nothing yet');
  perform t.eq(queue_event_followups('2030-04-04 21:30-04'), 1, '0026: window closed → Spring Social followed up (Old Picnic is too old for the automatic run)');
  perform t.eq(queue_event_followups('2030-04-04 21:30-04'), 0, '0026: same run again → nothing (once per event)');
  perform t.eq(queue_event_followups('2030-04-04 21:40-04'), 0, '0026: 10 minutes later → still nothing');
end $$;
:as_super
do $$ begin
  perform t.ok((select sent_by is null and attended = 3 and missed = 3 and emailed = 3 and sent_at = '2030-04-04 21:30-04'
                  from event_followups_sent where event_id = '00000000-0000-0000-0000-0000000026f1'), '0026: marker row: automatic, 3 came, 3 missed, 3 emails');
  perform t.eq((select count(*) from notifications where kind = 'event_followup' and title = 'Thanks for coming to Spring Social! 🐂'), 3::bigint,
               '0026: thanks → the three who checked in (alice, carol, erin)');
  perform t.eq((select body from notifications where kind = 'event_followup' and user_id = t.u('alice')),
               'Tell us how it went in the feedback survey: https://forms.gle/abc123 It counts as the “Complete a Feedback Survey” digital quest: send a screenshot of the confirmation in Quests for ' || tier_points(3) || ' points.',
               '0026: thanks body: survey link + the Feedback Survey digital quest + Tier 3 points');
  perform t.eq((select count(*) from notifications where kind = 'event_followup' and user_id = t.u('alice')), 1::bigint, '0026: alice came (and RSVP''d) → only the thanks, no "missed you"');
  perform t.eq((select title || ' | ' || body from notifications where kind = 'event_followup' and user_id = t.u('bob')),
               'Sorry we missed you at Spring Social | Hope to see you next time! Next up: Panel Night — Fri, Apr 5 at 6:00 PM at Gerrard Hall. RSVP in Quests.',
               '0026: RSVP no-show (UNC) → "Sorry we missed you" + next UNC/all-campus event (Eastern time)');
  perform t.eq((select body from notifications where kind = 'event_followup' and user_id = t.u('ref3')),
               'Hope to see you next time! Next up: Big Gala — Thu, Apr 25 at 6:00 PM at Durham. RSVP in Quests.',
               '0026: NC State no-show → next event for their campus or all campuses');
  perform t.ok(exists (select 1 from notifications where kind = 'event_followup' and user_id = t.u('dave') and title = 'Sorry we missed you at Spring Social'), '0026: no-show with email off still gets the in-app note');
  perform t.eq((select count(*) from notifications where kind = 'event_followup' and user_id = t.u('chair1')), 0::bigint, '0026: people who neither RSVP''d nor came get nothing');
  perform t.eq((select array_agg(to_emails[1] order by to_emails[1]) from email_outbox where kind = 'event_followup'),
               array['alice@example.edu', 'bob@example.edu', 'carol@example.edu'], '0026: emails only for people with email updates on (not erin, dave, ref3)');
  perform t.ok((select subject = 'Thanks for coming to Spring Social!' and body_text like '%https://forms.gle/abc123%' and body_html like '%Take the feedback survey%'
                       and body_text like '%Complete a Feedback Survey%' and status = 'pending'
                  from email_outbox where kind = 'event_followup' and dedupe_key = 'followup:00000000-0000-0000-0000-0000000026f1:' || t.u('alice')),
               '0026: thanks email: subject, survey link + button, the quest');
  perform t.ok((select subject = 'Sorry we missed you at Spring Social' and body_html like '%Panel Night%' and body_text like '%turn them off in Me%'
                  from email_outbox where kind = 'event_followup' and to_emails = array['bob@example.edu']), '0026: missed-you email names the next event');
  perform t.ok(exists (select 1 from admin_actions where action = 'event_followup_sent' and actor_id is null and actor_name = 'System'
                        and details->>'title' = 'Spring Social' and (details->>'automatic')::boolean), '0026: automatic follow-up logged as System');
end $$;
-- no survey link: the thanks still mentions the quest; nobody to thank / miss is fine too
:as_service
do $$ begin
  perform t.eq(queue_event_followups('2030-04-06 09:00-04'), 1, '0026: Panel Night (nobody came) followed up once');
end $$;
:as_super
do $$ begin
  perform t.ok((select attended = 0 and missed = 0 and emailed = 0 from event_followups_sent where event_id = '00000000-0000-0000-0000-0000000026f2'), '0026: empty event → marker with zeros');
end $$;
-- the every-10-minutes send-emails call runs the job on its own
insert into events (id, cycle_id, title, campus, kind, location, starts_at, ends_at, check_in_grace_minutes, activity_id) values
  ('00000000-0000-0000-0000-0000000026f6', active_cycle_id(), 'Cron Brunch', 'duke', 'active', 'Quad', now() - interval '3 hours', now() - interval '2 hours', 30, 'home_event');
insert into event_rsvps (event_id, user_id) values ('00000000-0000-0000-0000-0000000026f6', t.u('carol'));
:as_service
select enqueue_weekly_report_if_due() \g /dev/null
:as_super
do $$ begin
  perform t.ok(exists (select 1 from event_followups_sent where event_id = '00000000-0000-0000-0000-0000000026f6' and sent_by is null), '0026: the send-emails run queues follow-ups (no new cron)');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('carol') and title = 'Sorry we missed you at Cron Brunch'), '0026: …and the notes go out');
  perform t.ok(position('queue_event_followups' in pg_get_functiondef('public.enqueue_weekly_report_if_due()'::regprocedure)) > 0
               and position('queue_event_reminders' in pg_get_functiondef('public.enqueue_weekly_report_if_due()'::regprocedure)) > 0,
               '0026: enqueue_weekly_report_if_due calls both reminders and follow-ups');
end $$;

-- ---- staff: Send follow-up now ----
:as_admin
do $$ declare r json; begin
  perform t.throws('select send_event_followup_now(''00000000-0000-0000-0000-0000000026f3'')', 'not_ended', '0026: can''t send before check-in closes');
  perform t.throws(format('select send_event_followup_now(%L)', gen_random_uuid()), 'not_found', '0026: unknown event');
  r := send_event_followup_now('00000000-0000-0000-0000-0000000026f5');
  perform t.ok((r->>'attended')::int = 1 and (r->>'missed')::int = 0 and not (r->>'automatic')::boolean, '0026: staff can send an older event''s follow-up');
  perform t.throws('select send_event_followup_now(''00000000-0000-0000-0000-0000000026f5'')', 'already_sent', '0026: only once (manual)');
  perform t.throws('select send_event_followup_now(''00000000-0000-0000-0000-0000000026f1'')', 'already_sent', '0026: only once (after the automatic run)');
  perform t.ok((select automatic and attended = 3 from admin_event_followups() where event_id = '00000000-0000-0000-0000-0000000026f1'), '0026: status: automatic');
  perform t.ok((select not automatic and sent_by_name = 'Helper' from admin_event_followups() where event_id = '00000000-0000-0000-0000-0000000026f5'), '0026: status: sent by Helper');
end $$;
:as_service
do $$ begin
  perform t.eq(queue_event_followups(now()), 0, '0026: the automatic run skips events staff already followed up');
end $$;
:as_super
do $$ begin
  perform t.ok(exists (select 1 from admin_actions where action = 'event_followup_sent' and actor_id = t.u('admin') and details->>'title' = 'Old Picnic'), '0026: manual follow-up logged with the staff member');
  perform t.ok((select body like '%When YAC shares the feedback survey%' from notifications where kind = 'event_followup' and user_id = t.u('carol') and title = 'Thanks for coming to Old Picnic! 🐂'),
               '0026: no survey link → the thanks still points to the survey quest');
end $$;

-- ---- survey link on events ----
:as_admin
do $$ declare r json; v_id uuid;
  base jsonb := '{"title":"Survey Test","campus":"duke","kind":"active","location":"Here","startsAt":"2030-05-01T18:00:00-04:00","endsAt":"2030-05-01T20:00:00-04:00","password":"SURVEY"}';
begin
  perform t.throws(format('select create_event(%L)', base || '{"surveyUrl":"javascript:alert(1)"}'), 'surveyUrl', '0026 survey: javascript: refused');
  perform t.throws(format('select create_event(%L)', base || '{"surveyUrl":"ftp://forms.example.com/x"}'), 'surveyUrl', '0026 survey: only http(s)');
  perform t.throws(format('select create_event(%L)', base || '{"surveyUrl":"https://forms.gle/a b"}'), 'surveyUrl', '0026 survey: no spaces');
  perform t.throws(format('select create_event(%L)', base || '{"surveyUrl":"https://localhost"}'), 'surveyUrl', '0026 survey: needs a real host');
  perform t.throws(format('select create_event(%L)', base || jsonb_build_object('surveyUrl', 'https://x.co/' || repeat('a', 500))), 'surveyUrl', '0026 survey: 500 characters max');
  r := create_event(base || '{"surveyUrl":"  https://forms.gle/AbC123?usp=sf  "}');
  v_id := (r->>'id')::uuid;
  perform t.eq(r->>'surveyUrl', 'https://forms.gle/AbC123?usp=sf', '0026 survey: saved trimmed, returned by event_json');
  perform t.eq((update_event(v_id, base || '{"surveyUrl":"HTTP://Example.org/s"}'))->>'surveyUrl', 'HTTP://Example.org/s', '0026 survey: update changes it');
  perform t.ok((update_event(v_id, base || '{"surveyUrl":""}'))->>'surveyUrl' is null, '0026 survey: empty clears it');
  perform t.ok((update_event(v_id, base))->>'surveyUrl' is null, '0026 survey: optional');
end $$;
:as_super
do $$ declare v_state text; begin
  begin
    update events set survey_url = 'javascript:alert(1)' where id = '00000000-0000-0000-0000-0000000026f3';
  exception when others then v_state := sqlstate;
  end;
  perform t.eq(v_state, '23514', '0026 survey: table check constraint backs it up');
end $$;

-- ---- welcome tour ----
:as_alice
do $$ declare t1 timestamptz; begin
  perform t.ok((select tour_done_at is null from profiles where id = t.u('alice')), '0026 tour: not done yet');
  t1 := mark_tour_done();
  perform t.ok(t1 is not null and (select tour_done_at from profiles where id = t.u('alice')) = t1, '0026 tour: mark_tour_done sets it (and the person can read it)');
end $$;
:as_super
update profiles set tour_done_at = '2030-01-01 09:00-05' where id = t.u('alice');
:as_alice
do $$ begin
  perform t.eq(mark_tour_done(), '2030-01-01 09:00-05'::timestamptz, '0026 tour: set once (the first time is kept)');
end $$;
:as_super
do $$ begin
  perform t.ok((select tour_done_at is null from profiles where id = t.u('carol')), '0026 tour: other people unaffected');
end $$;
:as_anon
do $$ begin
  perform t.denied('select mark_tour_done()', '0026 tour: anon can''t call it');
end $$;

-- ---- photo wall privacy ----
:as_super
insert into submissions (id, cycle_id, user_id, activity_id, event_id, image_path, note, status, share_on_wall) values
  ('00000000-0000-0000-0000-00000026a001', active_cycle_id(), t.u('alice'), 'event_photos', '00000000-0000-0000-0000-0000000026f1', t.u('alice') || '/w1.jpg', '', 'approved', true),
  ('00000000-0000-0000-0000-00000026a002', active_cycle_id(), t.u('carol'), 'event_photos', '00000000-0000-0000-0000-0000000026f1', t.u('carol') || '/w1.jpg', '', 'approved', false),
  ('00000000-0000-0000-0000-00000026a003', active_cycle_id(), t.u('erin'),  'event_photos', '00000000-0000-0000-0000-0000000026f1', t.u('erin')  || '/w1.jpg', '', 'pending',  true),
  ('00000000-0000-0000-0000-00000026a004', active_cycle_id(), t.u('bob'),   'event_photos', '00000000-0000-0000-0000-0000000026f1', t.u('bob')   || '/w1.jpg', '', 'approved', true),
  ('00000000-0000-0000-0000-00000026a005', active_cycle_id(), t.u('dave'),  'event_photos', '00000000-0000-0000-0000-0000000026f1', t.u('dave')  || '/w1.jpg', '', 'approved', true),
  ('00000000-0000-0000-0000-00000026a006', active_cycle_id(), t.u('alice'), 'survey', null, t.u('alice') || '/s1.jpg', '', 'approved', false),
  ('00000000-0000-0000-0000-00000026a007', active_cycle_id(), t.u('frank'), 'event_photos', '00000000-0000-0000-0000-0000000026f1', t.u('frank') || '/w1.jpg', '', 'rejected', true);
update profiles set photo_wall_opt_out = true where id = t.u('bob');
insert into storage.buckets (id, name) values ('proofs', 'proofs') on conflict do nothing;
insert into storage.objects (bucket_id, name, owner)
select 'proofs', image_path, user_id from submissions where id::text like '00000000-0000-0000-0000-00000026a%';
:as_carol
do $$ begin
  perform t.eq((select array_agg(display_name order by display_name) from event_photos('00000000-0000-0000-0000-0000000026f1')),
               array['Alice A.', 'Dave'], '0026 wall: only approved + shared + not opted out (not carol''s unshared, erin''s pending, bob''s opted-out, frank''s rejected)');
  perform t.ok((select bool_and(not mine) from event_photos('00000000-0000-0000-0000-0000000026f1')), '0026 wall: mine = false for other people''s photos');
  perform t.eq((select photos from event_photo_counts() where event_id = '00000000-0000-0000-0000-0000000026f1'), 2, '0026 wall: counts use the same rule');
  perform t.eq((select array_agg(name order by name) from storage.objects where name not like t.u('carol') || '/%'),
               array[t.u('alice') || '/w1.jpg', t.u('dave') || '/w1.jpg'], '0026 wall: storage lets carol read (sign) only wall photos + her own');
  perform t.ok(exists (select 1 from storage.objects where name = t.u('carol') || '/w1.jpg'), '0026 wall: own photo still readable');
  perform t.eq((select count(*) from submissions where user_id <> t.u('carol')), 0::bigint, '0026 wall: other people''s submission rows (and unapproved photos) stay hidden');
  perform t.throws('select set_submission_wall_share(''00000000-0000-0000-0000-00000026a001'', false)', 'not_found', '0026 wall: can''t change someone else''s photo');
  perform t.throws('select set_photo_wall_hidden(''00000000-0000-0000-0000-00000026a001'')', 'forbidden', '0026 wall: participants can''t hide photos');
  perform t.ok(set_submission_wall_share('00000000-0000-0000-0000-00000026a002', true), '0026 wall: owner opts a photo in');
  perform t.eq((select count(*) from event_photos('00000000-0000-0000-0000-0000000026f1')), 3::bigint, '0026 wall: …and it shows up');
  perform t.ok((select mine from event_photos('00000000-0000-0000-0000-0000000026f1') where display_name = 'Carol'), '0026 wall: mine = true for your own');
end $$;
:as_alice
do $$ begin
  perform t.throws('select set_submission_wall_share(''00000000-0000-0000-0000-00000026a006'', true)', 'not_photo', '0026 wall: only event photos can be shared');
  perform t.eq((select count(*) from storage.objects where name = t.u('erin') || '/w1.jpg'), 0::bigint, '0026 wall: a pending photo can''t be read even if shared');
end $$;
:as_admin
do $$ begin
  perform t.ok(set_photo_wall_hidden('00000000-0000-0000-0000-00000026a005'), '0026 wall: staff hide a photo');
end $$;
:as_carol
do $$ begin
  perform t.eq((select array_agg(display_name order by display_name) from event_photos('00000000-0000-0000-0000-0000000026f1')),
               array['Alice A.', 'Carol'], '0026 wall: hidden photo gone from the wall');
  perform t.eq((select count(*) from storage.objects where name = t.u('dave') || '/w1.jpg'), 0::bigint, '0026 wall: …and from storage');
end $$;
:as_alice
do $$ begin
  perform t.eq(set_photo_wall_opt_out(true), true, '0026 wall: global opt-out');
  perform t.ok((select photo_wall_opt_out from profiles where id = t.u('alice')), '0026 wall: stored on the profile');
  perform t.ok(exists (select 1 from storage.objects where name = t.u('alice') || '/w1.jpg'), '0026 wall: opted-out owner still sees their own');
end $$;
:as_carol
do $$ begin
  perform t.eq((select array_agg(display_name) from event_photos('00000000-0000-0000-0000-0000000026f1')), array['Carol'], '0026 wall: opting out hides ALL of alice''s photos');
  perform t.eq((select count(*) from storage.objects where name = t.u('alice') || '/w1.jpg'), 0::bigint, '0026 wall: …in storage too');
end $$;
:as_anon
do $$ begin
  perform t.denied('select * from event_photos(''00000000-0000-0000-0000-0000000026f1'')', '0026 wall: anon can''t list photos');
  perform t.denied('select * from event_photo_counts()', '0026 wall: anon can''t count photos');
end $$;
:as_super
do $$ begin
  perform t.ok(exists (select 1 from admin_actions where action = 'photo_hidden' and actor_id = t.u('admin') and target_user_id = t.u('dave')
                        and details->>'title' = 'Spring Social'), '0026 wall: hiding is logged');
  perform t.ok((select wall_hidden_by = t.u('admin') and wall_hidden_at is not null from submissions where id = '00000000-0000-0000-0000-00000026a005'), '0026 wall: who hid it is kept');
  perform t.ok((select not share_on_wall from submissions where id = '00000000-0000-0000-0000-00000026a006'), '0026 wall: share_on_wall defaults off');
end $$;

-- ---- my friends ----
:as_alice
do $$ begin
  perform t.eq((select array_agg(display_name order by display_name) from my_friends()), array['Bob', 'Ref2', 'Ref3', 'Ref4'], '0026 friends: exactly the people who used alice''s code');
  perform set_config('t.friends', (select json_agg(f) from my_friends() f)::text, false);
  perform t.ok((select count(*) filter (where bonus) <= 3 and bool_and(not bonus or came) from my_friends()), '0026 friends: bonus only for friends who came (max 3)');
end $$;
:as_carol
do $$ begin
  perform t.eq((select count(*) from my_friends()), 0::bigint, '0026 friends: nobody used carol''s code → empty (never other people''s referrals)');
end $$;
:as_anon
do $$ begin
  perform t.denied('select * from my_friends()', '0026 friends: anon can''t call it');
end $$;
:as_super
do $$ begin
  perform t.ok((select bool_and(f.came = exists (select 1 from ledger l join profiles p on p.id = l.user_id
                                                  where p.display_name = f.display_name and p.referred_by = t.u('alice') and l.source = 'checkin'))
                  from json_to_recordset(current_setting('t.friends')::json) f(display_name text, came boolean)), '0026 friends: came = has an event check-in');
  perform t.ok((select bool_and(json_typeof(j->'joined_at') = 'string' and j->>'campus' in ('duke','unc','ncsu') and j->>'avatar' is not null)
                  from json_array_elements(current_setting('t.friends')::json) j), '0026 friends: campus, character and joined date included');
  perform t.ok(pg_get_function_result('public.my_friends()'::regprocedure) !~* '(email|handle|user_id|friend_code|points)', '0026 friends: only safe fields (no email, handle, id, code or points)');
end $$;
rollback;

-- =============================================================================
:as_super
select 'PASSED: ' || current_setting('t.passed') || ' assertions' as result;

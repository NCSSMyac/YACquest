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
  perform t.eq((select prize_goal from app_config), 650, 'goal still 650');
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
  perform t.throws(format('select set_role(%L, ''chair'')', t.u('alice')), 'forbidden', 'set_role cannot create a chair');
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
  perform t.throws(format('select adjust_points(%L, -651, ''because'')', t.u('alice')), 'amount', 'manual removal capped at the goal (650)');
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
  perform t.ok(exists (select 1 from notifications where user_id = t.u('admin') and title like '%chair%'), 'transfer_chair notifies target');
  perform t.ok(exists (select 1 from notifications where user_id = t.u('chair1') and title like '%chair seat%'), 'transfer_chair notifies caller');
end $$;
:as_chair1
do $$ begin
  perform t.throws('select list_team()', 'forbidden', 'former chair lost chair powers');
end $$;
:as_super
-- a bootstrap email signing up again can't create a 3rd chair
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
  perform t.eq((select role from profiles where id = t.u('chair2')), 'participant', 'bootstrap email does not create a 3rd chair');
  perform t.eq((select count(*) from profiles where role = 'chair'), 2::bigint, 'max 2 chairs');
end $$;

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
               and (s->>'nearGoalPoints')::int = 150 and json_array_length(s->'recipients') = 0
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
  perform t.throws('select send_announcement(''Hello there'', ''x'', ''all'', null, null, true)', 'forbidden', 'admin cannot EMAIL everyone');
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
:as_super
select 'PASSED: ' || current_setting('t.passed') || ' assertions' as result;

-- =============================================================================
-- Checks supabase/tests/email_test_pack.sql on the populated test DB (run by
-- run_tests.sh after tests.sql). run_tests.sh passes three files:
--   :pack   the pack, with the target email swapped for Helper@Example.EDU
--   :stepb  its STEP B query     :stepc  its STEP C cleanup
-- Every assertion raises on failure (ON_ERROR_STOP).
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

drop schema if exists tp cascade;
create schema tp;
create table tp.snap (phase text, tbl text, h text, primary key (phase, tbl));

create function tp.target() returns uuid language sql stable as $$
  select id from auth.users where lower(email) = 'helper@example.edu';
$$;

create function tp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL: email test pack: %', p_label;
  end if;
  raise notice 'ok - email test pack: %', p_label;
end $$;

-- Hash of every row of the key tables (email tables: only rows that aren't from the test pack).
create function tp.snapshot(p_phase text) returns void language plpgsql as $$
declare
  t text;
  h text;
  v_tables text[] := array[
    'auth.users', 'public.profiles', 'public.ledger', 'public.prize_claims', 'public.events', 'public.event_rsvps',
    'public.notifications', 'public.announcements', 'public.admin_actions', 'public.submissions', 'public.cycles',
    'public.app_config', 'public.report_settings', 'public.event_reminders_sent', 'public.event_followups_sent',
    'public.wrapped_sends', 'public.reward_passes', 'public.event_rewards', 'public.event_unlocks',
    'public.quickstart_pending_roles', 'public.email_runs', 'public.friendships', 'public.unlocks'];
begin
  foreach t in array v_tables loop
    if to_regclass(t) is null then
      continue;
    end if;
    execute format('select coalesce(md5(string_agg(x::text, %L order by x::text)), %L) from %s x', '|', 'empty', t) into h;
    insert into tp.snap values (p_phase, t, h) on conflict (phase, tbl) do update set h = excluded.h;
  end loop;
  insert into tp.snap values
    (p_phase, 'email_unsub_tokens(others)',
     (select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from public.email_unsub_tokens x where x.user_id <> tp.target())),
    (p_phase, 'email_verify_tokens(real)',
     (select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from public.email_verify_tokens x
       where x.token_hash not in (select split_part(o.dedupe_key, ':', 2) from public.email_outbox o where o.dedupe_key like 'verify:%:testpack:%'))),
    (p_phase, 'email_outbox(real)',
     (select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from public.email_outbox x where x.dedupe_key not like '%:testpack:%')),
    (p_phase, 'email_messages(real)',
     (select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from public.email_messages x where x.campaign_id not like 'testpack:%')),
    (p_phase, 'email_events(real)',
     (select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from public.email_events x
       where x.message_id is null or x.message_id not in (select id from public.email_messages where campaign_id like 'testpack:%'))),
    (p_phase, 'email_verify_tokens(all)',
     (select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from public.email_verify_tokens x)),
    (p_phase, 'email_outbox(all)',
     (select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from public.email_outbox x)),
    (p_phase, 'email_messages(all)',
     (select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from public.email_messages x)),
    (p_phase, 'email_events(all)',
     (select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from public.email_events x))
  on conflict (phase, tbl) do update set h = excluded.h;
end $$;

create function tp.changed(p_a text, p_b text, p_all boolean) returns text language sql stable as $$
  select string_agg(a.tbl, ', ' order by a.tbl)
    from tp.snap a join tp.snap b on b.tbl = a.tbl and b.phase = p_b
   where a.phase = p_a and a.h is distinct from b.h
     and (p_all or a.tbl not like '%(all)');
$$;

-- ---------------------------------------------------------------------------
-- Setup: a verified, opted-in staff account with a campus (the populated DB's admin "Helper").
-- ---------------------------------------------------------------------------
reset role;
do $$ begin
  perform tp.ok(tp.target() is not null, 'target account exists (helper@example.edu)');
  update public.profiles
     set email_opt_in = true, email_bounced = false, email_verified_at = coalesce(email_verified_at, now()),
         campus = coalesce(campus, 'ncsu')
   where id = tp.target();
end $$;
select tp.snapshot('before');

-- ---------------------------------------------------------------------------
-- Guard rails: opted-out account → friendly error, nothing queued
-- ---------------------------------------------------------------------------
begin;
update public.profiles set email_opt_in = false where id = tp.target();
\set ON_ERROR_STOP 0
\echo '   (expected error below: email updates are OFF)'
\i :pack
\set ON_ERROR_STOP 1
rollback;
do $$ begin
  perform tp.ok(not exists (select 1 from public.email_messages where campaign_id like 'testpack:%'), 'opted-out account: nothing queued');
end $$;

-- ---------------------------------------------------------------------------
-- Run 1
-- ---------------------------------------------------------------------------
\i :pack

do $$
declare
  v_camp text := (select campaign_id from public.email_messages where campaign_id like 'testpack:%' order by created_at desc limit 1);
  v_vals jsonb := public.email_fill_values(tp.target(), 'x', now());
  v_unsub text := (select token from public.email_unsub_tokens where user_id = tp.target());
  m record;
  k text;
  v_tok text;
  v_err text;
  v_kinds text[];
begin
  perform tp.ok((select count(*) from public.email_messages where campaign_id = v_camp) = 9, '9 emails queued in one test campaign');
  select array_agg(distinct x.k) into v_kinds
    from (select (regexp_matches(pg_get_constraintdef(oid), '''([a-z_]+)''', 'g'))[1] as k
            from pg_constraint where conname = 'email_outbox_kind_check') x;
  perform tp.ok((select array_agg(distinct kind order by kind) from public.email_messages where campaign_id = v_camp)
                = (select array_agg(x order by x) from unnest(v_kinds) x), 'one email of EVERY kind in email_outbox_kind_check');
  perform tp.ok((select bool_and(email = 'helper@example.edu' and user_id = tp.target() and status = 'queued')
                   from public.email_messages where campaign_id = v_camp), 'all to the target only (lower-cased), all queued');
  perform tp.ok((select array_agg(x.n order by x.n) from (select substring(subject from '^\[TEST (\d+)/9\] ')::int as n
                   from public.email_messages where campaign_id = v_camp) x) = array[1,2,3,4,5,6,7,8,9], 'subjects "[TEST n/9] " with n = 1..9');
  perform tp.ok((select count(*) from public.email_outbox where dedupe_key like '%:testpack:%') = 9
                and (select bool_and(subject like '[TEST _/9] %') from public.email_outbox where dedupe_key like '%:testpack:%'),
                '9 outbox rows, tagged keys + subjects');
  perform tp.ok(not exists (select 1 from public.email_messages where campaign_id = v_camp
                             and (subject || body_text || body_html) ~ '\{(first_name|name|campus|campus_pun|points|points_to_goal|next_stop|next_event|friend_code)\}'),
                'no {fill-in} braces left anywhere');
  perform tp.ok(not exists (select 1 from public.email_messages where campaign_id = v_camp and priority <> public.email_priority(kind)),
                'real priorities (1 test/verify/weekly/prize, 2 reminder, 3 follow-up, 4 announcement, 5 Wrapped)');
  perform tp.ok(not exists (select 1 from public.email_messages where campaign_id = v_camp
                             and ((kind in ('test', 'prize_qualified', 'prize_info')) <> (send_before is null)
                                  or send_before <= now())),
                'send_before: none for test/prize, in the future for the rest');
  perform tp.ok((select send_before between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
                   from public.email_messages where campaign_id = v_camp and kind = 'verify_email'), 'verify email expires in 7 days');
  perform tp.ok((select send_before <= now() + interval '1 hour 1 minute' from public.email_messages where campaign_id = v_camp and kind = 'event_reminder'),
                'reminder expires within an hour');

  -- participant emails: greeting, unsubscribe footer (link + token for the header), fill-ins
  for m in select * from public.email_messages where campaign_id = v_camp and public.email_is_participant_kind(kind) loop
    perform tp.ok(m.body_text like 'Hi Helper,%' and m.body_html like '%>Hi Helper,</p>%', m.kind || ': "Hi Helper," greeting');
    perform tp.ok(v_unsub is not null and m.body_html like '%/#/unsubscribe?t=' || v_unsub || '&amp;k=' || m.kind || '"%'
                  and m.body_text like '%Unsubscribe from these in one click: %/#/unsubscribe?t=' || v_unsub || '&k=' || m.kind || E'\n%', m.kind || ': one-click unsubscribe link for this type (0039: &k=<kind>)');
    perform tp.ok(m.body_html not like '%You get this because%' and m.body_text not like '%You get this because%', m.kind || ': old footer replaced');
  end loop;
  select * into m from public.email_messages where campaign_id = v_camp and kind = 'announcement';
  foreach k in array array['first_name', 'name', 'campus', 'points', 'points_to_goal', 'next_stop', 'next_event', 'friend_code'] loop
    perform tp.ok(position(v_vals->>k in m.body_text) > 0, 'announcement fill-in {' || k || '} = ' || (v_vals->>k));
  end loop;
  perform tp.ok(m.subject = '[TEST 3/9] YACquest: Test announcement for Helper 📣', 'announcement subject filled in');
  perform tp.ok(exists (select 1 from unnest(public.campus_puns('ncsu')) pun where position('Campus pun: ' || pun in m.body_text) > 0),
                'announcement {campus_pun} is an NC State pun');
  perform tp.ok(m.body_html like '%<a href="http%/#/me"%', 'announcement has a link to click');
  for m in select * from public.email_messages where campaign_id = v_camp and kind in ('event_followup', 'wrapped') loop
    perform tp.ok(exists (select 1 from unnest(public.campus_puns('ncsu')) pun where m.body_html like '%font-style:italic;">' || public.html_escape(pun) || '</p>%'),
                  m.kind || ': campus pun sign-off');
  end loop;

  -- 0039: no emoji and no URGENT in any subject; times say ET; the winner email has no delivery details
  perform tp.ok(not exists (select 1 from public.email_messages where campaign_id = v_camp
                             and (regexp_replace(subject, '^\[TEST \d+/9\] ', '') ~ '[^\x20-\x7E’—·…–]' or subject ~* 'urgent')
                             and kind <> 'announcement'),
                'no emoji or URGENT in any generated subject (the announcement title is the sender''s own)');
  perform tp.ok((select subject like '% ET' and body_text like '% starts at % ET.%' from public.email_messages where campaign_id = v_camp and kind = 'event_reminder'),
                'reminder: "starts at … ET" in subject and body');
  select * into m from public.email_messages where campaign_id = v_camp and kind = 'prize_info';
  perform tp.ok(m.subject = '[TEST 9/9] YACquest winner info received: Sample Winner (spot #1)'
                and m.body_text like '%For privacy, delivery details are only shown in the app.%' and m.body_html like '%/#/admin/prizes%'
                and (m.body_text || m.body_html) !~* 'phone|mailing address|@example|555-|preference',
                'prize_info: who + where to look, no delivery details');

  -- staff emails: staff footer, no unsubscribe
  perform tp.ok((select bool_and(body_text like '%You get this because you''re on the YACquest staff email list. Manage these in Admin → System.%'
                                 and body_html like '%You get this because you''re on the YACquest staff email list.%' and body_html not like '%unsubscribe%')
                   from public.email_messages where campaign_id = v_camp and kind in ('test', 'weekly_report', 'prize_qualified', 'prize_info')),
                'staff emails: staff-list footer (text = HTML), no unsubscribe');
  perform tp.ok((select body_html like '%Weekly committee report%' from public.email_messages where campaign_id = v_camp and kind = 'weekly_report'),
                'weekly report is the real build_weekly_report()');

  -- verification email: harmless pre-used token
  select * into m from public.email_messages where campaign_id = v_camp and kind = 'verify_email';
  v_tok := substring(m.body_text from '#/verify\?t=([0-9a-f]+)');
  perform tp.ok(v_tok is not null and m.body_html like '%#/verify?t=' || v_tok || '%' and m.body_html like '%someone signed up for YACquest%', 'verify email: link + its own footer');
  perform tp.ok((select body_text = '' and body_html = '' from public.email_outbox where id = m.outbox_id), 'verify email: outbox copy has no link (like the real one)');
  perform tp.ok(exists (select 1 from public.email_verify_tokens where token_hash = public.email_token_hash(v_tok)
                         and user_id = tp.target() and used_at is not null), 'verify email: test token is saved as already used');
  begin
    perform public.verify_email_token(v_tok);
  exception when others then
    v_err := sqlerrm;
  end;
  perform tp.ok(v_err like 'used: %', 'verify email: tapping the link says "already used" (the app shows All set!)');
end $$;

select tp.snapshot('after1');
do $$ begin
  perform tp.ok(tp.changed('before', 'after1', false) is null,
                'nothing else changed (points, prizes, events, notifications, profiles, real emails, real tokens…): ' || coalesce(tp.changed('before', 'after1', false), 'none'));
end $$;

-- ---------------------------------------------------------------------------
-- Eligible right away: the sender would claim all 9 now (rolled back)
-- ---------------------------------------------------------------------------
begin;
do $$
declare
  v_camp text := (select campaign_id from public.email_messages where campaign_id like 'testpack:%' order by created_at desc limit 1);
  v_ids uuid[] := '{}';
  v_tok text[] := '{}';
  r record;
begin
  -- other mail waiting in the test DB is not part of this check
  update public.email_messages set status = 'skipped_expired' where campaign_id <> v_camp and status in ('queued', 'sending', 'failed');
  -- 0038: the pack is queued directly (not through send_announcement), so it has no 10-minute cancel window
  perform tp.ok(not exists (select 1 from public.email_messages where campaign_id = v_camp and not_before is not null),
                'test pack emails are not held by the announcement cancel window (0038)');
  for r in select * from public.claim_email_messages(50) loop
    v_ids := v_ids || r.id;
    if r.unsub_token is not null then v_tok := v_tok || r.kind; end if;
  end loop;
  perform tp.ok(cardinality(v_ids) = 9 and not exists (select 1 from public.email_messages where campaign_id = v_camp and id <> all (v_ids)),
                'claim_email_messages() picks all 9 right away');
  perform tp.ok((select array_agg(x order by x) from unnest(v_tok) x) = array['announcement', 'event_followup', 'event_reminder', 'wrapped'],
                'participant emails come with the unsubscribe token (List-Unsubscribe headers)');
end $$;
rollback;

-- Budget nearly used: the low-priority tests are moved up so they still go now (rolled back)
begin;
update public.app_config set email_daily_budget = 30 + (select count(*) from public.email_messages m
   where (m.status in ('sent', 'bounced') and m.sent_at > now() - interval '24 hours')
      or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) >= now() - interval '15 minutes')) where id = 1;
\i :pack
do $$
declare v_camp text := (select campaign_id from public.email_messages where campaign_id like 'testpack:%' order by created_at desc limit 1);
begin
  perform tp.ok((select max(priority) from public.email_messages where campaign_id = v_camp) = 2, 'tight budget: test emails moved up to priority 2');
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- Tracking as the email-track Edge Function would record it, then STEP B
-- ---------------------------------------------------------------------------
do $$
declare
  v_camp text := (select campaign_id from public.email_messages where campaign_id like 'testpack:%' order by created_at desc limit 1);
  m public.email_messages;
  v_url text;
begin
  select * into m from public.email_messages where campaign_id = v_camp and kind = 'announcement';
  v_url := substring(m.body_html from '<a href="(https?://[^"]*/#/me)"');
  perform tp.ok(public.track_email_open(m.id, 'test-agent'), 'open recorded');
  perform tp.ok(public.track_email_click(m.id, v_url, public.email_link_sig(m.id, v_url), 'test-agent'), 'signed click recorded');
  perform tp.ok(not public.track_email_click(m.id, v_url, repeat('0', 32), 'test-agent'), 'bad signature refused');
end $$;

\echo '   STEP B output:'
\set QUIET 0
\i :stepb
\set QUIET 1
create temp table tp_stepb as
select substring(m.subject from '^\[TEST (\d+)/')::int as n,
       (select count(*) from public.email_events e where e.message_id = m.id and e.type = 'open') as opens,
       (select count(*) from public.email_events e where e.message_id = m.id and e.type = 'click') as clicks
  from public.email_messages m
 where m.campaign_id = (select campaign_id from public.email_messages where campaign_id like 'testpack:%' order by created_at desc limit 1);
do $$ begin
  perform tp.ok((select opens = 1 and clicks = 1 from tp_stepb where n = 3), 'STEP B query: announcement shows 1 open + 1 click');
end $$;

-- ---------------------------------------------------------------------------
-- Run 2 (re-run safe), then STEP C cleanup
-- ---------------------------------------------------------------------------
select pg_sleep(1.1);
\i :pack
do $$ begin
  perform tp.ok((select count(distinct campaign_id) from public.email_messages where campaign_id like 'testpack:%') = 2
                and (select count(*) from public.email_messages where campaign_id like 'testpack:%') = 18, 're-run: a second batch of 9, new keys');
end $$;

\i :stepc
select tp.snapshot('cleaned');
do $$ begin
  perform tp.ok(not exists (select 1 from public.email_messages where campaign_id like 'testpack:%')
                and not exists (select 1 from public.email_outbox where dedupe_key like '%:testpack:%'), 'STEP C: test emails gone');
  perform tp.ok(tp.changed('before', 'cleaned', true) is null,
                'STEP C: emails, opens/clicks and verify tokens exactly as before the pack: ' || coalesce(tp.changed('before', 'cleaned', true), 'none'));
end $$;

drop schema tp cascade;

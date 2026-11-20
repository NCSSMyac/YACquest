-- ═══════════════════════════════════════════════════════════════════════════
-- 0037 — Email retention purge, emailed ("mailto") unsubscribes, small fixes.
--
--   • RETENTION (automatic, at most once a day). purge_email_data() runs from
--     enqueue_weekly_report_if_due(), which the send-emails cron already calls
--     every 10 minutes (no new cron, no Edge Function change needed for this
--     part). A failure there never blocks sending. The periods are the named
--     constants below (email_keep_*()); docs/BACKEND.md "0037" and the Privacy
--     page say the same:
--       email_events (opens, clicks, bounces, unsubscribes) ... 12 months
--       email_messages (one row per recipient) ................. 12 months
--       email_outbox (what the app queued) ...................... 12 months
--       staff email contents that name people: prize_info
--         (winner's delivery details), prize_qualified and
--         weekly_report (names + feedback), plus verify_email
--         (holds a confirmation link): body_text / body_html are
--         emptied 30 days after they were queued; prize alerts
--         also as soon as the claim is marked fulfilled ......... 30 days / fulfilment
--       used or expired email_verify_tokens ...................... 30 days
--       email_unsub_tokens: kept (old emails' links must keep
--         working); a deleted account's token goes with it
--         (ON DELETE CASCADE since 0032) ......................... account lifetime
--     Rows still waiting to be sent (queued / sending / failed with retries
--     left) are never emptied. Emptied rows get body_purged_at; Retry refuses
--     them. Each daily run is logged in email_purge_runs.
--   • unsubscribe_by_email(p_email): service role only. send-emails calls it for
--     unread "unsubscribe" emails sent to the List-Unsubscribe mailto. Turns
--     email_opt_in off, logs an email_events 'unsubscribe' row (detail 'mailto').
--     True = the address belongs to an account. Idempotent.
--   • email_runs.unsubscribes: how many mailto unsubscribes a run processed.
--   • send_test_email(): greets with the first name, like every other email.
--
-- ADDITIVE (new table, new nullable columns, new index, re-created functions;
-- nothing dropped): no downtime. Run AFTER 0036. Safe to run more than once.
-- Then re-deploy send-emails (mailto unsubscribes; staff emails no longer get
-- tracked links). email-track: no behaviour change (its emailCore copy only
-- gained an unused helper), re-deploying it is optional.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Retention periods (named constants). Change them here only; keep the
--    Privacy page (src/screens/Privacy.tsx), docs and RETENTION in
--    supabase/functions/_shared/emailCore.ts in step (a vitest test compares).
-- ─────────────────────────────────────────────────────────────────────────────
-- Email log: email_events, email_messages and email_outbox rows older than this are deleted.
create or replace function public.email_keep_log()
returns interval language sql immutable as $$ select interval '12 months' $$;
-- Staff email contents that name people (prize alerts, weekly report) and confirmation emails: emptied after this.
create or replace function public.email_keep_sensitive_body()
returns interval language sql immutable as $$ select interval '30 days' $$;
-- Used or expired email confirmation tokens: deleted after this.
create or replace function public.email_keep_verify_tokens()
returns interval language sql immutable as $$ select interval '30 days' $$;
-- The purge runs at most this often.
create or replace function public.email_purge_every()
returns interval language sql immutable as $$ select interval '1 day' $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Columns, table, index (additive)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.email_outbox   add column if not exists body_purged_at timestamptz;
alter table public.email_messages add column if not exists body_purged_at timestamptz;
alter table public.email_runs     add column if not exists unsubscribes int not null default 0;

create table if not exists public.email_purge_runs (
  id     bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  stats  jsonb not null default '{}'::jsonb
);
create index if not exists email_purge_runs_ran on public.email_purge_runs (ran_at desc);
alter table public.email_purge_runs enable row level security;
revoke all on public.email_purge_runs from anon, authenticated;

-- The purge deletes by age (the table is small; this is quick).
create index if not exists email_messages_created on public.email_messages (created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Emptying staff email contents (prize alerts, weekly report, confirmations)
-- ─────────────────────────────────────────────────────────────────────────────
-- Kinds whose contents are emptied after email_keep_sensitive_body().
create or replace function public.email_sensitive_kinds()
returns text[] language sql immutable as $$
  select array['prize_info', 'prize_qualified', 'weekly_report', 'verify_email']
$$;

-- The prize claim an alert is about: dedupe key 'prize_info:<claim>:<md5>' / 'prize_qualified:<claim>',
-- or campaign id 'prize:<claim>'.
create or replace function public.email_prize_claim_id(p_key text)
returns uuid language sql immutable set search_path = public, extensions as $$
  select public.email_try_uuid(split_part(coalesce(p_key, ''), ':', 2));
$$;

-- Empties contents that are no longer needed. p_claim: only that claim's prize alerts (when it's fulfilled);
-- null: everything past the 30-day mark, plus alerts of every fulfilled claim. Never touches emails still
-- waiting to go out. Returns {outbox, messages}.
create or replace function public.email_clear_sensitive_bodies(p_now timestamptz default now(), p_claim uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cut timestamptz := p_now - public.email_keep_sensitive_body();
  v_o   int;
  v_m   int;
begin
  update public.email_outbox o
     set body_text = '', body_html = '', body_purged_at = p_now
   where o.kind = any (public.email_sensitive_kinds())
     and o.body_purged_at is null
     and o.status not in ('pending', 'sending')
     and (case when p_claim is not null
               then o.kind in ('prize_info', 'prize_qualified') and public.email_prize_claim_id(o.dedupe_key) = p_claim
               else o.created_at < v_cut
                    or (o.kind in ('prize_info', 'prize_qualified')
                        and exists (select 1 from public.prize_claims c
                                     where c.id = public.email_prize_claim_id(o.dedupe_key) and c.status = 'fulfilled'))
          end);
  get diagnostics v_o = row_count;

  update public.email_messages m
     set body_text = '', body_html = '', body_purged_at = p_now
   where m.kind = any (public.email_sensitive_kinds())
     and m.body_purged_at is null
     and m.status not in ('queued', 'sending')
     and not (m.status = 'failed' and m.attempts < 5)     -- still retried automatically
     and (case when p_claim is not null
               then m.kind in ('prize_info', 'prize_qualified') and public.email_prize_claim_id(m.campaign_id) = p_claim
               else m.created_at < v_cut
                    or (m.kind in ('prize_info', 'prize_qualified')
                        and exists (select 1 from public.prize_claims c
                                     where c.id = public.email_prize_claim_id(m.campaign_id) and c.status = 'fulfilled'))
          end);
  get diagnostics v_m = row_count;
  return jsonb_build_object('outbox', v_o, 'messages', v_m);
end $$;

-- A claim marked fulfilled: its prize alerts (delivery details) are emptied right away.
create or replace function public.prize_claim_clear_alerts()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status = 'fulfilled' and old.status is distinct from 'fulfilled' then
    begin
      perform public.email_clear_sensitive_bodies(now(), new.id);
    exception when others then
      raise warning 'email_clear_sensitive_bodies failed: %', sqlerrm;   -- never blocks marking it delivered
    end;
  end if;
  return null;
end $$;
drop trigger if exists prize_claim_clear_alerts on public.prize_claims;
create trigger prize_claim_clear_alerts after update of status on public.prize_claims
  for each row execute function public.prize_claim_clear_alerts();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The daily purge
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the counts, or {"skipped": "..."} when it already ran in the last day (p_force skips that check).
create or replace function public.purge_email_data(p_now timestamptz default now(), p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_log   timestamptz := p_now - public.email_keep_log();
  v_tok   timestamptz := p_now - public.email_keep_verify_tokens();
  v_body  jsonb;
  v_ev    int;
  v_msg   int;
  v_out   int;
  v_vt    int;
  v_stats jsonb;
begin
  perform public.require_service_role();
  if not pg_try_advisory_xact_lock(hashtext('yacquest_email_purge')) then
    return jsonb_build_object('skipped', 'running');
  end if;
  if not coalesce(p_force, false)
     and exists (select 1 from public.email_purge_runs where ran_at > p_now - public.email_purge_every() and ran_at <= p_now) then
    return jsonb_build_object('skipped', 'ran_today');
  end if;

  v_body := public.email_clear_sensitive_bodies(p_now, null);

  delete from public.email_events where created_at < v_log;
  get diagnostics v_ev = row_count;
  delete from public.email_messages where created_at < v_log;            -- their events cascade
  get diagnostics v_msg = row_count;
  delete from public.email_outbox where created_at < v_log;              -- trigger email_outbox_forget removes its messages
  get diagnostics v_out = row_count;
  delete from public.email_verify_tokens
   where created_at < v_tok and (used_at is not null or expires_at < p_now);
  get diagnostics v_vt = row_count;

  v_stats := jsonb_build_object('events', v_ev, 'messages', v_msg, 'outbox', v_out, 'verifyTokens', v_vt,
                                'bodiesOutbox', (v_body->>'outbox')::int, 'bodiesMessages', (v_body->>'messages')::int);
  insert into public.email_purge_runs (ran_at, stats) values (p_now, v_stats);
  delete from public.email_purge_runs where ran_at < p_now - public.email_keep_log();
  return v_stats;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Per-run hook: copy of 0028 + step 0d (the purge). Nothing else changes.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.enqueue_weekly_report_if_due()
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  rs     public.report_settings;
  v_now  timestamp := now() at time zone 'America/New_York';
  v_due  timestamp;
  v_to   text[];
  rep    json;
  v_new  boolean;
  sh     json;
begin
  perform public.require_service_role();
  -- 0. (0024) RSVP reminders ride along on this call. A failure here never blocks the report / emails.
  begin
    perform public.queue_event_reminders();
  exception when others then
    raise warning 'queue_event_reminders failed: %', sqlerrm;
  end;
  -- 0b. (0026) Event follow-ups ride along too. A failure here never blocks the report / emails.
  begin
    perform public.queue_event_followups();
  exception when others then
    raise warning 'queue_event_followups failed: %', sqlerrm;
  end;
  -- 0c. (0028) End-of-year: "Your YACquest Wrapped is here!" once per cycle. Never blocks the rest.
  begin
    perform public.queue_wrapped_notifications();
  exception when others then
    raise warning 'queue_wrapped_notifications failed: %', sqlerrm;
  end;
  -- 0d. (0037) Retention purge, at most once a day. Never blocks the rest.
  begin
    perform public.purge_email_data(now(), false);
  exception when others then
    raise warning 'purge_email_data failed: %', sqlerrm;
  end;
  select * into rs from public.report_settings where id = 1;
  if rs.id is null or not rs.weekly_enabled then
    return false;
  end if;
  -- ISO week starts Monday; weekly_day 0 = Sunday = last day of the ISO week.
  v_due := date_trunc('week', v_now) + make_interval(days => (rs.weekly_day + 6) % 7, hours => rs.weekly_hour);
  if v_now < v_due then
    return false;
  end if;
  v_to := public.report_recipients();
  if cardinality(v_to) = 0 then
    return false;
  end if;
  if exists (select 1 from public.email_outbox where dedupe_key = 'weekly:' || to_char(v_now, 'IYYY-IW')) then
    return false;
  end if;
  rep := public.build_weekly_report();
  v_new := public.enqueue_email('weekly_report', v_to, rep->>'subject', rep->>'text', rep->>'html',
                                'weekly:' || to_char(v_now, 'IYYY-IW'));
  -- 0012: when a report is really queued and last month is final, tell the Adventurer of the Month
  -- (once per calendar month: the winner of month M is announced during month M+1).
  if v_new then
    sh := public.monthly_shoutout_data();
    if sh is not null and (sh->>'final')::boolean
       and not exists (select 1 from public.notifications n
                        where n.user_id = (sh->>'userId')::uuid and n.kind = 'announcement'
                          and n.title = '⭐ You’re Adventurer of the Month!'
                          and n.created_at >= date_trunc('month', v_now) at time zone 'America/New_York') then
      perform public.notify((sh->>'userId')::uuid, 'announcement', '⭐ You’re Adventurer of the Month!',
        format('You earned %s points in %s — more than any other adventurer. Keep questing!',
               sh->>'pointsThisMonth', public.month_label(sh->>'month')));
    end if;
  end if;
  return v_new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Emailed unsubscribe requests (List-Unsubscribe mailto), read by send-emails
-- ─────────────────────────────────────────────────────────────────────────────
-- True = the address belongs to an account (its YACquest emails are now off). False = no account uses it.
-- Logs one 'unsubscribe' event (detail 'mailto') only when emails were on: calling it again changes nothing.
create or replace function public.unsubscribe_by_email(p_email text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  p       public.profiles;
  v_msg   uuid;
begin
  perform public.require_service_role();
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return false;
  end if;
  select pr.* into p
    from public.profiles pr left join auth.users u on u.id = pr.id
   where lower(u.email::text) = v_email or lower(pr.email::text) = v_email
   order by (lower(u.email::text) = v_email) desc nulls last
   limit 1
   for update of pr;
  if p.id is null then
    return false;
  end if;
  if p.email_opt_in then
    update public.profiles set email_opt_in = false where id = p.id;
    select id into v_msg from public.email_messages
     where user_id = p.id and status in ('sent', 'bounced') order by sent_at desc nulls last limit 1;
    insert into public.email_events (message_id, user_id, type, detail) values (v_msg, p.id, 'unsubscribe', 'mailto');
  end if;
  return true;
end $$;

-- Run log: copy of 0032 + the mailto unsubscribe count.
create or replace function public.email_run_finished(p_stats jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_service_role();
  insert into public.email_runs (sent, failed, released, bounces, unsubscribes, imap_status, imap_error)
  values (coalesce((p_stats->>'sent')::int, 0), coalesce((p_stats->>'failed')::int, 0), coalesce((p_stats->>'released')::int, 0),
          coalesce((p_stats->>'bounces')::int, 0), coalesce((p_stats->>'unsubscribes')::int, 0),
          case when p_stats->>'imap' in ('ok', 'off', 'error', 'skipped') then p_stats->>'imap' else 'off' end,
          left(p_stats->>'imapError', 300));
  delete from public.email_runs where ran_at < now() - interval '30 days';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Small fixes
-- ─────────────────────────────────────────────────────────────────────────────
-- Test email: copy of 0004, greets with the first name ("Hi Iesha,") like every other email.
create or replace function public.send_test_email()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := public.require_chair();
  v_email text;
  v_name  text := coalesce(public.email_first_name(public.display_name_of(v_uid)), 'there');
begin
  select lower(email::text) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    perform public.api_error('not_verified', 'Confirm your email address first.');
  end if;
  perform public.enqueue_email('test', array[v_email], 'YACquest test email ✅',
    format(E'Hi %s,\n\nThis is a test email from YACquest. If you can read this, committee emails are working.\n', v_name),
    public.email_layout('Test email',
      '<p style="margin:0 0 10px;">Hi ' || public.html_escape(v_name) || ',</p>'
      || '<p style="margin:0;">This is a test email from YACquest. If you can read this, committee emails are working. ✅</p>'),
    'test:' || gen_random_uuid());
end $$;

-- Retry: copy of 0032, but an email whose contents were emptied for privacy can't be re-sent (it would be blank).
create or replace function public.retry_email(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_outbox uuid;
begin
  perform public.require_chair();
  if exists (select 1 from public.email_messages where id = p_id and body_purged_at is not null)
     or exists (select 1 from public.email_outbox where id = p_id and body_purged_at is not null) then
    perform public.api_error('purged', 'This email’s contents were removed for privacy (after 30 days, or once the prize was delivered), so it can’t be sent again.');
  end if;
  update public.email_messages set status = 'queued', attempts = 0, claimed_at = null, error = null
   where id = p_id and status = 'failed' returning outbox_id into v_outbox;
  if found then
    update public.email_outbox set status = 'pending' where id = v_outbox and status = 'failed';
    return;
  end if;
  if exists (select 1 from public.email_messages where id = p_id) then
    perform public.api_error('not_failed', 'Only failed emails can be retried.');
  end if;
  update public.email_outbox set status = 'pending', attempts = 0, claimed_at = null where id = p_id;
  if not found then
    perform public.api_error('not_found', 'Email not found.');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function
  public.email_keep_log(), public.email_keep_sensitive_body(), public.email_keep_verify_tokens(), public.email_purge_every(),
  public.email_sensitive_kinds(), public.email_prize_claim_id(text), public.email_clear_sensitive_bodies(timestamptz, uuid),
  public.prize_claim_clear_alerts()
from public, anon, authenticated;

-- send-emails (service_role key) only
revoke execute on function
  public.purge_email_data(timestamptz, boolean), public.unsubscribe_by_email(text), public.email_run_finished(jsonb),
  public.enqueue_weekly_report_if_due()
from public, anon, authenticated;
grant execute on function
  public.purge_email_data(timestamptz, boolean), public.unsubscribe_by_email(text), public.email_run_finished(jsonb),
  public.enqueue_weekly_report_if_due()
to service_role;

-- Unchanged access: chairs (checked inside)
revoke execute on function public.send_test_email(), public.retry_email(uuid) from public, anon;
grant execute on function public.send_test_email(), public.retry_email(uuid) to authenticated;

-- Done.

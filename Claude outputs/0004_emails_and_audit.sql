-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 — Emails, admin action log, winner form, $75 × 4 prizes.
--
--   • Prizes: 4 spots × $75 gift cards. Google Sheets sync is cancelled
--     (table sync_status is dropped).
--   • report_settings (one row): weekly committee report schedule + recipients.
--   • email_outbox: every email the app wants to send. The Edge Function
--     `send-emails` (run every 10 minutes by Supabase Cron) picks rows up with
--     claim_email_batch() and reports back with mark_email_result().
--     dedupe_key makes sure the same report/alert is never queued twice.
--   • Prize alerts: committee gets an email when someone wins a spot, and an
--     URGENT email when the winner sends their delivery info.
--   • admin_actions: append-only log of what admins/chairs did (filled by triggers).
--   • submit_claim_info now takes phone + mailing address.
--
-- Contract: docs/BACKEND.md, section "0004".
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0001, 0002, 0003. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Config: 4 prizes × $75. Sheets sync is gone.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.app_config alter column prize_count set default 4;
alter table public.app_config alter column prize_value_usd set default 75;
update public.app_config set prize_count = 4, prize_value_usd = 75 where id = 1;

drop table if exists public.sync_status cascade;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.report_settings (
  id                   int primary key default 1 check (id = 1),
  weekly_enabled       boolean not null default true,
  weekly_day           int     not null default 1 check (weekly_day between 0 and 6),   -- 0 = Sunday (America/New_York)
  weekly_hour          int     not null default 9 check (weekly_hour between 0 and 23),
  near_goal_points     int     not null default 150 check (near_goal_points between 0 and 1000),
  recipients           text[]  not null default '{}',   -- extra emails
  include_chairs       boolean not null default true,
  include_admins       boolean not null default true,
  prize_alerts_enabled boolean not null default true,
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);
insert into public.report_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('weekly_report','prize_qualified','prize_info','test')),
  to_emails   text[] not null,
  subject     text not null default '',
  body_text   text not null default '',
  body_html   text not null default '',
  dedupe_key  text not null unique,
  status      text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts    int  not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  claimed_at  timestamptz   -- when the sender last picked it up (to recover stuck 'sending' rows)
);
create index if not exists email_outbox_status on public.email_outbox (status, created_at);
create index if not exists email_outbox_created on public.email_outbox (created_at desc);

create table if not exists public.admin_actions (
  id             bigint generated always as identity primary key,
  actor_id       uuid,          -- null = system. No FK: the log outlives deleted accounts.
  actor_name     text not null default 'System',
  action         text not null,
  target_user_id uuid,
  target_name    text,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists admin_actions_target on public.admin_actions (target_user_id, id desc);

-- admin_actions is append-only, even for the table owner.
create or replace function public.admin_actions_append_only()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  raise exception using errcode = 'P0001', message = 'forbidden: The action log is append-only.';
end $$;
drop trigger if exists admin_actions_no_change on public.admin_actions;
create trigger admin_actions_no_change
  before update or delete on public.admin_actions
  for each row execute function public.admin_actions_append_only();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Small helpers (internal)
-- ─────────────────────────────────────────────────────────────────────────────

-- True when called with the service_role key (Edge Function), or directly by a
-- database superuser with no API user at all (pg_cron / SQL Editor).
create or replace function public.is_service_role()
returns boolean language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_claims jsonb;
  v_role   text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  v_role := coalesce(v_role, nullif(v_claims->>'role', ''));
  if v_role = 'service_role' then
    return true;
  end if;
  -- No JWT at all (not an API request) and no logged-in user: pg_cron / SQL Editor.
  return v_role is null and auth.uid() is null and session_user <> 'authenticator';
end $$;

create or replace function public.require_service_role()
returns void language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_service_role() then
    perform public.api_error('forbidden', 'Only the email sender can do that.');
  end if;
end $$;

create or replace function public.html_escape(p text)
returns text language sql immutable set search_path = public, extensions as $$
  select replace(replace(replace(replace(replace(coalesce(p, ''),
         '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function public.campus_label(p text)
returns text language sql immutable set search_path = public, extensions as $$
  select case p when 'duke' then 'Duke' when 'unc' then 'UNC' when 'ncsu' then 'NC State'
                when 'all' then 'All campuses' else coalesce(p, '') end;
$$;

create or replace function public.display_name_of(p_id uuid)
returns text language sql stable security definer set search_path = public, extensions as $$
  select display_name from public.profiles where id = p_id;
$$;

-- Distinct lower-case emails that get committee emails.
create or replace function public.report_recipients()
returns text[] language sql stable security definer set search_path = public, extensions as $$
  with rs as (select * from public.report_settings where id = 1),
  emails as (
    select lower(trim(x)) as e from rs, unnest(rs.recipients) x
    union
    select lower(trim(u.email::text))
      from rs, public.profiles p join auth.users u on u.id = p.id
     where u.email_confirmed_at is not null
       and u.email is not null
       and ((rs.include_chairs and p.role = 'chair') or (rs.include_admins and p.role = 'admin'))
  )
  select coalesce(array_agg(e order by e), '{}'::text[]) from emails where e is not null and e <> '';
$$;

-- Queue an email. Returns true if a new row was added (false = duplicate key).
create or replace function public.enqueue_email(p_kind text, p_to text[], p_subject text, p_text text, p_html text, p_dedupe_key text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if p_to is null or cardinality(p_to) = 0 then
    return false;
  end if;
  insert into public.email_outbox (kind, to_emails, subject, body_text, body_html, dedupe_key)
  values (p_kind, p_to, coalesce(p_subject, ''), coalesce(p_text, ''), coalesce(p_html, ''), p_dedupe_key)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id is not null;
end $$;

-- Wraps body HTML in a simple, mobile-friendly, inline-styled email layout.
create or replace function public.email_layout(p_title text, p_inner_html text)
returns text language sql immutable set search_path = public, extensions as $$
  select
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    || '<title>' || public.html_escape(p_title) || '</title></head>'
    || '<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#1c2333;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;"><tr><td align="center" style="padding:16px 8px;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e7ef;">'
    || '<tr><td style="background:#0b2a5b;padding:18px 20px;border-bottom:4px solid #f2b33d;">'
    || '<div style="color:#f2b33d;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">YACquest</div>'
    || '<div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;margin-top:4px;">' || public.html_escape(p_title) || '</div>'
    || '</td></tr>'
    || '<tr><td style="padding:20px;font-size:15px;line-height:1.5;">' || p_inner_html || '</td></tr>'
    || '<tr><td style="padding:14px 20px;background:#f4f6fa;color:#5b6475;font-size:12px;line-height:1.4;">'
    || 'NCSSM Young Alumni Council · YACquest. You get this because you are on the YAC committee list.'
    || '</td></tr></table></td></tr></table></body></html>';
$$;

create or replace function public.email_h2(p text)
returns text language sql immutable set search_path = public, extensions as $$
  select '<h2 style="margin:22px 0 8px;font-size:16px;color:#0b2a5b;border-left:4px solid #f2b33d;padding-left:8px;">'
         || public.html_escape(p) || '</h2>';
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Weekly committee report
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.build_weekly_report()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  cfg       public.app_config;
  rs        public.report_settings;
  cyc       public.cycles;
  v_cycle   uuid := public.active_cycle_id();
  v_wk      timestamptz := public.week_start();
  v_taken   int;
  v_left    int;
  v_days    int;
  v_active  int;
  v_points  int;
  v_signups int;
  v_pending int;
  v_date    text := trim(to_char(now() at time zone 'America/New_York', 'Mon FMDD, YYYY'));
  v_subject text;
  t         text := '';
  h         text := '';
  r         record;
  td        constant text := '<td style="padding:6px 8px;border-bottom:1px solid #eef1f6;">';
  tdr       constant text := '<td style="padding:6px 8px;border-bottom:1px solid #eef1f6;text-align:right;white-space:nowrap;">';
  th        constant text := '<th style="padding:6px 8px;text-align:left;font-size:12px;color:#5b6475;text-transform:uppercase;border-bottom:2px solid #e3e7ef;">';
  thr       constant text := '<th style="padding:6px 8px;text-align:right;font-size:12px;color:#5b6475;text-transform:uppercase;border-bottom:2px solid #e3e7ef;">';
  tbl       constant text := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">';
  n         int;
begin
  select * into cfg from public.app_config where id = 1;
  select * into rs from public.report_settings where id = 1;
  select * into cyc from public.cycles where id = v_cycle;

  v_taken := (select count(*) from public.prize_claims where cycle_id = v_cycle and status <> 'revoked');
  v_left  := greatest(0, cfg.prize_count - v_taken);
  v_days  := greatest(0, ceil(extract(epoch from (cyc.ends_at - now())) / 86400.0))::int;
  v_active := (select count(distinct l.user_id) from public.ledger l join public.profiles p on p.id = l.user_id
                where p.role = 'participant' and l.cycle_id = v_cycle and l.created_at >= v_wk);
  v_points := (select coalesce(sum(greatest(0, l.amount)), 0) from public.ledger l join public.profiles p on p.id = l.user_id
                where p.role = 'participant' and l.cycle_id = v_cycle and l.created_at >= v_wk);
  v_signups := (select count(*) from public.profiles where role = 'participant' and created_at >= v_wk);
  v_pending := (select count(*) from public.submissions s join public.profiles p on p.id = s.user_id
                 where p.role = 'participant' and s.status = 'pending');

  v_subject := format('YACquest weekly report · %s · %s of %s prize spots left', v_date, v_left, cfg.prize_count);

  -- Headline
  t := format(E'YACquest weekly report — %s\n\n', v_date)
    || format(E'PRIZE SPOTS: %s of %s left ($%s gift cards, goal %s points)\n', v_left, cfg.prize_count, cfg.prize_value_usd, cfg.prize_goal)
    || format(E'DAYS LEFT IN CYCLE (%s): %s\n', coalesce(cyc.name, '—'), v_days);
  h := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    || '<td style="width:50%;padding:4px;"><div style="background:#0b2a5b;border-radius:10px;padding:14px;text-align:center;">'
    || '<div style="color:#f2b33d;font-size:30px;font-weight:800;line-height:1;">' || v_left || ' of ' || cfg.prize_count || '</div>'
    || '<div style="color:#ffffff;font-size:13px;margin-top:6px;">prize spots left</div></div></td>'
    || '<td style="width:50%;padding:4px;"><div style="background:#fff6e3;border:1px solid #f2b33d;border-radius:10px;padding:14px;text-align:center;">'
    || '<div style="color:#0b2a5b;font-size:30px;font-weight:800;line-height:1;">' || v_days || '</div>'
    || '<div style="color:#0b2a5b;font-size:13px;margin-top:6px;">days left in ' || public.html_escape(coalesce(cyc.name, 'the cycle')) || '</div></div></td>'
    || '</tr></table>'
    || '<p style="margin:12px 0 0;color:#5b6475;font-size:13px;">Goal: <b>' || cfg.prize_goal || ' points</b> · Prize: <b>$'
    || cfg.prize_value_usd || ' gift card</b> each.</p>';

  -- Winners so far
  if v_taken > 0 then
    t := t || E'\nWINNERS SO FAR\n';
    h := h || public.email_h2('Winners so far') || tbl;
    for r in select spot, display_name, campus, status from public.prize_claims
              where cycle_id = v_cycle and status <> 'revoked' order by spot loop
      t := t || format(E'  #%s %s (%s) — %s\n', r.spot, r.display_name, public.campus_label(r.campus),
                       case r.status when 'qualified' then 'waiting for delivery info'
                                     when 'info_submitted' then 'info received, send the gift card'
                                     else 'delivered' end);
      h := h || '<tr>' || td || '<b>#' || r.spot || '</b> ' || public.html_escape(r.display_name)
             || ' <span style="color:#5b6475;">(' || public.campus_label(r.campus) || ')</span></td>' || tdr
             || case r.status when 'qualified' then '<span style="color:#b26a00;">waiting for info</span>'
                              when 'info_submitted' then '<span style="color:#c0392b;font-weight:700;">send gift card</span>'
                              else '<span style="color:#1e8449;">delivered</span>' end
             || '</td></tr>';
    end loop;
    h := h || '</table>';
  end if;

  -- Close to the prize
  t := t || format(E'\nCLOSE TO THE PRIZE (within %s points of %s)\n', rs.near_goal_points, cfg.prize_goal);
  h := h || public.email_h2('🔥 Close to the prize')
         || '<p style="margin:0 0 8px;color:#5b6475;font-size:13px;">Within ' || rs.near_goal_points || ' points of '
         || cfg.prize_goal || ' and no spot yet. Give them a shout-out!</p>';
  n := 0;
  for r in select p.display_name, p.campus, p.points, greatest(0, cfg.prize_goal - p.points) as to_go
             from public.profiles p
            where p.role = 'participant'
              and p.points >= cfg.prize_goal - rs.near_goal_points
              and not exists (select 1 from public.prize_claims c
                               where c.cycle_id = v_cycle and c.user_id = p.id and c.status <> 'revoked')
            order by p.points desc, p.display_name
            limit 25 loop
    if n = 0 then
      h := h || tbl || '<tr>' || th || 'Name</th>' || th || 'Campus</th>' || thr || 'Points</th>' || thr || 'To go</th></tr>';
    end if;
    n := n + 1;
    t := t || format(E'  %s (%s) — %s pts, %s to go\n', r.display_name, public.campus_label(r.campus), r.points, r.to_go);
    h := h || '<tr>' || td || '<b>' || public.html_escape(r.display_name) || '</b></td>' || td || public.campus_label(r.campus)
           || '</td>' || tdr || r.points || '</td>' || tdr
           || '<span style="background:#fff6e3;color:#0b2a5b;border-radius:10px;padding:2px 8px;font-weight:700;">' || r.to_go || '</span></td></tr>';
  end loop;
  if n = 0 then
    t := t || E'  Nobody yet.\n';
    h := h || '<p style="margin:0;">Nobody yet.</p>';
  else
    h := h || '</table>';
  end if;

  -- Top 5
  t := t || E'\nTOP 5 OVERALL\n';
  h := h || public.email_h2('Top 5 overall');
  n := 0;
  for r in select * from public.leaderboard(5, null) loop
    if n = 0 then h := h || tbl; end if;
    n := n + 1;
    t := t || format(E'  %s. %s (%s) — %s pts\n', r.rank, r.display_name, public.campus_label(r.campus), r.points);
    h := h || '<tr>' || td || r.rank || '. ' || public.html_escape(r.display_name)
           || ' <span style="color:#5b6475;">(' || public.campus_label(r.campus) || ')</span></td>' || tdr || '<b>' || r.points || '</b> pts</td></tr>';
  end loop;
  if n = 0 then
    t := t || E'  No participants yet.\n';
    h := h || '<p style="margin:0;">No participants yet.</p>';
  else
    h := h || '</table>';
  end if;

  -- Campus Cup
  t := t || E'\nCAMPUS CUP (points per member)\n';
  h := h || public.email_h2('Campus Cup (points per member)') || tbl;
  for r in select * from public.campus_cup() loop
    t := t || format(E'  %s — %s per member (%s members, %s pts)\n', public.campus_label(r.campus), r.per_capita, r.members, r.total_points);
    h := h || '<tr>' || td || '<b>' || public.campus_label(r.campus) || '</b> <span style="color:#5b6475;">(' || r.members
           || ' members)</span></td>' || tdr || r.per_capita || ' / member</td></tr>';
  end loop;
  h := h || '</table>';

  -- This week
  t := t || E'\nTHIS WEEK (since Monday)\n'
         || format(E'  Active participants: %s\n  Points awarded: %s\n  New sign-ups: %s\n', v_active, v_points, v_signups)
         || format(E'\nPENDING REVIEWS: %s\n', v_pending);
  h := h || public.email_h2('This week (since Monday)') || tbl
         || '<tr>' || td || 'Active participants</td>' || tdr || '<b>' || v_active || '</b></td></tr>'
         || '<tr>' || td || 'Points awarded</td>' || tdr || '<b>' || v_points || '</b></td></tr>'
         || '<tr>' || td || 'New sign-ups</td>' || tdr || '<b>' || v_signups || '</b></td></tr>'
         || '<tr>' || td || 'Pending reviews</td>' || tdr
         || case when v_pending > 0 then '<b style="color:#c0392b;">' || v_pending || '</b>' else '<b>0</b>' end || '</td></tr>'
         || '</table>';
  if v_pending > 0 then
    h := h || '<p style="margin:12px 0 0;">Please open YACquest → Admin → Review to clear the queue.</p>';
  end if;

  return json_build_object('subject', v_subject, 'text', t, 'html', public.email_layout('Weekly committee report · ' || v_date, h));
end $$;

-- Called by the Edge Function (service_role) or pg_cron. Queues this week's report once.
create or replace function public.enqueue_weekly_report_if_due()
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  rs     public.report_settings;
  v_now  timestamp := now() at time zone 'America/New_York';
  v_due  timestamp;
  v_to   text[];
  rep    json;
begin
  perform public.require_service_role();
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
  return public.enqueue_email('weekly_report', v_to, rep->>'subject', rep->>'text', rep->>'html',
                              'weekly:' || to_char(v_now, 'IYYY-IW'));
end $$;

create or replace function public.send_weekly_report_now()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_to text[];
  rep  json;
begin
  perform public.require_chair();
  v_to := public.report_recipients();
  if cardinality(v_to) = 0 then
    perform public.api_error('no_recipients', 'Add at least one recipient in the report settings first.');
  end if;
  rep := public.build_weekly_report();
  perform public.enqueue_email('weekly_report', v_to, rep->>'subject', rep->>'text', rep->>'html',
                               'weekly-manual:' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint
                               || ':' || substr(md5(random()::text), 1, 6));
end $$;

create or replace function public.weekly_report_preview()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare rep json;
begin
  perform public.require_admin();
  rep := public.build_weekly_report();
  return json_build_object('subject', rep->>'subject', 'text', rep->>'text', 'html', rep->>'html',
                           'recipients', to_json(public.report_recipients()));
end $$;

create or replace function public.send_test_email()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := public.require_chair();
  v_email text;
  v_name  text := public.display_name_of(v_uid);
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Prize alerts (triggers on prize_claims)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.prize_alert_row(p_label text, p_value text)
returns text language sql immutable set search_path = public, extensions as $$
  select '<tr><td style="padding:6px 8px;border-bottom:1px solid #eef1f6;color:#5b6475;font-size:13px;white-space:nowrap;vertical-align:top;">'
         || public.html_escape(p_label) || '</td><td style="padding:6px 8px;border-bottom:1px solid #eef1f6;font-weight:600;">'
         || replace(public.html_escape(coalesce(nullif(p_value, ''), '—')), E'\n', '<br>') || '</td></tr>';
$$;

create or replace function public.on_prize_claim_alert()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  rs   public.report_settings;
  cfg  public.app_config;
  v_to text[];
  c    jsonb;
  v_subject text;
begin
  select * into rs from public.report_settings where id = 1;
  if rs.id is null or not rs.prize_alerts_enabled then
    return null;
  end if;
  if new.status = 'revoked' then
    return null;
  end if;
  select * into cfg from public.app_config where id = 1;

  if tg_op = 'INSERT' then
    v_to := public.report_recipients();
    if cardinality(v_to) = 0 then return null; end if;
    v_subject := format('🏆 YACquest: %s won spot #%s', new.display_name, new.spot);
    perform public.enqueue_email('prize_qualified', v_to, v_subject,
      format(E'%s (%s) reached %s points and won prize spot #%s of %s — a $%s gift card.\n\n'
             'They are waiting to send their delivery info. You will get another email as soon as they do.\n',
             new.display_name, public.campus_label(new.campus), cfg.prize_goal, new.spot, cfg.prize_count, cfg.prize_value_usd),
      public.email_layout(format('%s won spot #%s', new.display_name, new.spot),
        '<p style="margin:0 0 10px;font-size:17px;"><b>' || public.html_escape(new.display_name) || '</b> ('
        || public.campus_label(new.campus) || ') reached <b>' || cfg.prize_goal || ' points</b> and won prize spot <b>#'
        || new.spot || ' of ' || cfg.prize_count || '</b> — a <b>$' || cfg.prize_value_usd || ' gift card</b>. 🏆</p>'
        || '<p style="margin:0;color:#5b6475;">They are waiting to send their delivery info. You will get another email as soon as they do.</p>'),
      'prize_qualified:' || new.id);
    return null;
  end if;

  -- UPDATE: winner sent (or changed) their delivery info
  if new.contact is not null and new.contact is distinct from old.contact then
    v_to := public.report_recipients();
    if cardinality(v_to) = 0 then return null; end if;
    c := new.contact;
    v_subject := format('URGENT 🎁 YACquest winner info: %s (spot #%s)', new.display_name, new.spot);
    perform public.enqueue_email('prize_info', v_to, v_subject,
      format(E'%s won spot #%s and sent their delivery info. Please send the $%s gift card by %s.\n\n'
             'Full name: %s\nEmail: %s\nPhone: %s\nMailing address: %s\nGift card preference: %s\nNotes: %s\n'
             'Reference: %s\nCampus: %s\n',
             new.display_name, new.spot, cfg.prize_value_usd, to_char(cfg.fulfill_by, 'Mon FMDD, YYYY'),
             coalesce(c->>'fullName', ''), coalesce(c->>'email', ''), coalesce(c->>'phone', ''),
             coalesce(c->>'address', ''), coalesce(nullif(c->>'preference', ''), '—'), coalesce(nullif(c->>'notes', ''), '—'),
             coalesce(new.reference, '—'), public.campus_label(new.campus)),
      public.email_layout(format('Winner info: %s (spot #%s)', new.display_name, new.spot),
        '<p style="margin:0 0 12px;background:#fff6e3;border:1px solid #f2b33d;border-radius:8px;padding:10px 12px;">'
        || '<b style="color:#c0392b;">Action needed:</b> send the <b>$' || cfg.prize_value_usd || ' gift card</b> by <b>'
        || to_char(cfg.fulfill_by, 'Mon FMDD, YYYY') || '</b>, then mark spot #' || new.spot || ' fulfilled in YACquest.</p>'
        || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">'
        || public.prize_alert_row('Full name', c->>'fullName')
        || public.prize_alert_row('Email', c->>'email')
        || public.prize_alert_row('Phone', c->>'phone')
        || public.prize_alert_row('Mailing address', c->>'address')
        || public.prize_alert_row('Gift card preference', c->>'preference')
        || public.prize_alert_row('Notes', c->>'notes')
        || public.prize_alert_row('Reference', new.reference)
        || public.prize_alert_row('Campus', public.campus_label(new.campus))
        || '</table>'),
      'prize_info:' || new.id || ':' || md5(new.contact::text));
  end if;
  return null;
end $$;

drop trigger if exists prize_claims_alert_insert on public.prize_claims;
create trigger prize_claims_alert_insert
  after insert on public.prize_claims
  for each row execute function public.on_prize_claim_alert();

drop trigger if exists prize_claims_alert_update on public.prize_claims;
create trigger prize_claims_alert_update
  after update of contact on public.prize_claims
  for each row execute function public.on_prize_claim_alert();


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Sending (Edge Function `send-emails`, service_role)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_email_batch(p_limit int default 20)
returns setof public.email_outbox language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_service_role();
  -- Rows stuck in 'sending' that already used all 5 attempts give up.
  update public.email_outbox
     set status = 'failed', last_error = coalesce(last_error, 'Timed out while sending')
   where status = 'sending' and attempts >= 5
     and coalesce(claimed_at, created_at) < now() - interval '15 minutes';

  return query
    with picked as (
      select o.id from public.email_outbox o
       where o.status = 'pending'
          or (o.status = 'failed' and o.attempts < 5)
          or (o.status = 'sending' and coalesce(o.claimed_at, o.created_at) < now() - interval '15 minutes')
       order by o.created_at, o.id
       limit greatest(1, least(coalesce(p_limit, 20), 100))
       for update skip locked
    )
    update public.email_outbox o
       set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
      from picked
     where o.id = picked.id
    returning o.*;
end $$;

create or replace function public.mark_email_result(p_id uuid, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_service_role();
  if p_ok then
    update public.email_outbox set status = 'sent', sent_at = now(), last_error = null where id = p_id;
  else
    update public.email_outbox set status = 'failed', last_error = left(coalesce(p_error, 'Unknown error'), 500) where id = p_id;
  end if;
  if not found then
    perform public.api_error('not_found', 'Email not found.');
  end if;
end $$;

create or replace function public.email_log(p_limit int default 50)
returns table (id uuid, kind text, to_emails text[], subject text, status text, attempts int, last_error text,
               created_at timestamptz, sent_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_chair();
  return query
    select o.id, o.kind, o.to_emails, o.subject, o.status, o.attempts, o.last_error, o.created_at, o.sent_at
      from public.email_outbox o
     order by o.created_at desc, o.id
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;

create or replace function public.retry_email(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_chair();
  update public.email_outbox set status = 'pending', attempts = 0, claimed_at = null where id = p_id;
  if not found then
    perform public.api_error('not_found', 'Email not found.');
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Report settings (chair)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.report_settings_json(rs public.report_settings)
returns json language sql stable set search_path = public, extensions as $$
  select json_build_object(
    'weeklyEnabled', rs.weekly_enabled,
    'weeklyDay', rs.weekly_day,
    'weeklyHour', rs.weekly_hour,
    'nearGoalPoints', rs.near_goal_points,
    'recipients', to_json(rs.recipients),
    'includeChairs', rs.include_chairs,
    'includeAdmins', rs.include_admins,
    'prizeAlertsEnabled', rs.prize_alerts_enabled,
    'updatedAt', rs.updated_at
  );
$$;

create or replace function public.get_report_settings()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare rs public.report_settings;
begin
  perform public.require_chair();
  select * into rs from public.report_settings where id = 1;
  return public.report_settings_json(rs);
end $$;

create or replace function public.update_report_settings(p_settings jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid  uuid := public.require_chair();
  s      jsonb := coalesce(p_settings, '{}'::jsonb);
  rs     public.report_settings;
  v_list text[];
  v_e    text;
  v_int  int;
  k      text;
begin
  if jsonb_typeof(s) <> 'object' then
    perform public.api_error('settings', 'Settings must be an object.');
  end if;
  select * into rs from public.report_settings where id = 1 for update;

  foreach k in array array['weeklyEnabled','includeChairs','includeAdmins','prizeAlertsEnabled'] loop
    if s ? k and jsonb_typeof(s->k) <> 'boolean' then
      perform public.api_error(k, 'Must be on or off.');
    end if;
  end loop;
  rs.weekly_enabled       := coalesce((s->>'weeklyEnabled')::boolean, rs.weekly_enabled);
  rs.include_chairs       := coalesce((s->>'includeChairs')::boolean, rs.include_chairs);
  rs.include_admins       := coalesce((s->>'includeAdmins')::boolean, rs.include_admins);
  rs.prize_alerts_enabled := coalesce((s->>'prizeAlertsEnabled')::boolean, rs.prize_alerts_enabled);

  if s ? 'weeklyDay' then
    v_int := case when jsonb_typeof(s->'weeklyDay') = 'number' and (s->>'weeklyDay') ~ '^\d+$' then (s->>'weeklyDay')::int end;
    if v_int is null or v_int not between 0 and 6 then
      perform public.api_error('weeklyDay', 'Pick a day of the week.');
    end if;
    rs.weekly_day := v_int;
  end if;
  if s ? 'weeklyHour' then
    v_int := case when jsonb_typeof(s->'weeklyHour') = 'number' and (s->>'weeklyHour') ~ '^\d+$' then (s->>'weeklyHour')::int end;
    if v_int is null or v_int not between 0 and 23 then
      perform public.api_error('weeklyHour', 'Pick an hour from 0 to 23.');
    end if;
    rs.weekly_hour := v_int;
  end if;
  if s ? 'nearGoalPoints' then
    v_int := case when jsonb_typeof(s->'nearGoalPoints') = 'number' and (s->>'nearGoalPoints') ~ '^\d+$' and length(s->>'nearGoalPoints') <= 6
                  then (s->>'nearGoalPoints')::int end;
    if v_int is null or v_int not between 0 and 1000 then
      perform public.api_error('nearGoalPoints', '"Close to the prize" must be 0–1000 points.');
    end if;
    rs.near_goal_points := v_int;
  end if;
  if s ? 'recipients' then
    if jsonb_typeof(s->'recipients') <> 'array' then
      perform public.api_error('recipients', 'Recipients must be a list of emails.');
    end if;
    v_list := '{}';
    for v_e in select lower(trim(x)) from jsonb_array_elements_text(s->'recipients') x loop
      if v_e = '' then continue; end if;
      if v_e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_e) > 254 then
        perform public.api_error('recipients', format('"%s" is not a valid email.', left(v_e, 60)));
      end if;
      if not v_e = any (v_list) then
        v_list := v_list || v_e;
      end if;
    end loop;
    if cardinality(v_list) > 20 then
      perform public.api_error('recipients', 'At most 20 extra recipients.');
    end if;
    rs.recipients := v_list;
  end if;

  update public.report_settings
     set weekly_enabled = rs.weekly_enabled, weekly_day = rs.weekly_day, weekly_hour = rs.weekly_hour,
         near_goal_points = rs.near_goal_points, recipients = rs.recipients,
         include_chairs = rs.include_chairs, include_admins = rs.include_admins,
         prize_alerts_enabled = rs.prize_alerts_enabled, updated_at = now(), updated_by = v_uid
   where id = 1
   returning * into rs;
  return public.report_settings_json(rs);
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Winner form: phone + mailing address
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.submit_claim_info(text, text, text, text);

create or replace function public.submit_claim_info(p_full_name text, p_email text, p_phone text, p_address text,
                                                    p_preference text default null, p_notes text default null)
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
  if char_length(trim(coalesce(p_full_name, ''))) < 2 or char_length(trim(p_full_name)) > 100 then
    perform public.api_error('fullName', 'Enter your full name.');
  end if;
  if coalesce(trim(p_email), '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(trim(p_email)) > 254 then
    perform public.api_error('email', 'Enter a valid email.');
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 7 or char_length(trim(p_phone)) > 40 then
    perform public.api_error('phone', 'Enter a phone number with at least 7 digits.');
  end if;
  if char_length(trim(coalesce(p_address, ''))) < 10 or char_length(trim(p_address)) > 300 then
    perform public.api_error('address', 'Enter your full mailing address (street, city, state, ZIP).');
  end if;
  if char_length(coalesce(p_notes, '')) > 280 then
    perform public.api_error('notes', 'Keep notes under 280 characters.');
  end if;
  if char_length(coalesce(p_preference, '')) > 100 then
    perform public.api_error('preference', 'Keep the gift card preference short.');
  end if;

  update public.prize_claims
     set contact = jsonb_strip_nulls(jsonb_build_object(
           'fullName', trim(p_full_name), 'email', trim(p_email),
           'phone', trim(p_phone), 'address', trim(p_address),
           'preference', trim(coalesce(p_preference, '')),
           'notes', nullif(trim(coalesce(p_notes, '')), ''))),
         status = 'info_submitted',
         reference = coalesce(reference,
           'YQ-' || extract(year from now() at time zone 'America/New_York')::int || '-' ||
           lpad(spot::text, 2, '0') ||
           upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)))
   where id = c.id
   returning * into c;
  return public.claim_json(c);
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Admin action log (triggers). actor = auth.uid(), null = system.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.log_admin_action(p_actor uuid, p_action text, p_target uuid, p_details jsonb)
returns void language sql security definer set search_path = public, extensions as $$
  insert into public.admin_actions (actor_id, actor_name, action, target_user_id, target_name, details)
  values (p_actor,
          case when p_actor is null then 'System' else coalesce(public.display_name_of(p_actor), 'Unknown') end,
          p_action, p_target,
          case when p_target is null then null else public.display_name_of(p_target) end,
          coalesce(p_details, '{}'::jsonb));
$$;

-- Manual points (adjust_points / award_activity). Approvals are logged by the submissions trigger.
create or replace function public.audit_ledger()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.source = 'manual' and new.created_by is not null then
    perform public.log_admin_action(coalesce(auth.uid(), new.created_by),
      case when new.amount > 0 then 'points_added' else 'points_removed' end, new.user_id,
      jsonb_build_object('amount', new.amount, 'reason', new.reason, 'activityId', new.activity_id));
  end if;
  return null;
end $$;
drop trigger if exists ledger_audit on public.ledger;
create trigger ledger_audit after insert on public.ledger
  for each row execute function public.audit_ledger();

create or replace function public.audit_submissions()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    perform public.log_admin_action(coalesce(auth.uid(), new.reviewer_id),
      'submission_' || new.status, new.user_id,
      jsonb_build_object('activityId', new.activity_id, 'reason', new.review_reason));
  end if;
  return null;
end $$;
drop trigger if exists submissions_audit on public.submissions;
create trigger submissions_audit after update of status on public.submissions
  for each row execute function public.audit_submissions();

create or replace function public.audit_profiles_role()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.role is distinct from old.role then
    perform public.log_admin_action(auth.uid(), 'role_changed', new.id,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return null;
end $$;
drop trigger if exists profiles_role_audit on public.profiles;
create trigger profiles_role_audit after update of role on public.profiles
  for each row execute function public.audit_profiles_role();

-- Events: create / edit (real fields only — not attendee_count bumps) / delete.
create or replace function public.audit_events()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_admin_action(coalesce(auth.uid(), new.created_by), 'event_created', null,
      jsonb_build_object('eventId', new.id, 'title', new.title, 'kind', new.kind, 'campus', new.campus));
  elsif tg_op = 'UPDATE' then
    if (new.title, new.campus, new.kind, new.location, new.starts_at, new.ends_at, new.check_in_grace_minutes)
       is distinct from
       (old.title, old.campus, old.kind, old.location, old.starts_at, old.ends_at, old.check_in_grace_minutes) then
      perform public.log_admin_action(auth.uid(), 'event_updated', null,
        jsonb_build_object('eventId', new.id, 'title', new.title, 'kind', new.kind, 'campus', new.campus));
    end if;
  else
    perform public.log_admin_action(auth.uid(), 'event_deleted', null,
      jsonb_build_object('eventId', old.id, 'title', old.title, 'kind', old.kind, 'campus', old.campus));
  end if;
  return null;
end $$;
drop trigger if exists events_audit on public.events;
create trigger events_audit after insert or update or delete on public.events
  for each row execute function public.audit_events();

create or replace function public.audit_prize_claims()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status is distinct from old.status and new.status in ('fulfilled','revoked') then
    perform public.log_admin_action(auth.uid(), 'prize_' || new.status, new.user_id,
      jsonb_build_object('spot', new.spot, 'reason', new.revoke_reason));
  end if;
  return null;
end $$;
drop trigger if exists prize_claims_audit on public.prize_claims;
create trigger prize_claims_audit after update of status on public.prize_claims
  for each row execute function public.audit_prize_claims();

create or replace function public.audit_cycles()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.is_active then
    perform public.log_admin_action(auth.uid(), 'cycle_reset', null,
      jsonb_build_object('name', new.name, 'endsAt', new.ends_at));
  end if;
  return null;
end $$;
drop trigger if exists cycles_audit on public.cycles;
create trigger cycles_audit after insert on public.cycles
  for each row execute function public.audit_cycles();

-- details = the changed settings (camelCase key → new value).
create or replace function public.audit_report_settings()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_new jsonb := public.report_settings_json(new)::jsonb - 'updatedAt';
  v_old jsonb := public.report_settings_json(old)::jsonb - 'updatedAt';
  v_changed jsonb;
begin
  select coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) into v_changed
    from jsonb_each(v_new) n
   where n.value is distinct from v_old->n.key;
  if v_changed <> '{}'::jsonb then
    perform public.log_admin_action(coalesce(auth.uid(), new.updated_by), 'report_settings_changed', null, v_changed);
  end if;
  return null;
end $$;
drop trigger if exists report_settings_audit on public.report_settings;
create trigger report_settings_audit after update on public.report_settings
  for each row execute function public.audit_report_settings();

create or replace function public.admin_action_log(p_limit int default 100, p_before bigint default null)
returns table (id bigint, actor_name text, action text, target_name text, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_chair();
  return query
    select a.id, a.actor_name, a.action, a.target_name, a.details, a.created_at
      from public.admin_actions a
     where p_before is null or a.id < p_before
     order by a.id desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Row Level Security: chairs read; nobody writes directly.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.report_settings enable row level security;
alter table public.email_outbox    enable row level security;
alter table public.admin_actions   enable row level security;

drop policy if exists report_settings_read on public.report_settings;
create policy report_settings_read on public.report_settings for select to authenticated using (public.is_chair());
drop policy if exists email_outbox_read on public.email_outbox;
create policy email_outbox_read on public.email_outbox for select to authenticated using (public.is_chair());
drop policy if exists admin_actions_read on public.admin_actions;
create policy admin_actions_read on public.admin_actions for select to authenticated using (public.is_chair());


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Grants (Supabase auto-grants new tables/functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on public.report_settings, public.email_outbox, public.admin_actions from anon, authenticated;
grant select on public.report_settings, public.email_outbox, public.admin_actions to authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- every new function: nobody by default
revoke execute on function
  public.admin_actions_append_only(), public.is_service_role(), public.require_service_role(),
  public.html_escape(text), public.campus_label(text), public.display_name_of(uuid),
  public.report_recipients(), public.enqueue_email(text, text[], text, text, text, text),
  public.email_layout(text, text), public.email_h2(text), public.build_weekly_report(),
  public.enqueue_weekly_report_if_due(), public.send_weekly_report_now(), public.weekly_report_preview(),
  public.send_test_email(), public.prize_alert_row(text, text), public.on_prize_claim_alert(),
  public.claim_email_batch(int), public.mark_email_result(uuid, boolean, text),
  public.email_log(int), public.retry_email(uuid),
  public.report_settings_json(public.report_settings), public.get_report_settings(),
  public.update_report_settings(jsonb),
  public.submit_claim_info(text, text, text, text, text, text),
  public.log_admin_action(uuid, text, uuid, jsonb), public.audit_ledger(), public.audit_submissions(),
  public.audit_profiles_role(), public.audit_events(), public.audit_prize_claims(), public.audit_cycles(),
  public.audit_report_settings(), public.admin_action_log(int, bigint)
from public, anon, authenticated, service_role;

-- user-callable RPCs (role checks happen inside)
grant execute on function
  public.send_weekly_report_now(), public.weekly_report_preview(), public.send_test_email(),
  public.email_log(int), public.retry_email(uuid),
  public.get_report_settings(), public.update_report_settings(jsonb),
  public.submit_claim_info(text, text, text, text, text, text),
  public.admin_action_log(int, bigint)
to authenticated;

-- Edge Function `send-emails` (service_role key) only
grant execute on function
  public.enqueue_weekly_report_if_due(), public.claim_email_batch(int), public.mark_email_result(uuid, boolean, text)
to service_role;

-- Done. Next: deploy the Edge Function `send-emails` and schedule it (see SETUP.md).

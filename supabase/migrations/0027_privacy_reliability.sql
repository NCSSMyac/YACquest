-- ═══════════════════════════════════════════════════════════════════════════
-- 0027 — Privacy + reliability.
--   • Report a problem: feedback.context (jsonb, bug reports only). submit_bug_report() saves a
--     'bug' feedback row with a small, scrubbed technical context (route, app version, browser,
--     screen, online, theme, time, last errors — never emails or tokens). feedback_details()
--     lets staff read it (Admin → Feedback → "Technical details"). Weekly email: bug count.
--   • Delete my account: delete_my_account(p_confirm) — the caller types their username.
--       - blocked for the last YACquest Chair (last_chair) and while a prize is on its way
--         (qualified / info_submitted: prize_pending — email the chairs first);
--       - their proof screenshots / event photos in the private `proofs` bucket go to
--         storage_purge_queue; the send-emails Edge Function removes them through the Storage
--         API on its next run (Supabase blocks deleting storage files with plain SQL);
--       - prize claims they won stay as anonymous rows ("Deleted account", delivery info erased)
--         so the number of prize spots taken stays right; the alert emails about that claim are removed;
--       - their email is removed from the email log (rows only addressed to them are deleted);
--       - staff action-log rows about them (or by them) are anonymized ("Deleted account");
--       - then the login itself (auth.users) is deleted, which cascades to the profile, points
--         ledger, submissions, check-ins, RSVPs, notifications, feedback, prize ideas, badges,
--         staff notes about them, Hero of the Week reigns and staff rewards.
--       - one anonymous row is logged: "An account was deleted" (System, no details).
--   • Two FK fixes so deletion works for staff too:
--       - ledger.created_by is ON DELETE SET NULL, but the ledger is append-only: the guard now
--         lets that one automatic change (created_by → null, nothing else) through;
--       - prize_claims.user_id becomes nullable + ON DELETE SET NULL (was CASCADE).
-- Run AFTER 0026. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Report a problem (bug reports with technical context)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.feedback add column if not exists context jsonb;

-- Removes anything that looks like an email address, a login token or a secret URL parameter.
create or replace function public.scrub_text(p text, p_max int)
returns text language sql immutable set search_path = public, extensions as $$
  select nullif(left(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''), 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?', '[token]', 'g'),
        '((access|refresh|provider)_token|token|code|password|apikey|key)=[^&#[:space:]]+', '\1=[hidden]', 'gi'),
      '[^[:space:]@<>()"'',;:/]+@[^[:space:]@<>()"'',;:/]+\.[A-Za-z]{2,}', '[email]', 'g'),
    p_max), '');
$$;

-- Keeps only the known keys, each trimmed and scrubbed. Anything else the browser sends is dropped.
create or replace function public.clean_bug_context(p jsonb)
returns jsonb language sql immutable set search_path = public, extensions as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then null else
    nullif(jsonb_strip_nulls(jsonb_build_object(
      'route',   public.scrub_text(p->>'route', 200),
      'trying',  public.scrub_text(p->>'trying', 500),
      'version', public.scrub_text(p->>'version', 80),
      'browser', public.scrub_text(p->>'browser', 120),
      'screen',  public.scrub_text(p->>'screen', 40),
      'online',  case when jsonb_typeof(p->'online') = 'boolean' then p->'online' end,
      'theme',   case when p->>'theme' in ('light', 'dark', 'system') then p->>'theme' end,
      'time',    public.scrub_text(p->>'time', 40),
      'errors',  case when jsonb_typeof(p->'errors') = 'array' then
                   (select jsonb_agg(public.scrub_text(e, 300)) from (
                      select e from jsonb_array_elements_text(p->'errors') with ordinality x(e, i)
                       where nullif(trim(e), '') is not null order by i limit 5) y) end
    )), '{}'::jsonb)
  end;
$$;

-- Participant: "🐞 Report a problem". Same limit as feedback (10 a day, shared).
create or replace function public.submit_bug_report(p_message text, p_context jsonb default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  v_msg text := trim(coalesce(p_message, ''));
  v_id  uuid;
begin
  if char_length(v_msg) < 3 or char_length(v_msg) > 1000 then
    perform public.api_error('message', 'Tell us what happened (3–1000 characters).');
  end if;
  if (select count(*) from public.feedback where user_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    perform public.api_error('limit', 'Thanks for all the reports! Please try again tomorrow.');
  end if;
  insert into public.feedback (user_id, category, message, context)
  values (v_uid, 'bug', v_msg, public.clean_bug_context(p_context)) returning id into v_id;
  return json_build_object('id', v_id);
end $$;

-- Staff: technical details for the given feedback rows (Admin → Feedback).
create or replace function public.feedback_details(p_ids uuid[])
returns table (id uuid, context jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query select f.id, f.context from public.feedback f where f.id = any(coalesce(p_ids, '{}')) and f.context is not null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Foreign keys that must allow account deletion
-- ─────────────────────────────────────────────────────────────────────────────
-- Ledger stays append-only; the only allowed UPDATE is Postgres itself setting created_by to null
-- when the staff member who added that row deletes their account.
create or replace function public.ledger_append_only()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'UPDATE' and old.created_by is not null and new.created_by is null
     and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') then
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'forbidden: The ledger is append-only. Add a correcting entry instead.';
end $$;

-- Prize claims outlive a deleted account as anonymous rows (so spots taken stay right).
alter table public.prize_claims alter column user_id drop not null;
alter table public.prize_claims drop constraint if exists prize_claims_user_id_fkey;
alter table public.prize_claims add constraint prize_claims_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

-- The action log stays append-only, except for delete_my_account() anonymizing a deleted person.
create or replace function public.admin_actions_append_only()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'UPDATE' and current_setting('yacquest.anonymize_log', true) = 'on'
     and new.id = old.id and new.action = old.action and new.created_at = old.created_at then
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'forbidden: The action log is append-only.';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Storage files waiting to be removed (by the send-emails Edge Function, via the Storage API)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.storage_purge_queue (
  id        bigint generated always as identity primary key,
  bucket_id text not null,
  name      text not null,
  queued_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table public.storage_purge_queue enable row level security;
revoke all on public.storage_purge_queue from anon, authenticated;

-- Edge Function (service role): next files to remove.
create or replace function public.claim_storage_purge(p_limit int default 100)
returns table (id bigint, bucket_id text, name text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_service_role();
  return query select q.id, q.bucket_id, q.name from public.storage_purge_queue q
                order by q.id limit least(greatest(coalesce(p_limit, 100), 1), 1000);
end $$;

-- Edge Function (service role): these are gone now.
create or replace function public.finish_storage_purge(p_ids bigint[])
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform public.require_service_role();
  delete from public.storage_purge_queue where id = any(coalesce(p_ids, '{}'));
  get diagnostics n = row_count;
  return n;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Delete my account
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_my_account(p_confirm text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid    uuid := public.require_user();
  p        public.profiles;
  v_email  text;
  v_files  int := 0;
  v_claims uuid[];
begin
  select * into p from public.profiles where id = v_uid;
  if p.id is null then
    perform public.api_error('not_found', 'We couldn’t find your account.');
  end if;
  if lower(trim(both ' @' from coalesce(p_confirm, ''))) is distinct from lower(p.handle::text) then
    perform public.api_error('confirm', 'Type your username exactly (without the @) to confirm.');
  end if;
  if p.role = 'chair' and (select count(*) from public.profiles where role = 'chair') <= 1 then
    perform public.api_error('last_chair', 'You’re the only YACquest Chair. Make someone else a YACquest Chair first (Admin → Team), then delete your account.');
  end if;
  if exists (select 1 from public.prize_claims where user_id = v_uid and status in ('qualified', 'info_submitted')) then
    perform public.api_error('prize_pending', 'Your prize is still on its way! Please email the YACquest Chairs before deleting your account, so we can finish delivering your gift card.');
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  -- 1. Uploaded proof screenshots + event photos → removed by the Edge Function via the Storage API.
  insert into public.storage_purge_queue (bucket_id, name)
  select o.bucket_id, o.name from storage.objects o
   where o.bucket_id = 'proofs' and (o.owner = v_uid or o.name like v_uid::text || '/%')
  on conflict (bucket_id, name) do nothing;
  get diagnostics v_files = row_count;

  -- 2. Prize claims they won (delivered or revoked): anonymous rows, no delivery info, no alert emails.
  select array_agg(c.id) into v_claims from public.prize_claims c where c.user_id = v_uid;
  if v_claims is not null then
    delete from public.email_outbox e
     where e.kind in ('prize_qualified', 'prize_info')
       and exists (select 1 from unnest(v_claims) c where e.dedupe_key like 'prize\_%:' || c::text || '%');
    update public.prize_claims set display_name = 'Deleted account', contact = null, reference = null where user_id = v_uid;
  end if;

  -- 3. Email log: take their address out; drop emails that were only for them.
  if v_email is not null then
    update public.email_outbox e
       set to_emails = array(select x from unnest(e.to_emails) x where lower(x) <> lower(v_email))
     where exists (select 1 from unnest(e.to_emails) x where lower(x) = lower(v_email));
    delete from public.email_outbox where cardinality(to_emails) = 0;
  end if;

  -- 4. Staff action log: anonymize rows about them or by them (the log itself stays append-only).
  perform set_config('yacquest.anonymize_log', 'on', true);
  update public.admin_actions
     set target_user_id = null, target_name = 'Deleted account',
         details = details - array['from', 'to', 'message', 'note', 'body']
   where target_user_id = v_uid;
  update public.admin_actions set actor_id = null, actor_name = 'Deleted account' where actor_id = v_uid;
  perform set_config('yacquest.anonymize_log', 'off', true);

  -- 5. The login itself. Cascades to the profile and everything that belongs to it.
  delete from auth.users where id = v_uid;

  perform public.log_admin_action(null, 'account_deleted', null, '{}'::jsonb);
  return json_build_object('deleted', true, 'files', v_files);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Weekly committee report: copy of 0022 + one line — bug reports this week
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
  sh        json := public.monthly_shoutout_data();
  v_month   text;
  v_next_t  text;  -- 0022
  v_next_h  text;  -- 0022
  v_bugs    int;   -- 0027
  v_bugs_ctx int;  -- 0027
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

  -- Adventurer of the month (0012): last completed month's winner, else this month's leader so far
  t := t || E'\n⭐ ADVENTURER OF THE MONTH\n';
  h := h || public.email_h2('⭐ Adventurer of the month');
  if sh is null then
    t := t || E'  No points earned this month yet.\n';
    h := h || '<p style="margin:0;">No points earned this month yet.</p>';
  else
    v_month := public.month_label(sh->>'month');
    if (sh->>'final')::boolean then
      t := t || format(E'  %s (%s) — %s points in %s. Give them a shout-out!\n',
                       sh->>'displayName', public.campus_label(sh->>'campus'), sh->>'pointsThisMonth', v_month);
    else
      t := t || format(E'  Leading %s so far: %s (%s) — %s points. Give them a shout-out!\n',
                       v_month, sh->>'displayName', public.campus_label(sh->>'campus'), sh->>'pointsThisMonth');
    end if;
    h := h || '<div style="background:#fff6e3;border:1px solid #f2b33d;border-radius:10px;padding:12px 14px;">'
           || case when (sh->>'final')::boolean then ''
                   else '<div style="font-size:12px;color:#5b6475;text-transform:uppercase;">Leading ' || v_month || ' so far</div>' end
           || '<div style="font-size:17px;font-weight:700;color:#0b2a5b;">⭐ ' || public.html_escape(sh->>'displayName')
           || ' <span style="font-weight:400;color:#5b6475;font-size:14px;">(' || public.campus_label(sh->>'campus') || ')</span></div>'
           || '<div style="font-size:14px;margin-top:4px;"><b>' || (sh->>'pointsThisMonth') || ' points</b> in ' || v_month
           || case when (sh->>'final')::boolean then '' else ' so far' end || '. Give them a shout-out!</div></div>';
  end if;

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

  -- Feedback (last 7 days): general feedback + prize suggestions (0008)
  t := t || E'\nFEEDBACK (last 7 days)\n';
  h := h || public.email_h2('💬 Feedback (last 7 days)');
  -- 0027: how many of these were "Report a problem" bug reports (technical details are in Admin → Feedback)
  select count(*), count(*) filter (where f.context is not null) into v_bugs, v_bugs_ctx
    from public.feedback f where f.category = 'bug' and f.created_at >= now() - interval '7 days';
  t := t || format(E'  Bug reports this week: %s%s\n', v_bugs,
                   case when v_bugs_ctx > 0 then format(' (%s with technical details in Admin → Feedback)', v_bugs_ctx) else '' end);
  h := h || '<p style="margin:0 0 8px;font-size:14px;">🐞 <b>Bug reports this week: ' || v_bugs || '</b>'
         || case when v_bugs_ctx > 0 then ' <span style="color:#5b6475;">(' || v_bugs_ctx || ' with technical details in Admin → Feedback)</span>' else '' end
         || '</p>';
  n := 0;
  for r in select * from (
             -- 0013: anonymous feedback never carries the sender's name or campus into the email
             select f.created_at, f.category as cat, f.message as msg, f.anonymous as anon,
                    case when f.anonymous then null else p.display_name end as display_name,
                    case when f.anonymous then null else p.campus end as campus
               from public.feedback f join public.profiles p on p.id = f.user_id
              where f.created_at >= now() - interval '7 days'
             union all
             select s.created_at, 'prize'::text, s.idea, false, p.display_name, p.campus
               from public.prize_suggestions s join public.profiles p on p.id = s.user_id
              where s.created_at >= now() - interval '7 days'
           ) x
           order by x.created_at desc
           limit 30 loop
    n := n + 1;
    if r.anon then
      t := t || format(E'  [%s] Anonymous: %s\n', public.feedback_label(r.cat), r.msg);
    else
      t := t || format(E'  [%s] %s (%s): %s\n', public.feedback_label(r.cat), r.display_name, public.campus_label(r.campus), r.msg);
    end if;
    h := h || '<div style="border-left:4px solid #f2b33d;padding:6px 10px;margin:0 0 8px;background:#fffaf0;">'
           || '<div style="font-size:12px;color:#5b6475;"><b>' || public.feedback_label(r.cat) || '</b> · '
           || case when r.anon then 'Anonymous'
                   else public.html_escape(r.display_name) || ' (' || public.campus_label(r.campus) || ')' end || '</div>'
           || '<div style="font-size:14px;white-space:pre-wrap;">' || public.html_escape(r.msg) || '</div></div>';
  end loop;
  if n = 0 then
    t := t || E'  No new feedback this week.\n';
    h := h || '<p style="margin:0;">No new feedback this week.</p>';
  else
    h := h || '<p style="margin:4px 0 0;font-size:13px;">See and mark reviewed in YACquest → Admin → Feedback.</p>';
  end if;

  -- 0022: one line — events in the next 7 days with their RSVP counts
  select string_agg(format('%s (%s) · %s going', e.title, trim(to_char(e.starts_at at time zone 'America/New_York', 'Dy Mon FMDD')), x.n), '; ' order by e.starts_at, e.id),
         string_agg('<b>' || public.html_escape(e.title) || '</b> (' || trim(to_char(e.starts_at at time zone 'America/New_York', 'Dy Mon FMDD'))
                    || ') · ' || x.n || ' going', '; ' order by e.starts_at, e.id)
    into v_next_t, v_next_h
    from public.events e
    cross join lateral (select count(*)::int as n from public.event_rsvps rv where rv.event_id = e.id) x
   where e.cycle_id = v_cycle and e.starts_at >= now() and e.starts_at < now() + interval '7 days';
  t := t || E'\n📅 NEXT 7 DAYS (RSVPs): ' || coalesce(v_next_t, 'No events scheduled.') || E'\n';
  h := h || '<p style="margin:16px 0 0;font-size:14px;">📅 <b>Next 7 days (RSVPs):</b> ' || coalesce(v_next_h, 'No events scheduled.') || '</p>';

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

  -- 0015: Yak of the week (footer line)
  t := t || E'\n🐂 Yak of the week: ' || public.yak_pun_of_the_week() || E'\n';
  h := h || '<p style="margin:18px 0 0;color:#5b6475;font-size:13px;font-style:italic;">🐂 Yak of the week: ' || public.html_escape(public.yak_pun_of_the_week()) || '</p>';

  return json_build_object('subject', v_subject, 'text', t, 'html', public.email_layout('Weekly committee report · ' || v_date, h));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.scrub_text(text, int), public.clean_bug_context(jsonb), public.build_weekly_report()
from public, anon, authenticated, service_role;

revoke execute on function
  public.submit_bug_report(text, jsonb), public.feedback_details(uuid[]), public.delete_my_account(text),
  public.claim_storage_purge(int), public.finish_storage_purge(bigint[])
from public, anon;

grant execute on function public.submit_bug_report(text, jsonb), public.feedback_details(uuid[]), public.delete_my_account(text)
to authenticated;

revoke execute on function public.claim_storage_purge(int), public.finish_storage_purge(bigint[]) from authenticated;
grant execute on function public.claim_storage_purge(int), public.finish_storage_purge(bigint[]) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0013 — Launch extras.
--   • Anonymous feedback: feedback.anonymous (default false). submit_feedback() gets
--     p_anonymous boolean default false (old 2-argument calls still work). The sender is
--     still stored (rate limit, "Voice of the Herd" badge) but list_feedback() and the
--     weekly committee email show "Anonymous" with no name, handle or campus.
--   • Sign-up "Email me announcements from YAC": handle_new_user() reads
--     raw_user_meta_data.email_opt_in (missing → true, as before).
--   • admin_event_attendees(p_event_id): who checked in to an event (admins + chairs).
--
-- RE-RUN NOTE: 0008 (re-)creates submit_feedback(text, text) and list_feedback(text, int)
-- with the old result. Postgres can't change a result type in place, so — like 0009 did
-- for leaderboard — the new list_feedback uses p_status varchar and this file drops the
-- old versions. Callers (RPC/SQL) don't notice: same parameter names and defaults.
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0012. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Anonymous feedback
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.feedback add column if not exists anonymous boolean not null default false;

drop function if exists public.submit_feedback(text, text);
drop function if exists public.list_feedback(text, int);

-- Participant: send feedback. 10 per person per day. Same rules as 0008 plus p_anonymous.
create or replace function public.submit_feedback(p_category text, p_message text, p_anonymous boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  v_msg text := trim(coalesce(p_message, ''));
  v_id  uuid;
begin
  if coalesce(p_category, '') not in ('idea', 'bug', 'event', 'other') then
    perform public.api_error('category', 'Pick what kind of feedback this is.');
  end if;
  if char_length(v_msg) < 3 or char_length(v_msg) > 1000 then
    perform public.api_error('message', 'Feedback: 3–1000 characters.');
  end if;
  if (select count(*) from public.feedback where user_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    perform public.api_error('limit', 'Thanks for all the feedback! Please try again tomorrow.');
  end if;
  insert into public.feedback (user_id, category, message, anonymous)
  values (v_uid, p_category, v_msg, coalesce(p_anonymous, false)) returning id into v_id;
  return json_build_object('id', v_id);
end $$;

-- Admin: feedback + prize suggestions, newest first. p_status: null (all) | 'new' | 'reviewed'.
-- Anonymous rows: display_name 'Anonymous', handle and campus null.
create or replace function public.list_feedback(p_status varchar default null, p_limit int default 50)
returns table (id uuid, kind text, category text, message text, status text, display_name text, handle text,
               campus text, reviewed_by_name text, reviewed_at timestamptz, created_at timestamptz, anonymous boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
    select * from (
      select f.id, 'feedback'::text, f.category, f.message, f.status,
             case when f.anonymous then 'Anonymous' else p.display_name end,
             case when f.anonymous then null else p.handle::text end,
             case when f.anonymous then null else p.campus end,
             public.display_name_of(f.reviewed_by), f.reviewed_at, f.created_at, f.anonymous
        from public.feedback f join public.profiles p on p.id = f.user_id
      union all
      select s.id, 'prize'::text, 'prize'::text, s.idea, s.status, p.display_name, p.handle::text, p.campus,
             public.display_name_of(s.reviewed_by), s.reviewed_at, s.created_at, false
        from public.prize_suggestions s join public.profiles p on p.id = s.user_id
    ) x
    where p_status is null or x.status = p_status::text
    order by x.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Weekly committee report: copy of 0012 — only the feedback section changes
--    (anonymous rows show "Anonymous", no name or campus).
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Sign-up trigger: copy of 0011 + email_opt_in from the sign-up metadata
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_handle    text  := nullif(trim(meta->>'handle'), '');
  v_name      text  := nullif(trim(meta->>'display_name'), '');
  v_campus    text  := coalesce(nullif(meta->>'campus', ''), 'unc');
  v_avatar    text  := coalesce(nullif(meta->>'avatar', ''), 'yak');
  v_code      text  := nullif(upper(trim(meta->>'friend_code')), '');
  -- 0013: the sign-up checkbox "Email me announcements from YAC". Missing → on (as before).
  v_opt_in    boolean := coalesce(lower(trim(meta->>'email_opt_in')), 'true') not in ('false', 'f', '0', 'no', 'off');
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
    if not public.name_is_clean(v_handle) then
      v_handle := 'player' || floor(random() * 10000)::int;
    end if;
    while exists (select 1 from public.profiles where handle = v_handle::citext) loop
      v_handle := left(v_handle, 15) || floor(random() * 10000)::int;
    end loop;
  elsif v_handle !~ '^[a-zA-Z0-9_.]{3,20}$' then
    perform public.api_error('handle', 'Username: 3–20 letters, numbers, dots or underscores.');
  elsif not public.name_is_clean(v_handle) then
    perform public.api_error('handle', 'Please pick a different name — keep it friendly for everyone.');
  elsif exists (select 1 from public.profiles where handle = v_handle::citext) then
    perform public.api_error('handle', 'That username is taken.');
  end if;

  if v_name is not null and not public.name_is_clean(v_name) then
    perform public.api_error('displayName', 'Please pick a different name — keep it friendly for everyone.');
  end if;
  v_name := coalesce(v_name, left(v_local, 24));
  -- fallback name from the email must be clean too; the handle always is.
  if char_length(v_name) < 2 or not public.name_is_clean(v_name) then v_name := v_handle; end if;
  if char_length(v_name) > 24 then
    perform public.api_error('displayName', 'Display name: 2–24 characters.');
  end if;
  if v_campus not in ('duke','unc','ncsu') then
    perform public.api_error('campus', 'Pick your campus.');
  end if;
  if v_avatar not in ('yak','unicorn','dragon','knight','mage','ranger') then
    v_avatar := 'yak';
  end if;

  if v_code is not null then
    select id into v_referrer from public.profiles where friend_code = v_code;
    if v_referrer is null then
      perform public.api_error('friendCode', 'We couldn’t find that friend code.');
    end if;
  end if;

  -- Bootstrap chairs (never more than app_config.max_chairs chairs).
  if exists (select 1 from public.chair_bootstrap where email = new.email::citext)
     and (select count(*) from public.profiles where role = 'chair') < coalesce(cfg.max_chairs, 5) then
    v_role := 'chair';
  end if;

  insert into public.profiles (id, handle, display_name, email, campus, role, avatar, friend_code, referred_by, email_opt_in)
  values (new.id, v_handle, v_name, new.email, v_campus, v_role, v_avatar, public.make_friend_code(), v_referrer, v_opt_in);

  perform public.notify(new.id, 'announcement', 'Welcome to YACquest!',
    format('Earn points all year. The first %s people to reach %s win a $%s gift card.',
           cfg.prize_count, cfg.prize_goal, cfg.prize_value_usd));
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Event attendance list (admins + chairs). One row per check-in ledger row
--    (source 'checkin', ref_id = event id), as recorded — oldest first.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_event_attendees(p_event_id uuid)
returns table (user_id uuid, display_name text, handle text, campus text, checked_in_at timestamptz, points int)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    perform public.require_user();
    perform public.api_error('forbidden', 'Only YAC admins and chairs can see who came.');
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  return query
    select l.user_id, p.display_name, p.handle::text, p.campus, l.created_at, l.amount
      from public.ledger l join public.profiles p on p.id = l.user_id
     where l.source = 'checkin' and l.ref_id = p_event_id::text
     order by l.created_at, l.id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.build_weekly_report() from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function
  public.submit_feedback(text, text, boolean), public.list_feedback(varchar, int), public.admin_event_attendees(uuid)
from public, anon;
grant execute on function
  public.submit_feedback(text, text, boolean), public.list_feedback(varchar, int), public.admin_event_attendees(uuid)
to authenticated;

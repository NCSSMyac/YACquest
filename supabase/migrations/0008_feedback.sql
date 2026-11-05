-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — General feedback.
--   • Participants send feedback (Idea / Bug or problem / Event idea / Other) from the Me page.
--   • Admins see feedback + prize suggestions together in Admin → Feedback and mark them reviewed.
--   • The weekly committee email gets a "💬 Feedback (last 7 days)" section.
-- Run AFTER 0007. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  category     text not null check (category in ('idea', 'bug', 'event', 'other')),
  message      text not null check (char_length(message) between 3 and 1000),
  status       text not null default 'new' check (status in ('new', 'reviewed')),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;
drop policy if exists feedback_admin_read on public.feedback;
create policy feedback_admin_read on public.feedback for select to authenticated using (public.is_admin());
grant select on public.feedback to authenticated;

-- Prize suggestions get the same reviewed/new tracking.
alter table public.prize_suggestions add column if not exists status text not null default 'new';
alter table public.prize_suggestions add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.prize_suggestions add column if not exists reviewed_at timestamptz;

create or replace function public.feedback_label(p text)
returns text language sql immutable set search_path = public, extensions as $$
  select case p when 'idea' then 'Idea' when 'bug' then 'Bug / problem' when 'event' then 'Event idea'
                when 'prize' then 'Prize idea' else 'Other' end;
$$;

-- Participant: send feedback. 10 per person per day.
create or replace function public.submit_feedback(p_category text, p_message text)
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
  insert into public.feedback (user_id, category, message) values (v_uid, p_category, v_msg) returning id into v_id;
  return json_build_object('id', v_id);
end $$;

-- Admin: feedback + prize suggestions, newest first. p_status: null (all) | 'new' | 'reviewed'.
create or replace function public.list_feedback(p_status text default null, p_limit int default 50)
returns table (id uuid, kind text, category text, message text, status text, display_name text, handle text,
               campus text, reviewed_by_name text, reviewed_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
    select * from (
      select f.id, 'feedback'::text, f.category, f.message, f.status, p.display_name, p.handle::text, p.campus,
             public.display_name_of(f.reviewed_by), f.reviewed_at, f.created_at
        from public.feedback f join public.profiles p on p.id = f.user_id
      union all
      select s.id, 'prize'::text, 'prize'::text, s.idea, s.status, p.display_name, p.handle::text, p.campus,
             public.display_name_of(s.reviewed_by), s.reviewed_at, s.created_at
        from public.prize_suggestions s join public.profiles p on p.id = s.user_id
    ) x
    where p_status is null or x.status = p_status
    order by x.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- Admin: mark one item reviewed. p_kind: 'feedback' | 'prize'.
create or replace function public.mark_feedback_reviewed(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.require_admin();
  v_user  uuid;
  v_text  text;
begin
  if p_kind = 'feedback' then
    update public.feedback set status = 'reviewed', reviewed_by = v_admin, reviewed_at = now()
     where id = p_id returning user_id, message into v_user, v_text;
  elsif p_kind = 'prize' then
    update public.prize_suggestions set status = 'reviewed', reviewed_by = v_admin, reviewed_at = now()
     where id = p_id returning user_id, idea into v_user, v_text;
  else
    perform public.api_error('kind', 'Unknown feedback type.');
  end if;
  if v_user is null then
    perform public.api_error('not_found', 'That feedback no longer exists.');
  end if;
  perform public.log_admin_action(v_admin, 'feedback_reviewed', v_user, jsonb_build_object('kind', p_kind, 'message', left(v_text, 120)));
end $$;

-- Weekly report now includes feedback (same as 0004 plus the new section).
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

  -- Feedback (last 7 days): general feedback + prize suggestions (0008)
  t := t || E'\nFEEDBACK (last 7 days)\n';
  h := h || public.email_h2('💬 Feedback (last 7 days)');
  n := 0;
  for r in select * from (
             select f.created_at, f.category as cat, f.message as msg, p.display_name, p.campus
               from public.feedback f join public.profiles p on p.id = f.user_id
              where f.created_at >= now() - interval '7 days'
             union all
             select s.created_at, 'prize'::text, s.idea, p.display_name, p.campus
               from public.prize_suggestions s join public.profiles p on p.id = s.user_id
              where s.created_at >= now() - interval '7 days'
           ) x
           order by x.created_at desc
           limit 30 loop
    n := n + 1;
    t := t || format(E'  [%s] %s (%s): %s\n', public.feedback_label(r.cat), r.display_name, public.campus_label(r.campus), r.msg);
    h := h || '<div style="border-left:4px solid #f2b33d;padding:6px 10px;margin:0 0 8px;background:#fffaf0;">'
           || '<div style="font-size:12px;color:#5b6475;"><b>' || public.feedback_label(r.cat) || '</b> · '
           || public.html_escape(r.display_name) || ' (' || public.campus_label(r.campus) || ')</div>'
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

revoke execute on function public.feedback_label(text) from public, anon;
revoke execute on function public.submit_feedback(text, text) from public, anon;
revoke execute on function public.list_feedback(text, int) from public, anon;
revoke execute on function public.mark_feedback_reviewed(text, uuid) from public, anon;
revoke execute on function public.build_weekly_report() from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text) to authenticated;
grant execute on function public.list_feedback(text, int) to authenticated;
grant execute on function public.mark_feedback_reviewed(text, uuid) to authenticated;

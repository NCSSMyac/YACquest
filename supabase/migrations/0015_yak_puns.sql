-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — Yak puns.
--   • public.yak_pun(p_seed int): one pun from a fixed list, list[|seed| mod n]. The list is
--     a copy of src/lib/yakPuns.ts (same puns, same order — src/__tests__/yakPuns.test.ts
--     parses this file and fails if they drift). Change both together.
--   • public.yak_pun_of_the_week(): seeded by the America/New_York ISO week as YYYYWW
--     (e.g. 202645), same as yakPunOfTheWeek() in the app / mock.
--   • build_weekly_report(): copy of 0013 — only adds a "🐂 Yak of the week" footer line
--     (text + HTML).
--   • on_prize_claim_alert(): copy of 0004 — only adds the same line to both admin prize
--     alerts (text + HTML). Dedupe keys are unchanged.
--   Participant announcement emails (send_announcement) are NOT changed.
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0014. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The puns (KEEP IN SYNC with src/lib/yakPuns.ts)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.yak_pun(p_seed int)
returns text language sql immutable set search_path = public, extensions as $$
  select p[1 + (abs(coalesce(p_seed, 0)::bigint) % cardinality(p))::int]
    from (select array[
    'Yak to the future!',
    'You’re on the right yak.',
    'Don’t yak out now, keep questing!',
    'Yakety yak, check in and come back.',
    'Let’s keep this on yak.',
    'That was yak-tually amazing.',
    'Yak-cellent work, adventurer!',
    'Stay on yak and the prize is yours.',
    'We’ve got your yak.',
    'Hit the yak, Jack.',
    'Don’t look yak, keep climbing.',
    'Yak attack: go claim those points!',
    'Fast yak to the leaderboard.',
    'Keep calm and yak on.',
    'Every yak counts.',
    'The yak is back!',
    'You’re the yak of all trades.',
    'Yak-ademic weapon, reporting for duty.',
    'Yaks to the max!',
    'Two yaks are better than one. Bring a friend!',
    'Yak-pot! Points incoming.',
    'Yak the halls with points and glory.',
    'Yak-tion speaks louder than words.',
    'Ready, set, yak!',
    'Yak-ity split, here come the points.',
    'Yak-nowledge your greatness.',
    'Fur real, you’ve got this.',
    'Big yak energy.',
    'Quest, yak, repeat.',
    'Mountains are just yak speed bumps.',
    'Aim high. Yaks live at 15,000 feet.',
    'Yak-ing it one quest at a time.',
    'Yak in business, baby!',
    'Everything’s going yak-cording to plan.',
    'Hair today, points tomorrow.',
    'Yak-tivate quest mode!',
    'Herd it here first: you’re crushing it.',
    'Yak-cept the challenge.',
    'Have a yak-tastic day!',
    'Yak-pack ready, adventure awaits.'
    ]::text[] as p) x;
$$;

-- Internal: this week's pun (America/New_York ISO week, seed YYYYWW).
create or replace function public.yak_pun_of_the_week()
returns text language sql stable set search_path = public, extensions as $$
  select public.yak_pun(to_char(now() at time zone 'America/New_York', 'IYYYIW')::int);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Weekly committee report: copy of 0013 + "Yak of the week" footer line
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

  -- 0015: Yak of the week (footer line)
  t := t || E'\n🐂 Yak of the week: ' || public.yak_pun_of_the_week() || E'\n';
  h := h || '<p style="margin:18px 0 0;color:#5b6475;font-size:13px;font-style:italic;">🐂 Yak of the week: ' || public.html_escape(public.yak_pun_of_the_week()) || '</p>';

  return json_build_object('subject', v_subject, 'text', t, 'html', public.email_layout('Weekly committee report · ' || v_date, h));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Admin prize alerts: copy of 0004 + "Yak of the week" line
--    (the triggers from 0004 keep pointing at this function)
-- ─────────────────────────────────────────────────────────────────────────────
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
             new.display_name, public.campus_label(new.campus), cfg.prize_goal, new.spot, cfg.prize_count, cfg.prize_value_usd)
        || E'\n🐂 Yak of the week: ' || public.yak_pun_of_the_week() || E'\n',
      public.email_layout(format('%s won spot #%s', new.display_name, new.spot),
        '<p style="margin:0 0 10px;font-size:17px;"><b>' || public.html_escape(new.display_name) || '</b> ('
        || public.campus_label(new.campus) || ') reached <b>' || cfg.prize_goal || ' points</b> and won prize spot <b>#'
        || new.spot || ' of ' || cfg.prize_count || '</b> — a <b>$' || cfg.prize_value_usd || ' gift card</b>. 🏆</p>'
        || '<p style="margin:0;color:#5b6475;">They are waiting to send their delivery info. You will get another email as soon as they do.</p>'
        || '<p style="margin:12px 0 0;color:#5b6475;font-size:13px;font-style:italic;">🐂 Yak of the week: ' || public.html_escape(public.yak_pun_of_the_week()) || '</p>'),
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
             coalesce(new.reference, '—'), public.campus_label(new.campus))
        || E'\n🐂 Yak of the week: ' || public.yak_pun_of_the_week() || E'\n',
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
        || '</table>'
        || '<p style="margin:12px 0 0;color:#5b6475;font-size:13px;font-style:italic;">🐂 Yak of the week: ' || public.html_escape(public.yak_pun_of_the_week()) || '</p>'),
      'prize_info:' || new.id || ':' || md5(new.contact::text));
  end if;
  return null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants (Supabase auto-grants new functions to anon + authenticated): internal only
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.yak_pun(int), public.yak_pun_of_the_week()
from public, anon, authenticated, service_role;
revoke execute on function public.build_weekly_report(), public.on_prize_claim_alert()
from public, anon, authenticated, service_role;

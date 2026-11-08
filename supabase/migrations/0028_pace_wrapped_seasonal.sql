-- ═══════════════════════════════════════════════════════════════════════════
-- 0028 — Pace tracker, YACquest Wrapped + end-of-year wrap-up, seasonal wardrobe.
--
--   • Pace tracker (staff): admin_pace(p_now default null) → per-week point totals this cycle, every
--     participant's points + first activity, and the top 10's cumulative points per week. The app
--     does the projection (src/lib/pace.ts). Participants only (staff never counted).
--
--   • YACquest Wrapped:
--       - wrapped_opens_at(ends_at) = one week before the cycle's last day (America/New_York, midnight):
--         Apr 24, 2027 for the 2026–27 cycle. Same value as WRAPPED.opensAt in src/config.ts.
--       - my_wrapped() → the caller's year in numbers (points, events + favorite campus / event type,
--         best month, badges + rarest badge with "only N% of players have it", best streak, friends
--         brought, rank / top X% overall and on their campus, Adventurer of the Month wins, look,
--         points mix for the "YAC personality"). Staff get their staff stats (reviews, events hosted,
--         Hero of the Week, Council badges) instead of a rank; staff are never in percentiles or
--         badge rarity. Before opens_at: 'not_open' for everyone except YACquest Chairs (preview).
--       - wrapped_badge_rarity: per-cycle cache of how many participants hold each badge (≤ 1 h old).
--       - queue_wrapped_notifications(p_now default now()) → int: once per cycle (wrapped_sends marker),
--         when opens_at has passed and we're still inside the wrap-up window (cycle end + 14 days):
--         an in-app notification (kind 'wrapped') "Your YACquest Wrapped is here! 🎁" to everyone
--         (participants + staff), plus an email teaser (points · events · badges + link to #/wrapped)
--         to people with email updates on. Service role only. Rides on the every-10-minutes
--         send-emails run: enqueue_weekly_report_if_due() is re-created below (exact copy of 0026)
--         with one more guarded call. email_outbox.kind also allows 'wrapped'.
--       - app_config.app_url (default https://ncssmyac.github.io/YACquest/) for the email link.
--
--   • End-of-year checklist: table eoy_checklist (one row per cycle × item), eoy_checklist() (staff)
--     and set_eoy_item(p_item, p_done) (staff; 'reset' is YACquest Chair only and only after the
--     cycle has ended; 'wrapped_sent' ticks itself). Logged ('eoy_item_checked' / 'eoy_item_unchecked').
--
--   • Seasonal wardrobe:
--       - cosmetics.rule_type 'seasonal' (rule_value = holiday id) + 7 items.
--       - seasonal_holidays (id, name, emoji) and seasonal_windows (holiday, year, starts_on, ends_on;
--         inclusive, America/New_York). ⚠️ Dates must be verified every year (Diwali follows the lunar
--         calendar) and kept in sync with SEASONAL in src/config.ts. Indigenous Peoples' Day uses
--         second_monday_of_october(year) ± 7 days.
--       - seasonal_unlocks (user_id, item_id): claimed items stay owned forever (not reset with the cycle).
--       - claim_seasonal_items() → {claimed, active}: records every item whose window is open today
--         for the caller (participants AND staff) and sends one 'seasonal' notification per holiday
--         the first time. The app calls it on load and when the Wardrobe opens; equip_look() claims too.
--       - unlocks_for() / my_unlocks() re-created (0009 + owned seasonal items); equip_look() re-created
--         (0020 + claim first): owned seasonal items can be worn any time; unowned ones are 'locked'.
--       - Seasonal items never affect points.
--
-- Run AFTER 0027. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Config + email kind
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.app_config add column if not exists app_url text not null default 'https://ncssmyac.github.io/YACquest/';

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.email_outbox'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.email_outbox drop constraint %I', c);
  end loop;
end $$;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('weekly_report', 'prize_qualified', 'prize_info', 'test', 'announcement', 'event_reminder', 'event_followup', 'wrapped'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Pace tracker (staff). The projection itself happens in the app (src/lib/pace.ts).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_pace(p_now timestamptz default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_now   timestamptz := coalesce(p_now, now());
  v_cycle uuid := public.active_cycle_id();
  cyc     public.cycles;
  cfg     public.app_config;
  r       jsonb;
begin
  perform public.require_admin();
  select * into cyc from public.cycles where id = v_cycle;
  select * into cfg from public.app_config where id = 1;

  with
  parts as (select p.id, p.display_name, p.campus from public.profiles p where p.role = 'participant'),
  led as (
    select l.user_id, l.amount, l.created_at,
           date_trunc('week', l.created_at at time zone 'America/New_York')::date as wk
      from public.ledger l join parts p on p.id = l.user_id
     where l.cycle_id = v_cycle and l.created_at <= v_now
  ),
  weeks as (
    select w::date as wk
      from generate_series(date_trunc('week', cyc.starts_at at time zone 'America/New_York'),
                           date_trunc('week', least(v_now, cyc.ends_at) at time zone 'America/New_York'),
                           interval '7 days') w
  ),
  tot as (select led.wk, sum(led.amount)::int as pts from led group by led.wk),
  per as (
    select led.user_id, sum(led.amount)::int as pts, min(led.created_at) filter (where led.amount > 0) as first_at
      from led group by led.user_id
  ),
  top as (
    select per.user_id, per.pts, p.display_name, p.campus
      from per join parts p on p.id = per.user_id
     where per.pts > 0
     order by per.pts desc, p.display_name, p.id
     limit 10
  )
  select jsonb_build_object(
    'generatedAt', v_now,
    'goal', coalesce(cfg.prize_goal, 350),
    'prizeCount', coalesce(cfg.prize_count, 4),
    'cycle', jsonb_build_object('name', cyc.name, 'startsAt', cyc.starts_at, 'endsAt', cyc.ends_at),
    'weeks', (select coalesce(jsonb_agg(w.wk order by w.wk), '[]'::jsonb) from weeks w),
    'weeklyTotals', (select coalesce(jsonb_agg(coalesce(t.pts, 0) order by w.wk), '[]'::jsonb)
                       from weeks w left join tot t on t.wk = w.wk),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', per.user_id, 'name', p.display_name, 'campus', p.campus,
                                                             'points', per.pts, 'firstAt', per.first_at)
                                          order by per.pts desc, p.display_name, p.id), '[]'::jsonb)
                  from per join parts p on p.id = per.user_id),
    'top', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', top.user_id, 'name', top.display_name, 'campus', top.campus, 'points', top.pts,
                     'cumulative', (select jsonb_agg((select coalesce(sum(led.amount), 0) from led
                                                       where led.user_id = top.user_id and led.wk <= w.wk) order by w.wk)
                                      from weeks w))
                   order by top.pts desc, top.display_name, top.user_id), '[]'::jsonb) from top)
  ) into r;
  return r::json;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. YACquest Wrapped
-- ─────────────────────────────────────────────────────────────────────────────
-- One week before the cycle's last day, at midnight America/New_York (May 1 23:59 → Apr 24 00:00).
create or replace function public.wrapped_opens_at(p_ends_at timestamptz)
returns timestamptz language sql stable set search_path = public, extensions as $$
  select (date_trunc('day', p_ends_at at time zone 'America/New_York') - interval '7 days') at time zone 'America/New_York';
$$;

-- Cache: how many participants hold each badge this cycle (badges_for() for everyone is slow-ish).
create table if not exists public.wrapped_badge_rarity (
  cycle_id     uuid primary key references public.cycles (id) on delete cascade,
  computed_at  timestamptz not null default now(),
  participants int not null default 0,
  counts       jsonb not null default '{}'::jsonb
);
alter table public.wrapped_badge_rarity enable row level security;
revoke all on public.wrapped_badge_rarity from anon, authenticated;

create or replace function public.badge_rarity(p_max_age interval default interval '1 hour')
returns public.wrapped_badge_rarity language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cycle uuid := public.active_cycle_id();
  c       public.wrapped_badge_rarity;
begin
  select * into c from public.wrapped_badge_rarity where cycle_id = v_cycle;
  if c.cycle_id is not null and c.computed_at > now() - p_max_age then
    return c;
  end if;
  insert into public.wrapped_badge_rarity (cycle_id, computed_at, participants, counts)
  select v_cycle, now(),
         (select count(*) from public.profiles where role = 'participant'),
         coalesce((select jsonb_object_agg(x.id, x.n) from (
                     select b.id, count(*) filter (where b.earned) as n
                       from public.profiles p cross join lateral public.badges_for(p.id) b
                      where p.role = 'participant'
                      group by b.id) x), '{}'::jsonb)
  on conflict (cycle_id) do update
    set computed_at = excluded.computed_at, participants = excluded.participants, counts = excluded.counts
  returning * into c;
  return c;
end $$;

-- Internal: everything Wrapped shows for one user (current state of the active cycle).
create or replace function public.wrapped_for(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cycle uuid := public.active_cycle_id();
  me      public.profiles;
  cyc     public.cycles;
  s       record;
  rar     public.wrapped_badge_rarity;
  r       jsonb;
  v_staff boolean;
  v_n     int;
  v_rank  int;
  v_crank int;
  v_cn    int;
begin
  select * into me from public.profiles where id = p_user;
  select * into cyc from public.cycles where id = v_cycle;
  select * into s from public.checkin_streak(p_user);
  v_staff := me.role <> 'participant';

  with l as (
    select l.* from public.ledger l where l.user_id = p_user and l.cycle_id = v_cycle
  ),
  ci as (
    select distinct on (l.ref_id) l.ref_id, e.campus, e.kind
      from l left join public.events e on e.id::text = l.ref_id
     where l.source = 'checkin' and l.amount > 0
     order by l.ref_id
  ),
  months as (
    select to_char(l.created_at at time zone 'America/New_York', 'YYYY-MM') as m, sum(l.amount)::int as pts
      from l where l.amount > 0 group by 1
  )
  select jsonb_build_object(
    'cycleName', cyc.name, 'cycleEndsAt', cyc.ends_at, 'opensAt', public.wrapped_opens_at(cyc.ends_at),
    'displayName', me.display_name, 'handle', me.handle, 'campus', me.campus, 'role', me.role,
    'avatar', me.avatar, 'hat', me.hat, 'accessory', me.accessory, 'background', me.background,
    'points', me.points,
    'eventsAttended', (select count(*) from ci),
    'favoriteCampus', (select ci.campus from ci where ci.campus is not null group by ci.campus
                        order by count(*) desc, ci.campus = 'all', ci.campus limit 1),
    'favoriteKind', (select ci.kind from ci where ci.kind is not null group by ci.kind
                      order by count(*) desc, ci.kind limit 1),
    'bestMonth', (select jsonb_build_object('month', months.m, 'points', months.pts) from months
                   order by months.pts desc, months.m limit 1),
    'bestStreak', coalesce(s.best_streak, 0),
    'friendsBrought', (select count(*) from l where l.activity_id = 'bring_new_alum' and l.amount > 0),
    'monthWins', (select count(*) from public.monthly_standings() ms where ms.user_id = p_user and ms.place = 1 and ms.final),
    'mix', jsonb_build_object(
      'event',    (select coalesce(sum(l.amount), 0) from l where l.source = 'checkin' and l.amount > 0),
      'digital',  (select coalesce(sum(l.amount), 0) from l join public.activities a on a.id = l.activity_id
                    where l.source = 'submission' and l.amount > 0 and a.tier = 3),
      'photos',   (select coalesce(sum(l.amount), 0) from l where l.source = 'submission' and l.amount > 0 and l.activity_id = 'event_photos'),
      'quests',   (select coalesce(sum(l.amount), 0) from l join public.activities a on a.id = l.activity_id
                    where l.source = 'submission' and l.amount > 0 and a.tier < 3 and l.activity_id <> 'event_photos'),
      'referral', (select coalesce(sum(l.amount), 0) from l where l.source = 'referral' and l.amount > 0),
      'staff',    (select coalesce(sum(l.amount), 0) from l where l.source = 'manual' and l.amount > 0))
  ) into r;

  -- Badges (participants: the 16 quest badges + rarity among participants only)
  r := r || jsonb_build_object(
    'earnedBadgeIds', (select coalesce(jsonb_agg(b.id order by b.ord), '[]'::jsonb)
                         from public.badges_for(p_user) with ordinality as b (id, earned, progress, goal, ord) where b.earned),
    'badgeTotal', (select count(*) from public.badges_for(p_user)));
  r := r || jsonb_build_object('badgesEarned', jsonb_array_length(r->'earnedBadgeIds'));

  if not v_staff then
    rar := public.badge_rarity();
    v_n := greatest(rar.participants, 1);
    r := r || jsonb_build_object('rarestBadge', (
      select jsonb_build_object('id', b.id, 'holders', coalesce((rar.counts->>b.id)::int, 0),
                                'pct', greatest(1, ceil(100.0 * coalesce((rar.counts->>b.id)::int, 1) / v_n))::int)
        from public.badges_for(p_user) with ordinality as b (id, earned, progress, goal, ord)
       where b.earned
       order by coalesce((rar.counts->>b.id)::int, 0), b.ord desc
       limit 1));
    v_rank  := 1 + (select count(*) from public.profiles o where o.role = 'participant' and o.points > me.points);
    v_crank := 1 + (select count(*) from public.profiles o where o.role = 'participant' and o.campus = me.campus and o.points > me.points);
    v_n  := (select count(*) from public.profiles o where o.role = 'participant');
    v_cn := (select count(*) from public.profiles o where o.role = 'participant' and o.campus = me.campus);
    r := r || jsonb_build_object(
      'rankOverall', v_rank, 'rankCampus', v_crank, 'participants', v_n, 'campusParticipants', v_cn,
      'topPctOverall', greatest(1, ceil(100.0 * v_rank / greatest(v_n, 1)))::int,
      'topPctCampus', greatest(1, ceil(100.0 * v_crank / greatest(v_cn, 1)))::int);
  else
    -- Staff: this cycle's staff work instead of a rank (never in percentiles or rarity).
    r := r || jsonb_build_object('staff', jsonb_build_object(
      'reviews', (select count(*) from public.submissions sb where sb.reviewer_id = p_user and sb.cycle_id = v_cycle
                    and sb.status in ('approved', 'rejected')),
      'eventsHosted', (select count(*) from public.events e where e.created_by = p_user and e.cycle_id = v_cycle),
      'checkinsAtHosted', (select coalesce(sum(e.attendee_count), 0) from public.events e where e.created_by = p_user and e.cycle_id = v_cycle),
      'announcements', (select count(*) from public.announcements a where a.created_by = p_user
                          and a.created_at >= cyc.starts_at and a.created_at <= cyc.ends_at),
      'heroCrowns', (select count(*) from public.hero_reigns h where h.user_id = p_user
                       and h.crowned_at >= cyc.starts_at and h.crowned_at <= cyc.ends_at),
      'councilBadges', (select count(*) from public.staff_badges_for(p_user) b where b.earned),
      'councilBadgeIds', (select coalesce(jsonb_agg(b.id), '[]'::jsonb) from public.staff_badges_for(p_user) b where b.earned)));
  end if;
  return r;
end $$;

create or replace function public.my_wrapped()
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid  uuid := public.require_user();
  cyc    public.cycles;
  v_open timestamptz;
begin
  select * into cyc from public.cycles where id = public.active_cycle_id();
  v_open := public.wrapped_opens_at(cyc.ends_at);
  if now() < v_open and not public.is_chair() then
    perform public.api_error('not_open', 'Your YACquest Wrapped opens on '
      || trim(to_char(v_open at time zone 'America/New_York', 'FMMonth FMDD')) || '. Keep questing!');
  end if;
  return (public.wrapped_for(v_uid) || jsonb_build_object('preview', now() < v_open))::json;
end $$;

-- Once per cycle: the "Wrapped is here" notification + email teaser.
create table if not exists public.wrapped_sends (
  cycle_id uuid primary key references public.cycles (id) on delete cascade,
  sent_at  timestamptz not null default now(),
  notified int not null default 0,
  emailed  int not null default 0
);
alter table public.wrapped_sends enable row level security;
revoke all on public.wrapped_sends from anon, authenticated;

create or replace function public.queue_wrapped_notifications(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  cyc      public.cycles;
  cfg      public.app_config;
  v_open   timestamptz;
  v_link   text;
  r        record;
  v_events int;
  v_badges int;
  v_teaser text;
  v_text   text;
  v_html   text;
  v_n      int := 0;
  v_mail   int := 0;
  v_title  constant text := 'Your YACquest Wrapped is here! 🎁';
  v_footer constant text := 'You get this because you have email updates on in YACquest (turn them off in Me → Settings).';
begin
  perform public.require_service_role();
  select * into cyc from public.cycles where id = public.active_cycle_id();
  select * into cfg from public.app_config where id = 1;
  if cyc.id is null then
    return 0;
  end if;
  v_open := public.wrapped_opens_at(cyc.ends_at);
  if p_now < v_open or p_now >= cyc.ends_at + interval '14 days' then
    return 0;
  end if;
  insert into public.wrapped_sends (cycle_id, sent_at) values (cyc.id, p_now) on conflict do nothing;
  if not found then
    return 0;   -- already sent this cycle
  end if;
  v_link := rtrim(coalesce(nullif(trim(cfg.app_url), ''), 'https://ncssmyac.github.io/YACquest/'), '/') || '/#/wrapped';

  for r in
    select p.id, p.role, p.points, p.email_opt_in,
           case when u.email_confirmed_at is not null then lower(trim(u.email::text)) end as email
      from public.profiles p left join auth.users u on u.id = p.id
     order by p.created_at, p.id
  loop
    v_events := (select count(distinct l.ref_id) from public.ledger l
                  where l.user_id = r.id and l.cycle_id = cyc.id and l.source = 'checkin' and l.amount > 0);
    v_badges := (select count(*) from public.badges_for(r.id) b where b.earned);
    v_teaser := format('%s %s · %s %s · %s %s',
                       r.points, case when r.points = 1 then 'point' else 'points' end,
                       v_events, case when v_events = 1 then 'event' else 'events' end,
                       v_badges, case when v_badges = 1 then 'badge' else 'badges' end);
    perform public.notify(r.id, 'wrapped', v_title,
      'Your ' || cyc.name || ' in YACquest: ' || v_teaser || '. Open Wrapped from Home to see your best month, rarest badge, your YAC personality and a card to share.');
    v_n := v_n + 1;
    if r.email_opt_in and r.email is not null and r.email <> '' then
      v_text := 'Your YACquest Wrapped is here!' || chr(10) || chr(10)
             || 'Your ' || cyc.name || ' in a nutshell: ' || v_teaser || '.' || chr(10) || chr(10)
             || 'See the whole story (best month, rarest badge, your YAC personality) and a card to share: ' || v_link
             || chr(10) || chr(10) || v_footer;
      v_html := public.email_layout(v_title,
        '<p style="font-size:16px;margin:0 0 10px">Your <b>' || public.html_escape(cyc.name) || '</b> in a nutshell:</p>'
        || '<p style="font-size:22px;font-weight:800;color:#0b2a5b;margin:0 0 14px">' || public.html_escape(v_teaser) || '</p>'
        || '<p style="margin:0 0 14px">See the whole story (your best month, rarest badge and YAC personality) and get a card to share.</p>'
        || '<p style="margin:0 0 14px"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Open my Wrapped 🎁</a></p>'
        || '<p style="font-size:12px;color:#4a5672;margin:0">' || public.html_escape(v_footer) || '</p>');
      if public.enqueue_email('wrapped', array[r.email], v_title, v_text, v_html, 'wrapped:' || cyc.id::text || ':' || r.id::text) then
        v_mail := v_mail + 1;
      end if;
    end if;
  end loop;

  update public.wrapped_sends set notified = v_n, emailed = v_mail where cycle_id = cyc.id;
  perform public.log_admin_action(null, 'wrapped_sent', null,
    jsonb_build_object('cycle', cyc.name, 'notified', v_n, 'emailed', v_mail));
  return v_n;
end $$;

-- enqueue_weekly_report_if_due: latest definition was in 0026_participant_extras.sql.
-- Unchanged except step 0c, so the every-10-minutes send-emails run also sends Wrapped (once per cycle).
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
-- 3. End-of-year checklist (staff; 'reset' = YACquest Chair, after the cycle ends)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.eoy_checklist (
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  item     text not null check (item in ('ledger_backup', 'confirm_winners', 'deliver_gift_cards', 'thank_you', 'reset')),
  done     boolean not null default false,
  done_by  uuid references public.profiles (id) on delete set null,
  done_at  timestamptz,
  primary key (cycle_id, item)
);
alter table public.eoy_checklist enable row level security;
revoke all on public.eoy_checklist from anon, authenticated;

create or replace function public.eoy_checklist()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  cyc public.cycles;
  cfg public.app_config;
  ws  public.wrapped_sends;
  v_open timestamptz;
begin
  perform public.require_admin();
  select * into cyc from public.cycles where id = public.active_cycle_id();
  select * into cfg from public.app_config where id = 1;
  select * into ws from public.wrapped_sends where cycle_id = cyc.id;
  v_open := public.wrapped_opens_at(cyc.ends_at);
  return json_build_object(
    'cycleName', cyc.name, 'opensAt', v_open, 'endsAt', cyc.ends_at, 'windowEndsAt', cyc.ends_at + interval '14 days',
    'inWindow', now() >= v_open and now() < cyc.ends_at + interval '14 days',
    'cycleEnded', now() >= cyc.ends_at, 'fulfillBy', cfg.fulfill_by,
    'wrapped', case when ws.cycle_id is null then null
                    else json_build_object('sentAt', ws.sent_at, 'notified', ws.notified, 'emailed', ws.emailed) end,
    'items', (select json_agg(json_build_object(
                       'id', i.item, 'done', coalesce(c.done, false), 'doneAt', c.done_at,
                       'doneBy', case when c.done_by is null then null else coalesce(public.display_name_of(c.done_by), 'Former staff') end)
                     order by i.ord)
                from (values ('ledger_backup', 1), ('confirm_winners', 2), ('deliver_gift_cards', 3), ('thank_you', 4), ('reset', 5)) i (item, ord)
                left join public.eoy_checklist c on c.cycle_id = cyc.id and c.item = i.item));
end $$;

create or replace function public.set_eoy_item(p_item text, p_done boolean)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me  uuid := public.require_admin();
  cyc   public.cycles;
  v_item text := trim(coalesce(p_item, ''));
begin
  select * into cyc from public.cycles where id = public.active_cycle_id();
  if v_item = 'wrapped_sent' then
    perform public.api_error('auto', 'That one ticks itself when Wrapped goes out.');
  end if;
  if v_item not in ('ledger_backup', 'confirm_winners', 'deliver_gift_cards', 'thank_you', 'reset') then
    perform public.api_error('unknown', 'That isn’t on the checklist.');
  end if;
  if v_item = 'reset' then
    if not public.is_chair() then
      perform public.api_error('forbidden', 'Only a YACquest Chair can tick the reset.');
    end if;
    if now() < cyc.ends_at then
      perform public.api_error('too_early', 'Reset only after the cycle ends.');
    end if;
  end if;
  insert into public.eoy_checklist (cycle_id, item, done, done_by, done_at)
  values (cyc.id, v_item, coalesce(p_done, false), case when p_done then v_me end, case when p_done then now() end)
  on conflict (cycle_id, item) do update
    set done = excluded.done, done_by = excluded.done_by, done_at = excluded.done_at;
  perform public.log_admin_action(v_me, case when p_done then 'eoy_item_checked' else 'eoy_item_unchecked' end, null,
                                  jsonb_build_object('item', v_item, 'cycle', cyc.name));
  return json_build_object('id', v_item, 'done', coalesce(p_done, false), 'doneAt', case when p_done then now() end,
                           'doneBy', case when p_done then public.display_name_of(v_me) end);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seasonal wardrobe
-- ─────────────────────────────────────────────────────────────────────────────
-- 4a. rule_type 'seasonal' (rule_value = holiday id)
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.cosmetics'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%rule_type%'
  loop
    execute format('alter table public.cosmetics drop constraint %I', c);
  end loop;
end $$;
alter table public.cosmetics
  add constraint cosmetics_rule_type_check check (rule_type in ('free', 'points', 'badge', 'badges', 'seasonal'));

-- 4b. Holidays + windows. ⚠️ VERIFY THE DATES EVERY YEAR and keep SEASONAL in src/config.ts in sync.
create table if not exists public.seasonal_holidays (
  id         text primary key,
  name       text not null,
  emoji      text not null default '🎉',
  sort_order int  not null default 0
);
alter table public.seasonal_holidays enable row level security;
drop policy if exists seasonal_holidays_read on public.seasonal_holidays;
create policy seasonal_holidays_read on public.seasonal_holidays for select to anon, authenticated using (true);

insert into public.seasonal_holidays (id, name, emoji, sort_order) values
  ('indigenous_peoples_day', 'Indigenous Peoples’ Day', '🌲', 1),
  ('dia_de_muertos',         'Día de los Muertos',      '🌼', 2),
  ('diwali',                 'Diwali',                  '🪔', 3),
  ('thanksgiving',           'Thanksgiving',            '🍂', 4)
on conflict (id) do update set name = excluded.name, emoji = excluded.emoji, sort_order = excluded.sort_order;

create or replace function public.second_monday_of_october(p_year int)
returns date language sql immutable set search_path = public, extensions as $$
  select d + ((8 - extract(isodow from d)::int) % 7) + 7 from (select make_date(p_year, 10, 1) as d) x;
$$;

create table if not exists public.seasonal_windows (
  holiday   text not null references public.seasonal_holidays (id) on delete cascade,
  year      int  not null,
  starts_on date not null,
  ends_on   date not null check (ends_on >= starts_on),
  primary key (holiday, year)
);
alter table public.seasonal_windows enable row level security;
drop policy if exists seasonal_windows_read on public.seasonal_windows;
create policy seasonal_windows_read on public.seasonal_windows for select to anon, authenticated using (true);

-- Inclusive dates, America/New_York. Re-running this migration resets them to these values.
insert into public.seasonal_windows (holiday, year, starts_on, ends_on) values
  -- Día de los Muertos is Nov 1–2 every year.
  ('dia_de_muertos', 2026, '2026-10-25', '2026-11-09'),
  ('dia_de_muertos', 2027, '2027-10-25', '2027-11-09'),
  -- Diwali: 7 days before through 7 days after. Diwali 2026 = Sunday, Nov 8, 2026 (Lakshmi Puja; confirmed).
  -- Diwali 2027 = Oct 29, 2027: VERIFY before Oct 2027 (lunar calendar).
  ('diwali',         2026, '2026-11-01', '2026-11-15'),
  ('diwali',         2027, '2027-10-22', '2027-11-05'),
  -- Thanksgiving = 4th Thursday of November (Nov 26, 2026; Nov 25, 2027): the week before through the Monday after.
  ('thanksgiving',   2026, '2026-11-19', '2026-11-30'),
  ('thanksgiving',   2027, '2027-11-18', '2027-11-29'),
  -- Indigenous Peoples' Day = 2nd Monday of October, ± 7 days (2026: Oct 12 → Oct 5–19, already past at launch).
  ('indigenous_peoples_day', 2026, public.second_monday_of_october(2026) - 7, public.second_monday_of_october(2026) + 7),
  ('indigenous_peoples_day', 2027, public.second_monday_of_october(2027) - 7, public.second_monday_of_october(2027) + 7)
on conflict (holiday, year) do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on;

-- 4c. Items (mirror SEASONAL / COSMETICS in the app)
insert into public.cosmetics (id, slot, name, rule_type, rule_value, sort_order) values
  ('cempasuchil_crown', 'hat',        'Cempasúchil Crown',   'seasonal', 'dia_de_muertos',         101),
  ('papel_picado',      'background', 'Papel Picado',        'seasonal', 'dia_de_muertos',         102),
  ('diya',              'accessory',  'Diya',                'seasonal', 'diwali',                 103),
  ('rangoli_diyas',     'background', 'Rangoli & Diyas',     'seasonal', 'diwali',                 104),
  ('harvest_scarf',     'accessory',  'Harvest Scarf',       'seasonal', 'thanksgiving',           105),
  ('autumn_harvest',    'background', 'Autumn Harvest',      'seasonal', 'thanksgiving',           106),
  ('land_of_longleaf',  'background', 'Land of the Longleaf','seasonal', 'indigenous_peoples_day', 107)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, rule_type = excluded.rule_type,
      rule_value = excluded.rule_value, sort_order = excluded.sort_order;

-- 4d. Owned seasonal items (forever; no FK to cosmetics so re-running 0009 can't wipe them).
create table if not exists public.seasonal_unlocks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  item_id     text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.seasonal_unlocks enable row level security;
revoke all on public.seasonal_unlocks from anon, authenticated;

-- Holidays whose window includes p_now's date in America/New_York.
create or replace function public.seasonal_active(p_now timestamptz default now())
returns table (holiday text, ends_on date)
language sql stable security definer set search_path = public, extensions as $$
  select w.holiday, w.ends_on from public.seasonal_windows w
   where (p_now at time zone 'America/New_York')::date between w.starts_on and w.ends_on;
$$;

-- Internal: give p_user every item whose window is open at p_now. Returns the newly claimed ids and
-- sends one notification per holiday the first time any of its items is claimed.
create or replace function public.claim_seasonal_for(p_user uuid, p_now timestamptz default now())
returns text[] language plpgsql security definer set search_path = public, extensions as $$
declare
  v_new text[];
  h     record;
begin
  with ins as (
    insert into public.seasonal_unlocks (user_id, item_id, unlocked_at)
    select p_user, c.id, p_now
      from public.cosmetics c
     where c.rule_type = 'seasonal' and c.rule_value in (select a.holiday from public.seasonal_active(p_now) a)
    on conflict do nothing
    returning item_id
  )
  select coalesce(array_agg(ins.item_id order by ins.item_id), '{}'::text[]) into v_new from ins;
  for h in
    select sh.id, sh.name, sh.emoji
      from public.seasonal_holidays sh
     where exists (select 1 from public.cosmetics c where c.rule_type = 'seasonal' and c.rule_value = sh.id and c.id = any (v_new))
     order by sh.sort_order
  loop
    perform public.notify(p_user, 'seasonal', h.emoji || ' New limited-time item for ' || h.name || ' — see what it honors',
      'Free in Prize → Wardrobe → Seasonal while it lasts, and yours to keep. Tap “About this item” to learn what it celebrates.');
  end loop;
  return v_new;
end $$;

-- Any logged-in user (participants AND staff). Called on app load and when the Wardrobe opens.
create or replace function public.claim_seasonal_items()
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  v_new text[];
begin
  v_new := public.claim_seasonal_for(v_uid, now());
  return json_build_object(
    'claimed', to_json(v_new),
    'active', (select coalesce(json_agg(json_build_object('holiday', a.holiday, 'endsOn', a.ends_on) order by a.ends_on), '[]'::json)
                 from public.seasonal_active(now()) a));
end $$;

-- 4e. unlocks_for: copy of 0009 + owned seasonal items.
create or replace function public.unlocks_for(p_user uuid)
returns text[] language sql stable security definer set search_path = public, extensions as $$
  with b as materialized (select * from public.badges_for(p_user)),
  me as (select coalesce((select p.points from public.profiles p where p.id = p_user), 0) as pts)
  select coalesce(array_agg(c.id order by c.sort_order, c.id), '{}'::text[])
    from public.cosmetics c, me
   where case c.rule_type
           when 'free'     then true
           when 'points'   then me.pts >= c.rule_value::int
           when 'badge'    then exists (select 1 from b where b.id = c.rule_value and b.earned)
           when 'badges'   then (select count(*) from b where b.earned) >= c.rule_value::int
           when 'seasonal' then exists (select 1 from public.seasonal_unlocks su where su.user_id = p_user and su.item_id = c.id)
           else false
         end;
$$;

create or replace function public.my_unlocks()
returns text[] language sql stable security definer set search_path = public, extensions as $$
  select public.unlocks_for(public.require_user());
$$;

-- 4f. equip_look: copy of 0020, but first claims any seasonal item whose window is open today.
--     Owned seasonal items can be worn any time; unowned ones are 'locked' like any other item.
create or replace function public.equip_look(p_hat text default null, p_accessory text default null, p_background text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid    uuid := public.require_user();
  v_unl    text[];
  v_staff  text[] := public.staff_unlocks_for(v_uid);
  v_hat    text := nullif(trim(coalesce(p_hat, '')), '');
  v_acc    text := nullif(trim(coalesce(p_accessory, '')), '');
  v_bg     text := nullif(trim(coalesce(p_background, '')), '');
  v_slot   text;
  v_item   text;
begin
  perform public.claim_seasonal_for(v_uid, now());
  v_unl := public.unlocks_for(v_uid);
  foreach v_slot in array array['hat', 'accessory', 'background'] loop
    v_item := case v_slot when 'hat' then v_hat when 'accessory' then v_acc else v_bg end;
    continue when v_item is null;
    if exists (select 1 from public.cosmetics c where c.id = v_item and c.slot = v_slot) then
      if not (v_item = any (v_unl)) then
        perform public.api_error('locked', 'Unlock this first!');
      end if;
    elsif public.is_staff_user(v_uid)
          and exists (select 1 from public.staff_cosmetics c where c.id = v_item and c.slot = v_slot) then
      if not (v_item = any (v_staff)) then
        perform public.api_error('locked', 'Unlock this first!');
      end if;
    else
      perform public.api_error('look', 'That item doesn’t go there.');
    end if;
  end loop;
  update public.profiles set hat = v_hat, accessory = v_acc, background = v_bg where id = v_uid;
  return json_build_object('hat', v_hat, 'accessory', v_acc, 'background', v_bg);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal helpers: nobody calls these through the API.
revoke execute on function
  public.wrapped_for(uuid), public.badge_rarity(interval), public.claim_seasonal_for(uuid, timestamptz),
  public.seasonal_active(timestamptz), public.unlocks_for(uuid)
from public, anon, authenticated, service_role;

-- Logged-in users / staff (each function checks the role itself).
revoke execute on function
  public.admin_pace(timestamptz), public.my_wrapped(), public.eoy_checklist(), public.set_eoy_item(text, boolean),
  public.claim_seasonal_items(), public.my_unlocks(), public.equip_look(text, text, text)
from public, anon;
grant execute on function
  public.admin_pace(timestamptz), public.my_wrapped(), public.eoy_checklist(), public.set_eoy_item(text, boolean),
  public.claim_seasonal_items(), public.my_unlocks(), public.equip_look(text, text, text)
to authenticated;

-- Edge Function `send-emails` (service_role key) / pg_cron only
revoke execute on function public.queue_wrapped_notifications(timestamptz), public.enqueue_weekly_report_if_due()
from public, anon, authenticated, service_role;
grant execute on function public.queue_wrapped_notifications(timestamptz), public.enqueue_weekly_report_if_due() to service_role;

-- Done.

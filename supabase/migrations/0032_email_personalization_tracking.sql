-- ═══════════════════════════════════════════════════════════════════════════
-- 0032 — Personalized one-per-person emails, unsubscribe, tracking, bounce
--        checks and safe sending for a free @gmail.com account.
--
--   • email_messages: ONE ROW PER RECIPIENT. Whatever the app queues in
--     email_outbox (unchanged: same enqueue_email(), same dedupe keys) is split
--     right away by a trigger into one email_messages row per address, rendered
--     for that person: "Hi {first_name}," greeting, announcement fill-ins
--     ({first_name} {name} {campus} {campus_pun} {points} {points_to_goal}
--     {next_stop} {next_event} {friend_code}), and the footer (participants: one-
--     click unsubscribe + "Manage in the app (Me → Settings)"; staff: "Manage
--     these in Admin → System"). Every message gets a priority and a send_before
--     (expiry). email_outbox keeps the original request and is marked sent/failed
--     when all of its messages are done.
--   • The Edge Function send-emails (redeploy it!) now claims messages with
--     claim_email_messages(): rolling 24 h budget (app_config.email_daily_budget,
--     default 450 for free Gmail; 1900 on Google Workspace), a reserve of 50 for
--     priority 1–2, priority order, and expiry (rows that would go out too late
--     become 'skipped_expired', never sent). It sends ~20 a minute, one address
--     per email (no BCC), with List-Unsubscribe headers, tracked links and an open
--     pixel; then reads Gmail's bounce notices over IMAP (record_email_bounce).
--   • Old send-emails (BCC) keeps running harmlessly until it's redeployed:
--     claim_email_batch() now only returns outbox rows that have no messages
--     (none), so nothing is sent twice. Emails simply wait for the new sender.
--   • email_events: opens / clicks / bounces / unsubscribes / complaints.
--     Written by the public Edge Function email-track (deploy with "Verify JWT"
--     OFF) through service-role RPCs. Link signatures: HMAC-SHA256 with a secret
--     the database generates (email_secrets) and never shares — the Edge
--     Functions ask the database to sign and to check, so no secret to copy.
--   • Unsubscribe: per-person random token (email_unsub_tokens, never the user
--     id). unsubscribe_by_token(token) is callable by anyone (anon) and can only
--     turn that person's email_opt_in off.
--   • Bounces: 2 hard bounces → profiles.email_bounced (emails to them pause; staff
--     see "Bouncing email" in Players; the person sees a banner in Me).
--   • Direct announcements now respect "Email me announcements from YAC" too
--     (every participant email says "you have YACquest emails on").
--   • Staff stats: email_stats(), email_campaign_recipients(), email_history_for(),
--     email_queue_status(), email_bouncing_users().
--
-- Contract: docs/BACKEND.md, section "0032". Run AFTER 0031. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Config + columns (additive)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.app_config add column if not exists email_daily_budget int not null default 450;
alter table public.app_config add column if not exists email_reserve int not null default 50;
alter table public.app_config add column if not exists email_announcement_days int not null default 3;

alter table public.profiles add column if not exists email_bounced boolean not null default false;
alter table public.profiles add column if not exists email_bounced_at timestamptz;
alter table public.profiles add column if not exists email_bounce_cleared_at timestamptz;

alter table public.announcements add column if not exists email_send_before timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tables (RLS on, no policies, no grants: RPC only)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.email_unsub_tokens (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  token      text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.email_secrets (
  id           int primary key default 1 check (id = 1),
  track_secret text not null default encode(gen_random_bytes(32), 'hex'),
  created_at   timestamptz not null default now()
);
insert into public.email_secrets (id) values (1) on conflict (id) do nothing;

create table if not exists public.email_messages (
  id             uuid primary key default gen_random_uuid(),
  outbox_id      uuid references public.email_outbox (id) on delete set null,
  kind           text not null,
  campaign_id    text not null,
  campaign_label text not null default '',
  user_id        uuid references public.profiles (id) on delete set null,
  email          text not null,
  subject        text not null default '',
  body_text      text not null default '',
  body_html      text not null default '',
  priority       int  not null default 4,
  send_before    timestamptz,
  status         text not null default 'queued'
                 check (status in ('queued', 'sending', 'sent', 'failed', 'bounced',
                                   'skipped_expired', 'skipped_opted_out', 'skipped_bouncing')),
  attempts       int  not null default 0,
  claimed_at     timestamptz,
  sent_at        timestamptz,
  error          text,
  created_at     timestamptz not null default now()
);
create unique index if not exists email_messages_outbox_email on public.email_messages (outbox_id, email) where outbox_id is not null;
create index if not exists email_messages_status on public.email_messages (status, priority, created_at);
create index if not exists email_messages_sent on public.email_messages (sent_at desc) where sent_at is not null;
create index if not exists email_messages_campaign on public.email_messages (campaign_id);
create index if not exists email_messages_user on public.email_messages (user_id, created_at desc);
create index if not exists email_messages_email on public.email_messages (lower(email), sent_at desc);

create table if not exists public.email_events (
  id         bigint generated always as identity primary key,
  message_id uuid references public.email_messages (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  type       text not null check (type in ('open', 'click', 'bounce', 'unsubscribe', 'complaint')),
  url        text,
  detail     text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists email_events_message on public.email_events (message_id, type);
create index if not exists email_events_created on public.email_events (created_at desc, type);

create table if not exists public.email_runs (
  id          bigint generated always as identity primary key,
  ran_at      timestamptz not null default now(),
  sent        int not null default 0,
  failed      int not null default 0,
  released    int not null default 0,
  bounces     int not null default 0,
  imap_status text not null default 'off' check (imap_status in ('ok', 'off', 'error', 'skipped')),
  imap_error  text
);
create index if not exists email_runs_ran on public.email_runs (ran_at desc);

alter table public.email_unsub_tokens enable row level security;
alter table public.email_secrets      enable row level security;
alter table public.email_messages     enable row level security;
alter table public.email_events       enable row level security;
alter table public.email_runs         enable row level security;
revoke all on public.email_unsub_tokens, public.email_secrets, public.email_messages, public.email_events, public.email_runs
  from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Personalization helpers (internal; mirrored in src/lib/emailFill.ts + campusPuns.ts)
-- ─────────────────────────────────────────────────────────────────────────────

-- Same as EMAIL_PRIORITY in supabase/functions/_shared/emailCore.ts.
create or replace function public.email_priority(p_kind text)
returns int language sql immutable set search_path = public, extensions as $$
  select case p_kind
    when 'prize_qualified' then 1 when 'prize_info' then 1 when 'test' then 1 when 'weekly_report' then 1
    when 'event_reminder' then 2 when 'event_followup' then 3 when 'announcement' then 4 when 'wrapped' then 5
    else 4 end;
$$;

create or replace function public.email_is_participant_kind(p_kind text)
returns boolean language sql immutable set search_path = public, extensions as $$
  select p_kind in ('announcement', 'event_reminder', 'event_followup', 'wrapped');
$$;

-- Sum of the key's character codes (same as punSeed() in src/lib/campusPuns.ts).
create or replace function public.email_seed(p_key text)
returns int language sql immutable set search_path = public, extensions as $$
  select coalesce(sum(ascii(c)), 0)::int from regexp_split_to_table(coalesce(p_key, ''), '') c where c <> '';
$$;

-- KEEP IN SYNC with CAMPUS_PUNS in src/lib/campusPuns.ts (same lines, same order).
create or replace function public.campus_puns(p_campus text)
returns text[] language sql immutable set search_path = public, extensions as $$
  select case p_campus
    when 'duke' then array[
      'Bet they don''t teach you that at Duke 😈',
      'Even Blue Devils need a break — come hang!',
      'Devilishly good to see you, Duke.',
      'From the Gothic Wonderland to YAC: welcome back!'
    ]::text[]
    when 'unc' then array[
      'Bet they don''t teach you that at UNC 🐏',
      'Heel yeah, see you there!',
      'Carolina blue skies ahead 💙',
      'Ram-arkable things happen when Tar Heels show up.'
    ]::text[]
    when 'ncsu' then array[
      'Bet they don''t teach you that at NC State 🐺',
      'Howl about joining us?',
      'Wolfpack, roll call! 🐾',
      'Think and Do — and come hang with YAC!'
    ]::text[]
    else '{}'::text[] end;
$$;

create or replace function public.campus_pun(p_campus text, p_seed int)
returns text language sql immutable set search_path = public, extensions as $$
  select coalesce((public.campus_puns(p_campus))[abs(coalesce(p_seed, 0)) % greatest(1, cardinality(public.campus_puns(p_campus))) + 1],
                  'See you at the next YAC event!');
$$;

create or replace function public.email_first_name(p_display_name text)
returns text language sql immutable set search_path = public, extensions as $$
  select nullif(split_part(regexp_replace(trim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), ' ', 1), '');
$$;

-- "Camp (100 pts)" — same checkpoints as src/lib/checkpoints.ts.
create or replace function public.email_next_stop(p_points int, p_goal int)
returns text language sql immutable set search_path = public, extensions as $$
  select coalesce(
    (select c.label || ' (' || c.pts || ' pts)'
       from (values (50, 'Trailhead'), (100, 'Camp'), (ceil(p_goal / 2.0)::int, 'Halfway'),
                    ((floor(p_goal * 0.75 / 25))::int * 25, 'Summit'), (p_goal, 'the treasure')) c(pts, label)
      where coalesce(p_points, 0) < c.pts
      order by c.pts limit 1),
    'the treasure (you made it!)');
$$;

-- "Board Game Night (Sat, Nov 21)" — their campus or all campuses; else "the next YAC event".
create or replace function public.email_next_event(p_campus text, p_now timestamptz)
returns text language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    (select e.title || ' (' || to_char(e.starts_at at time zone 'America/New_York', 'Dy, Mon FMDD') || ')'
       from public.events e
      where e.starts_at > p_now and e.campus in (p_campus, 'all')
      order by e.starts_at limit 1),
    'the next YAC event');
$$;

-- Every fill-in for one person (src/lib/emailFill.ts fillValues()).
create or replace function public.email_fill_values(p_user uuid, p_seed_key text, p_now timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  p      public.profiles;
  v_goal int := coalesce((select prize_goal from public.app_config where id = 1), 350);
  v_pts  int;
begin
  select * into p from public.profiles where id = p_user;
  v_pts := greatest(0, coalesce(p.points, 0));
  return jsonb_build_object(
    'first_name',     coalesce(public.email_first_name(p.display_name), 'friend'),
    'name',           coalesce(nullif(trim(p.display_name), ''), 'friend'),
    'campus',         case when p.campus is null then 'your campus' else public.campus_label(p.campus) end,
    'campus_pun',     public.campus_pun(p.campus, public.email_seed(p_seed_key)),
    'points',         v_pts::text,
    'points_to_goal', greatest(0, v_goal - v_pts)::text,
    'next_stop',      public.email_next_stop(v_pts, v_goal),
    'next_event',     public.email_next_event(p.campus, p_now),
    'friend_code',    coalesce(p.friend_code, ''));
end $$;

create or replace function public.email_fill_tokens()
returns text[] language sql immutable set search_path = public, extensions as $$
  select array['first_name', 'name', 'campus', 'campus_pun', 'points', 'points_to_goal', 'next_stop', 'next_event', 'friend_code']::text[];
$$;

-- Replaces known {tokens}; unknown ones stay. p_html escapes the values.
create or replace function public.email_fill(p_text text, p_vals jsonb, p_html boolean default false)
returns text language plpgsql immutable set search_path = public, extensions as $$
declare
  k text;
  v text;
  r text := coalesce(p_text, '');
begin
  if position('{' in r) = 0 or p_vals is null then
    return r;
  end if;
  foreach k in array public.email_fill_tokens() loop
    v := coalesce(p_vals->>k, '');
    r := replace(r, '{' || k || '}', case when p_html then public.html_escape(v) else v end);
  end loop;
  return r;
end $$;

-- {tokens} that aren't fill-ins (template leftovers like {event}, typos like {frist_name}).
create or replace function public.email_unknown_tokens(p_text text)
returns text[] language sql immutable set search_path = public, extensions as $$
  select coalesce(array_agg(t order by t), '{}'::text[])
    from (select distinct m[1] as t from regexp_matches(coalesce(p_text, ''), '\{([A-Za-z_]+)\}', 'g') m) x
   where t <> all (public.email_fill_tokens());
$$;

create or replace function public.email_app_url()
returns text language sql stable security definer set search_path = public, extensions as $$
  select rtrim(coalesce(nullif(trim((select app_url from public.app_config where id = 1)), ''), 'https://ncssmyac.github.io/YACquest/'), '/');
$$;

-- Get-or-create the person's unsubscribe token (random, never the user id).
create or replace function public.email_unsub_token(p_user uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  if p_user is null then
    return null;
  end if;
  select token into v from public.email_unsub_tokens where user_id = p_user;
  if v is null then
    insert into public.email_unsub_tokens (user_id) values (p_user) on conflict (user_id) do nothing;
    select token into v from public.email_unsub_tokens where user_id = p_user;
  end if;
  return v;
end $$;

create or replace function public.email_unsub_url(p_token text)
returns text language sql stable security definer set search_path = public, extensions as $$
  select public.email_app_url() || '/#/unsubscribe?t=' || p_token;
$$;

-- HMAC-SHA256 link signature (left 32 hex). The secret never leaves the database.
create or replace function public.email_link_sig(p_msg uuid, p_url text)
returns text language sql stable security definer set search_path = public, extensions as $$
  select left(encode(hmac(p_msg::text || '|' || coalesce(p_url, ''), (select track_secret from public.email_secrets where id = 1), 'sha256'), 'hex'), 32);
$$;

-- Email layout (0004) + markers the per-recipient step fills in: greeting, sign-off, footer.
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
    || '<tr><td style="padding:20px;font-size:15px;line-height:1.5;"><!--yac:greeting-->' || p_inner_html || '<!--yac:signoff--></td></tr>'
    || '<tr><td style="padding:14px 20px;background:#f4f6fa;color:#5b6475;font-size:12px;line-height:1.5;"><!--yac:footer-->'
    || 'You get this because you are on the YAC committee list. Manage these in Admin → System.<br>YACquest · NCSSM Young Alumni Council'
    || '<!--/yac:footer--></td></tr></table></td></tr></table></body></html>';
$$;

create or replace function public.email_footer_html(p_unsub_url text)
returns text language sql immutable set search_path = public, extensions as $$
  select 'You''re getting this because you have YACquest emails on. '
         || case when p_unsub_url is not null
                 then '<a href="' || public.html_escape(p_unsub_url) || '" style="color:#0b2a5b;">Unsubscribe in one click</a> · '
                 else '' end
         || 'Manage in the app (Me → Settings)<br>YACquest · NCSSM Young Alumni Council';
$$;

create or replace function public.email_footer_text(p_unsub_url text)
returns text language sql immutable set search_path = public, extensions as $$
  select E'—\nYou''re getting this because you have YACquest emails on.'
         || case when p_unsub_url is not null then E'\nUnsubscribe in one click: ' || p_unsub_url else '' end
         || E'\nManage in the app: Me → Settings'
         || E'\nYACquest · NCSSM Young Alumni Council';
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Campaign + expiry for a queued email (from its kind and dedupe key)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.email_try_uuid(p text)
returns uuid language sql immutable set search_path = public, extensions as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

-- Same rules as sendBeforeFor() in supabase/functions/_shared/emailCore.ts.
create or replace function public.email_campaign(p_kind text, p_dedupe text, p_subject text, p_created timestamptz,
                                                 out campaign_id text, out campaign_label text, out send_before timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_ref uuid := public.email_try_uuid(split_part(coalesce(p_dedupe, ''), ':', 2));
  e     public.events;
  a     public.announcements;
  c     public.cycles;
  v_days int := coalesce((select email_announcement_days from public.app_config where id = 1), 3);
  v_ny  timestamp := p_created at time zone 'America/New_York';
begin
  campaign_label := coalesce(nullif(p_subject, ''), p_kind);
  send_before := null;
  if p_kind = 'announcement' and v_ref is not null then
    select * into a from public.announcements where id = v_ref;
    campaign_id := 'announcement:' || v_ref;
    campaign_label := coalesce(a.title, campaign_label);
    send_before := least(coalesce(a.created_at, p_created) + make_interval(days => v_days), a.email_send_before);
  elsif p_kind in ('event_reminder', 'event_followup') and v_ref is not null then
    select * into e from public.events where id = v_ref;
    campaign_id := p_kind || ':' || v_ref;
    campaign_label := case when p_kind = 'event_reminder' then 'Reminder · ' else 'Follow-up · ' end || coalesce(e.title, 'event');
    send_before := case when p_kind = 'event_reminder' then coalesce(e.starts_at, p_created + interval '1 hour')
                        else coalesce(e.ends_at, p_created) + interval '3 days' end;
  elsif p_kind = 'wrapped' and v_ref is not null then
    select * into c from public.cycles where id = v_ref;
    campaign_id := 'wrapped:' || v_ref;
    campaign_label := 'Wrapped · ' || coalesce(c.name, 'this year');
    send_before := case when c.ends_at > p_created then c.ends_at else p_created + interval '3 days' end;
  elsif p_kind = 'weekly_report' then
    campaign_id := 'weekly_report:' || to_char(v_ny, 'YYYY-MM-DD');
    campaign_label := 'Weekly report · ' || trim(to_char(v_ny, 'Mon FMDD'));
    send_before := (date_trunc('day', v_ny) + interval '1 day') at time zone 'America/New_York';
  elsif p_kind in ('prize_qualified', 'prize_info') then
    campaign_id := 'prize:' || coalesce(v_ref::text, p_dedupe);
  elsif p_kind = 'test' then
    campaign_id := 'test';
    campaign_label := 'Test emails';
  else
    campaign_id := p_kind || ':' || coalesce(p_dedupe, '');
  end if;
  if campaign_id is null then
    campaign_id := p_kind || ':' || coalesce(p_dedupe, '');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Per-recipient rendering: email_outbox row → email_messages rows
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.email_expand_outbox(p_outbox uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  o        public.email_outbox;
  camp     record;
  v_email  text;
  p        public.profiles;
  v_vals   jsonb;
  v_part   boolean;
  v_token  text;
  v_unsub  text;
  v_subj   text;
  v_text   text;
  v_html   text;
  v_greet  text;
  v_pun    text;
  v_status text;
  v_n      int := 0;
begin
  select * into o from public.email_outbox where id = p_outbox;
  if o.id is null or exists (select 1 from public.email_messages m where m.outbox_id = o.id) then
    return 0;
  end if;
  select * into camp from public.email_campaign(o.kind, o.dedupe_key, o.subject, o.created_at);
  v_part := public.email_is_participant_kind(o.kind);

  for v_email in
    select distinct lower(trim(x)) from unnest(o.to_emails) x where trim(coalesce(x, '')) <> ''
  loop
    p := null;
    select pr.* into p
      from public.profiles pr left join auth.users u on u.id = pr.id
     where lower(u.email::text) = v_email or lower(pr.email::text) = v_email
     order by (lower(u.email::text) = v_email) desc nulls last
     limit 1;
    v_subj := o.subject;
    v_text := o.body_text;
    v_html := o.body_html;
    v_status := 'queued';

    if v_part then
      v_vals := case when p.id is not null then public.email_fill_values(p.id, camp.campaign_id, o.created_at) end;
      v_token := case when p.id is not null then public.email_unsub_token(p.id) end;
      v_unsub := case when v_token is not null then public.email_unsub_url(v_token) end;
      v_greet := case when public.email_first_name(p.display_name) is not null
                      then 'Hi ' || public.email_first_name(p.display_name) || ',' else 'Hi there,' end;
      -- the event thank-you and Wrapped sign off with a campus pun
      v_pun := case when p.id is not null and ((o.kind = 'event_followup' and o.subject like 'Thanks for coming%') or o.kind = 'wrapped')
                    then public.campus_pun(p.campus, public.email_seed(camp.campaign_id)) end;
      -- older footers ("You get this because …") are replaced by the new one
      v_text := regexp_replace(v_text, E'\\s*You get this because[^\\n]*$', '');
      v_html := regexp_replace(v_html, '<p style="font-size:12px;color:#4a5672;margin:0">You get this because[^<]*</p>', '', 'g');
      v_subj := public.email_fill(v_subj, v_vals, false);
      v_text := v_greet || E'\n\n' || public.email_fill(v_text, v_vals, false)
                || coalesce(E'\n\n' || v_pun, '') || E'\n\n' || public.email_footer_text(v_unsub);
      v_html := public.email_fill(v_html, v_vals, true);
      v_html := replace(v_html, '<!--yac:greeting-->',
                        '<p style="margin:0 0 12px;font-size:16px;">' || public.html_escape(v_greet) || '</p>');
      if v_pun is not null then
        v_html := replace(v_html, '<!--yac:signoff-->',
                          '<p style="margin:14px 0 0;color:#4a5672;font-style:italic;">' || public.html_escape(v_pun) || '</p>');
      end if;
      v_html := regexp_replace(v_html, '<!--yac:footer-->.*<!--/yac:footer-->', public.email_footer_html(v_unsub));
      if p.id is not null and not p.email_opt_in then
        v_status := 'skipped_opted_out';
      end if;
    else
      if position('Admin → System' in v_text) = 0 then
        v_text := v_text || E'\n\n—\nYACquest · NCSSM Young Alumni Council. Manage these in Admin → System.';
      end if;
    end if;
    v_html := replace(replace(v_html, '<!--yac:greeting-->', ''), '<!--yac:signoff-->', '');
    if v_status = 'queued' and p.id is not null and p.email_bounced then
      v_status := 'skipped_bouncing';
    end if;

    insert into public.email_messages (outbox_id, kind, campaign_id, campaign_label, user_id, email, subject, body_text, body_html,
                                       priority, send_before, status, error, created_at)
    values (o.id, o.kind, camp.campaign_id, camp.campaign_label, p.id, v_email, v_subj, v_text, v_html,
            public.email_priority(o.kind), camp.send_before, v_status,
            case v_status when 'skipped_opted_out' then 'Email updates are off for this person.'
                          when 'skipped_bouncing' then 'Paused: emails to this address bounce.' end,
            o.created_at)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  perform public.email_outbox_rollup(o.id);
  return v_n;
end $$;

-- An outbox row is done (sent/failed) once none of its messages can still go out.
create or replace function public.email_outbox_rollup(p_outbox uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_open int;
  v_sent int;
  v_err  text;
begin
  if p_outbox is null then
    return;
  end if;
  if not exists (select 1 from public.email_messages where outbox_id = p_outbox) then
    return;
  end if;
  select count(*) filter (where status in ('queued', 'sending') or (status = 'failed' and attempts < 5)),
         count(*) filter (where status in ('sent', 'bounced')),
         max(error)
    into v_open, v_sent, v_err
    from public.email_messages where outbox_id = p_outbox;
  if v_open > 0 then
    return;
  end if;
  update public.email_outbox
     set status = case when v_sent > 0 then 'sent' else 'failed' end,
         sent_at = case when v_sent > 0 then coalesce(sent_at, now()) else sent_at end,
         last_error = case when v_sent > 0 then null else left(coalesce(v_err, 'Nothing was sent.'), 500) end
   where id = p_outbox and status <> case when v_sent > 0 then 'sent' else 'failed' end;
end $$;

create or replace function public.email_outbox_expand_trigger()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.email_expand_outbox(new.id);
  return null;
end $$;
drop trigger if exists email_outbox_expand on public.email_outbox;
create trigger email_outbox_expand after insert on public.email_outbox
  for each row execute function public.email_outbox_expand_trigger();

-- One-time (and re-run safe): emails still waiting from before 0032 get their per-recipient rows.
do $$
declare r record;
begin
  for r in
    select o.id from public.email_outbox o
     where (o.status = 'pending' or o.status = 'sending' or (o.status = 'failed' and o.attempts < 5))
       and not exists (select 1 from public.email_messages m where m.outbox_id = o.id)
     order by o.created_at
  loop
    perform public.email_expand_outbox(r.id);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Announcements: copy of 0017 — fill-ins, one email per person, opt-out always respected
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.send_announcement(
  p_title text, p_body text, p_audience text,
  p_campus text default null, p_user_id uuid default null, p_send_email boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin    uuid := public.require_admin();
  v_title    text := trim(coalesce(p_title, ''));
  v_body     text := trim(coalesce(p_body, ''));
  v_id       uuid;
  v_targets  uuid[];
  v_emails   text[];
  v_count    int;
  v_emailed  int := 0;
  v_html     text;
  v_today    int;
  v_unknown  text[];
  v_before   timestamptz;
  v_link     text;
begin
  if char_length(v_title) < 3 or char_length(v_title) > 80 then
    perform public.api_error('title', 'Title: 3–80 characters.');
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    perform public.api_error('body', 'Message: 1–1000 characters.');
  end if;
  if p_audience not in ('all', 'campus', 'user') then
    perform public.api_error('audience', 'Choose who gets this message.');
  end if;
  if p_audience = 'campus' and coalesce(p_campus, '') not in ('duke', 'unc', 'ncsu') then
    perform public.api_error('campus', 'Pick a campus.');
  end if;
  if p_audience = 'user' and not exists (select 1 from public.profiles where id = p_user_id) then
    perform public.api_error('user', 'Pick the person to message.');
  end if;
  -- 0032: every {token} must be a fill-in
  v_unknown := public.email_unknown_tokens(v_title || ' ' || v_body);
  if cardinality(v_unknown) > 0 then
    perform public.api_error('fill_in', 'Fill in or remove: ' || (select string_agg('{' || x || '}', ' ') from unnest(v_unknown) x)
                             || '. Use Insert ▾ for fill-ins.');
  end if;

  select count(*) into v_today from public.announcements
   where created_by = v_admin and created_at > now() - interval '1 day';
  if v_today >= 20 then
    perform public.api_error('limit', 'You''ve sent 20 messages today. Try again tomorrow.');
  end if;

  select coalesce(array_agg(p.id), '{}') into v_targets
    from public.profiles p
   where case p_audience
           when 'all'    then true
           when 'campus' then p.campus = p_campus
           else p.id = p_user_id
         end;
  v_count := cardinality(v_targets);
  if v_count = 0 then
    perform public.api_error('audience', 'Nobody matches that audience yet.');
  end if;

  -- 0032: if it names an upcoming event, the email must not go out after that event starts.
  select min(e.starts_at) into v_before
    from public.events e
   where e.starts_at > now() and char_length(trim(e.title)) >= 4
     and position(lower(trim(e.title)) in lower(v_title || ' ' || v_body)) > 0;

  insert into public.announcements (title, body, audience, campus, target_user_id, send_email, recipient_count, created_by, email_send_before)
  values (v_title, v_body, p_audience,
          case when p_audience = 'campus' then p_campus end,
          case when p_audience = 'user' then p_user_id end,
          coalesce(p_send_email, false), v_count, v_admin, v_before)
  returning id into v_id;

  -- in-app: filled in per person
  insert into public.notifications (user_id, kind, title, body)
  select t, 'announcement',
         public.email_fill(v_title, public.email_fill_values(t, 'announcement:' || v_id)),
         public.email_fill(v_body, public.email_fill_values(t, 'announcement:' || v_id))
    from unnest(v_targets) t;

  if coalesce(p_send_email, false) then
    select coalesce(array_agg(distinct lower(u.email::text)), '{}') into v_emails
      from public.profiles p join auth.users u on u.id = p.id
     where p.id = any (v_targets)
       and u.email_confirmed_at is not null and u.email is not null
       and p.email_opt_in;    -- 0032: direct messages too
    v_emailed := cardinality(v_emails);
    v_link := public.email_app_url() || '/';
    -- One outbox row; the 0032 trigger renders one email per person (fill-ins, greeting, footer).
    v_html := public.email_layout(v_title,
      '<p style="font-size:16px;line-height:1.5;white-space:pre-wrap;margin:0 0 16px">'
      || regexp_replace(public.html_escape(v_body), '(https?://[^\s<]*[^\s<.,!?;:)])', '<a href="\1" style="color:#0b2a5b;">\1</a>', 'g')
      || '</p>'
      || '<p style="margin:0 0 16px"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Open YACquest</a></p>'
      || '<p style="font-size:13px;color:#4a5672;margin:0">Sent by ' || public.html_escape(coalesce(public.display_name_of(v_admin), 'YAC'))
      || ' via YACquest.</p>');
    perform public.enqueue_email('announcement', v_emails, 'YACquest: ' || v_title,
      v_body || E'\n\nOpen YACquest: ' || v_link || E'\n\n— Sent by ' || coalesce(public.display_name_of(v_admin), 'YAC') || ' via YACquest.',
      v_html, 'announcement:' || v_id);
    update public.announcements set email_count = v_emailed where id = v_id;
  end if;

  perform public.log_admin_action(v_admin, 'announcement_sent',
    case when p_audience = 'user' then p_user_id end,
    jsonb_build_object('title', v_title, 'audience', p_audience, 'campus', p_campus,
                       'recipients', v_count, 'emailed', v_emailed));

  return json_build_object('id', v_id, 'recipients', v_count, 'emailed', v_emailed);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Sending (Edge Function send-emails, service role)
-- ─────────────────────────────────────────────────────────────────────────────

-- 0004's claim_email_batch: now only for outbox rows without per-recipient rows (there are none after
-- this migration), so an old BCC sender that hasn't been redeployed yet sends nothing twice.
create or replace function public.claim_email_batch(p_limit int default 20)
returns setof public.email_outbox language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_service_role();
  return query
    with picked as (
      select o.id from public.email_outbox o
       where (o.status = 'pending'
              or (o.status = 'failed' and o.attempts < 5)
              or (o.status = 'sending' and coalesce(o.claimed_at, o.created_at) < now() - interval '15 minutes'))
         and not exists (select 1 from public.email_messages m where m.outbox_id = o.id)
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

-- Picks the next emails to send (see planBatch() in emailCore.ts for the same rules in TypeScript).
create or replace function public.claim_email_messages(p_limit int default 5, p_now timestamptz default now())
returns table (id uuid, kind text, email text, subject text, body_text text, body_html text,
               unsub_token text, attempts int, priority int)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  cfg      public.app_config;
  v_limit  int := greatest(1, least(coalesce(p_limit, 5), 50));
  v_left   int;
  v_high   uuid[];
  v_low    uuid[];
  v_room   int;
  v_ids    uuid[];
  v_touch  uuid[];
begin
  perform public.require_service_role();
  select * into cfg from public.app_config where id = 1;

  -- stuck in 'sending' after the 5th try → give up
  update public.email_messages m
     set status = 'failed', error = coalesce(m.error, 'Timed out while sending')
   where m.status = 'sending' and m.attempts >= 5 and coalesce(m.claimed_at, m.created_at) < p_now - interval '15 minutes';

  -- too late → skipped, never sent late
  with x as (
    update public.email_messages m
       set status = 'skipped_expired', error = 'Too late to send (daily email budget was used up).', body_text = '', body_html = ''
     where (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5)
            or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < p_now - interval '15 minutes'))
       and m.send_before is not null and m.send_before <= p_now
    returning m.outbox_id)
  select array_agg(distinct outbox_id) into v_touch from x;

  -- turned email off (or started bouncing) after it was queued
  with x as (
    update public.email_messages m
       set status = case when p.email_bounced then 'skipped_bouncing' else 'skipped_opted_out' end,
           error = case when p.email_bounced then 'Paused: emails to this address bounce.' else 'Email updates are off for this person.' end,
           body_text = '', body_html = ''
      from public.profiles p
     where p.id = m.user_id
       and (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5))
       and (p.email_bounced or (public.email_is_participant_kind(m.kind) and not p.email_opt_in))
    returning m.outbox_id)
  select coalesce(v_touch, '{}') || coalesce(array_agg(distinct outbox_id), '{}') into v_touch from x;

  -- rolling 24 h budget: sent + in flight
  v_left := coalesce(cfg.email_daily_budget, 450)
            - (select count(*) from public.email_messages m
                where (m.status in ('sent', 'bounced') and m.sent_at > p_now - interval '24 hours')
                   or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) >= p_now - interval '15 minutes'))::int;

  select coalesce(array_agg(q.id), '{}') into v_high from (
    select m.id from public.email_messages m
     where m.priority <= 2
       and (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5)
            or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < p_now - interval '15 minutes'))
     order by m.priority, m.created_at, m.id
     limit greatest(0, least(v_limit, v_left))
     for update skip locked) q;
  v_room := greatest(0, least(v_limit - cardinality(v_high), v_left - coalesce(cfg.email_reserve, 50) - cardinality(v_high)));
  select coalesce(array_agg(q.id), '{}') into v_low from (
    select m.id from public.email_messages m
     where m.priority > 2
       and (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5)
            or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < p_now - interval '15 minutes'))
     order by m.priority, m.created_at, m.id
     limit v_room
     for update skip locked) q;
  v_ids := v_high || v_low;

  if cardinality(v_touch) > 0 then
    perform public.email_outbox_rollup(t) from unnest(v_touch) t where t is not null;
  end if;

  return query
    with upd as (
      update public.email_messages m
         set status = 'sending', attempts = m.attempts + 1, claimed_at = p_now
       where m.id = any (v_ids)
      returning m.*)
    select u.id, u.kind, u.email, u.subject, u.body_text, u.body_html,
           case when public.email_is_participant_kind(u.kind) then t.token end,
           u.attempts, u.priority
      from upd u left join public.email_unsub_tokens t on t.user_id = u.user_id
     order by u.priority, u.created_at, u.id;
end $$;

create or replace function public.mark_email_message(p_id uuid, p_ok boolean, p_error text default null, p_now timestamptz default now())
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_outbox uuid;
begin
  perform public.require_service_role();
  if p_ok then
    update public.email_messages
       set status = 'sent', sent_at = p_now, error = null, body_text = '', body_html = ''   -- bodies aren't kept after sending
     where id = p_id returning outbox_id into v_outbox;
  else
    update public.email_messages set status = 'failed', error = left(coalesce(p_error, 'Unknown error'), 500)
     where id = p_id returning outbox_id into v_outbox;
  end if;
  if not found then
    perform public.api_error('not_found', 'Email not found.');
  end if;
  perform public.email_outbox_rollup(v_outbox);
end $$;

-- Claimed but not sent before the run had to stop: back in the queue, the try doesn't count.
create or replace function public.release_email_messages(p_ids uuid[])
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform public.require_service_role();
  update public.email_messages set status = 'queued', attempts = greatest(0, attempts - 1), claimed_at = null
   where id = any (coalesce(p_ids, '{}')) and status = 'sending';
  get diagnostics n = row_count;
  return n;
end $$;

-- Links → signatures for the tracked /c/ links (only for real messages, only http(s)).
create or replace function public.email_sign_links(p_msg uuid, p_urls text[])
returns table (url text, sig text) language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform public.require_service_role();
  if not exists (select 1 from public.email_messages where id = p_msg) then
    return;
  end if;
  return query
    select u, public.email_link_sig(p_msg, u)
      from unnest(coalesce(p_urls, '{}')) u
     where u ~* '^https?://\S+$' and char_length(u) <= 2000;
end $$;

create or replace function public.email_run_finished(p_stats jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_service_role();
  insert into public.email_runs (sent, failed, released, bounces, imap_status, imap_error)
  values (coalesce((p_stats->>'sent')::int, 0), coalesce((p_stats->>'failed')::int, 0), coalesce((p_stats->>'released')::int, 0),
          coalesce((p_stats->>'bounces')::int, 0),
          case when p_stats->>'imap' in ('ok', 'off', 'error', 'skipped') then p_stats->>'imap' else 'off' end,
          left(p_stats->>'imapError', 300));
  delete from public.email_runs where ran_at < now() - interval '30 days';
end $$;

-- A Gmail "Delivery Status Notification (Failure)" → latest sent email to that address is 'bounced'.
-- 2 hard bounces (since staff last cleared it) → profiles.email_bounced = true.
create or replace function public.record_email_bounce(p_email text, p_reason text default null, p_hard boolean default true,
                                                      p_now timestamptz default now())
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  m       public.email_messages;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_hard  int;
  v_flag  boolean := false;
  p       public.profiles;
begin
  perform public.require_service_role();
  select * into m from public.email_messages
   where lower(email) = v_email and status in ('sent', 'bounced') and sent_at > p_now - interval '3 days'
   order by (status = 'sent') desc, sent_at desc limit 1;
  if m.id is null then
    return json_build_object('matched', false, 'flagged', false);
  end if;
  if m.status = 'sent' then
    update public.email_messages set status = 'bounced', error = left(coalesce(p_reason, 'Bounced'), 500) where id = m.id;
  end if;
  insert into public.email_events (message_id, user_id, type, detail)
  values (m.id, m.user_id, 'bounce', left(case when coalesce(p_hard, true) then 'hard: ' else 'soft: ' end || coalesce(p_reason, ''), 300));

  select pr.* into p from public.profiles pr left join auth.users u on u.id = pr.id
   where pr.id = m.user_id or lower(u.email::text) = v_email or lower(pr.email::text) = v_email
   limit 1;
  select count(distinct ev.message_id) into v_hard
    from public.email_events ev join public.email_messages mm on mm.id = ev.message_id
   where ev.type = 'bounce' and ev.detail like 'hard:%' and lower(mm.email) = v_email
     and ev.created_at > coalesce(p.email_bounce_cleared_at, '-infinity'::timestamptz);
  if p.id is not null and v_hard >= 2 and not p.email_bounced then
    update public.profiles set email_bounced = true, email_bounced_at = p_now where id = p.id;
    v_flag := true;
  end if;
  return json_build_object('matched', true, 'flagged', v_flag, 'messageId', m.id, 'hardBounces', v_hard);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Tracking + unsubscribe (Edge Function email-track; unsubscribe also from the app page)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.track_email_open(p_msg uuid, p_ua text default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare m public.email_messages;
begin
  perform public.require_service_role();
  select * into m from public.email_messages where id = p_msg;
  if m.id is null or (select count(*) from public.email_events where message_id = p_msg and type = 'open') >= 20 then
    return false;
  end if;
  insert into public.email_events (message_id, user_id, type, user_agent) values (m.id, m.user_id, 'open', left(p_ua, 120));
  return true;
end $$;

-- True only when the signature matches (then the Edge Function redirects). Logs the click.
create or replace function public.track_email_click(p_msg uuid, p_url text, p_sig text, p_ua text default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare m public.email_messages;
begin
  perform public.require_service_role();
  if p_msg is null or p_url is null or p_sig is null or p_url !~* '^https?://\S+$'
     or lower(p_sig) <> public.email_link_sig(p_msg, p_url) then
    return false;
  end if;
  select * into m from public.email_messages where id = p_msg;
  if m.id is not null and (select count(*) from public.email_events where message_id = p_msg and type = 'click') < 50 then
    insert into public.email_events (message_id, user_id, type, url, user_agent) values (m.id, m.user_id, 'click', left(p_url, 2000), left(p_ua, 120));
  end if;
  return true;
end $$;

-- Anyone with the link (no login). Only ever turns that person's announcement emails OFF.
create or replace function public.unsubscribe_by_token(p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid;
  v_was  boolean;
  v_msg  uuid;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    perform public.api_error('invalid_token', 'This unsubscribe link isn’t valid. You can turn emails off in YACquest under Me → Settings.');
  end if;
  select user_id into v_user from public.email_unsub_tokens where token = p_token;
  if v_user is null then
    perform public.api_error('invalid_token', 'This unsubscribe link isn’t valid. You can turn emails off in YACquest under Me → Settings.');
  end if;
  select email_opt_in into v_was from public.profiles where id = v_user;
  update public.profiles set email_opt_in = false where id = v_user;
  select id into v_msg from public.email_messages where user_id = v_user and status in ('sent', 'bounced') order by sent_at desc limit 1;
  if v_was then
    insert into public.email_events (message_id, user_id, type, detail) values (v_msg, v_user, 'unsubscribe', 'one-click');
  end if;
  return json_build_object('unsubscribed', true, 'alreadyOff', not coalesce(v_was, false));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Staff: queue state, stats, drill-down, per-person history, bouncing emails
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.email_queue_status(p_now timestamptz default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_now  timestamptz := coalesce(p_now, now());
  cfg    public.app_config;
  r      public.email_runs;
  v_last timestamptz;
begin
  perform public.require_admin();
  select * into cfg from public.app_config where id = 1;
  select * into r from public.email_runs order by ran_at desc limit 1;
  select max(ran_at) into v_last from public.email_runs where imap_status = 'ok';
  return json_build_object(
    'budget', coalesce(cfg.email_daily_budget, 450),
    'reserve', coalesce(cfg.email_reserve, 50),
    'sent24h', (select count(*) from public.email_messages where status in ('sent', 'bounced') and sent_at > v_now - interval '24 hours'),
    'waiting', (select count(*) from public.email_messages where status in ('queued', 'sending') or (status = 'failed' and attempts < 5)),
    'waitingHigh', (select count(*) from public.email_messages where priority <= 2 and (status in ('queued', 'sending') or (status = 'failed' and attempts < 5))),
    'skippedToday', (select count(*) from public.email_messages where status = 'skipped_expired' and created_at > v_now - interval '24 hours'),
    'lastRunAt', r.ran_at,
    'nextRunAt', case when r.ran_at is null then null else r.ran_at + interval '10 minutes' end,
    'bounceCheck', case when r.id is null then 'never' else r.imap_status end,
    'bounceError', r.imap_error,
    'lastBounceCheckAt', v_last);
end $$;

create or replace function public.email_stats(p_days int default 30, p_now timestamptz default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_now   timestamptz := coalesce(p_now, now());
  v_days  int := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz := v_now - make_interval(days => v_days);
  v_tot   json;
  v_daily json;
  v_camps json;
begin
  perform public.require_admin();
  with m as (
    select m.*,
           exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'open') as opened,
           exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'click') as clicked
      from public.email_messages m
     where coalesce(m.sent_at, m.created_at) >= v_since and coalesce(m.sent_at, m.created_at) <= v_now
  ), t as (
    select count(*) filter (where status in ('sent', 'bounced')) as sent,
           count(*) filter (where status = 'sent') as delivered,
           count(*) filter (where status = 'sent' and opened) as opened,
           count(*) filter (where status = 'sent' and clicked) as clicked,
           count(*) filter (where status = 'bounced') as bounced,
           count(*) filter (where status like 'skipped%') as skipped,
           count(*) filter (where status = 'skipped_expired') as expired,
           count(*) filter (where status = 'failed' and attempts >= 5) as failed
      from m
  )
  select json_build_object(
           'sent', t.sent, 'delivered', t.delivered, 'opened', t.opened, 'clicked', t.clicked,
           'openRate', case when t.delivered > 0 then round(100.0 * t.opened / t.delivered) else 0 end,
           'ctr', case when t.delivered > 0 then round(100.0 * t.clicked / t.delivered) else 0 end,
           'bounced', t.bounced, 'skipped', t.skipped, 'expired', t.expired, 'failed', t.failed,
           'unsubscribed', (select count(distinct coalesce(e.user_id::text, e.id::text)) from public.email_events e
                             where e.type = 'unsubscribe' and e.created_at >= v_since and e.created_at <= v_now))
    into v_tot from t;

  select coalesce(json_agg(json_build_object('day', d.day, 'sent', d.sent, 'opened', d.opened, 'clicked', d.clicked) order by d.day), '[]'::json)
    into v_daily
    from (
      select to_char(g.day, 'YYYY-MM-DD') as day,
             count(m.id) filter (where m.status in ('sent', 'bounced')) as sent,
             count(m.id) filter (where m.status = 'sent' and exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'open')) as opened,
             count(m.id) filter (where m.status = 'sent' and exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'click')) as clicked
        from generate_series(date_trunc('day', v_since at time zone 'America/New_York') + interval '1 day',
                             date_trunc('day', v_now at time zone 'America/New_York'), interval '1 day') g(day)
        left join public.email_messages m
               on m.sent_at is not null and date_trunc('day', m.sent_at at time zone 'America/New_York') = g.day
       group by g.day) d;

  select coalesce(json_agg(c order by c."firstAt" desc), '[]'::json) into v_camps
    from (
      select m.campaign_id as id, max(m.campaign_label) as label, min(m.kind) as kind,
             min(m.created_at) as "firstAt",
             count(*) as recipients,
             count(*) filter (where m.status in ('sent', 'bounced')) as sent,
             count(*) filter (where m.status = 'sent' and exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'open')) as opened,
             count(*) filter (where m.status = 'sent' and exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'click')) as clicked,
             count(*) filter (where m.status = 'bounced') as bounced,
             count(*) filter (where exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'unsubscribe')) as unsubscribed,
             count(*) filter (where m.status like 'skipped%') as skipped,
             count(*) filter (where m.status in ('queued', 'sending') or (m.status = 'failed' and m.attempts < 5)) as waiting,
             count(*) filter (where m.status = 'failed' and m.attempts >= 5) as failed
        from public.email_messages m
       where m.created_at >= v_since and m.created_at <= v_now
       group by m.campaign_id
       order by min(m.created_at) desc
       limit 100) c;

  return json_build_object('days', v_days, 'since', v_since, 'totals', v_tot, 'daily', v_daily, 'campaigns', v_camps);
end $$;

create or replace function public.email_campaign_recipients(p_campaign text)
returns table (message_id uuid, user_id uuid, name text, campus text, email text, status text, sent_at timestamptz,
               opened boolean, opened_at timestamptz, clicked_urls text[], bounced boolean, unsubscribed boolean, error text)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query
    select m.id, m.user_id, coalesce(p.display_name, ''), coalesce(p.campus, ''), m.email, m.status, m.sent_at,
           exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'open'),
           (select min(e.created_at) from public.email_events e where e.message_id = m.id and e.type = 'open'),
           coalesce((select array_agg(distinct e.url) from public.email_events e where e.message_id = m.id and e.type = 'click'), '{}'::text[]),
           m.status = 'bounced',
           exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'unsubscribe'),
           m.error
      from public.email_messages m left join public.profiles p on p.id = m.user_id
     where m.campaign_id = p_campaign
     order by lower(coalesce(p.display_name, m.email)), m.created_at;
end $$;

create or replace function public.email_history_for(p_user uuid)
returns table (id uuid, kind text, label text, subject text, status text, created_at timestamptz, sent_at timestamptz,
               opened boolean, clicked boolean, error text)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query
    select m.id, m.kind, m.campaign_label, m.subject, m.status, m.created_at, m.sent_at,
           exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'open'),
           exists (select 1 from public.email_events e where e.message_id = m.id and e.type = 'click'),
           m.error
      from public.email_messages m
     where m.user_id = p_user
     order by m.created_at desc
     limit 50;
end $$;

create or replace function public.email_bouncing_users()
returns table (user_id uuid, bounced_at timestamptz) language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query select p.id, p.email_bounced_at from public.profiles p where p.email_bounced;
end $$;

create or replace function public.admin_clear_email_bounce(p_user uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_admin uuid := public.require_admin();
begin
  update public.profiles set email_bounced = false, email_bounce_cleared_at = now() where id = p_user;
  if not found then
    perform public.api_error('not_found', 'Player not found.');
  end if;
  perform public.log_admin_action(v_admin, 'email_bounce_cleared', p_user, '{}'::jsonb);
end $$;

create or replace function public.my_email_status()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = public.require_user();
  return json_build_object('optIn', p.email_opt_in, 'bounced', p.email_bounced, 'bouncedAt', p.email_bounced_at);
end $$;

-- "My email works now" (after fixing the mailbox): emails resume; 2 new hard bounces pause them again.
create or replace function public.clear_my_email_bounce()
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.profiles set email_bounced = false, email_bounce_cleared_at = now() where id = public.require_user();
end $$;

-- Delivery log (0004) → one row per recipient now (older emails from before 0032 keep their row).
create or replace function public.email_log(p_limit int default 50)
returns table (id uuid, kind text, to_emails text[], subject text, status text, attempts int, last_error text,
               created_at timestamptz, sent_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform public.require_chair();
  return query
    select x.id, x.kind, x.to_emails, x.subject, x.status, x.attempts, x.last_error, x.created_at, x.sent_at
      from (
        select m.id, m.kind, array[m.email] as to_emails, m.subject,
               case m.status when 'queued' then 'pending' else m.status end as status,
               m.attempts, m.error as last_error, m.created_at, m.sent_at
          from public.email_messages m
        union all
        select o.id, o.kind, o.to_emails, o.subject, o.status, o.attempts, o.last_error, o.created_at, o.sent_at
          from public.email_outbox o
         where not exists (select 1 from public.email_messages m where m.outbox_id = o.id)
      ) x
     order by x.created_at desc, x.id
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;

create or replace function public.retry_email(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_outbox uuid;
begin
  perform public.require_chair();
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
-- 10. Deleted accounts: their address and email contents leave the log
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.email_messages_forget_profile()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.email_messages
     set email = 'deleted-account', subject = '(deleted account)', body_text = '', body_html = ''
   where user_id = old.id or (old.email is not null and lower(email) = lower(old.email::text));
  return old;
end $$;
-- An outbox row deleted by delete_my_account() (0027, e.g. prize alerts about them): its per-recipient copies go too.
create or replace function public.email_outbox_forget()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.email_messages where outbox_id = old.id;
  return old;
end $$;
drop trigger if exists email_outbox_forget on public.email_outbox;
create trigger email_outbox_forget before delete on public.email_outbox
  for each row execute function public.email_outbox_forget();

drop trigger if exists profiles_forget_emails on public.profiles;
create trigger profiles_forget_emails before delete on public.profiles
  for each row execute function public.email_messages_forget_profile();

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function
  public.email_priority(text), public.email_is_participant_kind(text), public.email_seed(text), public.campus_puns(text),
  public.campus_pun(text, int), public.email_first_name(text), public.email_next_stop(int, int), public.email_next_event(text, timestamptz),
  public.email_fill_values(uuid, text, timestamptz), public.email_fill_tokens(), public.email_fill(text, jsonb, boolean),
  public.email_unknown_tokens(text), public.email_app_url(), public.email_unsub_token(uuid), public.email_unsub_url(text),
  public.email_link_sig(uuid, text), public.email_footer_html(text), public.email_footer_text(text), public.email_try_uuid(text),
  public.email_campaign(text, text, text, timestamptz), public.email_expand_outbox(uuid), public.email_outbox_rollup(uuid),
  public.email_outbox_expand_trigger(), public.email_messages_forget_profile(), public.email_outbox_forget()
from public, anon, authenticated;

-- Edge Functions (service_role key) only
revoke execute on function
  public.claim_email_messages(int, timestamptz), public.mark_email_message(uuid, boolean, text, timestamptz),
  public.release_email_messages(uuid[]), public.email_sign_links(uuid, text[]), public.email_run_finished(jsonb),
  public.record_email_bounce(text, text, boolean, timestamptz), public.track_email_open(uuid, text),
  public.track_email_click(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function
  public.claim_email_messages(int, timestamptz), public.mark_email_message(uuid, boolean, text, timestamptz),
  public.release_email_messages(uuid[]), public.email_sign_links(uuid, text[]), public.email_run_finished(jsonb),
  public.record_email_bounce(text, text, boolean, timestamptz), public.track_email_open(uuid, text),
  public.track_email_click(uuid, text, text, text)
to service_role;

-- The unsubscribe page works without logging in.
revoke execute on function public.unsubscribe_by_token(text) from public;
grant execute on function public.unsubscribe_by_token(text) to anon, authenticated, service_role;

-- Staff (admins + chairs; checked inside) and the person themself
revoke execute on function
  public.email_queue_status(timestamptz), public.email_stats(int, timestamptz), public.email_campaign_recipients(text),
  public.email_history_for(uuid), public.email_bouncing_users(), public.admin_clear_email_bounce(uuid),
  public.my_email_status(), public.clear_my_email_bounce(), public.send_announcement(text, text, text, text, uuid, boolean)
from public, anon;
grant execute on function
  public.email_queue_status(timestamptz), public.email_stats(int, timestamptz), public.email_campaign_recipients(text),
  public.email_history_for(uuid), public.email_bouncing_users(), public.admin_clear_email_bounce(uuid),
  public.my_email_status(), public.clear_my_email_bounce(), public.send_announcement(text, text, text, text, uuid, boolean)
to authenticated;

-- Done.

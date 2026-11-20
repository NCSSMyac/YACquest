-- ═══════════════════════════════════════════════════════════════════════════
-- 0039 — Emails: no winner details in the prize email, cleaner wording,
--        per-type email choices, email health alerts.
--
--   • WINNER EMAIL WITHOUT PERSONAL DETAILS. prize_info ("YACquest winner info
--     received: <name> (spot #N)") now only says that the winner sent their
--     delivery details, where to see them (YACquest → Admin → Prizes, YACquest
--     Chairs only: list_claims is chair-only) and the deadline, plus a button and
--     the reference code. No full name, email, phone, address, gift card
--     preference or notes. prize_info_email() builds it (also used by the email
--     test pack). Existing prize_info rows that still have contents (outbox and
--     unsent per-person copies) are re-written to the new version, once, here.
--     The 0037 30-day / delivered clearing is unchanged.
--   • WORDING. No emoji and no "URGENT" in any subject:
--       prize_qualified  "YACquest: <name> won prize spot #N"
--       prize_info       "YACquest winner info received: <name> (spot #N)"
--       wrapped          "Your YACquest Wrapped is here"
--       test             "YACquest test email"
--     Event times in emails say "ET" (reminders: "Reminder: <event> starts at
--     7:00 PM ET"; follow-ups and the weekly report: "Thu, Nov 19 at 7:00 PM ET").
--     In-app notifications are unchanged. Friendly campus lines ({campus_pun}):
--     4 per campus, all school spirit, no rivalry. Confirmation email: "Confirming
--     lets you hold a prize spot and get YACquest emails." Staff footer: "You get
--     this because you're on the YACquest staff email list." (HTML and plain text).
--     Two weekly-report "Yak of the week" lines that could read badly are gone.
--   • PER-TYPE EMAIL CHOICES. profiles.email_announcements / email_events
--     (event reminders + follow-ups) / email_wrapped, default true, back-filled
--     from email_opt_in. email_opt_in stays and is kept in sync by a trigger:
--     it is "any of the three on"; turning it off (old app, mailto unsubscribe,
--     old unsubscribe links) turns all three off, turning it on turns all three
--     on. Every place that checked email_opt_in for a participant email now checks
--     that email's own setting: send_announcement, announcement_audience_count,
--     reminders, follow-ups, Wrapped, email_expand_outbox and claim_email_messages
--     ('skipped_opted_out'). set_my_email_prefs() changes them (Me → Settings);
--     my_email_status() reports them. unsubscribe_by_token(token, kind default null):
--     with a kind (announcement / event_reminder / event_followup / wrapped) it
--     turns off only that type; without one (old links, mailto) everything, as
--     before. The unsubscribe event's detail records it ('one-click:events').
--     Participant emails' one-click links now carry ?k=<kind>.
--   • EMAIL HEALTH. email_health() (admins + chairs) → {status: green|amber|red,
--     reasons[{code, level, title, todo, detail}], lastRunAt, …}: sender not run
--     in 60 min, Gmail login rejected, last 3 runs sent nothing, bounce check
--     can't reach Gmail, emails stuck > 2 h, sent > 20 participant emails in 7
--     days with no opens or clicks (tracking down), budget > 90 % used. The weekly
--     report gets one "Email health" line.
--
-- ADDITIVE (new columns with defaults, a new trigger, new functions, re-created
-- functions; unsubscribe_by_token gains an optional argument — the one-argument
-- version is replaced by it in one transaction, so old callers keep working).
-- No downtime. Run AFTER 0038. Safe to run more than once.
-- BACKWARD COMPATIBLE: the deployed send-emails and email-track keep working
-- unchanged after this runs (same RPC names and arguments). Re-deploy both
-- afterwards (either order) so Gmail's Unsubscribe button turns off only that
-- email's type; until then it turns off everything, as before. See docs/SETUP.md.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-type email choices (additive) + back-fill + keep email_opt_in in sync
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists email_announcements boolean not null default true;
alter table public.profiles add column if not exists email_events        boolean not null default true;
alter table public.profiles add column if not exists email_wrapped       boolean not null default true;

-- email_opt_in = "any of the three on". Changing a type sets email_opt_in; changing only email_opt_in (old app,
-- mailto / old unsubscribe links, old update_profile) sets all three to match.
create or replace function public.profiles_email_prefs_sync()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if not coalesce(new.email_opt_in, true) then
      new.email_announcements := false;
      new.email_events := false;
      new.email_wrapped := false;
    end if;
  elsif (new.email_announcements, new.email_events, new.email_wrapped)
        is not distinct from (old.email_announcements, old.email_events, old.email_wrapped) then
    if new.email_opt_in is distinct from old.email_opt_in then
      new.email_announcements := coalesce(new.email_opt_in, false);
      new.email_events := coalesce(new.email_opt_in, false);
      new.email_wrapped := coalesce(new.email_opt_in, false);
    end if;
  end if;
  new.email_opt_in := new.email_announcements or new.email_events or new.email_wrapped;
  return new;
end $$;
drop trigger if exists profiles_email_prefs_sync on public.profiles;
create trigger profiles_email_prefs_sync before insert or update of email_opt_in, email_announcements, email_events, email_wrapped
  on public.profiles for each row execute function public.profiles_email_prefs_sync();

-- Back-fill (re-run safe): people who had emails off get all three off. Nobody else changes. Returns how many.
create or replace function public.email_prefs_backfill()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  update public.profiles set email_announcements = false, email_events = false, email_wrapped = false
   where not email_opt_in and (email_announcements or email_events or email_wrapped);
  get diagnostics n = row_count;
  return n;
end $$;
select public.email_prefs_backfill();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Email types (mirrored in src/lib/emailWording.ts + emailCore.ts)
-- ─────────────────────────────────────────────────────────────────────────────
-- Email kind (or type name) → its setting: 'announcement' | 'events' | 'wrapped'; null = not a participant type.
create or replace function public.email_kind_type(p_kind text)
returns text language sql immutable set search_path = public, extensions as $$
  select case lower(trim(coalesce(p_kind, '')))
    when 'announcement' then 'announcement' when 'announcements' then 'announcement'
    when 'event_reminder' then 'events' when 'event_followup' then 'events' when 'events' then 'events' when 'event' then 'events'
    when 'wrapped' then 'wrapped'
  end;
$$;

-- True when this person wants this kind of email (staff and account emails: always true).
create or replace function public.email_type_on(p_kind text, p_announcements boolean, p_events boolean, p_wrapped boolean)
returns boolean language sql immutable set search_path = public, extensions as $$
  select case public.email_kind_type(p_kind)
    when 'announcement' then coalesce(p_announcements, false)
    when 'events' then coalesce(p_events, false)
    when 'wrapped' then coalesce(p_wrapped, false)
    else true end;
$$;

-- "Announcements" / "Event reminders and thank-yous" / "Yearly Wrapped" (the Me → Settings labels).
create or replace function public.email_type_label(p_kind text)
returns text language sql immutable set search_path = public, extensions as $$
  select case public.email_kind_type(p_kind)
    when 'announcement' then 'Announcements' when 'events' then 'Event reminders and thank-yous' when 'wrapped' then 'Yearly Wrapped'
    else 'YACquest' end;
$$;

-- In a sentence: "… YACquest announcement emails on", "event reminder and thank-you", "yearly Wrapped".
create or replace function public.email_type_phrase(p_kind text)
returns text language sql immutable set search_path = public, extensions as $$
  select case public.email_kind_type(p_kind)
    when 'announcement' then 'announcement' when 'events' then 'event reminder and thank-you' when 'wrapped' then 'yearly Wrapped'
    else '' end;
$$;

create or replace function public.email_type_off_error(p_kind text)
returns text language sql immutable set search_path = public, extensions as $$
  select case when public.email_kind_type(p_kind) is null then 'Email updates are off for this person.'
              else upper(left(public.email_type_phrase(p_kind), 1)) || substr(public.email_type_phrase(p_kind), 2)
                   || ' emails are off for this person.' end;
$$;

-- One-click link that turns off only this kind's type: <app>/#/unsubscribe?t=<token>&k=<kind>.
create or replace function public.email_unsub_url_for(p_token text, p_kind text)
returns text language sql stable security definer set search_path = public, extensions as $$
  select public.email_unsub_url(p_token)
         || case when public.email_kind_type(p_kind) is not null then '&k=' || lower(trim(p_kind)) else '' end;
$$;

-- Participant footer for one kind (copy of 0032's email_footer_html/text, naming the type).
create or replace function public.email_footer_html_for(p_unsub_url text, p_kind text)
returns text language sql immutable set search_path = public, extensions as $$
  select 'You''re getting this because you have YACquest ' || public.email_type_phrase(p_kind) || ' emails on. '
         || case when p_unsub_url is not null
                 then '<a href="' || public.html_escape(p_unsub_url) || '" style="color:#0b2a5b;">Unsubscribe from these in one click</a> · '
                 else '' end
         || 'Manage all email choices in the app (Me → Settings)<br>YACquest · NCSSM Young Alumni Council';
$$;

create or replace function public.email_footer_text_for(p_unsub_url text, p_kind text)
returns text language sql immutable set search_path = public, extensions as $$
  select E'—\nYou''re getting this because you have YACquest ' || public.email_type_phrase(p_kind) || ' emails on.'
         || case when p_unsub_url is not null then E'\nUnsubscribe from these in one click: ' || p_unsub_url else '' end
         || E'\nManage all email choices in the app: Me → Settings'
         || E'\nYACquest · NCSSM Young Alumni Council';
$$;

-- Staff emails' plain-text footer: the same words as the HTML footer in email_layout().
create or replace function public.email_staff_footer_text()
returns text language sql immutable set search_path = public, extensions as $$
  select E'—\nYou get this because you''re on the YACquest staff email list. Manage these in Admin → System.\nYACquest · NCSSM Young Alumni Council';
$$;

-- Event times in emails name the time zone: "7:00 PM ET" / "Thu, Nov 19 at 7:00 PM ET".
create or replace function public.email_event_time(p_at timestamptz)
returns text language sql stable set search_path = public, extensions as $$
  select to_char(p_at at time zone 'America/New_York', 'FMHH12:MI AM') || ' ET';
$$;

create or replace function public.email_event_when(p_at timestamptz)
returns text language sql stable set search_path = public, extensions as $$
  select public.followup_when(p_at) || ' ET';
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Friendly campus lines (KEEP IN SYNC with CAMPUS_PUNS in src/lib/campusPuns.ts)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.campus_puns(p_campus text)
returns text[] language sql immutable set search_path = public, extensions as $$
  select case p_campus
    when 'duke' then array[
      'Go Blue Devils — see you soon!',
      'From the Gothic Wonderland to YAC: welcome back!',
      'Duke''s got spirit — bring it to the next event!',
      'Forever Duke, forever NCSSM.'
    ]::text[]
    when 'unc' then array[
      'Go Heels!',
      'Carolina blue skies ahead 💙',
      'Heel yeah, see you there!',
      'Ram-arkable things happen when Tar Heels show up.'
    ]::text[]
    when 'ncsu' then array[
      'Go Pack!',
      'Howl about joining us?',
      'Wolfpack, roll call! 🐾',
      'Think and Do — and come hang with YAC!'
    ]::text[]
    else '{}'::text[] end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Yak of the week: copy of 0015 without two lines that could read badly
--    (KEEP IN SYNC with src/lib/yakPuns.ts)
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
    'Quest, yak, repeat.',
    'Mountains are just yak speed bumps.',
    'Aim high. Yaks live at 15,000 feet.',
    'Yak-ing it one quest at a time.',
    'Everything’s going yak-cording to plan.',
    'Hair today, points tomorrow.',
    'Yak-tivate quest mode!',
    'Herd it here first: you’re crushing it.',
    'Yak-cept the challenge.',
    'Have a yak-tastic day!',
    'Yak-pack ready, adventure awaits.'
    ]::text[] as p) x;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Wording: staff footer (layout), test email, confirmation email — copies with the new words
-- ─────────────────────────────────────────────────────────────────────────────
-- Copy of 0032: the staff footer says "You get this because you're on the YACquest staff email list."
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
    || 'You get this because you''re on the YACquest staff email list. Manage these in Admin → System.<br>YACquest · NCSSM Young Alumni Council'
    || '<!--/yac:footer--></td></tr></table></td></tr></table></body></html>';
$$;


-- Copy of 0037: subject without emoji ("YACquest test email").
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
  perform public.enqueue_email('test', array[v_email], 'YACquest test email',
    format(E'Hi %s,\n\nThis is a test email from YACquest. If you can read this, YACquest staff emails are working.\n', v_name),
    public.email_layout('Test email',
      '<p style="margin:0 0 10px;">Hi ' || public.html_escape(v_name) || ',</p>'
      || '<p style="margin:0;">This is a test email from YACquest. If you can read this, YACquest staff emails are working. ✅</p>'),
    'test:' || gen_random_uuid());
end $$;


-- Copy of 0034: "Confirming lets you hold a prize spot and get YACquest emails."
create or replace function public.queue_verification_email(p_user uuid, p_reason text default 'signup', p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  p       public.profiles;
  cfg     public.app_config;
  v_email text;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_hash  text;
  v_url   text;
  v_first text;
  v_text  text;
  v_html  text;
  v_out   uuid;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null or p.email_verified_at is not null then
    return false;
  end if;
  select * into cfg from public.app_config where id = 1;
  select lower(trim(u.email::text)) into v_email from auth.users u where u.id = p_user;
  v_email := coalesce(v_email, lower(trim(p.email::text)));
  if coalesce(v_email, '') !~ '^\S+@\S+\.\S+$' then
    return false;
  end if;
  -- global cap (bot sign-up floods): later sends can still go out with "Resend"
  if (select count(*) from public.email_verify_tokens where created_at > p_now - interval '1 hour')
     >= coalesce(cfg.verify_emails_per_hour, 150) then
    return false;
  end if;
  v_hash := public.email_token_hash(v_token);
  insert into public.email_verify_tokens (token_hash, user_id, email, reason, created_at, expires_at)
  values (v_hash, p_user, v_email, case when p_reason = 'resend' then 'resend' else 'signup' end, p_now,
          p_now + make_interval(days => public.email_verify_days()));

  v_url := public.email_app_url() || '/#/verify?t=' || v_token;
  v_first := coalesce(public.email_first_name(p.display_name), 'there');
  v_text := 'Hi ' || v_first || E',\n\n'
    || E'Welcome to YACquest! You can already check in, earn points and play. Tap the link below to confirm this is your email. Confirming lets you hold a prize spot and get YACquest emails.\n\n'
    || 'Confirm my email: ' || v_url || E'\n\n'
    || E'The link works for 7 days. If you didn''t sign up for YACquest, you can ignore this email.\n\n'
    || E'—\nYACquest · NCSSM Young Alumni Council';
  v_html := public.email_layout('Confirm your YACquest email',
      '<p style="margin:0 0 12px;font-size:16px;">Hi ' || public.html_escape(v_first) || ',</p>'
    || '<p style="margin:0 0 12px;">Welcome to YACquest! You can already check in, earn points and play. Tap the button to confirm this is your email. Confirming lets you hold a prize spot and get YACquest emails.</p>'
    || '<p style="margin:18px 0;"><a href="' || public.html_escape(v_url) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;border:2px solid #0b2a5b;">Confirm my email</a></p>'
    || '<p style="margin:0 0 6px;font-size:13px;color:#5b6475;">Or paste this link into your browser:<br><span style="word-break:break-all;">' || public.html_escape(v_url) || '</span></p>'
    || '<p style="margin:12px 0 0;font-size:13px;color:#5b6475;">The link works for 7 days.</p>');
  v_html := regexp_replace(v_html, '<!--yac:footer-->.*<!--/yac:footer-->',
    'You''re getting this because someone signed up for YACquest with this address. If that wasn''t you, you can ignore this email.<br>YACquest · NCSSM Young Alumni Council');

  insert into public.email_outbox (kind, to_emails, subject, body_text, body_html, dedupe_key)
  values ('verify_email', array[v_email], 'Confirm your YACquest email', v_text, v_html, 'verify:' || v_hash)
  returning id into v_out;
  -- The per-person copy (email_messages) was just written by the outbox trigger; don't keep the link here too.
  update public.email_outbox set body_text = '', body_html = '' where id = v_out;
  return true;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Prize alerts: no personal details in email
-- ─────────────────────────────────────────────────────────────────────────────
-- The "winner info received" email: who, which spot, where to look, the deadline, the reference. Nothing else.
-- {subject, text, html}. Also used by the email test pack (sample data) and the clean-up below.
create or replace function public.prize_info_email(p_name text, p_campus text, p_spot int, p_reference text)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  cfg      public.app_config;
  v_name   text := coalesce(nullif(trim(p_name), ''), 'A winner');
  v_campus text := case when p_campus is null then null else public.campus_label(p_campus) end;
  v_spot   text := coalesce(p_spot::text, '?');
  v_by     text;
  v_value  text;
  v_link   text := public.email_app_url() || '/#/admin/prizes';
  v_lead   text;
  v_chair  constant text := 'A YACquest chair can see them in Admin → Prizes (only chairs can open it). If you''re not a chair, please pass this on to one.';
begin
  select * into cfg from public.app_config where id = 1;
  v_by := coalesce(trim(to_char(cfg.fulfill_by, 'Mon FMDD, YYYY')), 'the deadline');
  v_value := '$' || coalesce(cfg.prize_value_usd::text, '75');
  v_lead := v_name || coalesce(' (' || v_campus || ')', '') || ' sent their delivery details for prize spot #' || v_spot || '.';
  return json_build_object(
    'subject', format('YACquest winner info received: %s (spot #%s)', v_name, v_spot),
    'text', v_lead || ' Open YACquest → Admin → Prizes to see them and send the ' || v_value || ' gift card by ' || v_by || '.'
            || ' For privacy, delivery details are only shown in the app.' || E'\n\n'
            || v_chair || E'\n' || 'Open Admin → Prizes: ' || v_link || E'\n\n'
            || 'Reference: ' || coalesce(nullif(p_reference, ''), '—'),
    'html', public.email_layout(format('Winner info received: spot #%s', v_spot),
      '<p style="margin:0 0 12px;font-size:16px;">' || public.html_escape(v_lead) || '</p>'
      || '<p style="margin:0 0 12px;background:#fff6e3;border:1px solid #f2b33d;border-radius:8px;padding:10px 12px;">'
      || 'Open YACquest → <b>Admin → Prizes</b> to see them and send the <b>' || public.html_escape(v_value) || ' gift card</b> by <b>'
      || public.html_escape(v_by) || '</b>. For privacy, delivery details are only shown in the app.</p>'
      || '<p style="margin:0 0 12px;"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Open Admin → Prizes</a></p>'
      || '<p style="margin:0 0 12px;color:#5b6475;font-size:13px;">' || public.html_escape(v_chair) || '</p>'
      || '<p style="margin:0;font-size:13px;color:#5b6475;">Reference: <b style="color:#1c2333;">' || public.html_escape(coalesce(nullif(p_reference, ''), '—')) || '</b></p>'));
end $$;

-- Copy of 0015 (triggers from 0004 keep pointing here): new subjects, and the info email has no delivery details.
create or replace function public.on_prize_claim_alert()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  rs   public.report_settings;
  cfg  public.app_config;
  v_to text[];
  v_subject text;
  j    json;
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
    v_subject := format('YACquest: %s won prize spot #%s', new.display_name, new.spot);
    perform public.enqueue_email('prize_qualified', v_to, v_subject,
      format(E'%s (%s) reached %s points and won prize spot #%s of %s — a $%s gift card.\n\n'
             'They are waiting to send their delivery info. You will get another email as soon as they do.\n',
             new.display_name, public.campus_label(new.campus), cfg.prize_goal, new.spot, cfg.prize_count, cfg.prize_value_usd)
        || E'\n🐂 Yak of the week: ' || public.yak_pun_of_the_week() || E'\n',
      public.email_layout(format('%s won prize spot #%s', new.display_name, new.spot),
        '<p style="margin:0 0 10px;font-size:17px;"><b>' || public.html_escape(new.display_name) || '</b> ('
        || public.campus_label(new.campus) || ') reached <b>' || cfg.prize_goal || ' points</b> and won prize spot <b>#'
        || new.spot || ' of ' || cfg.prize_count || '</b> — a <b>$' || cfg.prize_value_usd || ' gift card</b>. 🏆</p>'
        || '<p style="margin:0;color:#5b6475;">They are waiting to send their delivery info. You will get another email as soon as they do.</p>'
        || '<p style="margin:12px 0 0;color:#5b6475;font-size:13px;font-style:italic;">🐂 Yak of the week: ' || public.html_escape(public.yak_pun_of_the_week()) || '</p>'),
      'prize_qualified:' || new.id);
    return null;
  end if;

  -- UPDATE: winner sent (or changed) their delivery info. 0039: the email only says so; the details stay in the app.
  if new.contact is not null and new.contact is distinct from old.contact then
    v_to := public.report_recipients();
    if cardinality(v_to) = 0 then return null; end if;
    j := public.prize_info_email(new.display_name, new.campus, new.spot, new.reference);
    perform public.enqueue_email('prize_info', v_to, j->>'subject', j->>'text', j->>'html',
      'prize_info:' || new.id || ':' || md5(new.contact::text));
  end if;
  return null;
end $$;

-- Clean-up (run once below; re-run safe): every prize_info email that still has contents gets the new, detail-free
-- version — the outbox copy and per-person copies not sent yet (sent copies were already emptied when sent).
-- Rows emptied for privacy (0037) stay empty. Returns how many rows were re-written.
create or replace function public.email_scrub_prize_info()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  c public.prize_claims;
  j json;
  n int := 0;
begin
  for r in select o.id, o.dedupe_key from public.email_outbox o
            where o.kind = 'prize_info' and o.body_purged_at is null and (o.body_text <> '' or o.body_html <> '')
              and o.body_text not like '%For privacy, delivery details are only shown in the app.%'
  loop
    c := null;
    select * into c from public.prize_claims where id = public.email_prize_claim_id(r.dedupe_key);
    j := public.prize_info_email(c.display_name, c.campus, c.spot, c.reference);
    update public.email_outbox set subject = j->>'subject', body_text = j->>'text', body_html = j->>'html' where id = r.id;
    n := n + 1;
  end loop;
  for r in select m.id, m.campaign_id from public.email_messages m
            where m.kind = 'prize_info' and m.body_purged_at is null and (m.body_text <> '' or m.body_html <> '')
              and m.body_text not like '%For privacy, delivery details are only shown in the app.%'
  loop
    c := null;
    select * into c from public.prize_claims where id = public.email_prize_claim_id(r.campaign_id);
    j := public.prize_info_email(c.display_name, c.campus, c.spot, c.reference);
    update public.email_messages
       set subject = j->>'subject',
           body_text = (j->>'text') || E'\n\n' || public.email_staff_footer_text(),
           body_html = replace(replace(j->>'html', '<!--yac:greeting-->', ''), '<!--yac:signoff-->', '')
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
select public.email_scrub_prize_info();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Per-person rendering + sending: per-type choices (copies of 0034 / 0038)
-- ─────────────────────────────────────────────────────────────────────────────
-- Copy of 0034: skip by the email's own type, ?k=<kind> in the one-click link, the footer names the type,
-- staff plain-text footer = the HTML words.
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
      v_unsub := case when v_token is not null then public.email_unsub_url_for(v_token, o.kind) end;   -- 0039: ?k=<kind>
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
                || coalesce(E'\n\n' || v_pun, '') || E'\n\n' || public.email_footer_text_for(v_unsub, o.kind);
      v_html := public.email_fill(v_html, v_vals, true);
      v_html := replace(v_html, '<!--yac:greeting-->',
                        '<p style="margin:0 0 12px;font-size:16px;">' || public.html_escape(v_greet) || '</p>');
      if v_pun is not null then
        v_html := replace(v_html, '<!--yac:signoff-->',
                          '<p style="margin:14px 0 0;color:#4a5672;font-style:italic;">' || public.html_escape(v_pun) || '</p>');
      end if;
      v_html := regexp_replace(v_html, '<!--yac:footer-->.*<!--/yac:footer-->', public.email_footer_html_for(v_unsub, o.kind));
      if p.id is not null and not public.email_type_on(o.kind, p.email_announcements, p.email_events, p.email_wrapped) then   -- 0039: per type
        v_status := 'skipped_opted_out';
      elsif p.id is not null and p.email_verified_at is null then   -- 0034: in-app only until the email is confirmed
        v_status := 'skipped_unverified';
      end if;
    elsif o.kind <> 'verify_email' then   -- 0034: the confirmation email is already complete
      if position('Admin → System' in v_text) = 0 then
        v_text := rtrim(v_text, E'\n ') || E'\n\n' || public.email_staff_footer_text();   -- 0039: same words as the HTML footer
      end if;
    end if;
    v_html := replace(replace(v_html, '<!--yac:greeting-->', ''), '<!--yac:signoff-->', '');
    if v_status = 'queued' and p.id is not null and p.email_bounced then
      v_status := 'skipped_bouncing';
    end if;

    insert into public.email_messages (outbox_id, kind, campaign_id, campaign_label, user_id, email, subject, body_text, body_html,
                                       priority, send_before, status, error, created_at)
    values (o.id, o.kind, camp.campaign_id, camp.campaign_label, p.id, v_email, v_subj,
            case when v_status like 'skipped%' then '' else v_text end,
            case when v_status like 'skipped%' then '' else v_html end,
            public.email_priority(o.kind), camp.send_before, v_status,
            case v_status when 'skipped_opted_out' then public.email_type_off_error(o.kind)
                          when 'skipped_bouncing' then 'Paused: emails to this address bounce.'
                          when 'skipped_unverified' then 'Email not confirmed yet: in-app only.' end,
            o.created_at)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  perform public.email_outbox_rollup(o.id);
  return v_n;
end $$;


-- Copy of 0038: "turned off after it was queued" checks the email's own type.
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

  -- turned that kind of email off (or started bouncing) after it was queued
  with x as (
    update public.email_messages m
       set status = case when p.email_bounced then 'skipped_bouncing' else 'skipped_opted_out' end,
           error = case when p.email_bounced then 'Paused: emails to this address bounce.' else public.email_type_off_error(m.kind) end,
           body_text = '', body_html = ''
      from public.profiles p
     where p.id = m.user_id
       and (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5))
       and (p.email_bounced or not public.email_type_on(m.kind, p.email_announcements, p.email_events, p.email_wrapped))   -- 0039: per type
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
       and (m.not_before is null or m.not_before <= p_now)     -- 0038: still in its cancel window → wait
     order by m.priority, m.created_at, m.id
     limit greatest(0, least(v_limit, v_left))
     for update skip locked) q;
  v_room := greatest(0, least(v_limit - cardinality(v_high), v_left - coalesce(cfg.email_reserve, 50) - cardinality(v_high)));
  select coalesce(array_agg(q.id), '{}') into v_low from (
    select m.id from public.email_messages m
     where m.priority > 2
       and (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5)
            or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < p_now - interval '15 minutes'))
       and (m.not_before is null or m.not_before <= p_now)     -- 0038: still in its cancel window → wait
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


-- Copy of 0038: emails only people with "Announcements" on.
create or replace function public.send_announcement(
  p_title text, p_body text, p_audience text,
  p_campus text default null, p_user_id uuid default null, p_send_email boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin    uuid := public.require_admin();
  v_title    text := trim(coalesce(p_title, ''));
  v_body     text := trim(coalesce(p_body, ''));
  v_email_on boolean := coalesce(p_send_email, false);
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
  v_cap      int;
  v_hold_min int;
  v_hold     timestamptz;
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

  select coalesce(announce_all_email_weekly_cap, 3), coalesce(announce_email_hold_minutes, 10)
    into v_cap, v_hold_min from public.app_config where id = 1;
  v_cap := coalesce(v_cap, 3);
  v_hold_min := coalesce(v_hold_min, 10);

  -- 0038: weekly cap on all-member EMAILS. One sender at a time past this point (released at commit),
  -- and the count below sees every send that committed before us.
  if v_email_on and p_audience = 'all' then
    perform pg_advisory_xact_lock(hashtext('yacquest_announce_all_email'));
    if public.announce_all_emails_used(now()) >= v_cap then
      perform public.api_error('email_cap', public.announce_cap_message(v_cap));
    end if;
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

  v_hold := case when v_email_on then now() + make_interval(mins => v_hold_min) end;

  insert into public.announcements (title, body, audience, campus, target_user_id, send_email, recipient_count, created_by,
                                    email_send_before, email_hold_until)
  values (v_title, v_body, p_audience,
          case when p_audience = 'campus' then p_campus end,
          case when p_audience = 'user' then p_user_id end,
          v_email_on, v_count, v_admin, v_before, v_hold)
  returning id into v_id;

  -- in-app: filled in per person (0038: tagged with the announcement, so a cancel can remove them)
  insert into public.notifications (user_id, kind, title, body, announcement_id)
  select t, 'announcement',
         public.email_fill(v_title, public.email_fill_values(t, 'announcement:' || v_id)),
         public.email_fill(v_body, public.email_fill_values(t, 'announcement:' || v_id)),
         v_id
    from unnest(v_targets) t;

  if v_email_on then
    select coalesce(array_agg(distinct lower(u.email::text)), '{}') into v_emails
      from public.profiles p join auth.users u on u.id = p.id
     where p.id = any (v_targets)
       and u.email_confirmed_at is not null and u.email is not null
       and p.email_announcements;    -- 0039: the person's "Announcements" choice (direct messages too)
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
    -- 0038: the cancel window. Same transaction as the insert, so the sender never sees these rows un-held.
    update public.email_messages set not_before = v_hold
     where campaign_id = 'announcement:' || v_id and status = 'queued' and v_hold_min > 0;
    select count(*) into v_emailed from public.email_messages where campaign_id = 'announcement:' || v_id and status = 'queued';
    update public.announcements set email_count = v_emailed where id = v_id;
  end if;

  perform public.log_admin_action(v_admin, 'announcement_sent',
    case when p_audience = 'user' then p_user_id end,
    jsonb_build_object('title', v_title, 'audience', p_audience, 'campus', p_campus,
                       'recipients', v_count, 'emailed', v_emailed, 'emailHoldUntil', v_hold));

  return json_build_object('id', v_id, 'recipients', v_count, 'emailed', v_emailed,
                           'emailHoldUntil', case when v_email_on and v_hold_min > 0 then v_hold end,
                           'holdMinutes', case when v_email_on then v_hold_min end);
end $$;


-- Copy of 0038: counts "Announcements" on; one person: also emailTypes {announcements, events, wrapped}.
create or replace function public.announcement_audience_count(p_audience text, p_campus text default null, p_user uuid default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_in     int;
  v_email  int;
  v_reason text;
  p        public.profiles;
  v_conf   boolean;
begin
  perform public.require_admin();
  if coalesce(p_audience, '') not in ('all', 'campus', 'user') then
    perform public.api_error('audience', 'Choose who gets this message.');
  end if;
  if p_audience = 'campus' and coalesce(p_campus, '') not in ('duke', 'unc', 'ncsu') then
    perform public.api_error('campus', 'Pick a campus.');
  end if;
  if p_audience = 'user' then
    select * into p from public.profiles where id = p_user;
    if p.id is null then
      return json_build_object('inApp', 0, 'email', 0, 'emailReason', null);
    end if;
    select u.email_confirmed_at is not null and u.email is not null and p.email_verified_at is not null into v_conf
      from auth.users u where u.id = p.id;
    v_reason := case when not p.email_announcements then 'emails_off'   -- 0039: the "Announcements" choice
                     when not coalesce(v_conf, false) then 'not_confirmed'
                     when p.email_bounced then 'bouncing' end;
    return json_build_object('inApp', 1, 'email', case when v_reason is null then 1 else 0 end, 'emailReason', v_reason,
                             'emailTypes', json_build_object('announcements', p.email_announcements, 'events', p.email_events, 'wrapped', p.email_wrapped));
  end if;

  select count(*) into v_in from public.profiles p2
   where p_audience = 'all' or p2.campus = p_campus;
  select count(distinct lower(u.email::text)) into v_email
    from public.profiles p2 join auth.users u on u.id = p2.id
   where (p_audience = 'all' or p2.campus = p_campus)
     and u.email_confirmed_at is not null and u.email is not null
     and p2.email_announcements and p2.email_verified_at is not null and not p2.email_bounced;
  return json_build_object('inApp', v_in, 'email', v_email, 'emailReason', null);
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Reminders, follow-ups, Wrapped, weekly report: per-type choices + "ET" (copies)
-- ─────────────────────────────────────────────────────────────────────────────
-- Copy of 0024: "Event reminders and thank-yous"; the email says "starts at 7:00 PM ET" (in-app unchanged).
create or replace function public.queue_event_reminders(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  r       record;
  v_n     int := 0;
  v_time  text;
  v_mins  numeric;
  v_title text;
  v_body  text;
  v_html  text;
  v_etime text;   -- 0039
begin
  perform public.require_service_role();
  for r in
    select e.id as event_id, e.title, e.location, e.starts_at,
           coalesce(public.tier_points((select ac.tier from public.activities ac where ac.id = e.activity_id)), public.tier_points(2)) as pts,
           rv.user_id, p.email_events,
           case when u.email_confirmed_at is not null then lower(trim(u.email::text)) end as email
      from public.events e
      join public.event_rsvps rv on rv.event_id = e.id
      join public.profiles p on p.id = rv.user_id
      left join auth.users u on u.id = p.id
     where e.starts_at > p_now
       and e.starts_at <= p_now + interval '70 minutes'
       and not exists (select 1 from public.event_reminders_sent s where s.event_id = e.id and s.user_id = rv.user_id)
       and not exists (select 1 from public.ledger l
                        where l.user_id = rv.user_id and l.source = 'checkin' and l.ref_id = e.id::text)
     order by e.starts_at, rv.created_at
  loop
    insert into public.event_reminders_sent (event_id, user_id) values (r.event_id, r.user_id)
    on conflict do nothing;
    if not found then
      continue;   -- another run got there first
    end if;
    v_time := to_char(r.starts_at at time zone 'America/New_York', 'FMHH12:MI AM');
    v_mins := extract(epoch from (r.starts_at - p_now)) / 60;
    v_title := '⏰ Starts in ' || case when v_mins >= 45 then '1 hour' else greatest(1, round(v_mins))::int || ' min' end
               || ': ' || r.title || ' at ' || r.location;
    v_body := r.title || ' starts at ' || v_time || ' at ' || r.location
              || '. Check in at the event to earn ' || r.pts || ' points.';
    perform public.notify(r.user_id, 'event_reminder', v_title, v_body);
    if r.email_events and r.email is not null and r.email <> '' then   -- 0039: "Event reminders and thank-yous"
      v_etime := public.email_event_time(r.starts_at);   -- 0039: "7:00 PM ET"
      v_html := public.email_layout('Reminder: ' || r.title,
        '<p style="font-size:16px;margin:0 0 8px"><b>' || public.html_escape(r.title) || '</b> starts at <b>'
        || public.html_escape(v_etime) || '</b>.</p>'
        || '<p style="margin:0 0 8px">📍 ' || public.html_escape(r.location) || '</p>'
        || '<p style="margin:0 0 12px">Check in at the event to earn <b>' || r.pts || ' points</b>.</p>'
        || '<p style="font-size:12px;color:#4a5672;margin:0">You get this because you RSVP’d in YACquest and have event emails on (turn them off in Me → Settings).</p>');
      perform public.enqueue_email('event_reminder', array[r.email],
        'Reminder: ' || r.title || ' starts at ' || v_etime,
        r.title || ' starts at ' || v_etime || '.' || chr(10) || 'Where: ' || r.location || chr(10) || chr(10)
          || 'Check in at the event to earn ' || r.pts || ' points.' || chr(10) || chr(10)
          || 'You get this because you RSVP''d in YACquest and have event emails on (turn them off in Me → Settings).',
        v_html,
        'reminder:' || r.event_id::text || ':' || r.user_id::text);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;


-- Copy of 0030: "Event reminders and thank-yous"; the email says "Sat, Nov 21 at 6:00 PM ET" (in-app unchanged).
create or replace function public.send_followup_for_event(p_event_id uuid, p_now timestamptz, p_by uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  e        public.events;
  v_act    text;
  v_pts    int;
  r        record;
  nx       record;
  v_att    int := 0;
  v_miss   int := 0;
  v_mail   int := 0;
  v_title  text;
  v_body   text;
  v_text   text;
  v_html   text;
  v_footer text := 'You get this because you have event emails on in YACquest (turn them off in Me → Settings).';
  v_spts   int;   -- 0030: in-app event survey points
  v_link   text;  -- 0030: <app_url>#/survey/<event id>
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null then
    return null;
  end if;
  insert into public.event_followups_sent (event_id, sent_at, sent_by) values (e.id, p_now, p_by)
  on conflict do nothing;
  if not found then
    return null;   -- already sent (or another run got there first)
  end if;
  select coalesce(a.title, 'Complete a Feedback Survey'), public.tier_points(coalesce(a.tier, 3))
    into v_act, v_pts
    from (select 1) one left join public.activities a on a.id = 'survey';
  -- 0030: the in-app event survey (+5, once per attendee) — link in the note and the email.
  v_spts := public.tier_points(coalesce((select tier from public.activities where id = 'event_survey'), 3));
  v_link := rtrim(coalesce(nullif(trim((select app_url from public.app_config where id = 1)), ''), 'https://ncssmyac.github.io/YACquest/'), '/')
            || '/#/survey/' || e.id::text;

  -- (a) everyone who checked in
  for r in
    select distinct on (l.user_id) l.user_id, p.email_events,
           case when u.email_confirmed_at is not null then lower(trim(u.email::text)) end as email
      from public.ledger l
      join public.profiles p on p.id = l.user_id
      left join auth.users u on u.id = p.id
     where l.source = 'checkin' and l.ref_id = e.id::text
     order by l.user_id
  loop
    v_title := 'Thanks for coming to ' || e.title || '! 🐂';
    -- 0030: in-app survey first (#/survey/<id> becomes a button in Notifications), then the external one if set.
    v_body := 'How was it? Rate it in the app for +' || v_spts || ' points (takes a minute): #/survey/' || e.id::text;
    if e.survey_url is not null then
      v_body := v_body || ' Or fill out the YAC survey here: ' || e.survey_url
                || ' It counts as the “' || v_act || '” digital quest: send a screenshot of the confirmation in Quests for '
                || v_pts || ' points.';
    end if;
    perform public.notify(r.user_id, 'event_followup', v_title, v_body);
    v_att := v_att + 1;
    if r.email_events and r.email is not null and r.email <> '' then
      v_text := 'Thanks for coming to ' || e.title || '!' || chr(10) || chr(10)
                || 'How was it? Rate it in YACquest for +' || v_spts || ' points (takes a minute):' || chr(10) || v_link
                || case when e.survey_url is not null
                        then chr(10) || chr(10) || 'Or fill out the YAC survey here: ' || e.survey_url || chr(10)
                             || 'Completing it counts as the "' || v_act || '" digital quest: send a screenshot of the confirmation in YACquest → Quests for ' || v_pts || ' points.'
                        else '' end
                || chr(10) || chr(10) || v_footer;
      v_html := public.email_layout('Thanks for coming to ' || e.title || '!',
        '<p style="font-size:16px;margin:0 0 10px">Thanks for coming to <b>' || public.html_escape(e.title) || '</b>! 🐂</p>'
        || '<p style="margin:0 0 6px">How was it? Rate it in YACquest for <b>+' || v_spts || ' points</b> (takes a minute):</p>'
        || '<p style="margin:0 0 12px"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">⭐ Rate this event</a></p>'
        || case when e.survey_url is not null
                then '<p style="margin:0 0 12px">Or fill out the YAC survey here: <a href="' || public.html_escape(e.survey_url) || '">'
                     || public.html_escape(e.survey_url) || '</a>. Completing it counts as the <b>' || public.html_escape(v_act)
                     || '</b> digital quest: send a screenshot of the confirmation in YACquest → Quests for <b>' || v_pts || ' points</b>.</p>'
                else '' end
        || '<p style="font-size:12px;color:#4a5672;margin:0">' || public.html_escape(v_footer) || '</p>');
      if public.enqueue_email('event_followup', array[r.email], 'Thanks for coming to ' || e.title || '!', v_text, v_html,
                              'followup:' || e.id::text || ':' || r.user_id::text) then
        v_mail := v_mail + 1;
      end if;
    end if;
  end loop;

  -- (b) RSVP'd but didn't check in
  for r in
    select rv.user_id, p.campus, p.email_events,
           case when u.email_confirmed_at is not null then lower(trim(u.email::text)) end as email
      from public.event_rsvps rv
      join public.profiles p on p.id = rv.user_id
      left join auth.users u on u.id = p.id
     where rv.event_id = e.id
       and not exists (select 1 from public.ledger l
                        where l.user_id = rv.user_id and l.source = 'checkin' and l.ref_id = e.id::text)
     order by rv.created_at
  loop
    -- (no row → nx is a row of nulls)
    select n.title, n.starts_at, n.location into nx
      from public.events n
     where n.starts_at > p_now and n.id <> e.id and n.campus in (r.campus, 'all')
     order by n.starts_at limit 1;
    if nx.title is null then
      select n.title, n.starts_at, n.location into nx
        from public.events n
       where n.starts_at > p_now and n.id <> e.id
       order by n.starts_at limit 1;
    end if;
    v_title := 'Sorry we missed you at ' || e.title;
    v_body := case when nx.title is not null
                   then 'Hope to see you next time! Next up: ' || nx.title || ' — ' || public.followup_when(nx.starts_at)
                        || ' at ' || nx.location || '. RSVP in Quests.'
                   else 'Hope to see you next time! New events show up in Quests.' end;
    perform public.notify(r.user_id, 'event_followup', v_title, v_body);
    v_miss := v_miss + 1;
    if r.email_events and r.email is not null and r.email <> '' then
      v_html := public.email_layout(v_title,
        '<p style="font-size:16px;margin:0 0 10px">We missed you at <b>' || public.html_escape(e.title) || '</b>. Hope to see you next time!</p>'
        || case when nx.title is not null
                then '<p style="margin:0 0 12px">Next up: <b>' || public.html_escape(nx.title) || '</b><br>🕒 '
                     || public.html_escape(public.email_event_when(nx.starts_at)) || '<br>📍 ' || public.html_escape(nx.location)
                     || '</p><p style="margin:0 0 12px">RSVP in YACquest → Quests.</p>'
                else '<p style="margin:0 0 12px">New events show up in YACquest → Quests.</p>' end
        || '<p style="font-size:12px;color:#4a5672;margin:0">' || public.html_escape(v_footer) || '</p>');
      -- 0039: the email names the time zone ("Sat, Nov 21 at 6:00 PM ET"); the in-app note stays as it was
      v_text := 'We missed you at ' || e.title || '. Hope to see you next time!' || chr(10) || chr(10)
                || case when nx.title is not null
                        then 'Next up: ' || nx.title || chr(10) || 'When: ' || public.email_event_when(nx.starts_at) || chr(10)
                             || 'Where: ' || nx.location || chr(10) || chr(10) || 'RSVP in YACquest → Quests.'
                        else 'New events show up in YACquest → Quests.' end;
      if public.enqueue_email('event_followup', array[r.email], v_title, v_text || chr(10) || chr(10) || v_footer, v_html,
                              'followup:' || e.id::text || ':' || r.user_id::text) then
        v_mail := v_mail + 1;
      end if;
    end if;
  end loop;

  update public.event_followups_sent set attended = v_att, missed = v_miss, emailed = v_mail where event_id = e.id;
  perform public.log_admin_action(p_by, 'event_followup_sent', null,
    jsonb_build_object('eventId', e.id, 'title', e.title, 'attended', v_att, 'missed', v_miss, 'emailed', v_mail,
                       'automatic', p_by is null));
  return json_build_object('eventId', e.id, 'sentAt', p_now, 'attended', v_att, 'missed', v_miss, 'emailed', v_mail,
                           'automatic', p_by is null);
end $$;


-- Copy of 0028: "Yearly Wrapped"; subject "Your YACquest Wrapped is here" (the in-app title is unchanged).
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
  v_footer constant text := 'You get this because you have Wrapped emails on in YACquest (turn them off in Me → Settings).';
  v_subject constant text := 'Your YACquest Wrapped is here';   -- 0039: no emoji in the subject (the in-app title keeps it)
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
    select p.id, p.role, p.points, p.email_wrapped,
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
    if r.email_wrapped and r.email is not null and r.email <> '' then   -- 0039: "Yearly Wrapped"
      v_text := 'Your YACquest Wrapped is here!' || chr(10) || chr(10)
             || 'Your ' || cyc.name || ' in a nutshell: ' || v_teaser || '.' || chr(10) || chr(10)
             || 'See the whole story (best month, rarest badge, your YAC personality) and a card to share: ' || v_link
             || chr(10) || chr(10) || v_footer;
      v_html := public.email_layout(v_subject,
        '<p style="font-size:16px;margin:0 0 10px">Your <b>' || public.html_escape(cyc.name) || '</b> in a nutshell:</p>'
        || '<p style="font-size:22px;font-weight:800;color:#0b2a5b;margin:0 0 14px">' || public.html_escape(v_teaser) || '</p>'
        || '<p style="margin:0 0 14px">See the whole story (your best month, rarest badge and YAC personality) and get a card to share.</p>'
        || '<p style="margin:0 0 14px"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Open my Wrapped 🎁</a></p>'
        || '<p style="font-size:12px;color:#4a5672;margin:0">' || public.html_escape(v_footer) || '</p>');
      if public.enqueue_email('wrapped', array[r.email], v_subject, v_text, v_html, 'wrapped:' || cyc.id::text || ':' || r.id::text) then
        v_mail := v_mail + 1;
      end if;
    end if;
  end loop;

  update public.wrapped_sends set notified = v_n, emailed = v_mail where cycle_id = cyc.id;
  perform public.log_admin_action(null, 'wrapped_sent', null,
    jsonb_build_object('cycle', cyc.name, 'notified', v_n, 'emailed', v_mail));
  return v_n;
end $$;


-- Copy of 0030: event times with ET in "Next 7 days", plus one "Email health" line.
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
  v_surv    int;      -- 0030
  v_surv_avg numeric; -- 0030
  v_health  json;     -- 0039
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
    t := t || format(E'  %s — %s per member (%s member%s, %s pts)\n', public.campus_label(r.campus), r.per_capita, r.members,
                     case when r.members = 1 then '' else 's' end, r.total_points);   -- 0039: "1 member"
    h := h || '<tr>' || td || '<b>' || public.campus_label(r.campus) || '</b> <span style="color:#5b6475;">(' || r.members
           || case when r.members = 1 then ' member' else ' members' end || ')</span></td>' || tdr || r.per_capita || ' / member</td></tr>';
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
  -- 0039: with the time and time zone ("Thu, Nov 19 at 7:00 PM ET")
  select string_agg(format('%s (%s) · %s going', e.title, public.email_event_when(e.starts_at), x.n), '; ' order by e.starts_at, e.id),
         string_agg('<b>' || public.html_escape(e.title) || '</b> (' || public.html_escape(public.email_event_when(e.starts_at))
                    || ') · ' || x.n || ' going', '; ' order by e.starts_at, e.id)
    into v_next_t, v_next_h
    from public.events e
    cross join lateral (select count(*)::int as n from public.event_rsvps rv where rv.event_id = e.id) x
   where e.cycle_id = v_cycle and e.starts_at >= now() and e.starts_at < now() + interval '7 days';
  t := t || E'\n📅 NEXT 7 DAYS (RSVPs): ' || coalesce(v_next_t, 'No events scheduled.') || E'\n';
  h := h || '<p style="margin:16px 0 0;font-size:14px;">📅 <b>Next 7 days (RSVPs):</b> ' || coalesce(v_next_h, 'No events scheduled.') || '</p>';

  -- 0030: one line — in-app event survey responses this week + their average rating
  select count(*), round(avg(s.rating)::numeric, 1) into v_surv, v_surv_avg
    from public.event_surveys s where s.created_at >= v_wk;
  t := t || E'\n📝 EVENT SURVEYS THIS WEEK: '
         || case when v_surv = 0 then 'No new responses.'
                 else format('%s new response%s · average %s★', v_surv, case when v_surv = 1 then '' else 's' end, v_surv_avg) end
         || E' (results in Admin → Events → Survey)\n';
  h := h || '<p style="margin:12px 0 0;font-size:14px;">📝 <b>Event surveys this week:</b> '
         || case when v_surv = 0 then 'No new responses.'
                 else v_surv || ' new response' || case when v_surv = 1 then '' else 's' end || ' · average <b>' || v_surv_avg || '★</b>' end
         || ' <span style="color:#5b6475;">(results in Admin → Events → Survey)</span></p>';

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

  -- 0039: one line — email health (same checks as the Admin dashboard banner)
  v_health := public.email_health_data(now());
  t := t || E'\n🩺 ' || public.email_health_line(v_health) || E'\n';
  h := h || '<p style="margin:12px 0 0;font-size:14px;">🩺 <b>Email health:</b> '
         || public.html_escape(substr(public.email_health_line(v_health), length('Email health: ') + 1)) || '</p>';

  -- 0015: Yak of the week (footer line)
  t := t || E'\n🐂 Yak of the week: ' || public.yak_pun_of_the_week() || E'\n';
  h := h || '<p style="margin:18px 0 0;color:#5b6475;font-size:13px;font-style:italic;">🐂 Yak of the week: ' || public.html_escape(public.yak_pun_of_the_week()) || '</p>';

  return json_build_object('subject', v_subject, 'text', t, 'html', public.email_layout('Weekly committee report · ' || v_date, h));
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Unsubscribe by link: one type (kind given) or everything (old links). Replaces the one-argument
--    version in the same transaction, so a call with only p_token (the deployed email-track, the app's
--    old unsubscribe page) keeps working throughout.
-- ─────────────────────────────────────────────────────────────────────────────
begin;
drop function if exists public.unsubscribe_by_token(text);
create or replace function public.unsubscribe_by_token(p_token text, p_kind text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid;
  v_type text := public.email_kind_type(p_kind);
  p      public.profiles;
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
  select * into p from public.profiles where id = v_user for update;
  if v_type is null then
    -- no kind (emails from before 0039, Gmail's button before send-emails is re-deployed): everything off, as before
    v_was := p.email_opt_in;
    update public.profiles set email_announcements = false, email_events = false, email_wrapped = false where id = v_user;
  else
    v_was := case v_type when 'announcement' then p.email_announcements when 'events' then p.email_events else p.email_wrapped end;
    update public.profiles
       set email_announcements = case when v_type = 'announcement' then false else email_announcements end,
           email_events        = case when v_type = 'events' then false else email_events end,
           email_wrapped       = case when v_type = 'wrapped' then false else email_wrapped end
     where id = v_user;
  end if;
  select * into p from public.profiles where id = v_user;
  if v_was then
    select id into v_msg from public.email_messages where user_id = v_user and status in ('sent', 'bounced') order by sent_at desc nulls last limit 1;
    insert into public.email_events (message_id, user_id, type, detail)
    values (v_msg, v_user, 'unsubscribe', 'one-click' || coalesce(':' || v_type, ''));
  end if;
  return json_build_object('unsubscribed', true, 'alreadyOff', not coalesce(v_was, false),
                           'type', coalesce(v_type, 'all'),
                           'label', case when v_type is null then null else public.email_type_label(v_type) end,
                           'othersOn', p.email_opt_in);
end $$;
revoke execute on function public.unsubscribe_by_token(text, text) from public;
grant execute on function public.unsubscribe_by_token(text, text) to anon, authenticated, service_role;
commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. The person's own choices (Me → Settings) + status
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.email_prefs_json(p public.profiles)
returns json language sql stable set search_path = public, extensions as $$
  select json_build_object('announcements', p.email_announcements, 'events', p.email_events, 'wrapped', p.email_wrapped,
                           'optIn', p.email_opt_in);
$$;

-- null leaves that one as it is. Returns {announcements, events, wrapped, optIn}.
create or replace function public.set_my_email_prefs(p_announcements boolean default null, p_events boolean default null,
                                                     p_wrapped boolean default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  p     public.profiles;
begin
  update public.profiles
     set email_announcements = coalesce(p_announcements, email_announcements),
         email_events        = coalesce(p_events, email_events),
         email_wrapped       = coalesce(p_wrapped, email_wrapped)
   where id = v_uid
  returning * into p;
  return public.email_prefs_json(p);
end $$;

-- Copy of 0032 + the three choices.
create or replace function public.my_email_status()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = public.require_user();
  return json_build_object('optIn', p.email_opt_in, 'bounced', p.email_bounced, 'bouncedAt', p.email_bounced_at,
                           'announcements', p.email_announcements, 'events', p.email_events, 'wrapped', p.email_wrapped);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Email health (Admin dashboard banner, Admin → System line, weekly report line)
--     Same rules as emailHealthBanner() in src/lib/emailHealth.ts (the demo mirrors them).
-- ─────────────────────────────────────────────────────────────────────────────
-- "45 minutes" / "3 hours" / "2 days".
create or replace function public.email_ago(p interval)
returns text language sql immutable set search_path = public, extensions as $$
  select case
    when extract(epoch from p) < 5400 then greatest(1, round(extract(epoch from p) / 60))::int || ' minutes'
    when extract(epoch from p) < 172800 then round(extract(epoch from p) / 3600)::int || ' hours'
    else floor(extract(epoch from p) / 86400)::int || ' days' end;
$$;

-- Internal (no permission check): {status, reasons[], lastRunAt, minutesSinceRun, sent24h, budget, checkedAt}.
create or replace function public.email_health_data(p_now timestamptz default now())
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_now     timestamptz := coalesce(p_now, now());
  cfg       public.app_config;
  v_budget  int;
  v_reserve int;
  v_sent24  int;
  v_left    int;
  v_last    timestamptz;
  v_runs    int;
  v_zero    boolean;
  v_failed  int;
  v_oldest  timestamptz;
  v_ready   int;
  v_stuck   int;
  v_auth    text;
  v_imap    text;
  v_part    int;
  v_track   int;
  v_r       jsonb := '[]'::jsonb;
  v_red     boolean;
  v_auth_re constant text := '535|534-5\.7|invalid login|username and password not accepted|application-specific password|eauth|authenticationfailed|invalid credentials|smtp_user|smtp_pass';
begin
  select * into cfg from public.app_config where id = 1;
  v_budget  := coalesce(cfg.email_daily_budget, 450);
  v_reserve := coalesce(cfg.email_reserve, 50);
  v_sent24  := (select count(*) from public.email_messages
                 where status in ('sent', 'bounced') and sent_at > v_now - interval '24 hours' and sent_at <= v_now);
  v_left    := v_budget - v_sent24
               - (select count(*) from public.email_messages
                   where status = 'sending' and coalesce(claimed_at, created_at) >= v_now - interval '15 minutes')::int;
  select max(ran_at) into v_last from public.email_runs where ran_at <= v_now;

  -- red: the sender hasn't run in the last hour
  if v_last is null or v_last < v_now - interval '60 minutes' then
    v_r := v_r || jsonb_build_object('code', 'not_running', 'level', 'red',
      'title', case when v_last is null then 'Email sender hasn’t run yet — check Supabase → Integrations → Cron'
                    else 'Email sender hasn’t run in ' || public.email_ago(v_now - v_last) || ' — check Supabase → Integrations → Cron' end,
      'todo', 'In Supabase → Integrations → Cron, the send-emails job should run every 10 minutes. Check it’s turned on and its last runs succeeded.');
  end if;

  -- red: Gmail rejected the login (sending errors in the last 3 hours, or the last 3 runs' Gmail check)
  select x.err into v_auth from (
    select m.error as err, coalesce(m.claimed_at, m.created_at) as at from public.email_messages m
     where m.status = 'failed' and coalesce(m.claimed_at, m.created_at) > v_now - interval '3 hours' and m.error ~* v_auth_re
    union all
    select r.imap_error, r.ran_at from (select * from public.email_runs where ran_at <= v_now order by ran_at desc limit 3) r
     where r.imap_error ~* v_auth_re
  ) x order by x.at desc limit 1;
  if v_auth is not null then
    v_r := v_r || jsonb_build_object('code', 'gmail_login', 'level', 'red',
      'title', case when v_auth ~* 'smtp_user|smtp_pass' then 'Email isn’t set up — add the Gmail app password'
                    else 'Gmail rejected the login — check the app password' end,
      'todo', 'Make a new app password for the YAC Gmail (Google Account → Security → App passwords) and paste it into the SMTP_PASS secret (Supabase → Edge Functions → Secrets). Then Retry the failed emails in Admin → System.',
      'detail', left(v_auth, 200));
  end if;

  -- red: the last 3 runs all sent nothing while emails were waiting (or failing)
  select count(*), coalesce(bool_and(r.sent = 0), false), coalesce(sum(r.failed), 0), min(r.ran_at)
    into v_runs, v_zero, v_failed, v_oldest
    from (select * from public.email_runs where ran_at <= v_now order by ran_at desc limit 3) r;
  -- ready to go: waiting, not held, not expired, and the budget has room for its priority
  select count(*) into v_ready from public.email_messages m
   where (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5)
          or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < v_now - interval '15 minutes'))
     and (m.not_before is null or m.not_before <= v_now) and (m.send_before is null or m.send_before > v_now)
     and m.created_at < coalesce(v_oldest, v_now)
     and ((m.priority <= 2 and v_left > 0) or (m.priority > 2 and v_left > v_reserve));
  if v_runs = 3 and v_zero and (v_failed > 0 or v_ready > 0) then
    v_r := v_r || jsonb_build_object('code', 'not_sending', 'level', 'red',
      'title', 'Emails aren’t going out: the last 3 runs sent nothing'
               || case when v_ready > 0 then ' while ' || v_ready || ' ' || case when v_ready = 1 then 'was' else 'were' end || ' waiting' else '' end,
      'todo', 'Open Admin → System → Email log to see the error, and Supabase → Edge Functions → send-emails → Logs.');
  end if;

  -- amber: the bounce / unsubscribe check can't reach Gmail (unless that's the login problem above)
  select r.imap_error into v_imap from (select * from public.email_runs where ran_at <= v_now order by ran_at desc limit 3) r
   where r.imap_status = 'error' order by r.ran_at desc limit 1;
  if found and v_auth is null then
    v_r := v_r || jsonb_build_object('code', 'bounce_check', 'level', 'amber',
      'title', 'Bounce/unsubscribe check can’t reach Gmail',
      'todo', 'Turn on IMAP in the YAC Gmail (Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP). Sending still works; bad addresses and emailed unsubscribes just aren’t picked up.',
      'detail', left(v_imap, 200));
  end if;

  v_red := exists (select 1 from jsonb_array_elements(v_r) e where e->>'level' = 'red');

  -- amber: emails waiting more than 2 hours although the budget has room (only when no red reason explains it)
  select count(*) into v_stuck from public.email_messages m
   where (m.status = 'queued' or (m.status = 'failed' and m.attempts < 5)
          or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) < v_now - interval '15 minutes'))
     and coalesce(m.not_before, m.created_at) < v_now - interval '2 hours'
     and (m.send_before is null or m.send_before > v_now)
     and ((m.priority <= 2 and v_left > 0) or (m.priority > 2 and v_left > v_reserve));
  if v_stuck > 0 and not v_red then
    v_r := v_r || jsonb_build_object('code', 'stuck', 'level', 'amber',
      'title', v_stuck || ' email' || case when v_stuck = 1 then ' has' else 's have' end || ' been waiting more than 2 hours',
      'todo', 'The budget has room, so they should have gone. Check Admin → System → Email log for errors and Supabase → Edge Functions → send-emails → Logs.');
  end if;

  -- amber: > 20 participant emails sent in 7 days and not one open or click → tracking is probably down
  select count(*) into v_part from public.email_messages m
   where m.status = 'sent' and m.sent_at > v_now - interval '7 days' and m.sent_at <= v_now and public.email_is_participant_kind(m.kind);
  if v_part > 20 then
    select count(*) into v_track from public.email_events e join public.email_messages m on m.id = e.message_id
     where e.type in ('open', 'click') and m.status = 'sent' and m.sent_at > v_now - interval '7 days' and m.sent_at <= v_now
       and public.email_is_participant_kind(m.kind);
    if v_track = 0 then
      v_r := v_r || jsonb_build_object('code', 'tracking', 'level', 'amber',
        'title', 'Open/click tracking may be down — check the email-track function',
        'todo', 'Supabase → Edge Functions → email-track must be deployed with “Verify JWT” turned OFF. ' || v_part || ' member emails went out this week with no opens or clicks recorded.');
    end if;
  end if;

  -- amber: today's budget is more than 90% used
  if v_sent24 > 0.9 * v_budget then
    v_r := v_r || jsonb_build_object('code', 'budget', 'level', 'amber',
      'title', 'Today’s email budget is ' || least(100, round(100.0 * v_sent24 / greatest(v_budget, 1)))::int || '% used (' || v_sent24 || ' of ' || v_budget || ')',
      'todo', 'Prize alerts and reminders still go first; announcements and Wrapped wait until older emails leave the 24-hour window. Save big sends for tomorrow.');
  end if;

  return json_build_object(
    'status', case when exists (select 1 from jsonb_array_elements(v_r) e where e->>'level' = 'red') then 'red'
                   when jsonb_array_length(v_r) > 0 then 'amber' else 'green' end,
    'reasons', v_r,
    'lastRunAt', v_last,
    'minutesSinceRun', case when v_last is null then null else floor(extract(epoch from (v_now - v_last)) / 60)::int end,
    'sent24h', v_sent24,
    'budget', v_budget,
    'checkedAt', v_now);
end $$;

-- "Email health: all good" / "Email health: problem — …" / "Email health: warning — …" (weekly report).
create or replace function public.email_health_line(p_health json)
returns text language sql immutable set search_path = public, extensions as $$
  select 'Email health: '
         || case p_health->>'status'
              when 'green' then 'all good'
              else case when p_health->>'status' = 'red' then 'problem — ' else 'warning — ' end
                   || (select string_agg(e->>'title', '; ' order by ord) from json_array_elements(p_health->'reasons') with ordinality x(e, ord))
                   || ' (see the Admin dashboard)'
            end;
$$;

-- Admin dashboard + Admin → System: admins and YACquest Chairs.
create or replace function public.email_health(p_now timestamptz default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return public.email_health_data(coalesce(p_now, now()));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
-- Internal helpers + re-created internals: nobody calls these through the API.
revoke execute on function
  public.profiles_email_prefs_sync(), public.email_kind_type(text), public.email_type_on(text, boolean, boolean, boolean),
  public.email_type_label(text), public.email_type_phrase(text), public.email_type_off_error(text), public.email_unsub_url_for(text, text),
  public.email_footer_html_for(text, text), public.email_footer_text_for(text, text), public.email_staff_footer_text(),
  public.email_event_time(timestamptz), public.email_event_when(timestamptz), public.campus_puns(text), public.yak_pun(int),
  public.email_layout(text, text), public.queue_verification_email(uuid, text, timestamptz), public.email_expand_outbox(uuid),
  public.send_followup_for_event(uuid, timestamptz, uuid), public.build_weekly_report(), public.on_prize_claim_alert(),
  public.prize_info_email(text, text, int, text), public.email_prefs_json(public.profiles), public.email_ago(interval),
  public.email_prefs_backfill(), public.email_scrub_prize_info(),
  public.email_health_data(timestamptz), public.email_health_line(json)
from public, anon, authenticated;

-- send-emails (service_role key) only — unchanged
revoke execute on function
  public.claim_email_messages(int, timestamptz), public.queue_event_reminders(timestamptz), public.queue_wrapped_notifications(timestamptz)
from public, anon, authenticated;
grant execute on function
  public.claim_email_messages(int, timestamptz), public.queue_event_reminders(timestamptz), public.queue_wrapped_notifications(timestamptz)
to service_role;

-- Signed-in people (their own settings; staff checks inside)
revoke execute on function
  public.set_my_email_prefs(boolean, boolean, boolean), public.my_email_status(), public.email_health(timestamptz),
  public.send_announcement(text, text, text, text, uuid, boolean), public.announcement_audience_count(text, text, uuid),
  public.send_test_email()
from public, anon;
grant execute on function
  public.set_my_email_prefs(boolean, boolean, boolean), public.my_email_status(), public.email_health(timestamptz),
  public.send_announcement(text, text, text, text, uuid, boolean), public.announcement_audience_count(text, text, uuid),
  public.send_test_email()
to authenticated;

-- Done.

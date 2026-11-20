-- ═══════════════════════════════════════════════════════════════════════════
-- YACquest EMAIL TEST PACK — one sample of every email, sent ONLY to you.
--
--   This is NOT a migration. Paste the whole file into Supabase → SQL Editor →
--   New query, check the email on the line marked ✏️ below, and press Run.
--   Safe to run again (every run gets its own unique keys and timestamp).
--
--   What it does
--   • Finds your YACquest account by the email below (any capitalisation).
--   • Queues 9 emails, one of each kind, to you only. Subjects start with
--     "[TEST n/9] ". The send-emails Edge Function sends them on its next run
--     (it runs every 10 minutes), ~20 a minute.
--   • Each email goes through the same database path a real one does: the row is
--     put in email_outbox (enqueue_email(), like the app), and the 0032 trigger
--     splits it into a per-person email_messages row → "Hi <first name>,"
--     greeting, fill-ins ({first_name} {campus_pun} …), campus pun sign-off,
--     one-click unsubscribe footer, priority and send_before (expiry). The sender
--     then adds the open pixel + tracked click links + List-Unsubscribe headers.
--   • The CONTENT is built the same way the real functions build it (same layout
--     and helpers), but with sample data, because the real triggers would also
--     touch other people or change data (points, prize spots, events, RSVPs,
--     notifications, announcements). The weekly report is the real one
--     (build_weekly_report() only reads).
--
--   What it does NOT do
--   • No points, prize claims, events, RSVPs, in-app notifications,
--     announcements, admin log entries or other people's data are changed.
--   • Your verified state and your real confirmation links are untouched (see #2).
--   • Stats: Admin → Email stats DOES count these (that's how you check opens and
--     clicks). They are grouped as ONE campaign named "🧪 Email test pack …".
--     Run STEP C at the bottom afterwards to remove them from the stats.
--   • There are no "quiet hours" in YACquest. The only things that can hold an
--     email back are the daily Gmail budget (450 / rolling 24 h, with 50 kept for
--     priority 1–2) and other emails already waiting in line. The script checks
--     the budget and tells you (NOTICE) if anything might wait; see the end.
--
--   The 9 emails
--     1 test             "YACquest test email ✅" (Admin → System → Send test email)
--     2 verify_email     "Confirm your YACquest email" (quick-start sign-up). Uses a
--                        harmless test link: its token is saved as ALREADY USED, so
--                        tapping it shows "All set! Your email was already
--                        confirmed ✓" and changes nothing. Your real links still work.
--     3 announcement     Admin → Announce, with every fill-in + a link to click
--     4 event_reminder   "Reminder: … starts at …" (sample event, 1 h ahead)
--     5 event_followup   "Thanks for coming to …!" + the ⭐ Rate button + campus pun
--                        (sample event: the Rate page says the event doesn't exist)
--     6 wrapped          "Your YACquest Wrapped is here! 🎁" with your real numbers
--     7 weekly_report    the real weekly committee report, built right now
--     8 prize_qualified  "🏆 YACquest: Sample Winner won spot #1" (no real winner)
--     9 prize_info       "URGENT 🎁 YACquest winner info: …" (sample delivery info)
--   Brew & Quest / limited rewards: no email exists for these (in-app only), so
--   there is nothing to queue; see docs/TEST_CHECKLIST.md to test them.
--
--   Run it before ~11:30 PM (New York): the weekly report expires at midnight, like a real one.
--
--   Open-pixel tracking + unsubscribe link/headers are on participant emails
--   only (3–6), same as real life. Click tracking is on every email's links,
--   except unsubscribe and email-confirmation links (never tracked on purpose).
-- ═══════════════════════════════════════════════════════════════════════════

-- ✏️ EDIT THIS ONE LINE if needed: who gets the test emails (your YACquest login email).
select set_config('yac.test_pack_email', 'iesha.landis.yac@ncssm.edu', false);

do $pack$
declare
  v_target  text := lower(trim(coalesce(current_setting('yac.test_pack_email', true), '')));
  p         public.profiles;
  cfg       public.app_config;
  cyc       public.cycles;
  v_addr    text;                     -- the address the app itself would use
  v_first   text;
  v_name    text;
  v_app     text := public.email_app_url();
  v_now     timestamptz := now();
  v_run     text := to_char(now() at time zone 'America/New_York', 'YYYYMMDD-HH24MISS') || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
  v_stamp   text := trim(to_char(now() at time zone 'America/New_York', 'Mon FMDD, FMHH12:MI AM'));
  v_camp    text;
  v_total   constant int := 9;
  -- one row per test email, built below, queued in the loop at the end
  k_kind    text[] := '{}';
  k_subj    text[] := '{}';
  k_text    text[] := '{}';
  k_html    text[] := '{}';
  k_key     text[] := '{}';
  -- scratch
  v_token   text;
  v_hash    text;
  v_url     text;
  v_title   text;
  v_body    text;
  v_link    text;
  v_html    text;
  v_text    text;
  v_time    text;
  v_pts     int;
  v_spts    int;
  v_events  int;
  v_badges  int;
  v_teaser  text;
  v_footer  text;
  rep       json;
  c         jsonb;
  v_out     uuid;
  v_n       int;
  v_left    int;
  v_low     int;
  v_waiting int;
  v_missing text[];
  i         int;
begin
  -- ── who ───────────────────────────────────────────────────────────────────
  if v_target !~ '^\S+@\S+\.\S+$' then
    raise exception 'Email test pack: put your YACquest email on the line marked ✏️ at the top (it says %), then press Run again.',
      coalesce(nullif(v_target, ''), 'nothing');
  end if;
  select pr.* into p
    from public.profiles pr left join auth.users u on u.id = pr.id
   where lower(trim(u.email::text)) = v_target or lower(trim(pr.email::text)) = v_target
   order by (lower(trim(u.email::text)) = v_target) desc nulls last
   limit 1;
  if p.id is null then
    raise exception 'Email test pack: no YACquest account uses "%". Check the spelling on the line marked ✏️ at the top (use the email you log in with), then press Run again. Nothing was queued.', v_target;
  end if;
  select coalesce(lower(trim(u.email::text)), v_target) into v_addr from auth.users u where u.id = p.id;
  v_addr := coalesce(v_addr, v_target);
  -- Participant emails (3–6) are skipped for people who turned emails off, haven't confirmed
  -- their email, or whose address bounces: stop now instead of queuing emails that won't go.
  if not p.email_opt_in then
    raise exception 'Email test pack: email updates are OFF for % (for example after testing Unsubscribe), so the announcement / reminder / follow-up / Wrapped tests would be skipped. Turn them back on in YACquest → Me → Settings ("Email me YACquest updates"), then press Run again. Nothing was queued.', v_addr;
  end if;
  if p.email_verified_at is null then
    raise exception 'Email test pack: % hasn''t confirmed their email yet, so participant emails would be skipped (in-app only). Confirm it first (red bar at the top of the app → Resend email), then press Run again. Nothing was queued.', v_addr;
  end if;
  if p.email_bounced then
    raise exception 'Email test pack: emails to % are paused because they bounced. Clear it in Admin → Players (or Me → "My email works now"), then press Run again. Nothing was queued.', v_addr;
  end if;

  select * into cfg from public.app_config where id = 1;
  select * into cyc from public.cycles where id = public.active_cycle_id();
  v_first := coalesce(public.email_first_name(p.display_name), 'there');
  v_name  := coalesce(nullif(trim(p.display_name), ''), 'there');
  v_camp  := 'testpack:' || v_run;

  -- ── 1. test (copy of send_test_email(), 0004) ─────────────────────────────
  k_kind := k_kind || 'test'::text;
  k_subj := k_subj || 'YACquest test email ✅'::text;
  k_text := k_text || format(E'Hi %s,\n\nThis is a test email from YACquest. If you can read this, committee emails are working.\n', v_name);
  k_html := k_html || public.email_layout('Test email',
      '<p style="margin:0 0 10px;">Hi ' || public.html_escape(v_name) || ',</p>'
      || '<p style="margin:0;">This is a test email from YACquest. If you can read this, committee emails are working. ✅</p>');
  k_key  := k_key || ('test:testpack:' || v_run || ':1');

  -- ── 2. verify_email (copy of queue_verification_email(), 0034) ─────────────
  -- Harmless test token: saved as ALREADY USED, for your account, so the link can never verify
  -- anything and your verified state is untouched (verify_email_token() answers "already used"
  -- before it looks at anything else; the app shows "All set!"). Real tokens aren't touched.
  -- STEP C deletes this token row again.
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_hash  := public.email_token_hash(v_token);
  insert into public.email_verify_tokens (token_hash, user_id, email, reason, created_at, expires_at, used_at)
  values (v_hash, p.id, v_addr, 'resend', v_now, v_now + make_interval(days => public.email_verify_days()), v_now);
  v_url := v_app || '/#/verify?t=' || v_token;
  k_kind := k_kind || 'verify_email'::text;
  k_subj := k_subj || 'Confirm your YACquest email'::text;
  k_text := k_text || ('Hi ' || v_first || E',\n\n'
    || E'Welcome to YACquest! You can already check in, earn points and play. Tap the link below to confirm this is your email. It locks in your points and makes you eligible for a prize spot.\n\n'
    || 'Confirm my email: ' || v_url || E'\n\n'
    || E'The link works for 7 days. If you didn''t sign up for YACquest, you can ignore this email.\n\n'
    || E'—\nYACquest · NCSSM Young Alumni Council');
  v_html := public.email_layout('Confirm your YACquest email',
      '<p style="margin:0 0 12px;font-size:16px;">Hi ' || public.html_escape(v_first) || ',</p>'
    || '<p style="margin:0 0 12px;">Welcome to YACquest! You can already check in, earn points and play. Tap the button to confirm this is your email. It locks in your points and makes you eligible for a prize spot.</p>'
    || '<p style="margin:18px 0;"><a href="' || public.html_escape(v_url) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;border:2px solid #0b2a5b;">Confirm my email</a></p>'
    || '<p style="margin:0 0 6px;font-size:13px;color:#5b6475;">Or paste this link into your browser:<br><span style="word-break:break-all;">' || public.html_escape(v_url) || '</span></p>'
    || '<p style="margin:12px 0 0;font-size:13px;color:#5b6475;">The link works for 7 days.</p>');
  k_html := k_html || regexp_replace(v_html, '<!--yac:footer-->.*<!--/yac:footer-->',
    'You''re getting this because someone signed up for YACquest with this address. If that wasn''t you, you can ignore this email.<br>YACquest · NCSSM Young Alumni Council');
  k_key  := k_key || ('verify:' || v_hash || ':testpack:' || v_run || ':2');

  -- ── 3. announcement (copy of send_announcement()'s email, 0032) ────────────
  -- Every fill-in, written as {token}: the per-person step must replace them all.
  -- The key carries a made-up id (no announcement row is created), so it expires in 3 days like a real one.
  v_title := 'Test announcement for {first_name} 📣';
  v_link  := v_app || '/';
  v_body  := E'This is a test of the personalized announcement email. Each line below should show YOUR details, with no curly braces left:\n'
          || E'• First name: {first_name}\n• Name: {name}\n• Campus: {campus}\n• Campus pun: {campus_pun}\n'
          || E'• Points: {points}\n• Points to the goal: {points_to_goal}\n• Next stop: {next_stop}\n• Next event: {next_event}\n'
          || E'• Friend code: {friend_code}\n\n'
          || 'Tap this link to test click tracking (it opens your Me page): ' || v_app || '/#/me';
  k_kind := k_kind || 'announcement'::text;
  k_subj := k_subj || ('YACquest: ' || v_title);
  k_text := k_text || (v_body || E'\n\nOpen YACquest: ' || v_link || E'\n\n— Sent by ' || coalesce(p.display_name, 'YAC') || ' via YACquest.');
  k_html := k_html || public.email_layout(v_title,
      '<p style="font-size:16px;line-height:1.5;white-space:pre-wrap;margin:0 0 16px">'
      || regexp_replace(public.html_escape(v_body), '(https?://[^\s<]*[^\s<.,!?;:)])', '<a href="\1" style="color:#0b2a5b;">\1</a>', 'g')
      || '</p>'
      || '<p style="margin:0 0 16px"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Open YACquest</a></p>'
      || '<p style="font-size:13px;color:#4a5672;margin:0">Sent by ' || public.html_escape(coalesce(p.display_name, 'YAC'))
      || ' via YACquest.</p>');
  k_key  := k_key || ('announcement:' || gen_random_uuid() || ':testpack:' || v_run || ':3');

  -- ── 4. event_reminder (copy of queue_event_reminders(), 0024) ─────────────
  -- Sample event (no events row): the key's made-up event id makes it expire 1 hour after queuing.
  v_time := to_char((date_trunc('hour', v_now) + interval '1 hour') at time zone 'America/New_York', 'FMHH12:MI AM');
  v_pts  := coalesce(public.tier_points(2), 0);
  v_title := 'Test Event (sample)';
  k_kind := k_kind || 'event_reminder'::text;
  k_subj := k_subj || ('Reminder: ' || v_title || ' starts at ' || v_time);
  k_text := k_text || (v_title || ' starts at ' || v_time || '.' || chr(10) || 'Where: YAC HQ (sample)' || chr(10) || chr(10)
          || 'Check in at the event to earn ' || v_pts || ' points.' || chr(10) || chr(10)
          || 'You get this because you RSVP''d in YACquest and have email updates on (turn them off in Me).');
  k_html := k_html || public.email_layout('Reminder: ' || v_title,
        '<p style="font-size:16px;margin:0 0 8px"><b>' || public.html_escape(v_title) || '</b> starts at <b>'
        || public.html_escape(v_time) || '</b>.</p>'
        || '<p style="margin:0 0 8px">📍 ' || public.html_escape('YAC HQ (sample)') || '</p>'
        || '<p style="margin:0 0 12px">Check in at the event to earn <b>' || v_pts || ' points</b>.</p>'
        || '<p style="font-size:12px;color:#4a5672;margin:0">You get this because you RSVP’d in YACquest and have email updates on (turn them off in Me).</p>');
  k_key  := k_key || ('reminder:' || gen_random_uuid() || ':testpack:' || v_run || ':4');

  -- ── 5. event_followup "Thanks for coming" (copy of send_followup_for_event(), 0030) ──
  -- The subject must start with "Thanks for coming" so the campus-pun sign-off is added (the
  -- [TEST] prefix goes on afterwards). Sample event id: the ⭐ Rate page says the event doesn't exist.
  v_footer := 'You get this because you have email updates on in YACquest (turn them off in Me → Settings).';
  v_spts := coalesce(public.tier_points(coalesce((select tier from public.activities where id = 'event_survey'), 3)), 0);
  v_url  := gen_random_uuid()::text;   -- sample event id
  v_link := v_app || '/#/survey/' || v_url;
  k_kind := k_kind || 'event_followup'::text;
  k_subj := k_subj || ('Thanks for coming to ' || v_title || '!');
  k_text := k_text || ('Thanks for coming to ' || v_title || '!' || chr(10) || chr(10)
          || 'How was it? Rate it in YACquest for +' || v_spts || ' points (takes a minute):' || chr(10) || v_link
          || chr(10) || chr(10) || v_footer);
  k_html := k_html || public.email_layout('Thanks for coming to ' || v_title || '!',
        '<p style="font-size:16px;margin:0 0 10px">Thanks for coming to <b>' || public.html_escape(v_title) || '</b>! 🐂</p>'
        || '<p style="margin:0 0 6px">How was it? Rate it in YACquest for <b>+' || v_spts || ' points</b> (takes a minute):</p>'
        || '<p style="margin:0 0 12px"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">⭐ Rate this event</a></p>'
        || '<p style="font-size:12px;color:#4a5672;margin:0">' || public.html_escape(v_footer) || '</p>');
  k_key  := k_key || ('followup:' || v_url || ':testpack:' || v_run || ':5');

  -- ── 6. wrapped (copy of queue_wrapped_notifications(), 0028), your real numbers (read only) ──
  v_events := (select count(distinct l.ref_id) from public.ledger l
                where l.user_id = p.id and l.cycle_id = cyc.id and l.source = 'checkin' and l.amount > 0);
  v_badges := (select count(*) from public.badges_for(p.id) b where b.earned);
  v_teaser := format('%s %s · %s %s · %s %s',
                     p.points, case when p.points = 1 then 'point' else 'points' end,
                     v_events, case when v_events = 1 then 'event' else 'events' end,
                     v_badges, case when v_badges = 1 then 'badge' else 'badges' end);
  v_link := v_app || '/#/wrapped';
  k_kind := k_kind || 'wrapped'::text;
  k_subj := k_subj || 'Your YACquest Wrapped is here! 🎁'::text;
  k_text := k_text || ('Your YACquest Wrapped is here!' || chr(10) || chr(10)
          || 'Your ' || coalesce(cyc.name, 'year') || ' in a nutshell: ' || v_teaser || '.' || chr(10) || chr(10)
          || 'See the whole story (best month, rarest badge, your YAC personality) and a card to share: ' || v_link
          || chr(10) || chr(10) || v_footer);
  k_html := k_html || public.email_layout('Your YACquest Wrapped is here! 🎁',
        '<p style="font-size:16px;margin:0 0 10px">Your <b>' || public.html_escape(coalesce(cyc.name, 'year')) || '</b> in a nutshell:</p>'
        || '<p style="font-size:22px;font-weight:800;color:#0b2a5b;margin:0 0 14px">' || public.html_escape(v_teaser) || '</p>'
        || '<p style="margin:0 0 14px">See the whole story (your best month, rarest badge and YAC personality) and get a card to share.</p>'
        || '<p style="margin:0 0 14px"><a href="' || public.html_escape(v_link) || '" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Open my Wrapped 🎁</a></p>'
        || '<p style="font-size:12px;color:#4a5672;margin:0">' || public.html_escape(v_footer) || '</p>');
  k_key  := k_key || ('wrapped:' || gen_random_uuid() || ':testpack:' || v_run || ':6');

  -- ── 7. weekly_report: the real report (build_weekly_report() only reads) ───
  rep := public.build_weekly_report();
  k_kind := k_kind || 'weekly_report'::text;
  k_subj := k_subj || coalesce(rep->>'subject', 'YACquest weekly report');
  k_text := k_text || coalesce(rep->>'text', '');
  k_html := k_html || coalesce(rep->>'html', '');
  k_key  := k_key || ('weekly_report:testpack:' || v_run || ':7');

  -- ── 8. prize_qualified (copy of on_prize_claim_alert() INSERT, 0015) — sample winner ──
  k_kind := k_kind || 'prize_qualified'::text;
  k_subj := k_subj || format('🏆 YACquest: %s won spot #%s', 'Sample Winner', 1);
  k_text := k_text || (format(E'%s (%s) reached %s points and won prize spot #%s of %s — a $%s gift card.\n\n'
             'They are waiting to send their delivery info. You will get another email as soon as they do.\n',
             'Sample Winner', public.campus_label(coalesce(p.campus, 'unc')), cfg.prize_goal, 1, cfg.prize_count, cfg.prize_value_usd)
        || E'\n🐂 Yak of the week: ' || public.yak_pun_of_the_week() || E'\n'
        || E'\n(TEST: no real prize spot was given.)\n');
  k_html := k_html || public.email_layout(format('%s won spot #%s', 'Sample Winner', 1),
        '<p style="margin:0 0 10px;font-size:17px;"><b>' || public.html_escape('Sample Winner') || '</b> ('
        || public.campus_label(coalesce(p.campus, 'unc')) || ') reached <b>' || cfg.prize_goal || ' points</b> and won prize spot <b>#'
        || 1 || ' of ' || cfg.prize_count || '</b> — a <b>$' || cfg.prize_value_usd || ' gift card</b>. 🏆</p>'
        || '<p style="margin:0;color:#5b6475;">They are waiting to send their delivery info. You will get another email as soon as they do.</p>'
        || '<p style="margin:12px 0 0;color:#5b6475;font-size:13px;font-style:italic;">🐂 Yak of the week: ' || public.html_escape(public.yak_pun_of_the_week()) || '</p>'
        || '<p style="margin:12px 0 0;color:#c0392b;font-size:13px;">TEST: no real prize spot was given.</p>');
  k_key  := k_key || ('prize_qualified:testpack:' || v_run || ':8');

  -- ── 9. prize_info (copy of on_prize_claim_alert() UPDATE, 0015) — sample delivery info ──
  c := jsonb_build_object('fullName', 'Sample Winner', 'email', 'sample.winner@example.com', 'phone', '(919) 555-0100',
                          'address', '1 Sample St, Durham NC 27705', 'preference', 'Amazon', 'notes', 'TEST: not a real winner.');
  k_kind := k_kind || 'prize_info'::text;
  k_subj := k_subj || format('URGENT 🎁 YACquest winner info: %s (spot #%s)', 'Sample Winner', 1);
  k_text := k_text || (format(E'%s won spot #%s and sent their delivery info. Please send the $%s gift card by %s.\n\n'
             'Full name: %s\nEmail: %s\nPhone: %s\nMailing address: %s\nGift card preference: %s\nNotes: %s\n'
             'Reference: %s\nCampus: %s\n',
             'Sample Winner', 1, cfg.prize_value_usd, to_char(cfg.fulfill_by, 'Mon FMDD, YYYY'),
             c->>'fullName', c->>'email', c->>'phone', c->>'address', c->>'preference', c->>'notes',
             'TEST-0000', public.campus_label(coalesce(p.campus, 'unc')))
        || E'\n🐂 Yak of the week: ' || public.yak_pun_of_the_week() || E'\n');
  k_html := k_html || public.email_layout(format('Winner info: %s (spot #%s)', 'Sample Winner', 1),
        '<p style="margin:0 0 12px;background:#fff6e3;border:1px solid #f2b33d;border-radius:8px;padding:10px 12px;">'
        || '<b style="color:#c0392b;">Action needed:</b> send the <b>$' || cfg.prize_value_usd || ' gift card</b> by <b>'
        || coalesce(to_char(cfg.fulfill_by, 'Mon FMDD, YYYY'), '—') || '</b>, then mark spot #1 fulfilled in YACquest.</p>'
        || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">'
        || public.prize_alert_row('Full name', c->>'fullName')
        || public.prize_alert_row('Email', c->>'email')
        || public.prize_alert_row('Phone', c->>'phone')
        || public.prize_alert_row('Mailing address', c->>'address')
        || public.prize_alert_row('Gift card preference', c->>'preference')
        || public.prize_alert_row('Notes', c->>'notes')
        || public.prize_alert_row('Reference', 'TEST-0000')
        || public.prize_alert_row('Campus', public.campus_label(coalesce(p.campus, 'unc')))
        || '</table>'
        || '<p style="margin:12px 0 0;color:#5b6475;font-size:13px;font-style:italic;">🐂 Yak of the week: ' || public.html_escape(public.yak_pun_of_the_week()) || '</p>');
  k_key  := k_key || ('prize_info:testpack:' || v_run || ':9');

  if cardinality(k_kind) <> v_total then
    raise exception 'Email test pack: internal count mismatch (% emails built, expected %).', cardinality(k_kind), v_total;
  end if;

  -- ── queue: same insert path as the app (enqueue_email → outbox → per-person trigger) ──
  for i in 1 .. v_total loop
    if not public.enqueue_email(k_kind[i], array[v_addr], k_subj[i], k_text[i], k_html[i], k_key[i]) then
      raise exception 'Email test pack: email % was not queued (duplicate key %). Press Run again.', i, k_key[i];
    end if;
    select id into v_out from public.email_outbox where dedupe_key = k_key[i];
    if k_kind[i] = 'verify_email' then
      -- like queue_verification_email(): the link lives only in the per-person copy
      update public.email_outbox set body_text = '', body_html = '' where id = v_out;
    end if;
    -- Tag: "[TEST i/9]" subject + one easy-to-find campaign (Admin → Email stats, STEP B/C).
    update public.email_messages
       set subject = '[TEST ' || i || '/' || v_total || '] ' || subject,
           campaign_id = v_camp,
           campaign_label = '🧪 Email test pack · ' || v_stamp
     where outbox_id = v_out;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'Email test pack: email % (%): expected 1 per-person row, got %. Is migration 0032 deployed?', i, k_kind[i], v_n;
    end if;
    update public.email_outbox set subject = '[TEST ' || i || '/' || v_total || '] ' || subject where id = v_out;
  end loop;

  -- Every row must be waiting to send (not skipped for opt-out / unverified / bounce / expiry).
  if exists (select 1 from public.email_messages where campaign_id = v_camp and status <> 'queued') then
    raise exception 'Email test pack: some emails were not queued: %. Nothing was queued.',
      (select string_agg(kind || ' → ' || status || coalesce(' (' || error || ')', ''), '; ')
         from public.email_messages where campaign_id = v_camp and status <> 'queued');
  end if;

  -- ── budget (same math as claim_email_messages) ────────────────────────────
  -- Priority 1–2 may use the whole rolling-24 h budget; priority 3+ (follow-up, announcement,
  -- Wrapped) only what's left above the reserve. If that room is used up, those three would
  -- wait, so they are moved up to priority 2 for this test (and you get a NOTICE).
  v_left := coalesce(cfg.email_daily_budget, 450)
            - (select count(*) from public.email_messages m
                where (m.status in ('sent', 'bounced') and m.sent_at > v_now - interval '24 hours')
                   or (m.status = 'sending' and coalesce(m.claimed_at, m.created_at) >= v_now - interval '15 minutes'))::int;
  select count(*) into v_low from public.email_messages where campaign_id = v_camp and priority > 2;
  if v_left < v_total then
    raise notice 'Email test pack: the daily email budget is nearly used up (% of % left in the last 24 h). Some test emails will wait until older sends drop out of the 24-hour window.',
      greatest(v_left, 0), coalesce(cfg.email_daily_budget, 450);
  elsif v_left - coalesce(cfg.email_reserve, 50) < v_total then
    update public.email_messages set priority = 2 where campaign_id = v_camp and priority > 2;
    raise notice 'Email test pack: only % emails of budget left above the reserve, so the % low-priority test emails were moved up to priority 2 so they go out now.',
      greatest(v_left - coalesce(cfg.email_reserve, 50), 0), v_low;
  end if;
  select count(*) into v_waiting from public.email_messages m
   where m.campaign_id <> v_camp and (m.status in ('queued', 'sending') or (m.status = 'failed' and m.attempts < 5));
  if v_waiting > 40 then
    raise notice 'Email test pack: % other emails are already waiting, so the test emails may take a few runs (10 minutes each).', v_waiting;
  end if;

  -- Newer email kinds this pack doesn't know about yet?
  select coalesce(array_agg(k), '{}') into v_missing
    from (select (regexp_matches(pg_get_constraintdef(oid), '''([a-z_]+)''', 'g'))[1] as k
            from pg_constraint where conname = 'email_outbox_kind_check') x
   where k <> all (k_kind);
  if cardinality(v_missing) > 0 then
    raise notice 'Email test pack: these newer email kinds have no test here yet: %', array_to_string(v_missing, ', ');
  end if;

  raise notice 'Email test pack: queued % emails to % (run %). They go out on the next send-emails run (every 10 minutes).', v_total, v_addr, v_run;
end $pack$;

-- What was queued (this run)
select substring(m.subject from '^\[TEST (\d+)/')::int as n,
       m.kind,
       m.subject,
       m.email as "to",
       m.priority,
       m.status,
       to_char(m.send_before at time zone 'America/New_York', 'Mon FMDD FMHH12:MI AM') as send_before_ny,
       case when public.email_is_participant_kind(m.kind) then 'open pixel + clicks' else 'clicks only' end as tracking,
       case when public.email_is_participant_kind(m.kind) and m.body_html like '%/#/unsubscribe?t=%' then 'link + header' else '—' end as unsubscribe,
       case when m.subject || m.body_text || m.body_html ~ '\{(first_name|name|campus|campus_pun|points|points_to_goal|next_stop|next_event|friend_code)\}'
            then 'LEFTOVER {…}!' else 'ok' end as fill_ins
  from public.email_messages m
 where m.campaign_id = (select campaign_id from public.email_messages where campaign_id like 'testpack:%' order by created_at desc limit 1)
 order by 1;


/* ═══════════════════════════════════════════════════════════════════════════
   STEP B — run ~10 min later to check results
   Copy everything between the BEGIN and END lines into a NEW query and press Run.
   One row per test email (latest run). sent_at fills in once it's sent; opens need
   images on in your mail app (Gmail: "Display images"); clicks appear after you tap
   a link. The last columns repeat the latest send-emails run (bounce check status).
   If status is still "queued" after 15 minutes, the send-emails schedule isn't
   running: tell Claude and paste this table.
-- STEP B BEGIN
select substring(m.subject from '^\[TEST (\d+)/')::int as n,
       m.kind,
       m.status,
       to_char(m.sent_at at time zone 'America/New_York', 'Mon FMDD FMHH12:MI:SS AM') as sent_at_ny,
       m.error as last_error,
       (select count(*) from public.email_events e where e.message_id = m.id and e.type = 'open') as opens,
       (select count(*) from public.email_events e where e.message_id = m.id and e.type = 'click') as clicks,
       (select string_agg(distinct e.url, ' · ') from public.email_events e where e.message_id = m.id and e.type = 'click') as clicked_links,
       (select count(*) from public.email_events e where e.message_id = m.id and e.type in ('bounce', 'unsubscribe', 'complaint')) as other_events,
       to_char(r.ran_at at time zone 'America/New_York', 'Mon FMDD FMHH12:MI AM') as last_run_ny,
       r.sent as last_run_sent,
       r.failed as last_run_failed,
       r.imap_status,
       r.imap_error as "imapError"
  from public.email_messages m
  left join lateral (select * from public.email_runs order by ran_at desc limit 1) r on true
 where m.campaign_id = (select campaign_id from public.email_messages where campaign_id like 'testpack:%' order by created_at desc limit 1)
 order by 1;
-- STEP B END
   ═══════════════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════════════════
   STEP C — cleanup (optional)
   Removes ONLY the test-pack emails (every run), their opens/clicks, and the
   already-used test confirmation tokens, so they stop showing in Admin → Email
   stats. Copy everything between the BEGIN and END lines into a NEW query and
   press Run. It does NOT change your email settings: if you tested Unsubscribe,
   turn emails back on in Me → Settings. Your unsubscribe link (one per person,
   shared with real emails) is kept.
-- STEP C BEGIN
delete from public.email_verify_tokens t
 using public.email_outbox o
 where o.kind = 'verify_email' and o.dedupe_key like 'verify:%:testpack:%'
   and t.token_hash = split_part(o.dedupe_key, ':', 2) and t.used_at is not null;
delete from public.email_events e
 using public.email_messages m
 where e.message_id = m.id and m.campaign_id like 'testpack:%';
delete from public.email_messages where campaign_id like 'testpack:%';
delete from public.email_outbox where dedupe_key like '%:testpack:%';
select (select count(*) from public.email_messages where campaign_id like 'testpack:%') as test_emails_left,
       (select count(*) from public.email_outbox where dedupe_key like '%:testpack:%') as test_outbox_left;
-- STEP C END
   ═══════════════════════════════════════════════════════════════════════════ */

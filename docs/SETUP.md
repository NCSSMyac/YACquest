# Going live with Supabase — setup checklist

This takes about 30–45 minutes, done once. Dashboard menu names can differ slightly; look for the nearest match.

## 1. Create the project
1. Go to **supabase.com**, sign up (use a YAC Google account if you have one, so the project survives YACquest Chair changes), and create a project:
   - Name: `yacquest`. Region: **East US**. Save the **database password** somewhere safe (a shared YAC password manager is ideal).
2. **Add Jacob** so the project never depends on one person: Organization → **Team** → invite `jacob.rodriguez.yac@ncssm.edu` as **Owner**.

## 2. Create the database
1. Open **SQL Editor → New query**.
2. Paste the whole of `supabase/migrations/0001_init.sql` and click **Run**. It should finish with "Success". It is safe to run again.
3. Then do the same for every later file in `supabase/migrations/` **in number order** (`0002_event_kinds.sql`, … through `0038_announcement_safeguards.sql`). Each new migration only needs to be run once, but re-running is safe.
   - **Already live before 0013?** Run `0013_launch_extras.sql` once (anonymous feedback, the sign-up email checkbox, and Admin → Events → **Who came**).
   - **Already live before 0014?** Run `0014_goal_350.sql` once (prize goal 650 → 350, Halfway badge 175, Sparkle Aura at 300, "close to the prize" range 75). Deploy the new app build at the same time so the app shows the same goal.
   - **Already live before 0015?** Run `0015_yak_puns.sql` once (adds a "Yak of the week" line to the weekly committee email and admin prize alerts).
   - `0016_goal_300.sql` is superseded by 0018 and now does nothing; you can skip it.
   - **Already live before 0017?** Run `0017_consistency.sql` once (no rule changes: fixes stale column defaults, and the announcement email footer now names the “Email me announcements from YAC” setting).
   - **Already live before 0018?** Run `0018_goal_350_again.sql` once (prize goal back to 350, Halfway badge 175, Sparkle Aura at 300, "close to the prize" range 75). Deploy the new app build at the same time so the app shows the same goal. If you never ran 0017, run it first, then 0018 (0016 can be skipped).
   - **Already live before 0019?** Run `0019_consistency_350.sql` once (no rule changes: YACquest Chair limit fallbacks now 6). App build unchanged by this file.
   - **Already live before 0020?** Run `0020_staff_rewards.sql` once (staff-only rewards: Hero of the Week, Council wardrobe + badges, Golden Yak) and deploy the new app build with it. Nothing changes for participants.
   - **Already live before 0021?** Run `0021_council_board.sql` once (after 0020) for the staff-only Admin → Council team board, and deploy the app build with it.
   - **Already live before 0022?** Run `0022_rsvp_streaks.sql` once (after 0021) and deploy the app build with it: event RSVPs ("I'm going" on Quests, "N going · M came" and **Who's going** on Admin → Events, an RSVP line in the weekly email), monthly check-in streaks + the **Hot Streak** badge, and the shareable **My Quest Card** (Prize → Treasure). No point rules change. Until 0022 is run, the new app build still works; RSVP counts and streaks just show as 0.
   - **Already live before 0023?** Run `0023_yacquest_chair_wording.sql` once (wording only: server messages and notifications say "YACquest Chair" instead of "chair" / "YAC chair"; no rule, role or error-code changes). Works with any app build.
   - **Already live before 0024?** Run `0024_small_improvements.sql` once (after 0023) and deploy the app build with it: the **🏆 Game win** quick award in Admin → Events → Who came (needs 0024; until then it shows an error and nothing is awarded) and **RSVP reminders** about 1 hour before each event (in-app + email for people with email updates on). Nothing else to set up: reminders ride on the existing every-10-minutes `send-emails` cron job (see "RSVP reminders" below); no Edge Function redeploy. No point rules change.
   - **Already live before 0025?** Run `0025_admin_tools.sql` once (after 0024) and deploy the app build with it: staff-only admin tools — event-day **Door mode**, **bulk approve** in Review, the **Stats** page, **CSV downloads** (Who came / Who's going for staff; all participants for YACquest Chairs), **announcement templates**, private **staff notes** on players and **Undo** for manual points changes. No point rules change and nothing changes for participants. Until 0025 is run those buttons show an error; everything else keeps working.

   - **Already live before 0026?** Run `0026_participant_extras.sql` once (after 0025) and deploy the app build with it. **Nothing else to configure:** automatic event follow-ups ride on the existing `send-emails` cron job (every 10 minutes), and the photo wall uses the existing private `proofs` bucket plus one storage policy the migration adds (no bucket changes, no service key in the app). Until 0026 is run: no follow-ups, the tour is remembered per device only, photo walls are empty and My friends shows an error; everything else keeps working.
   - **Already live before 0027?** Run `0027_privacy_reliability.sql` once (after 0026), deploy the app build with it, and **re-deploy the `send-emails` Edge Function** with the new `supabase/functions/send-emails/index.ts` (paste the whole file again in Supabase → Edge Functions → send-emails → Code → Deploy). Adds: **Delete my account** (Me → Account), **🐞 Report a problem** with technical details for staff (Admin → Feedback), the bug count in the weekly email, and the public **Privacy** page. The Edge Function now also removes the uploaded files of deleted accounts on each 10-minute run (Supabase doesn't let SQL delete storage files). Until 0027 is run, deleting an account and sending a problem report show an error; everything else keeps working. Until the Edge Function is re-deployed, deleted accounts' files wait in `storage_purge_queue` (still private).
   - **Already live before 0028?** Run `0028_pace_wrapped_seasonal.sql` once (after 0027) and deploy the app build with it. **Nothing else to configure:** the "Your YACquest Wrapped is here!" send rides on the existing `send-emails` cron job (no Edge Function re-deploy needed). Adds the staff **Pace** tracker, **YACquest Wrapped** + the **End-of-year checklist**, and the **Seasonal wardrobe**. Until 0028 is run those show an error; everything else keeps working. Check `app_config.app_url` (default `https://ncssmyac.github.io/YACquest/`) if the site lives somewhere else: the Wrapped email links to `<app_url>#/wrapped`.
   - **Already live before 0030?** Run `0030_event_surveys.sql` once (after 0029) and deploy the app build with it. It is **additive** (new table, new activity, new functions; nothing dropped or renamed), so there's **no downtime** and nothing to configure: the survey link rides on the existing automatic follow-up. Attendees can then rate an event in the app (+5, once per event, up to 14 days after it; not part of the digital limit), staff see results under Admin → Events → **📊 Survey**, Stats gets an **Event ratings** card and the weekly email a survey line. Until 0030 is run the Rate buttons and Survey buttons simply don't appear.
   - **Already live before 0031?** Run `0031_seasonal_november.sql` once (after 0030) and deploy the app build with it. It is **additive** (a new column with a default, new rows and upserted dates, one function re-created; nothing dropped), so there's **no downtime** and nothing to configure. Diwali and Thanksgiving items become free for **all of November** (Diwali 2027 from Oct 22), and the new **Native American Heritage Month** background, **Three Sisters Garden**, is free Nov 1–30. People who open the app in November get it automatically. ⚠️ Have it reviewed by Native community members before promoting it (see Seasonal wardrobe below).
   - **Already live before 0032?** Run `0032_email_personalization_tracking.sql` once (after 0031), then **right away redeploy `send-emails`** and **deploy the new public `email-track` function** (JWT verification OFF), and deploy the app build. It is **additive** (new tables/columns with defaults, one trigger, re-created functions; nothing dropped), so there's no downtime: until `send-emails` is redeployed, emails simply wait (the old sender finds nothing to send, so nobody gets a copy twice). Full steps: "Personalized emails, unsubscribe, tracking and bounces (0032)" below.
   - **Already live before 0033?** Run `0033_brew_and_quest.sql` once (after 0032) and deploy the app build with it. It is **additive** (new tables `event_rewards`, `reward_passes`, `event_unlocks`, 3 new wardrobe items, re-created `check_in`, `unlocks_for`, `badges_for`; nothing dropped), so there's **no downtime** and nothing to configure. Normal events work exactly as before. Then set up the Brew & Quest events (see "Brew & Quest (0033)" below).
   - **Already live before 0034?** Do these **in this exact order** (details: "Quick start sign-ups (0034)" below):
     1. Run `0034_quickstart_promo_collection.sql` once (after 0033). It is **additive** (new columns/tables, re-created functions, two triggers; nothing dropped), so there's no downtime. Everyone who already confirmed their email is marked confirmed automatically.
     2. **Re-deploy the `send-emails` Edge Function** with the new `supabase/functions/send-emails/index.ts` (and `email-track` with the new `email-track/index.ts`) so confirmation links are never turned into tracked links.
     3. Deploy the new app build.
     4. **Only then:** Supabase → **Authentication → Sign In / Providers → Email → turn OFF "Confirm email"** → Save.
   - **Already live before 0037?** Run `0037_email_retention_mailto_unsub.sql` once (after 0036), then **re-deploy the `send-emails` Edge Function** with the new `supabase/functions/send-emails/index.ts` (Edge Functions → send-emails → Code → paste the whole file → Deploy), and deploy the app build. It is **additive** (one new table, new columns with defaults, one index, one trigger, re-created functions; nothing dropped), so there's **no downtime**. The **automatic clean-up** of old email data starts on the next 10-minute run with no redeploy at all (it rides on the database call `send-emails` already makes; details: "Email data clean-up and emailed unsubscribes (0037)" below). The redeploy adds **emailed unsubscribe requests** (the `mailto:` in the List-Unsubscribe header) and stops tracking links in staff emails; until you redeploy, those emails just wait in the Inbox as before. **`email-track` doesn't need a redeploy** (no behaviour change; its pasted helper copy only gained unused functions).
   - **Already live before 0038?** Run `0038_announcement_safeguards.sql` once (after 0037) and deploy the app build with it. It is **additive** (new columns with defaults, a wider email status check, new functions, re-created functions with the same names and inputs; nothing dropped), so there's **no downtime**. **No Edge Function re-deploy:** `send-emails` and `email-track` work unchanged (the 10-minute hold is enforced inside the database call `send-emails` already makes; their pasted helper copy only gained an unused field, so re-deploying them is optional). Run the SQL **before** deploying the app build (the new Announce screen calls the new functions). Adds the weekly limit on emails to everyone (3), the recipient count and the 10-minute cancel window: "Announcement safeguards (0038)" below.
   - **Already live before 0036?** Run `0036_winter_windows_kwanzaa.sql` once (after 0035) and deploy the app build with it. It is **additive** (new rows and upserted dates; nothing dropped), so there's **no downtime**. Every winter holiday now opens **Dec 1** (Hanukkah Nov 30; new dates in the table below) and Kwanzaa gains three accessories: **Kikombe cha Umoja (Unity Cup)**, **Zawadi (Gift)** and the **Red, Black & Green Scarf**. Run it before **Nov 30, 2026**.
   - **Already live before 0035?** Run `0035_winter_seasonal.sql` once (after 0034) and deploy the app build with it. It is **additive** (new rows, upserted dates, one function re-created; nothing dropped), so there's **no downtime** and nothing to configure. Adds the **winter seasonal wardrobe** (14 items for Hanukkah, Christmas, Kwanzaa, Winter Solstice, New Year's, Three Kings Day and Lunar New Year; dates under "Seasonal wardrobe" below). Hanukkah opens **Nov 30, 2026**, so run it before then. ⚠️ Ask the campus groups listed below to review the text and art before promoting each holiday.
   - **Already live before 0029?** Run `0029_reset_keeps_events.sql` once (after 0028) and deploy the app build with it. From now on, **Reset points** (System → Danger zone) keeps upcoming and live events visible: they move to the new cycle; finished events stay with the archived one. Running 0029 **also repairs events orphaned by an earlier reset** (e.g. an event created before you reset points while testing): every event whose check-in hasn't closed yet is moved to the active cycle, so it shows up on participants' Quests tab again. Safe to run even if you already ran the one-line `update public.events set cycle_id = …` fix by hand (it just moves nothing). Admin → Events now shows this cycle's events, with an **Older cycles** toggle for the rest.

## 3. Turn on real logins
**Authentication → Sign In / Providers → Email**
- Email provider: **on**
- **Confirm email: OFF** (since 0034, "Quick start": new people are logged in right away and YACquest sends its own confirmation email. Turn it off only after running 0034 and deploying the matching app build; see "Quick start sign-ups (0034)".)
- Minimum password length: **8**

**Authentication → URL Configuration**
- Site URL: `https://ncssmyac.github.io/YACquest/`
- Redirect URLs (add all):
  - `https://ncssmyac.github.io/YACquest/**`
  - `http://localhost:5173/**`
  - `http://localhost:5174/**`

## 4. Email sending (required before launch)
Supabase's built-in email only sends a few messages per hour and is meant for testing. For 300 people, connect your own:

**Easiest: a Gmail account for YAC**
1. Create a Gmail like `ncssm.yac.app@gmail.com` (school accounts often block step 2).
2. Turn on **2-Step Verification**, then create an **App password** (Google Account → Security → App passwords).
3. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   - Host `smtp.gmail.com`, Port `465`, Username = the Gmail address, Password = the app password
   - Sender name `YACquest · NCSSM Young Alumni`, sender email = the Gmail address
4. Gmail allows about 500 emails a day — plenty.

**Email templates** (Authentication → Emails → Templates): use the ready-made ones in `docs/email-templates/` (see "Getting out of spam" below). Subjects without emoji, e.g. *"Confirm your YACquest account"*. Keep the `{{ .ConfirmationURL }}` link in the body.

## 5. Connect the website
1. Supabase → **Project Settings → API** (or **API Keys**): copy the **Project URL** and the **anon / publishable** key. *Never use the `service_role` / secret key in the app.*
2. GitHub repo → **Settings → Secrets and variables → Actions → Variables** → **New repository variable**:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon/publishable key
3. On your Mac, to run the live version locally, copy `.env.example` to `.env.local` and paste the same two values. (Leave `.env.local` empty or delete it to go back to the fake-data demo.)
4. Push any change to `main` (or re-run the deploy action) — the site rebuilds with the real backend.

## 6. Create the YACquest Chair accounts
1. Open the site → **Create account** using `iesha.landis.yac@ncssm.edu`. Confirm via the email link. You are automatically a **YACquest Chair** (Admin tab appears).
2. Jacob does the same with `jacob.rodriguez.yac@ncssm.edu`.

## 7. Before the Nov 8 pickleball event
1. Admin → **Events → New event**: title, campus, start/end time, location, and a password you'll announce at the event (e.g. `PICKLE-8`).
2. Test the whole flow with a friend's account: sign up → confirm email → check in with the password → see points on the leaderboard.
3. Add helpers: they sign up and confirm their email, then Admin → **Team → Add an admin**.
4. **Check-in QR code**: Admin → **Events** → the event → **QR code**. It shows a big QR, the password and the link (with **Copy link**). Project it, or screenshot it and print it for the check-in table. Scanning opens `…/YACquest/#/checkin?event=…&code=…` and checks the person in (only while check-in is open: 30 min before the start until the grace period after the end). Someone who isn't logged in is asked to log in or sign up first, and the check-in finishes automatically after they log in (remembered on that phone for 12 hours). Saying the password out loud still works too.
5. After the event, **Who came (N)** on the event lists everyone who checked in, with **Copy list** (name, username, campus, time). Past events stay under the **Past** tab.

## 8. Weekly email + prize alerts
YACquest emails the YAC team a **weekly report** (spots left, who's close to the prize, top 5, Campus Cup, this week's numbers) and sends **prize alerts** right away when someone wins a spot and when a winner sends their delivery info (name, email, phone, mailing address). It uses the same YAC Gmail and app password as step 4. Do this once:

**a. Update the database.** SQL Editor → New query → paste all of `supabase/migrations/0004_emails_and_audit.sql` → **Run**. (Skip if you already ran every migration in step 2.)

**b. Add the email sender.**
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly `send-emails`.
3. Delete the sample code, then paste the whole of `supabase/functions/send-emails/index.ts` (on GitHub, open the file → **Raw** → select all → copy).
4. Click **Deploy**.

**c. Give it the Gmail password.** Edge Functions → **Secrets** (sometimes under *Manage secrets*) → add:
| Name | Value |
|---|---|
| `SMTP_USER` | the YAC Gmail address, e.g. `ncssm.yac.app@gmail.com` |
| `SMTP_PASS` | the 16-letter Google **app password** (spaces are fine) |
| `SMTP_FROM_NAME` | optional — the sender name people see (default `YACquest · NCSSM Young Alumni`; if you set this secret before, change it to that) |
| `SMTP_HOST` / `SMTP_PORT` | optional — only if you're not using Gmail (defaults `smtp.gmail.com` / `465`) |

**d. Run it every 10 minutes.** **Integrations → Cron** → enable it if asked → **Create job**:
- Name: `send-emails`
- Schedule: every 10 minutes — `*/10 * * * *`
- Type: **Supabase Edge Function** → pick `send-emails`, method **POST**. The default headers (including *Authorization* with the anon key) are fine.
- Save.

**e. Test it.** In the app: Admin → **System** → **Send test email to me**. Within 10 minutes it should arrive (check spam), and the **Email delivery log** shows it as **sent**. If it says **failed**, the error explains why (usually a wrong app password — fix the secret, then press **Retry**).

**Changing it later** (no code): Admin → **System → Weekly committee email** — turn it on/off, pick the day and time (Eastern), set how close counts as "close to the prize", choose whether YACquest Chairs/admins get it, add extra emails (e.g. a board member), and turn prize alerts on/off. **Send this week's report now** sends one immediately; the preview is on the Admin **Overview** tab.

YACquest Chairs can also see every admin change (points added/removed, reviews, role changes, events, prizes) under Admin → **Log**.

## Roles, and handing over the YACquest Chair seat
- **Admin**: review screenshots, award/adjust points (at most +35 per entry), run events, send announcements (including email to everyone). Everything except prizes, Team, the action Log and System settings. Given and removed by a YACquest Chair (only to accounts with a confirmed email).
- **YACquest Chair**: everything. There can be up to **6** (`MAX_CHAIRS` in `src/config.ts`, `app_config.max_chairs` in the database). Any YACquest Chair can make an admin (or a participant with a confirmed email) a YACquest Chair from Admin → **Team**. A YACquest Chair can't remove another YACquest Chair.
- Admins and YACquest Chairs can't win prizes and don't appear on leaderboards.
- **Stepping down**: Admin → **Team → Step down as YACquest Chair** makes you an admin (not allowed if you're the only YACquest Chair — make someone else a YACquest Chair first). Or use **Hand over my YACquest Chair seat** to swap places with a successor in one step (handy when all 6 seats are full). Another YACquest Chair can then remove you from the team.
- Also transfer **Supabase project ownership** (Organization → Team) and the GitHub repo access to the new YACquest Chair.

### Staff rewards: Hero of the Week, Council wardrobe, Golden Yak (staff only)
Participants never see any of this (not in the Wardrobe, Badges, character picker, Rules or Help); only admins and YACquest Chairs do.
- **Crown Hero of the Week** (after each biweekly YAC meeting): Admin → **Heroes** (YACquest Chairs only) → pick the admin or YACquest Chair, add an optional short note (e.g. "ran the pickleball check-in table") → **Crown hero**. They get a pop-up next time they open the app, a gold glow around their avatar, and the Hero’s Crown, Hero’s Cape and Hall of Heroes background in their Wardrobe. Crowning the next hero moves those perks over (they come off the old hero automatically); there's no expiry. **Clear current hero** ends a reign without crowning anyone. Every admin sees the hero and the Hall of Heroes on Admin → **Overview**.
- **Council wardrobe** unlocks by itself from staff work (counted all-time): Gatekeeper’s Monocle (25 reviews), Herald’s Horn (5 announcements), Event Host Top Hat (3 events you created that each got 5+ check-ins), Council Chamber (every staff member). Council badges are on Prize → **Badges** under "Council badges".
- **Grant an item**: Admin → **Heroes → Grant a Council reward** → pick the person and Royal Scepter, Starlit Throne Room or Wizard Council Hat.
- **Council MVP** (an extra-special accomplishment): same form, reward **Council MVP**. It unlocks the Legendary **Golden Yak** character (Me → Edit profile). Staff also unlock it by earning the Council Legend badge (Gatekeeper + Town Crier + Event Host + Hero of the Week once).
- **Council team board**: Admin → **Council** (every admin and YACquest Chair, view-only) shows each staff member's look, role, Council badges, unlocked Council items and the ★ Legendary chip, with the reigning hero first. YACquest Chairs get a "Manage in Heroes" link.
- All crowns, clears and grants appear in Admin → **Log**. If someone goes back to participant their staff looks and Golden Yak come off (they fall back to their previous character); it all returns if they rejoin the team.

### RSVPs, streaks and quest cards (0022)
- **RSVPs**: everyone (participants and staff) can tap **I'm going** on an upcoming event in Quests; it shows "12 going" and the Add to calendar button right next to it. RSVPs close when the event starts and never earn points. Admin → **Events** shows "N going · M came" on each card; **Who's going** lists name · campus · RSVP time with ✓ for people who came, plus **Copy list** (CSV with emails). Past events also show how many RSVP'd but didn't come.
- **Weekly committee email**: one extra line, "📅 NEXT 7 DAYS (RSVPs)", lists events starting in the next 7 days with their RSVP counts.
- **Monthly streaks**: months in a row (Eastern time, this cycle) with at least one event check-in. Shown as a small 🔥 chip on Home (2+ months) and on Me. The **Hot Streak** badge = 3 months in a row.
- **My Quest Card**: Prize → Treasure → **🎴 Share my quest card** makes a 1080×1920 story-sized image (character + look, points, badges, events, best streak, ranks for participants / Council badges for staff). **Share** opens the phone's share sheet (pick Instagram → Story); otherwise **Save image** and post it from Photos.

### Small improvements (0024)
- **RSVP reminders**: about 1 hour before an event starts, everyone who tapped **I'm going** (staff too) and hasn't checked in yet gets "⏰ Starts in 1 hour: <event> at <place>" in the app, plus an email ("Reminder: <event> starts at 2:00 PM") if their email updates are on (Me → Settings). Each person gets one reminder per event. **How it runs:** the `send-emails` cron job you set up above (every 10 minutes) already calls the database each run; since 0024 that call also queues the reminders, so there is **no new dashboard setup and no Edge Function redeploy**. If emails aren't set up yet, the in-app reminder still appears once the cron job runs; without the cron job there are no reminders. Reminder emails show as "Event reminder" in Admin → System → Email delivery log.
- **Quick game-win award**: Admin → Events → **Who came** → **🏆 Game win +20** next to anyone who checked in → check/edit the note ("Won a game at <event>") → **Award +20**. Once per person per event (the row then shows **✓ awarded**). Logged in Admin → **Log** like every award.
- **Duplicate event**: Admin → Events → **Duplicate** on any event opens the New event form with the same title, tier, campus, location, length and grace, one week later, and a new password. Nothing is saved until you press **Save**.
- **Check-in confirmation**: after checking in (password or QR), people see a full-screen **CHECKED IN ✓** pass with their name and character, the event, the check-in time, the points and a live ticking clock. Door staff can ask to see it; the moving seconds show it isn't a screenshot.
- Also: a "📅 Today" chip on Home (and a dot on the bell) when you RSVP'd to an event today, a "N more points to <next checkpoint>" line under your points, "Start here" tips for brand-new players, and campus-color frames around avatars on Ranks and Adventurer of the Month.


### Admin tools (0025, staff only)
- **🚪 Door mode** (Admin → Events, or the dashboard's Next event card): a full-screen page for the door or a projector with a huge check-in QR, the password, a live "here" counter (updates every ~5 s), "N going / M here" and the last few arrivals. It keeps the screen awake where the browser allows it; **Full screen** and **Exit** are at the top.
- **Bulk approve** (Admin → Review): tick cards (or "Select all on this page") → **Approve N** → confirm. Anything already reviewed is skipped and listed in the result. Rejecting stays one at a time.
- **Stats** (new Admin tile): sign-ups per week, attendance per event, campuses, progress to the prize, where points come from and top badges, each with a **⬇ CSV** button. Participants only.
- **CSV downloads**: Who came / Who's going (with emails) on each event; **All participants** on Stats for YACquest Chairs only. Files open in Excel/Sheets; cells that look like formulas are made safe.
- **Templates ▾** in Announce (5 built-ins + the team's saved ones), **Staff notes** on players (never visible to the player) and **↩ Undo** on manual points changes (Players → Points history; Log for YACquest Chairs).

### Participant extras (0026)
- **Automatic follow-up after events**: when an event's check-in closes (end time + grace), everyone who checked in gets "Thanks for coming to <event>! 🐂" (with the event's **Survey link** if you added one — filling it out counts as the *Complete a Feedback Survey* quest, +5 with a screenshot), and everyone who RSVP'd but didn't come gets "Sorry we missed you" + the next event. Email too for people with email updates on. Once per event; only events that closed in the last 3 days go out automatically. Admin → Events → **Past** shows "Follow-up sent ✓ <time>" or a **✉ Send follow-up now** button (staff). Emails show as "event_followup" in the email log.
- **Survey link**: optional field in the New/Edit event form (and kept by Duplicate). Must start with https:// (or http://).
- **Welcome tour**: new players see a 4-step tour once after their first login (staff get a 5th step about the Admin tab). Replay it from Me (**🧭 Replay the tour**) or Help. Accounts made before 0026 see it once too.
- **Event photo wall**: past events in Quests have **📸 Photos (N)**. Only approved event photos whose uploader ticked "Show my photo on the event photo wall" (off by default) and hasn't turned off "Show my approved event photos on photo walls" (Me → Settings). Staff can tap a photo → **Hide from wall** (logged). Storage stays private; see BACKEND.md 0026.
- **My friends** (Me, or tap the friend code on Home): who joined with your code, whether they came to an event, X/3 bonuses used, **Copy** / **Share** (shares the sign-up link `…/#/signup?code=YAC-XXXX`, which prefills the code).

### Privacy, account deletion and problem reports (0027)
- **Privacy page** (`#/privacy`): a plain-language summary, public (Login, Sign-up, Help and Me link to it). It is **pending review by the NCSSM Foundation**; if anything about how data is handled changes, update `src/screens/Privacy.tsx` and its "Last updated" date.
- **Delete my account** (Me → Account, red): the person types their username and confirms. Blocked for the **last YACquest Chair** (make someone else a chair first) and while their **prize is on its way** (qualified or info sent: they're asked to email the chairs; mark it delivered, then they can delete). Everything that belongs to the account is deleted; a delivered prize spot stays filled as "Deleted account" with the delivery info erased; the action log anonymizes them and shows "An account was deleted". Details in BACKEND.md 0027.
- **🐞 Report a problem** (Help, Me, and the "Oops, a glitch!" screen): saved as *Bug / problem* feedback with **Technical details** (page, app version, browser, screen size, online/offline, theme, time, last errors) in Admin → Feedback. Logged-out people get an email draft to the YACquest Chairs instead. The weekly email shows how many bug reports came in.
- **Offline banner + refresh prompt**: the app shows "You're offline…" and refreshes the screen when the connection is back; after a deploy, open apps show "New version available — Refresh". Nothing to configure.

### Pace, Wrapped, end of year and the seasonal wardrobe (0028)
- **Pace** (Admin dashboard card + Admin → Stats → "Pace to the prize", staff only): projects how many participants reach the goal by May 1 at their current pace (80% pace = conservative, 100% = optimistic). Says "Check back after a couple of weeks of events" until there are 2 weeks of points. From **Feb 1** it suggests "Consider lowering the goal" if even the optimistic count is under 2; any time it says "Goal may be too easy" if even the conservative count is over 8. Tuning: `PACE` in `src/config.ts`. Changing the goal: POINTS.md → Check-ins during the year.
- **YACquest Wrapped timing:** opens for everyone on **Apr 24, 2027 at midnight Eastern** (`WRAPPED.opensAt` in `src/config.ts`; the database derives the same moment: one week before the cycle's last day, so it moves automatically with next year's cycle). YACquest Chairs can **Preview Wrapped** any time (Admin → System → End of year). Within 10 minutes of opening, the `send-emails` run sends **once per cycle**: an in-app notification to everyone and an email teaser (points · events · badges + link) to people with email updates on. Home shows a Wrapped banner and the admin dashboard shows the **End-of-year checklist** from Apr 24 until 14 days after the quest ends (May 15). The quest card (Prize → Badges → Share my quest card) stays available all year.
- **End-of-year checklist** (dashboard during the wrap-up; always in Admin → System): Wrapped sent (ticks itself), export the ledger CSV, confirm winners + delivery info, deliver gift cards by May 15, thank-you announcement (opens Announce with the "Thank you for a great year" template), reset for next year (YACquest Chairs, only after May 1). Ticks are saved per cycle and logged.
- **Seasonal wardrobe** (Prize → Wardrobe → ⭐ Collection since 0034; was 🎉 Seasonal): limited-time items, free for participants and staff during their window, kept forever once claimed (opening the app or the Wardrobe during the window claims them). Outside the window, items you don't own show "Returns next year" (or "Coming soon" within about 100 days, or later the same year when that year's window hasn't happened yet; winter holidays say "Returns next winter" once their season is over). They never affect points.
  - **⚠️ Verify the dates every year.** Windows (America/New_York, inclusive) live in **two places**: `SEASONAL` in `src/config.ts` and the `seasonal_windows` table (seeded by 0028 for 2026 and 2027, updated by 0031). Since 0031, **Diwali, Thanksgiving and Native American Heritage Month are all November** (Nov 1–30). Diwali follows the lunar calendar (2026: Sunday, Nov 8, Lakshmi Puja, confirmed → Nov 1–30; 2027: Oct 29 → **Oct 22 – Nov 30** so it still covers the festival, verify before October 2027); Thanksgiving (4th Thursday of November) and Native American Heritage Month are Nov 1–30; Indigenous Peoples' Day is the 2nd Monday of October ± 7 days (computed; its 2026 window, Oct 5–19, had already passed at launch, so it first appears Oct 2027); Día de los Muertos is Oct 25 – Nov 9 every year. For 2028+, add rows with a new migration (`insert into seasonal_windows … on conflict (holiday, year) do update …`) and the same dates in `SEASONAL`.
  - **Winter (0035, dates from 0036) — dates to verify every year** (America/New_York, inclusive; a unit test keeps `SEASONAL` and 0036 in sync):

    | Holiday | 2026–27 window | 2027–28 window | Verify yearly? |
    |---|---|---|---|
    | 🕎 Hanukkah | Nov 30 – Dec 31, 2026 (begins at sundown Fri Dec 4, ends Dec 12, 2026) | Nov 30 – Dec 31, 2027 (begins at sundown Fri Dec 24, 2027, ends Jan 1, 2028) | **Yes** (Hebrew calendar): widen the end date in a year when Hanukkah runs past Dec 31 |
    | 🎄 Christmas | Dec 1–31, 2026 | Dec 1–31, 2027 | No (Dec 25) |
    | 🕯️ Kwanzaa | Dec 1, 2026 – Jan 8, 2027 | Dec 1, 2027 – Jan 8, 2028 | No (Dec 26 – Jan 1) |
    | ✨ Winter Solstice | Dec 1–31, 2026 (solstice Dec 21) | Dec 1–31, 2027 (solstice Dec 21 in New York, Dec 22 UTC) | Only that it falls in December |
    | 🎆 New Year's | Dec 1, 2026 – Jan 7, 2027 | Dec 1, 2027 – Jan 7, 2028 | No. The party hat shows the year being welcomed ("2027" from Dec 2026 through Jan 2027, then "2028"), computed by the app. |
    | ⭐ Three Kings Day | Dec 1, 2026 – Jan 13, 2027 | Dec 1, 2027 – Jan 13, 2028 | No (Jan 6) |
    | 🧧 Lunar New Year | Dec 1, 2026 – Feb 20, 2027 (Sat Feb 6, 2027; Year of the Goat, also called Sheep or Ram; Lantern Festival Feb 20) | Dec 1, 2027 – Feb 20, 2028 (Wed Jan 26, 2028; Year of the Monkey) | **Yes** (lunisolar calendar): Feb 20 must still come after the New Year. The zodiac sentence in its About text is computed from the year the window ends in. |

    These dates were written without an internet check: confirm the **Hanukkah**, **Winter Solstice** and **Lunar New Year** dates (and the zodiac animal) against a reliable calendar before each season, and fix both `SEASONAL` and a new migration if anything is off. For 2028–29+, add rows the same way.
  - **⚠️ Community review before each item goes live:** all seasonal descriptions and art should be reviewed by members of those communities (e.g. campus cultural organizations: Latinx/Mexican-American student groups for Día de los Muertos, South Asian / Hindu / Sikh / Jain student groups for Diwali, Native American student associations and the NC Commission of Indian Affairs for Indigenous Peoples' Day **and the Native American Heritage Month "Three Sisters Garden" background**). For the Heritage Month item, reach out before promoting it to Native student organizations at NCSSM and nearby campuses, e.g. **UNC's Carolina Indian Circle**, **NC State's Native American Student Association** and **Duke's Native American Student Alliance**, and ask them to review the About text (Native American Heritage Month, "Truthsgiving", the National Day of Mourning, the Three Sisters) and the art. Design rule for every Native-related item: plants, landscapes and objects only — **no** headdresses, feathers, war bonnets, regalia, face paint, tipis/totems as decoration, "pilgrim vs Indian" scenes or anything wearable that imitates Native dress. Edit text in `SEASONAL` (`src/config.ts`) and art in `src/components/cosmetics/seasonalArt.ts`. To pause an item, delete its window rows in `seasonal_windows` and its dates in `SEASONAL` (people who already own it keep it).
  - **Winter items (0035): community review.** Before promoting each winter holiday, ask campus cultural organizations to review the About text and the art (Prize → Wardrobe → ⭐ Collection → About this item), for example **Hillel** (Hanukkah: the hanukkiah with its raised shamash, the dreidel with the letter נ nun, sufganiyot), the **Black Student Alliance / Black Student Movement** (Kwanzaa: the kinara with three red, one black and three green candles, the mkeka, corn and the unity cup; since 0036 also the Kikombe cha Umoja (Unity Cup), Zawadi (a book wrapped in a red, black and green ribbon) and the Red, Black & Green Scarf, with one About line each), **Latinx / Hispanic student organizations** (Three Kings Day: the Rosca de Reyes and the star; no Magi depicted), **Asian student associations** (Lunar New Year: red lanterns, plum blossoms, the red envelope, and the Chinese New Year / Seollal / Tết wording) and Christian student groups for Christmas. Design rule for every winter item: backgrounds and everyday objects that are part of the public celebration only — **no** religious figures, **no** religious garments or costumes on characters (no kippah/tallit, clergy garb, Magi crowns/robes, kente cloth, qipao/hanbok/áo dài), **no** caricature, **no** sacred symbols used as fashion. Edit text in `SEASONAL` (`src/config.ts`) and art in `src/components/cosmetics/winterVec.ts`.

### Personalized emails, unsubscribe, tracking and bounces (0032)
Every email now goes to **one person** ("Hi Ava,"), with a one-click unsubscribe link, open/click stats and bounce checks, and a daily budget so the free Gmail never goes over its limit. Do these once, in order:

1. **Run the migration.** Supabase → SQL Editor → New query → paste all of `supabase/migrations/0032_email_personalization_tracking.sql` → **Run**. (Safe to run again.)
2. **Redeploy the sender right away.** Edge Functions → `send-emails` → **Code** → replace everything with the new `supabase/functions/send-emails/index.ts` → **Deploy**. (Until you do, emails just wait in the queue; nothing is sent twice.)
3. **Deploy the tracking function.** Edge Functions → **Deploy a new function** → **Via Editor** → name it exactly `email-track` → paste all of `supabase/functions/email-track/index.ts` → **Deploy**. Then open `email-track` → **Details** (or Settings) → turn **OFF** "Verify JWT" / "Enforce JWT verification" → **Save**. This must be public: email apps open its links without logging in. It can only log an open/click, redirect a link the database signed, or unsubscribe the person who owns the link.
4. **Nothing to copy for the tracking secret.** The migration created a random secret inside the database (`email_secrets`); the Edge Functions ask the database to sign and check links, so there is **no `TRACK_SECRET`** to add.
5. **Sender name.** If you added an `SMTP_FROM_NAME` secret earlier, change it to `YACquest · NCSSM Young Alumni` (or delete it — that's the default). Also set Supabase → **Authentication → Emails → SMTP Settings → Sender name** to the same `YACquest · NCSSM Young Alumni`.
6. **Turn on IMAP in the YAC Gmail** (for bounce checks): Gmail → ⚙️ → **See all settings** → **Forwarding and POP/IMAP** → **Enable IMAP** → **Save Changes**. It uses the same app password. If IMAP is off, sending still works and Admin → System shows "Bounce checking off". Bounce notices get the label **YACquest bounces**. (Set the secret `BOUNCE_CHECK=off` to skip it entirely.)
7. **Paste the new login email templates** (next section).
8. **Optional:** GitHub → Settings → Secrets and variables → Actions → **Variables** → add `VITE_YAC_SENDER_EMAIL` = the YAC Gmail address, so the "Check your inbox" screen can say "Add ncssm.yac.app@gmail.com to your contacts".
9. **Check it:** Admin → System → **Send test email to me** → within 10 minutes it arrives; **Email sending** shows "Today: 1 / 450 sent · …" and the delivery log shows one row per person.

**Daily budget.** Free @gmail.com allows about 500 recipients per rolling 24 hours, and Gmail flags fast bursts. YACquest sends at most **450 in any 24 hours**, about 20 a minute, every 10 minutes. Order: 1) prize alerts, test, weekly report · 2) event reminders · 3) follow-ups · 4) announcements · 5) Wrapped; the last 50 are reserved for 1–2. Emails that would arrive too late are skipped ("Skipped — too late (budget)"): reminders after the event started, follow-ups 3 days after the event, announcements after 3 days (or once an event they name starts), Wrapped after the year ends, the weekly report after its day. If you move to **Google Workspace** (≈2,000/day), raise it:
```sql
update public.app_config set email_daily_budget = 1900 where id = 1;   -- reserve: email_reserve (50); announcement expiry: email_announcement_days (3)
```

**Stats:** Admin → Stats → **Email** card → **Details** (opens are approximate: Apple Mail preloads images, some apps block them). Players → a person → **Emails** shows what they were sent; addresses that bounced twice show **Bouncing email** and stop getting email until fixed.

### Email data clean-up and emailed unsubscribes (0037)
**Clean-up (automatic, once a day, nothing to set up).** The database call `send-emails` makes every 10 minutes also deletes old email data, at most once a day (a failure there never stops emails from going out). The periods are named constants at the top of `supabase/migrations/0037_email_retention_mailto_unsub.sql` (and `RETENTION` in `emailCore.ts`; the Privacy page states them too, so change all three together):
- **Opens, clicks, bounces, unsubscribe events, the email log (`email_messages`) and the outbox:** deleted after **12 months**. Admin → Email stats (last 7 / 30 days) is unaffected.
- **Prize alert emails** (the winner's name, address and phone): their contents are emptied as soon as the prize is marked delivered in Admin → Prizes, and after **30 days** at the latest. **Weekly staff reports** (names + feedback) and **confirmation emails** are emptied after **30 days**. The subject and status stay in the delivery log; **Retry** says the contents were removed. Emails still waiting to go out are never emptied.
- **Used or expired confirmation links:** deleted after **30 days**.
- **Unsubscribe links** keep working for as long as the account exists (deleted with the account).

To see what the last runs removed: SQL Editor → `select ran_at, stats from public.email_purge_runs order by ran_at desc limit 5;`

**Emailed unsubscribes.** Gmail and other apps can unsubscribe by sending an email with the subject **unsubscribe** to the YAC Gmail (the `mailto:` in every participant email's List-Unsubscribe header). After redeploying `send-emails`, each run reads those (same IMAP access as the bounce check; turn IMAP on as in step 6 of the 0032 steps above; `BOUNCE_CHECK=off` skips both). If the sender's address belongs to an account and Gmail verified the sender, their YACquest emails are turned off, the message is marked read and filed under the label **YACquest unsubscribes**. Anything else stays **unread in the Inbox** with the label **YACquest unsubscribes/unmatched**: check those now and then (usually someone writing from a different address than their account) and turn their emails off by hand (Supabase → Table Editor → `profiles` → `email_opt_in` = false) or reply to them. YACquest never replies automatically. The function's JSON response (Edge Functions → send-emails → Logs) shows `unsubscribes` per run, and `email_runs.unsubscribes` keeps the count.

### Brew & Quest (0033): limited reward events
A special event type for "the first N people get a free item" promos. This year: the exam-season coffee tab at NC State, UNC and Duke.

**Set up the 3 events once the times are known** (Admin → Events → **+ New event** → **☕ Brew & Quest preset**):
1. Pick the campus: **NC State · Cup of Joe · Dec 2 (10 coffees)**, **UNC Chapel Hill · Epilogue · Dec 3 (30)** or **Duke · venue TBD · Dec 5 (6)**. The title ("Brew & Quest @ Cup of Joe"), campus, location, Tier 2 · Active (+20) and the **Special reward event** section are filled in for you, with a secret word like `MOCHA-42`.
2. Type the **start and end times** (the date is shown in the yellow note). Duke: put the café's name in *Venue name* and *Location* once it's picked (until then participants see "Venue coming soon").
3. Check the limit and message, then **Save**. Repeat for the other two campuses. You can change the venue, limit (never below passes already handed out) or secret word later with **Edit**.

**What people get:** everyone who checks in gets the event points and the limited **Latte Night Scholar** outfit (beanie, A+ latte, moonlit study nook; never available any other way). The **first N participants** (staff never use one up) also get a **YACquest Coffee Pass**: their number (#7 of 30), the secret word, a live clock, valid **30 minutes**, plus the **Early Bird ☕** badge. One free coffee per person across all three events. Nobody is ever told how many are left.

**What to tell the café** (print `cafe-cheat-sheet.pdf`): "Students show a YACquest Coffee Pass with today's secret word and a live clock; valid 30 minutes." Write the number of free coffees and the secret word on the sheet. The café does nothing in the app.

**On the day:** open **🚪 Door mode** for the event. Staff see *Free coffees left: 12 / 30*, the secret word in big letters (tell the café at the start), and the pass list (#, name, time, Used / Not yet; tap to mark used or undo). **⬇ Passes CSV** reconciles the café tab afterwards. The event card in Admin → Events shows **☕ 18/30 passes**.

### Quick start sign-ups (0034)
**Why:** with Supabase's "Confirm email" on, someone who scans the event QR, signs up and then has to dig through their inbox (often Spam) usually gives up before checking in. Now they're in the app instantly: check in, earn points, get a Coffee Pass, all right away.

**Order matters:** 1) run `0034_quickstart_promo_collection.sql`, 2) re-deploy `send-emails` (+ `email-track`), 3) deploy the app, 4) **then** Authentication → Sign In / Providers → Email → **Confirm email: OFF**. (If you flip the switch first, new accounts still work, but the old app shows a "Check your inbox" screen they don't need.)

**How confirmation works now:**
- Every new account gets a **"Confirm your YACquest email"** email from YACquest's own sender (the outbox + `send-emails`, so it arrives within ~10 minutes, from "YACquest · NCSSM Young Alumni", "Hi {first name}"). The link (`#/verify?t=…`) works for **7 days**, once, in any browser, logged in or not. Tokens are stored hashed.
- Until they confirm, people **play normally**, but: they **can't hold a prize spot** (the prize race skips them; when they confirm, any open spot is filled by real crossing time, so nobody is bumped), **can't be made admin / YACquest Chair**, and get **no announcement / reminder / follow-up / Wrapped emails** (they still see everything in the app). A **red bar** sits right under the top bar on every screen (admin too): "⚠️ Confirm your email to keep your points & prize spot. Check your Spam/Promotions folder for an email from YACquest." with **Resend email** (3 an hour) and **Wrong email?** (how to reach the YACquest Chairs). × hides it only until the next page; from day 3 it adds "(day N)". It steps aside on the Coffee Pass and the reward reveal. Check-ins keep working.
- Staff see an **Unverified** chip in Admin → Players and "Email confirmed %" in Admin → Stats.
- Everyone who had confirmed through Supabase before 0034 is already confirmed. A bootstrap YACquest Chair email that signs up unconfirmed starts as a participant and gets the seat when it's confirmed.
- **Limits:** at most 3 resends per person per hour, and at most `app_config.verify_emails_per_hour` (150) confirmation emails per hour overall, so a burst of fake sign-ups can't use up the Gmail budget. Change with `update public.app_config set verify_emails_per_hour = 300 where id = 1;`.
- Someone stuck? In Supabase → Authentication → Users → the person → **Confirm user** also confirms them in YACquest (or run `update public.profiles set email_verified_at = now() where email = 'their@email.com';`).

### Reusable limited reward events: campaigns (0034)
Brew & Quest is now one **campaign**; you can run more (e.g. a snack or merch giveaway). Admin → Events → **🎁 Campaigns** → **+ New campaign**: name ("Snack Attack 2027"), free item ("free snack" / "free merch"), pass name ("Snack Pass"), emoji, default countdown message and the **outfit set** (each campaign has its own outfit; one free item per person per campaign). When making an event, tick **Special reward event** and pick the campaign; or fill in the section by hand and tap **💾 Save as campaign**. The pass, countdown banner, Door mode and recap card use the campaign's words. Brew & Quest 2026 stays the default; existing Brew & Quest events keep working unchanged.

**Add a new outfit set** (needs a developer, ~1 hour plus drawing):
1. **Art files:** draw the pieces (any of hat / accessory / background) in `src/components/cosmetics/` like `limitedArt.ts` (pixel grids) or `limitedVec.ts` (vector), and register them next to the Latte Night Scholar pieces.
2. **One config entry:** add the set to `OUTFIT_SETS` in `src/lib/rewardEvents.ts` (id, name, edition, item ids, about text) and the items to `COSMETICS` in `src/lib/cosmetics.ts` with `rule: { type: 'event', id: '<set id>' }`.
3. **One migration row per item:** a new migration inserting into `public.cosmetics (id, slot, name, rule_type, rule_value, sort_order)` with `rule_type 'event'` and `rule_value '<set id>'` (copy section 2 of `0033_brew_and_quest.sql`).
4. Deploy, then create the campaign in Admin → Events → Campaigns and pick the new set. It shows up in Wardrobe → **Collection** automatically.

### Promo extras (0034)
- **Mystery outfit teaser:** for 14 days before a campaign's next event, Home shows the outfit as a dark silhouette with an **RSVP** button, and Login / Sign-up show it too (silhouette only, no venue) to push sign-ups.
- **Bring-a-friend:** after a check-in (reveal, Coffee Pass, CHECKED IN screen) people can Share / Copy / show a **QR** of the sign-up link with their friend code; hidden once they've used all 3 friend bonuses.
- **Live campus scoreboard:** from 3 days before a campaign's first event to 1 day after its last, Home and the Admin dashboard show participant check-ins per campus, refreshing every 30 seconds.
- **📸 Recap card:** Admin → Events → Past → **📸 Recap card** makes a feed (1080×1350) or story (1080×1920) image: title, venue, campus colors, "38 adventurers met us at Cup of Joe ☕", free items given, up to 12 characters (never names) and a campus thank-you.
- **Finals Study Break quest:** a Tier 3 screenshot quest ("share your favorite study spot or snack"), open Dec 1–18, 2026 and Apr 20 – May 1, 2027 only, counting toward the weekly digital limit. Dates live in `QUEST_WINDOWS` (`src/config.ts`) **and** `public.quest_windows`; change both (e.g. `insert into public.quest_windows values ('finals_study_break', '2027-12-01', '2027-12-17');`).
- **Wardrobe → Collection:** limited event outfits and seasonal items on one shelf (first tab), with "Collected 9 / 18".

### Getting out of spam
Free Gmail senders often land in Spam or Promotions at first. What helps, in order:
1. **Check Supabase Auth really uses the YAC Gmail**, not Supabase's built-in sender: Authentication → Emails → **SMTP Settings** → "Enable custom SMTP" is ON with `smtp.gmail.com`, port `465`, the Gmail address and its app password. (Supabase's default sender is rate-limited and often filtered.)
2. **Paste the YACquest templates** from `docs/email-templates/` (Authentication → Emails → **Templates**; for each, set the Subject and paste the HTML into the message body):
   | Template | Subject | File |
   |---|---|---|
   | Confirm signup (unused once "Confirm email" is off, 0034) | `Confirm your YACquest account` | `confirm-signup.html` |
   | Reset password | `Reset your YACquest password` | `reset-password.html` |
   | Magic link (only if you turn it on) | `Your YACquest login link` | `magic-link.html` |
   | Change email address | `Confirm your new YACquest email` | `change-email.html` |
   Plain language, no emoji in subjects, one button plus the plain link, and *"You're getting this because you signed up for YACquest, the NCSSM Young Alumni Council app."*
3. **Same sender name everywhere:** `YACquest · NCSSM Young Alumni` (SMTP Settings sender name + `SMTP_FROM_NAME`).
4. **Ask early users to tap "Not spam"** (and add the YAC Gmail to contacts) — the Check-your-inbox screen says this too. A few dozen "Not spam" clicks teach Gmail quickly.
5. **Warm up gradually:** the first week, send email announcements to one campus at a time instead of everyone; keep the in-app message for the rest. The daily budget and 20-a-minute pace already avoid bursts.
6. **Keep emails consistent:** links only to `ncssmyac.github.io` (no URL shorteners), a real text version (YACquest sends both), the footer with the unsubscribe link (YACquest adds it), and replies go to the YAC Gmail.
7. **Long-term fix:** a custom domain (e.g. `yacquest.org`) sent through an email service (Resend, Postmark, Google Workspace…) with **SPF, DKIM and DMARC** records. That isn't possible with a free @gmail.com address; it's the step that makes school and Outlook inboxes trust you. (Tracked links point at the Supabase domain; with your own domain you could also put tracking on it.)

### Emergency: a YACquest Chair lost access
In Supabase **SQL Editor**, run (replace the email):
```sql
update public.profiles set role = 'chair' where email = 'new.chair@ncssm.edu';
```
Make sure no more than 6 people are YACquest Chairs afterwards.

## Good to know
- **Free plan limits**: 500 MB database, 1 GB file storage, 50k monthly users — far more than YACquest needs. Free projects pause after 7 days with **no activity**; any login wakes it.
- Screenshots are shrunk to ~150 KB before upload. ~300 people × a few per month stays well under 1 GB for the year.

### Announcement safeguards (0038)
- **Weekly limit on emails to everyone.** At most **3** announcements to **Everyone** can be emailed per week (Monday–Sunday, Eastern time), counting all staff together. Campus and one-person emails, and in-app messages, are never limited. When the week's emails are used up, Announce disables "Also send as an email" for Everyone and explains why; staff can still post it in the app or email one campus. A cancelled announcement gives its slot back.
- **Who gets it.** Announce shows "Goes to 262 people in the app · 241 by email" before sending (email = emails on, confirmed, not bouncing).
- **10-minute cancel window.** Emailed announcements wait **10 minutes** before the emails can go out (they go with the next 10-minute run after that, so 10–20 minutes). Until then the sender or a YACquest Chair can press **Cancel · N min left** in Announce → Recently sent: the emails are stopped (shown as "Cancelled" in the delivery log and Email stats) and the message disappears from everyone's app. In-app-only messages can't be cancelled.
- **Changing the numbers:** Admin → System → **Announcement emails** (YACquest Chairs), or SQL: `update public.app_config set announce_all_email_weekly_cap = 3, announce_email_hold_minutes = 10 where id = 1;` (limit 0–20 a week; window 0–60 minutes, 0 = no window). Changes are in Admin → Log.
- Backups: Admin → **System → Export ledger CSV** once a month, saved to the YAC Drive.

## For developers
- Database tests: `bash supabase/tests/run_tests.sh` (needs local Postgres 16).
- App tests: `npm test`. Contract between DB and app: `docs/BACKEND.md`.
- Email sender: `supabase/functions/send-emails/index.ts`; tracking: `supabase/functions/email-track/index.ts` (Deno; not part of the app's TypeScript build). Both contain a copy of `supabase/functions/_shared/emailCore.ts` (pure helpers, unit tested) between "BEGIN/END emailCore" markers so each can be pasted into the dashboard as one file: after editing it run `node scripts/sync-edge-core.mjs` (a test fails if the copies drift). CLI deploy: `supabase functions deploy send-emails` and `supabase functions deploy email-track --no-verify-jwt`.
- Future database changes go in a new numbered file in `supabase/migrations/` (next after `0038_announcement_safeguards.sql`, i.e. `0039_…`). Supabase grants new functions to everyone by default, so repeat the `revoke execute … from public, anon` lines for any new function.

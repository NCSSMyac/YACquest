# Going live with Supabase — setup checklist

This takes about 30–45 minutes, done once. Dashboard menu names can differ slightly; look for the nearest match.

## 1. Create the project
1. Go to **supabase.com**, sign up (use a YAC Google account if you have one, so the project survives YACquest Chair changes), and create a project:
   - Name: `yacquest`. Region: **East US**. Save the **database password** somewhere safe (a shared YAC password manager is ideal).
2. **Add Jacob** so the project never depends on one person: Organization → **Team** → invite `jacob.rodriguez.yac@ncssm.edu` as **Owner**.

## 2. Create the database
1. Open **SQL Editor → New query**.
2. Paste the whole of `supabase/migrations/0001_init.sql` and click **Run**. It should finish with "Success". It is safe to run again.
3. Then do the same for every later file in `supabase/migrations/` **in number order** (`0002_event_kinds.sql`, … through `0026_participant_extras.sql`). Each new migration only needs to be run once, but re-running is safe.
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

## 3. Turn on real logins
**Authentication → Sign In / Providers → Email**
- Email provider: **on**
- **Confirm email: on** (people must click the link before they can log in)
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
   - Sender name `YACquest`, sender email = the Gmail address
4. Gmail allows about 500 emails a day — plenty.

**Email templates** (Authentication → Emails → Templates): edit "Confirm signup" and "Reset password" so they say YACquest, e.g. subject *"Confirm your YACquest account 🐂"*. Keep the `{{ .ConfirmationURL }}` link in the body.

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
| `SMTP_FROM_NAME` | optional — the sender name people see (default `YACquest`) |
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

### Emergency: a YACquest Chair lost access
In Supabase **SQL Editor**, run (replace the email):
```sql
update public.profiles set role = 'chair' where email = 'new.chair@ncssm.edu';
```
Make sure no more than 6 people are YACquest Chairs afterwards.

## Good to know
- **Free plan limits**: 500 MB database, 1 GB file storage, 50k monthly users — far more than YACquest needs. Free projects pause after 7 days with **no activity**; any login wakes it.
- Screenshots are shrunk to ~150 KB before upload. ~300 people × a few per month stays well under 1 GB for the year.
- Backups: Admin → **System → Export ledger CSV** once a month, saved to the YAC Drive.

## For developers
- Database tests: `bash supabase/tests/run_tests.sh` (needs local Postgres 16).
- App tests: `npm test`. Contract between DB and app: `docs/BACKEND.md`.
- Email sender: `supabase/functions/send-emails/index.ts` (Deno; not part of the app's TypeScript build). Deploy from the CLI with `supabase functions deploy send-emails` if you prefer.
- Future database changes go in a new numbered file in `supabase/migrations/` (next after `0026_participant_extras.sql`, i.e. `0027_…`). Supabase grants new functions to everyone by default, so repeat the `revoke execute … from public, anon` lines for any new function.

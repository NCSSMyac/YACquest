# Going live with Supabase — setup checklist

This takes about 30–45 minutes, done once. Dashboard menu names can differ slightly; look for the nearest match.

## 1. Create the project
1. Go to **supabase.com**, sign up (use a YAC Google account if you have one, so the project survives YACquest Chair changes), and create a project:
   - Name: `yacquest`. Region: **East US**. Save the **database password** somewhere safe (a shared YAC password manager is ideal).
2. **Add Jacob** so the project never depends on one person: Organization → **Team** → invite `jacob.rodriguez.yac@ncssm.edu` as **Owner**.

## 2. Create the database
1. Open **SQL Editor → New query**.
2. Paste the whole of `supabase/migrations/0001_init.sql` and click **Run**. It should finish with "Success". It is safe to run again.
3. Then do the same for every later file in `supabase/migrations/` **in number order** (`0002_event_kinds.sql`, … through `0031_seasonal_november.sql`). Each new migration only needs to be run once, but re-running is safe.
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
   - **Already live before 0029?** Run `0029_reset_keeps_events.sql` once (after 0028) and deploy the app build with it. From now on, **Reset points** (System → Danger zone) keeps upcoming and live events visible: they move to the new cycle; finished events stay with the archived one. Running 0029 **also repairs events orphaned by an earlier reset** (e.g. an event created before you reset points while testing): every event whose check-in hasn't closed yet is moved to the active cycle, so it shows up on participants' Quests tab again. Safe to run even if you already ran the one-line `update public.events set cycle_id = …` fix by hand (it just moves nothing). Admin → Events now shows this cycle's events, with an **Older cycles** toggle for the rest.

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

### Privacy, account deletion and problem reports (0027)
- **Privacy page** (`#/privacy`): a plain-language summary, public (Login, Sign-up, Help and Me link to it). It is **pending review by the NCSSM Foundation**; if anything about how data is handled changes, update `src/screens/Privacy.tsx` and its "Last updated" date.
- **Delete my account** (Me → Account, red): the person types their username and confirms. Blocked for the **last YACquest Chair** (make someone else a chair first) and while their **prize is on its way** (qualified or info sent: they're asked to email the chairs; mark it delivered, then they can delete). Everything that belongs to the account is deleted; a delivered prize spot stays filled as "Deleted account" with the delivery info erased; the action log anonymizes them and shows "An account was deleted". Details in BACKEND.md 0027.
- **🐞 Report a problem** (Help, Me, and the "Oops, a glitch!" screen): saved as *Bug / problem* feedback with **Technical details** (page, app version, browser, screen size, online/offline, theme, time, last errors) in Admin → Feedback. Logged-out people get an email draft to the YACquest Chairs instead. The weekly email shows how many bug reports came in.
- **Offline banner + refresh prompt**: the app shows "You're offline…" and refreshes the screen when the connection is back; after a deploy, open apps show "New version available — Refresh". Nothing to configure.

### Pace, Wrapped, end of year and the seasonal wardrobe (0028)
- **Pace** (Admin dashboard card + Admin → Stats → "Pace to the prize", staff only): projects how many participants reach the goal by May 1 at their current pace (80% pace = conservative, 100% = optimistic). Says "Check back after a couple of weeks of events" until there are 2 weeks of points. From **Feb 1** it suggests "Consider lowering the goal" if even the optimistic count is under 2; any time it says "Goal may be too easy" if even the conservative count is over 8. Tuning: `PACE` in `src/config.ts`. Changing the goal: POINTS.md → Check-ins during the year.
- **YACquest Wrapped timing:** opens for everyone on **Apr 24, 2027 at midnight Eastern** (`WRAPPED.opensAt` in `src/config.ts`; the database derives the same moment: one week before the cycle's last day, so it moves automatically with next year's cycle). YACquest Chairs can **Preview Wrapped** any time (Admin → System → End of year). Within 10 minutes of opening, the `send-emails` run sends **once per cycle**: an in-app notification to everyone and an email teaser (points · events · badges + link) to people with email updates on. Home shows a Wrapped banner and the admin dashboard shows the **End-of-year checklist** from Apr 24 until 14 days after the quest ends (May 15). The quest card (Prize → Badges → Share my quest card) stays available all year.
- **End-of-year checklist** (dashboard during the wrap-up; always in Admin → System): Wrapped sent (ticks itself), export the ledger CSV, confirm winners + delivery info, deliver gift cards by May 15, thank-you announcement (opens Announce with the "Thank you for a great year" template), reset for next year (YACquest Chairs, only after May 1). Ticks are saved per cycle and logged.
- **Seasonal wardrobe** (Prize → Wardrobe → 🎉 Seasonal): limited-time items, free for participants and staff during their window, kept forever once claimed (opening the app or the Wardrobe during the window claims them). Outside the window, items you don't own show "Returns next year" (or "Coming soon" later the same year). They never affect points.
  - **⚠️ Verify the dates every year.** Windows (America/New_York, inclusive) live in **two places**: `SEASONAL` in `src/config.ts` and the `seasonal_windows` table (seeded by 0028 for 2026 and 2027, updated by 0031). Since 0031, **Diwali, Thanksgiving and Native American Heritage Month are all November** (Nov 1–30). Diwali follows the lunar calendar (2026: Sunday, Nov 8, Lakshmi Puja, confirmed → Nov 1–30; 2027: Oct 29 → **Oct 22 – Nov 30** so it still covers the festival, verify before October 2027); Thanksgiving (4th Thursday of November) and Native American Heritage Month are Nov 1–30; Indigenous Peoples' Day is the 2nd Monday of October ± 7 days (computed; its 2026 window, Oct 5–19, had already passed at launch, so it first appears Oct 2027); Día de los Muertos is Oct 25 – Nov 9 every year. For 2028+, add rows with a new migration (`insert into seasonal_windows … on conflict (holiday, year) do update …`) and the same dates in `SEASONAL`.
  - **⚠️ Community review before each item goes live:** all seasonal descriptions and art should be reviewed by members of those communities (e.g. campus cultural organizations: Latinx/Mexican-American student groups for Día de los Muertos, South Asian / Hindu / Sikh / Jain student groups for Diwali, Native American student associations and the NC Commission of Indian Affairs for Indigenous Peoples' Day **and the Native American Heritage Month "Three Sisters Garden" background**). For the Heritage Month item, reach out before promoting it to Native student organizations at NCSSM and nearby campuses, e.g. **UNC's Carolina Indian Circle**, **NC State's Native American Student Association** and **Duke's Native American Student Alliance**, and ask them to review the About text (Native American Heritage Month, "Truthsgiving", the National Day of Mourning, the Three Sisters) and the art. Design rule for every Native-related item: plants, landscapes and objects only — **no** headdresses, feathers, war bonnets, regalia, face paint, tipis/totems as decoration, "pilgrim vs Indian" scenes or anything wearable that imitates Native dress. Edit text in `SEASONAL` (`src/config.ts`) and art in `src/components/cosmetics/seasonalArt.ts`. To pause an item, delete its window rows in `seasonal_windows` and its dates in `SEASONAL` (people who already own it keep it).

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
- Future database changes go in a new numbered file in `supabase/migrations/` (next after `0031_seasonal_november.sql`, i.e. `0032_…`). Supabase grants new functions to everyone by default, so repeat the `revoke execute … from public, anon` lines for any new function.

# Live test checklist (phone)

A quick pass over everything that changed recently (migrations 0032–0038, the email
sender, quick start, Brew & Quest, the winter wardrobe and the Wardrobe shortcuts).
Use your phone, logged in as yourself unless a step says otherwise.

Each item says **where to tap**, **what you should see**, and **what to tell Claude if it's wrong**.
When something is off, a screenshot plus the item number is the most useful thing to send.

**Before you start**
- Open https://ncssmyac.github.io/YACquest/ and pull down to refresh. If a "New version" toast shows, tap it.
- Some steps need a **second test account**. Use a second email address you can read (a personal Gmail works).
  Delete that account at the end (Me → Account → Delete my account).
- For the email items, paste `supabase/tests/email_test_pack.sql` into Supabase → SQL Editor and press Run
  first. You'll get 9 emails starting with **[TEST n/9]**.

---

## 1. Quick start sign-up, red verify bar, verify link

**1.1 Quick start sign-up** (second test account, logged out, or a private browser tab)
- Tap: Sign up → fill in name, campus, email, password → Create account.
- Expect: you go straight into the app (welcome tour), with no "check your email first" wall.
- If wrong, tell Claude: "Quick start sign-up stopped at [screen] / showed [error]."

**1.2 Red verify bar** (same test account)
- Expect: a red bar at the top: confirm your email, with **Resend email**. The × hides it for now; it comes back on the next page.
- Tap Resend email → "Sent! Check spam too".
- If wrong: "No red bar for an unconfirmed account" or "Resend email said [message]".

**1.3 Verify link**
- Open the "Confirm your YACquest email" email on the phone → tap **Confirm my email**.
- Expect: "Email confirmed!" with a little celebration. Back in the app, the red bar is gone.
- Tap the same link again → "All set! Your email was already confirmed ✓" (that's good, not an error).
- In the email test pack, email **[TEST 2/9]** should also show "All set!" (its link is a harmless test link).
- If wrong: "Verify link showed [message]" (screenshot).

## 2. Wardrobe shortcuts

**2.1 Home button**
- Tap: Home. Next to your character there's a gold **👕 Wardrobe** pill.
- Expect: it opens Prize → Wardrobe. It shows a **NEW** tag only when you have an event outfit you haven't looked at yet.
- If wrong: "No Wardrobe pill on Home" / "Pill opens [somewhere else]".

**2.2 Pencil badge + Me**
- Tap: Me. Your avatar has a small pixel **pencil** in the corner.
- Expect: tapping the avatar opens the Wardrobe.
- If wrong: "No pencil on my avatar in Me" / "Tapping it does nothing".

**2.3 Prize tab**
- Tap: Prize → Wardrobe tab.
- Expect: the Wardrobe opens normally; saving an outfit still works.
- If wrong: "Prize → Wardrobe [problem]".

## 3. Collection tab and winter items

**3.1 Collection tab**
- Tap: Prize → Wardrobe → **⭐ Collection** (first tab).
- Expect: "Collected X / Y" with a gold progress bar; groups for the Brew & Quest outfit
  (LIMITED EDITION ribbon) and each holiday. Owned items say "Yours to keep".
- If wrong: "Collection tab missing / counts look wrong: [screenshot]".

**3.2 Winter items (check early, safely)**
- Right now (before Dec 1) the winter holidays are already listed in the Collection, **locked**, marked
  "Winter 2026–27" with **Coming soon** and "Arrives Nov 30" (Hanukkah) or "Arrives Dec 1" (Christmas, Kwanzaa,
  Winter Solstice, New Year's, Three Kings Day, Lunar New Year).
- Tap a locked winter item (or **ⓘ About this item**) → a short "what it honors" sheet opens.
- There's no safe way to unlock them early on the live site (changing the dates would hand the items to
  everyone), so just check back: **Hanukkah opens Nov 30**, the rest **Dec 1**. On that day, opening the app
  shows a "New limited-time items…" note and the items unlock.
- If wrong: "Winter items missing from Collection" / "Hanukkah not unlocked on Nov 30" / "[item] art looks off".

## 4. Brew & Quest (limited reward event)

Set up once: Admin → Events → create a **test event** (today, starting in ~10 minutes, your campus)
→ turn on **🎁 Special reward event**, limit **2**, a venue and a secret word → Save.
Delete the test event when you're done.

**4.1 Countdown banner**
- Tap: Home (and Quests). Expect: "☕ Brew & Quest starts in …" ticking every second; once it starts,
  "First quest: meet us at [venue]… · time left". It never says how many passes are left.
- If wrong: "No countdown on Home/Quests" / "Countdown frozen / wrong time".

**4.2 Check-in + timed coffee pass** (second test account)
- Check in with the event QR or code. Expect: the reveal, the limited-edition outfit, and a **Coffee Pass**
  ticket: "#1 of 2", the name, the venue, the secret word big, a ticking clock with a moving stripe and
  "Valid until [check-in + 30 min]". After 30 minutes it greys out as "Pass expired".
- If wrong: "No pass after check-in" / "Pass shows [problem]" (screenshot).

**4.3 Door mode counter**
- Tap: Admin → Events → the test event → **🚪 Door mode**.
- Expect: big QR + password, the live "here" counter, and "Free coffees left: **1 / 2**" after one check-in
  (updates within ~5 seconds), the secret word, and a list of passes you can mark used.
- If wrong: "Door mode counter didn't move" / "Coffees left wrong".

**4.4 Campaign CSV**
- In Door mode tap **⬇ Passes CSV (café tab)**. Expect a CSV download with one row per pass.
- Also: Admin → Events → **🎁 Campaigns** lists "Brew & Quest" and you can edit it.
- If wrong: "CSV didn't download / is empty / columns wrong".

## 5. Email

**5.1 Test email**
- Tap: Admin → System → **Send test email to me** (weekly email card). Within ~10 minutes: "YACquest test email ✅".
- Also check the 9 **[TEST n/9]** emails from the SQL test pack arrived (look in Spam/Promotions too).
- If wrong: "Test email never arrived" + paste the STEP B table from the SQL file.

**5.2 Sender name**
- Expect: every email shows the sender as **YACquest · NCSSM Young Alumni**.
- If wrong: "Sender shows as [name]".

**5.3 Personalization**
- Open **[TEST 3/9]**. Expect: "Hi [your first name]," and every line filled in (your campus, a campus pun,
  points, next stop, next event, friend code). No `{curly braces}` anywhere.
- **[TEST 5/9]** and **[TEST 6/9]** end with an italic campus pun.
- If wrong: "Fill-in [name] shows [what you saw]".

**5.4 Open / click tracking**
- In Gmail tap "Display images" (if asked) on [TEST 3/9], then tap the link in it.
- Tap: Admin → Stats → **Email (7 days) → Details ›** (or Admin → System → Email sending → **Email stats ›**). Expect a campaign
  "🧪 Email test pack · [time]" with **opened** and **clicked** counts going up (give it a minute).
- Tap the campaign → you appear in the recipient list with opened ✓ and the clicked link.
- Opens are only tracked on announcement / reminder / follow-up / Wrapped emails (3–6), by design.
- If wrong: "Opened/clicked stays 0 after I opened and clicked [TEST 3/9]".

**5.5 Unsubscribe and re-subscribe**
- In [TEST 3/9], tap **Unsubscribe in one click** at the bottom. Expect the "Email settings" page saying
  you're unsubscribed, with **Turn emails back on**.
- Gmail may also show its own "Unsubscribe" link next to the sender; that works too.
- (0037) Emailed unsubscribe: from the address on your account, send an email with the subject **unsubscribe** to the
  YAC Gmail. Within ~10 minutes Me → Settings shows "Email me YACquest updates" off, and in the YAC Gmail the message is
  read and under the label **YACquest unsubscribes**. From an address with no account it stays unread in the Inbox with
  the label **YACquest unsubscribes/unmatched**.
- Re-subscribe: tap **Turn emails back on** (or Me → Settings → "Email me YACquest updates" on).
- Expect: Me → Settings shows emails on again. (If you re-run the SQL test pack while you're unsubscribed,
  it stops and tells you to turn emails back on. That's on purpose.)
- If wrong: "Unsubscribe page showed [message]" / "Couldn't turn emails back on".

**5.6 Bounce check status**
- Tap: Admin → System → **Email sending** card.
- Expect: today's budget, how many are waiting, last/next run, and **Bounce checking on** with
  "Gmail checked [time]". If it says off with "Gmail said: …", IMAP needs turning on in Gmail
  (Settings → Forwarding and POP/IMAP); sending still works.
- If wrong: "Bounce checking says [message]" (screenshot).

**5.7 Clean up** (optional): run **STEP C** from the SQL file to remove the test emails from the stats.

## 6. Admin dashboard

- Tap: Admin (home). Expect the cards to load without errors: Needs attention, the KPIs, Next event
  (with QR / Who's going), Prize race, Campus Cup, Adventurer of the Month and Hero of the Week.
- Admin → Stats: the KPI row includes "Email confirmed (x/y)", and the **Email (7 days)** card shows
  sent / opened / clicked / bounced + unsub.
- If wrong: "Admin card [name] shows an error / looks empty" (screenshot).

## 7. Announcement safeguards (0038)

⚠️ Don't email **Everyone** to test this: every step below uses **One person → yourself**, or a setting you put back.

**7.1 Who gets it**
- Tap: Admin → Announce. Under the email box: **"Goes to [N] people in the app"**; tick "Also send as an email" →
  **"… · [M] by email"** (M is smaller: only people with emails on, a confirmed address and no bounces).
- Pick **One person** → yourself. Expect **"Goes to 1 person · emailed: yes"**. Pick someone with emails off (Players shows
  it) → **"emailed: no (emails off)"**.
- If wrong: "Count says [text] for [audience]".

**7.2 Weekly limit line**
- With **Everyone** + email ticked, expect **"[n] of 3 all-member emails left this week (resets Monday)"**.
- To see the "used up" state without emailing anyone: SQL Editor →
  `update public.app_config set announce_all_email_weekly_cap = 0 where id = 1;` → reload Announce → Everyone.
  Expect the email box **greyed out** and the orange note "… You can still post it in the app, or send the email to one
  campus." **One campus** and **One person** can still tick email. Then put it back:
  `update public.app_config set announce_all_email_weekly_cap = 3 where id = 1;`
  (or Admin → System → **Announcement emails**: 3 per week, 10 minutes → Save).
- If wrong: "Email box still on / message says [text]".

**7.3 Cancel window**
- Send a message to **One person → yourself** with email ticked. The confirm box says the emails wait 10 minutes and can be
  cancelled; after Send the toast says **"Sent to the app. Emails go out in 10 minutes — you can cancel until then."**
- In **Recently sent** it shows a red **Cancel · 10 min left** (counts down). Tap it → **Cancel announcement**.
  Expect: the item shows **Cancelled** + "Cancelled by [you]", the message is gone from your bell / Home, and no email
  arrives. Admin → System → delivery log shows it as **Cancelled**.
- Send another one to yourself and don't cancel: the email arrives 10–20 minutes later, and after 10 minutes the Cancel
  button is gone.
- If wrong: "Cancel button [missing / still there after 10 min]" or "Email arrived after I cancelled" (screenshot).

---

**Afterwards:** delete the test event (Admin → Events), delete the second test account (log in as it →
Me → Account → Delete my account), and run STEP C of the email test pack if you want the stats clean.

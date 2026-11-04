# Going live with Supabase — setup checklist

This takes about 30–45 minutes, done once. Dashboard menu names can differ slightly; look for the nearest match.

## 1. Create the project
1. Go to **supabase.com**, sign up (use a YAC Google account if you have one, so the project survives chair changes), and create a project:
   - Name: `yacquest`. Region: **East US**. Save the **database password** somewhere safe (a shared YAC password manager is ideal).
2. **Add Jacob** so the project never depends on one person: Organization → **Team** → invite `jacob.rodriguez.yac@ncssm.edu` as **Owner**.

## 2. Create the database
1. Open **SQL Editor → New query**.
2. Paste the whole of `supabase/migrations/0001_init.sql` and click **Run**. It should finish with "Success". It is safe to run again.

## 3. Turn on real logins
**Authentication → Sign In / Providers → Email**
- Email provider: **on**
- **Confirm email: on** (people must click the link before they can log in)
- Minimum password length: **8**

**Authentication → URL Configuration**
- Site URL: `https://ieshalandis1.github.io/YACquest/`
- Redirect URLs (add all):
  - `https://ieshalandis1.github.io/YACquest/**`
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

## 6. Create the chair accounts
1. Open the site → **Create account** using `iesha.landis.yac@ncssm.edu`. Confirm via the email link. You are automatically a **YAC Chair** (Admin tab appears).
2. Jacob does the same with `jacob.rodriguez.yac@ncssm.edu`.

## 7. Before the Nov 8 pickleball event
1. Admin → **Events → New event**: title, campus, start/end time, location, and a password you'll announce at the event (e.g. `PICKLE-8`).
2. Test the whole flow with a friend's account: sign up → confirm email → check in with the password → see points on the leaderboard.
3. Add helpers: they sign up and confirm their email, then Admin → **Team → Add an admin**.

## Roles, and handing over the chair
- **Admin**: review screenshots, award/adjust points, run events. Given and removed by a chair (only to accounts with a confirmed email).
- **Chair**: everything. There can be at most **2**. A chair can't remove the other chair.
- **Stepping down**: Admin → **Team → Hand over my chair seat** → pick the successor (they must have a confirmed account). They become chair and you become an admin in one step. The new chairs can then remove you from the team.
- Also transfer **Supabase project ownership** (Organization → Team) and the GitHub repo access to the new chair.

### Emergency: a chair lost access
In Supabase **SQL Editor**, run (replace the email):
```sql
update public.profiles set role = 'chair' where email = 'new.chair@ncssm.edu';
```
Make sure no more than 2 people are chairs afterwards.

## Good to know
- **Free plan limits**: 500 MB database, 1 GB file storage, 50k monthly users — far more than YACquest needs. Free projects pause after 7 days with **no activity**; any login wakes it.
- Screenshots are shrunk to ~150 KB before upload. ~300 people × a few per month stays well under 1 GB for the year.
- Backups: Admin → **System → Export ledger CSV** once a month, saved to the YAC Drive.
- Not built yet: Google Sheets sync and the weekly email (use CSV export for now).

## For developers
- Database tests: `bash supabase/tests/run_tests.sh` (needs local Postgres 16).
- App tests: `npm test`. Contract between DB and app: `docs/BACKEND.md`.
- Future database changes go in a new file `supabase/migrations/0002_….sql`. Supabase grants new functions to everyone by default, so repeat the `revoke execute … from public, anon` lines for any new function.

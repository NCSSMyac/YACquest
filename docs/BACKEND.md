# YACquest backend (Supabase) — contract

The database SQL (`supabase/migrations/*.sql`) and the front end's live API (`src/api/live.ts`) **both follow this file**. If you change one, update this file and the other.

## Principles
- **Points only change through the `ledger` table**, and only via `security definer` RPC functions that check the caller's role. Nobody (not even admins) can insert into `ledger`, `prize_claims` or `profiles.role` directly.
- **Row Level Security (RLS) is on for every table.** Reads go through table selects (allowed by RLS) or RPCs; all writes go through RPCs.
- Settings live in the one-row `app_config` table. Defaults match `src/config.ts`; keep them in sync.
- Times are `timestamptz`. IDs are `uuid` (`gen_random_uuid()`), except `activities.id` (text slug) and `ledger.id` (bigint identity).
- Every RPC raises errors as `raise exception using errcode = 'P0001', message = '<code>: <friendly message>'`. The front end splits on the first `': '` → `ApiError(code, message)`. Codes match the mock (`wrong_password`, `expired`, `duplicate`, `not_open`, `limit`, `forbidden`, `reason`, `amount`, `confirm`, `not_found`, `already_reviewed`, `has_attendees`, `chair_limit`, `not_verified`, `last_chair`, `handle`, `friendCode`, …).

## Roles
| role | who | can |
|---|---|---|
| `participant` | anyone who signs up | earn points, submit proof, claim prize |
| `admin` | helpers granted by a YACquest Chair | review submissions, award/adjust points, create/edit events, see event passwords, search players, see suggestions, overview, send announcements (incl. email to everyone, since 0012) — **all campuses** |
| `chair` | the YACquest Chairs (up to `app_config.max_chairs` = 6, since 0011) | everything admins can + team (admins/YACquest Chairs), prize claims & fulfillment, admin action log, system settings (weekly committee email, export, cycle reset) |

- **Bootstrap:** table `chair_bootstrap(email)` seeded with `iesha.landis.yac@ncssm.edu`, `jacob.rodriguez.yac@ncssm.edu`. When an auth user is created with one of those emails, their profile starts as `chair`. (They still must confirm the email before they can log in.)
- **Max 2 YACquest Chairs in 0001; up to 6 since 0011** (`app_config.max_chairs`; `set_role` can make YACquest Chairs, see 0011). In 0001 `set_role` couldn't create YACquest Chairs. A YACquest Chair passes their seat with `transfer_chair(target)` → target becomes `chair`, caller becomes `admin`, in one transaction. A YACquest Chair cannot demote the other YACquest Chair. Emergency recovery: run SQL in the Supabase dashboard (see SETUP.md).
- Only accounts with a **confirmed email** (`auth.users.email_confirmed_at is not null`) can be made admin or YACquest Chair (`not_verified`).
- Helper SQL functions: `is_admin()` (admin or YACquest Chair), `is_chair()`, both `stable security definer` reading `profiles.role` for `auth.uid()`.

## Tables (public schema)
- `app_config` (id int pk check id=1, prize_goal int 650 **(350 since 0014; 0016 briefly set 300, now a no-op; 350 since 0018)**, prize_count int 5 **(4 since 0004)**, prize_value_usd int 50 **(75 since 0004)**, fulfill_by date '2027-05-15', tier1_points 40 **(35 since 0003; column default 35 since 0017)**, tier2_points 20, tier3_points 5, digital_per_week 1, social_tag_per_month 2, referrals_per_cycle 3, photos_per_event 1, photos_per_cycle 4, max_chairs **(6, since 0011)**)
- `cycles` (id uuid, name text, starts_at, ends_at, is_active bool, archived_at) — exactly one active. Seed: '2026–27 Pilot', 2026-10-15 → 2027-05-01 23:59:59 America/New_York. (The app *shows* the quest as Nov 8, 2026 – May 1, 2027, the first event — `CYCLE.displayStart` in src/config.ts, display only; the database start stays Oct 15.) Helper `active_cycle_id()`.
- `chair_bootstrap` (email citext pk)
- `activities` (id text pk, tier int 1–3, title text, method text check in ('event_password','screenshot','photo','lead_award','referral')) — seeded with the 13 ids in `src/lib/activities.ts`.
- `profiles` (id uuid pk → auth.users on delete cascade, handle citext unique 3–20 `[a-zA-Z0-9_.]`, display_name text 2–24, email citext, campus text check in ('duke','unc','ncsu'), role text default 'participant', avatar text check in ('yak','knight','mage','ranger'), friend_code text unique like 'YAC-XXXX', referred_by uuid → profiles, email_opt_in bool default true, points int default 0 **(current cycle total, maintained by ledger trigger)**, created_at)
- `events` (id uuid, cycle_id, title, campus text check in ('duke','unc','ncsu','all'), cross_campus bool, kind text check in ('home','cross_campus','panel') **(since 0002: kind decides points — cross_campus → Tier 1 and campus forced to 'all'; home/panel → Tier 2 and need a host campus; cross_campus flag is derived)**, location, starts_at, ends_at, check_in_grace_minutes int default 60, activity_id text → activities, attendee_count int default 0, created_by uuid, created_at)
- `event_secrets` (event_id uuid pk → events on delete cascade, password text) — admins only.
- `event_rsvps` **(0022)** (event_id → events on delete cascade, user_id → profiles on delete cascade, created_at; pk (event_id, user_id)) — written only by `set_rsvp()`.
- `submissions` (id uuid, cycle_id, user_id, activity_id, event_id null, image_path text — storage path in bucket `proofs`, note text ≤280, status text 'pending'|'approved'|'rejected', reviewer_id, review_reason, created_at, reviewed_at)
- `ledger` (id bigint identity, cycle_id, user_id, amount int ≠ 0, source text check in ('checkin','submission','manual','referral'), activity_id null, ref_id text null, reason text, created_by uuid null, created_at)
- `prize_claims` (id uuid, cycle_id, spot int, user_id, display_name text, campus text, qualified_at, status text 'qualified'|'info_submitted'|'fulfilled'|'revoked', reference text, contact jsonb {fullName,email,preference,notes}, fulfilled_at, revoked_at, revoke_reason). Partial unique indexes: (cycle_id, spot) where status <> 'revoked'; (cycle_id, user_id) where status <> 'revoked'.
- `notifications` (id uuid, user_id, kind text, title, body, read bool default false, created_at)
- `prize_suggestions` (id uuid, user_id, idea text ≤300, created_at)
- `sync_status` (id int pk =1, last_sync_at, rows_pushed, rows_pulled, conflicts, state text default 'not_configured', sheet_url text)

### RLS read rules
- `profiles`: own row; admins read all.
- `events`: any authenticated user. `event_secrets`: admins only. `event_rsvps` (0022): own rows only (counts via `event_rsvp_summary()`, lists via `admin_event_rsvps()`).
- `activities`, `app_config`, `cycles`: any authenticated user (app_config/activities also anon).
- `submissions`, `ledger`, `notifications`: own rows; admins read all (notifications: own only).
- `prize_claims`: own rows; YACquest Chairs read all. (Public view of the race is the `prize_status()` RPC — no contact info.)
- `prize_suggestions`: admins.
- `sync_status`: YACquest Chairs.
- Storage bucket `proofs` (private): authenticated users may upload only under `<their uid>/…`; read own files; admins read all.

## Triggers
1. **New auth user → profile** (`after insert on auth.users`, security definer). Reads `raw_user_meta_data`: `handle`, `display_name`, `campus`, `avatar`, `friend_code` (optional, the *referrer's* code). Generates a unique `friend_code` (`YAC-` + 4 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`). Role = `chair` if email in `chair_bootstrap`, else `participant`. Inserts a welcome notification. Invalid/duplicate handle → raise so signup fails (front end pre-checks with `handle_available`).
2. **Ledger insert → points + prize race** (`after insert on ledger`): recompute `profiles.points` = sum of ledger for user in active cycle, then call `refresh_prize_race(cycle_id)` which, under `lock table prize_claims in share row exclusive mode`:
   - **revokes** any non-revoked, non-fulfilled claim whose user now has `points < prize_goal` (status 'revoked', revoked_at, revoke_reason 'Points fell below the goal after a correction', notify the user);
   - **fills open spots** (lowest free spot numbers 1..prize_count) with eligible participants (`role='participant'`, `points >= prize_goal`, no active claim) **ordered by the time they most recently crossed the goal** (running ledger sum; tie → ledger id), notify each winner ("You won spot #N!").

## RPC functions (all `security definer`, `set search_path = public`)
Anon-callable:
- `handle_available(p_handle text) → boolean`
- `friend_code_exists(p_code text) → boolean`

Participant (authenticated):
- `dashboard_stats() → json {points, rankOverall, rankCampus, participants, referralsUsed, unreadCount}` (ranks: 1 + count of participants with more points; participants = count role 'participant')
- `leaderboard(p_limit int default 10, p_campus text default null) → table(rank int, user_id uuid, display_name text, campus text, avatar text, points int)` — participants only, ordered points desc, display_name asc; ties share rank (`rank()` window).
- `my_rank() → same row shape` (null if not a participant)
- `campus_cup() → table(campus text, members int, total_points int, per_capita numeric)` per-capita desc
- `prize_status() → json {goal, total, remaining, claims:[{spot,userId,displayName,campus,qualifiedAt,status}]}` (non-revoked claims, spot asc)
- `check_in(p_event_id uuid, p_password text) → json {points int, activityId text}` — rules: event exists (`not_found`); now ≥ starts_at − 30 min (`not_open`); now ≤ ends_at + grace (`expired`); not already checked in (ledger source 'checkin' ref_id = event id → `duplicate`); password case-insensitive trimmed match (`wrong_password`). Activity: cross_campus or campus='all' → `cross_campus_event` (tier 1); kind 'panel' → `panel_mentorship`; else `home_event`. Inserts ledger, bumps attendee_count. **Referral:** if this is the user's first check-in this cycle and `referred_by` is set and the referrer has < referrals_per_cycle 'referral' rows this cycle → ledger tier-1 'referral' for referrer (activity `bring_new_alum`, ref_id = new user id) + notification.
- `can_submit(p_activity_id text, p_event_id uuid default null) → text` (null = OK, else friendly reason) — same rules as the mock's `submissionBlocker`: method must be screenshot/photo; once-per-cycle for `annual_fund`, `follow_ig`; tier-3 combined ≤ digital_per_week per ISO week (America/New_York, Monday start), counting pending+approved; `social_tag` ≤ social_tag_per_month per calendar month; `event_photos` needs an event the user checked into, ≤ photos_per_event per event, ≤ photos_per_cycle per cycle.
- `submit_proof(p_activity_id text, p_event_id uuid, p_image_path text, p_note text) → submissions row` — re-runs `can_submit` (`limit`), image_path must start with `<uid>/` (`file_type`), note ≤ 280.
- `submit_claim_info(p_full_name text, p_email text, p_preference text, p_notes text) → json claim` — own active claim (`no_claim`), not fulfilled; sets contact, status 'info_submitted', reference `YQ-<year>-<spot 2 digits><4 random>` if null.
- `suggest_prize(p_idea text)` (3–300 chars)
- `mark_notifications_read(p_ids uuid[] default null)` (null = all own)
- `update_profile(p_display_name text, p_avatar text, p_email_opt_in boolean) → profiles row` (nulls = unchanged; also updates display_name on own claims)

Admin (`is_admin()` else `forbidden`):
- `review_submission(p_id uuid, p_decision text, p_reason text)` — pending only (`already_reviewed`); reject needs reason (`reason`); approve → ledger tier points (source 'submission', ref_id submission id) + notification; reject → notification with reason.
- `adjust_points(p_user_id uuid, p_amount int, p_reason text)` — integer, ≠0, |x| ≤ 500 in 0001; **since 0003: at most +tier1_points (35) per entry, removals down to −prize_goal (−350)** (`amount`); reason ≥3 chars (`reason`); ledger source 'manual' + notification.
- `award_activity(p_user_id uuid, p_activity_id text, p_note text)` — ledger tier points, source 'manual', reason "<title>: <note>" + notification.
- `search_users(p_query text, p_limit int default 20) → table(id, handle, display_name, email, campus, role, points)`
- `admin_list_events() → table(events.* + password text)` newest first
- `create_event(p_event jsonb) → json event incl. password` — keys: title, campus, crossCampus, kind, location, startsAt, endsAt, checkInGraceMinutes, password. Validates title ≥3, password ≥4, ends > starts. Derives activity_id like check_in.
- `update_event(p_id uuid, p_event jsonb) → json event`
- `delete_event(p_id uuid)` — refuse if attendee_count > 0 (`has_attendees`)
- `admin_overview() → json {participants, activeThisWeek, pointsThisWeek, pendingReviews, newSignupsThisWeek, prize (same as prize_status), nearGoal:[leaderboard rows within 75 of goal (100 before 0014), unclaimed, top 10]}`

YACquest Chair (`is_chair()` else `forbidden`):
- `list_team() → table(id, display_name, handle, email, role, email_verified boolean)` — admins + YACquest Chairs
- `set_role(p_user_id uuid, p_role text)` — p_role in ('participant','admin') only (0011 adds 'chair'); target must not be a YACquest Chair (`forbidden`); for 'admin' target email must be confirmed (`not_verified`); notify target.
- `transfer_chair(p_user_id uuid)` — target ≠ caller, email confirmed; the number of YACquest Chairs stays ≤ max_chairs (2 in 0001, 6 since 0011): target → YACquest Chair, caller → admin; notify both.
- `list_claims() → setof prize_claims` (all statuses, spot asc then revoked last)
- `mark_fulfilled(p_spot int)` — active claim in active cycle + notify.
- `reset_cycle(p_confirm text, p_name text, p_ends_at timestamptz)` — p_confirm = 'RESET' (`confirm`); archive current cycle (is_active false, archived_at now()), create new active cycle, set all profiles.points = 0, notify all participants. Ledger/claims/submissions stay (they belong to the old cycle_id).
- `archives() → table(cycle name, archived_at, ledger_rows bigint, winners json)`

## Storage
Bucket `proofs`, private, 5 MB limit, image mime types only. Path: `<uid>/<uuid>.jpg`. Admin review screens use `createSignedUrls` (1 hour). Front end uploads after `can_submit` passes, then calls `submit_proof` with the path.

## Auth (Supabase dashboard settings — see SETUP.md)
Email + password; **Confirm email ON**; min password length 8; PKCE flow. Redirects: confirmation → `<site>?confirmed=1`, password reset → `<site>?reset=1` (query string, not hash, because the app uses HashRouter).

---

## 0004 — Emails, action log, winner form, $75 × 4 prizes (no Google Sheets)

**Config:** `app_config.prize_count = 4`, `prize_value_usd = 75`. Drop table `sync_status` (Google Sheets sync is cancelled).

### New tables (RLS on; **YACquest Chairs read**, nobody writes directly; writes via RPCs/triggers)
- `report_settings` (id int pk check id=1, weekly_enabled bool default true, weekly_day int 0–6 default 1 (0=Sunday, America/New_York), weekly_hour int 0–23 default 9, near_goal_points int default 150 **(75 since 0014; 0016 briefly set 50, now a no-op; 75 since 0018)**, recipients text[] default '{}' (extra emails), include_chairs bool default true, include_admins bool default true, prize_alerts_enabled bool default true, updated_at, updated_by uuid). Seed one row.
- `email_outbox` (id uuid, kind text check in ('weekly_report','prize_qualified','prize_info','test'), to_emails text[] not null, subject text, body_text text, body_html text, dedupe_key text unique not null, status text check in ('pending','sending','sent','failed') default 'pending', attempts int default 0, last_error text, created_at, sent_at). **dedupe_key prevents duplicate reports/alerts.**
- `admin_actions` (id bigint identity, actor_id uuid null, actor_name text, action text, target_user_id uuid null, target_name text, details jsonb default '{}', created_at default now()). Append-only.

### Recipients
`report_recipients() → text[]` (internal): distinct lower-case emails from `report_settings.recipients` ∪ (YACquest Chairs if include_chairs) ∪ (admins if include_admins), only profiles whose auth email is confirmed.

### Weekly committee report
`build_weekly_report() → json {subject, text, html}` (internal). Contents: spots left (`N of 4 left`); **Close to the prize**: participants with no active claim and points ≥ goal − near_goal_points, ordered by points desc, showing name, campus, points, points to go (this is the "Johnny is dominating" shout-out list); top 5 overall; Campus Cup per-capita; this week (Mon 00:00 NY): active participants, points awarded, new sign-ups; pending reviews; days left in cycle. Simple inline-styled HTML (navy/gold), plain-text twin.
- `enqueue_weekly_report_if_due() → boolean` — **service_role only**. If weekly_enabled and now (NY) is on/after weekly_day+weekly_hour of the current ISO week, insert with dedupe_key `weekly:<IYYY-IW>` (on conflict do nothing). Returns true if a row was inserted. No recipients → do nothing.
- `send_weekly_report_now() → void` — YACquest Chair; dedupe_key `weekly-manual:<epoch ms>`.
- `weekly_report_preview() → json {subject, text, html, recipients text[]}` — admin or YACquest Chair.
- `send_test_email() → void` — YACquest Chair; to the caller's email, kind 'test', dedupe `test:<uuid>`.

### Prize alerts (triggers on `prize_claims`, only if prize_alerts_enabled and recipients exist)
- After insert (a new winner): kind 'prize_qualified', dedupe `prize_qualified:<claim id>`, subject `🏆 YACquest: <name> won spot #N`, body says they're waiting for delivery info.
- After update when `contact` changes and is not null: kind 'prize_info', dedupe `prize_info:<claim id>:<md5(contact::text)>`, subject `URGENT 🎁 YACquest winner info: <name> (spot #N)`, body lists full name, email, phone, mailing address, gift card preference, notes, reference, campus.

### Sending (Edge Function `send-emails`, run every 10 min by Supabase Cron)
- `claim_email_batch(p_limit int default 20) → setof email_outbox` — service_role only. Picks rows with status 'pending', or 'failed' with attempts < 5, or 'sending' older than 15 min; sets status 'sending', attempts+1; returns them (`for update skip locked`).
- `mark_email_result(p_id uuid, p_ok boolean, p_error text)` — service_role only. ok → 'sent', sent_at now(), last_error null; else 'failed', last_error = left(p_error, 500).
- YACquest Chair: `email_log(p_limit int default 50) → table(id, kind, to_emails, subject, status, attempts, last_error, created_at, sent_at)` newest first; `retry_email(p_id uuid)` → status 'pending', attempts 0.
- YACquest Chair: `get_report_settings() → json` (camelCase: weeklyEnabled, weeklyDay, weeklyHour, nearGoalPoints, recipients, includeChairs, includeAdmins, prizeAlertsEnabled, updatedAt) and `update_report_settings(p_settings jsonb) → json` (same keys, any subset; validate day 0–6, hour 0–23, near_goal_points 0–1000, recipients valid emails ≤ 20).

### Winner form
`submit_claim_info(p_full_name text, p_email text, p_phone text, p_address text, p_preference text default null, p_notes text default null) → json claim` — drop the old 4-argument version. Validation codes: `fullName` (≥2), `email`, `phone` (≥7 digits), `address` (≥10 chars). Contact jsonb keys: fullName, email, phone, address, preference, notes. Everything else as before.

### Admin action log (triggers; actor = auth.uid(), null = system)
Actions: `points_added` / `points_removed` (ledger insert with created_by and source 'manual'; details {amount, reason, activityId}), `submission_approved` / `submission_rejected` (status change; details {activityId, reason}), `role_changed` (details {from, to}), `event_created` / `event_updated` / `event_deleted` (details {title, kind, campus}), `prize_fulfilled` / `prize_revoked` (details {spot, reason}), `cycle_reset` (details {name}), `report_settings_changed` (details = changed keys). actor_name/target_name are display names at the time.
- `admin_action_log(p_limit int default 100, p_before bigint default null) → table(id, actor_name, action, target_name, details, created_at)` — **YACquest Chair**, newest first, keyset paging by id.

---

## 0005 — Event kinds are the three tiers
`events.kind` ∈ ('high_impact','active','digital') → activities `cross_campus_event` ("High-Impact Event", Tier 1), `home_event` ("Active Event", Tier 2), `digital_event` ("Digital Event", Tier 3, new). Campus is chosen independently ('duke','unc','ncsu','all'); `cross_campus` = (campus = 'all'). Points always come from the tier via app_config. `panel_mentorship` is no longer used for new events (kept for history).

---

## 0006 — Announcements
- Table `announcements` (admins read via RLS). `send_announcement(p_title, p_body, p_audience 'all'|'campus'|'user', p_campus, p_user_id, p_send_email) → json {id, recipients, emailed}` — admin/YACquest Chair; any admin or YACquest Chair may email 'all' (only YACquest Chairs until 0012); 20 per sender per day (`limit`); codes `title`, `body`, `audience`, `campus`, `user`.
- Creates one `notifications` row (kind 'announcement') per target; Home shows the latest 3. Email copy → `email_outbox` kind 'announcement', ≤ 90 BCC per row, only opted-in confirmed emails (a direct message always emails that person). Logged as `announcement_sent`.
- `list_announcements(p_limit default 20)` — admin/YACquest Chair, newest first, snake_case rows.

---

## 0007 — Characters
`profiles.avatar` ∈ ('yak','unicorn','dragon','knight','mage','ranger').

## 0008 — Feedback
- Table `feedback` (id, user_id, category 'idea'|'bug'|'event'|'other', message 3–1000, status 'new'|'reviewed', reviewed_by, reviewed_at, created_at); admins read via RLS. `prize_suggestions` gains status/reviewed_by/reviewed_at.
- `submit_feedback(p_category, p_message) → json {id}` (10/day, codes `category`, `message`, `limit`).
- `list_feedback(p_status default null, p_limit default 50)` admin → feedback + prize suggestions (kind 'feedback'|'prize'), newest first.
- `mark_feedback_reviewed(p_kind, p_id)` admin; logged as `feedback_reviewed`.
- `build_weekly_report()` adds "💬 Feedback (last 7 days)".

---

## 0009 — Quest extras (badges, wardrobe, shout-out — weekly here, monthly since 0012)
- `profiles` + `hat`, `accessory`, `background` (nullable). Table `cosmetics(id, slot, name, rule_type, rule_value, sort_order)` mirrors `src/lib/cosmetics.ts`.
- `my_badges() → table(id, earned, progress, goal)` (current cycle, order of `src/lib/badges.ts`). Badges never award points.
- `my_unlocks() → text[]`; `equip_look(p_hat, p_accessory, p_background) → json {hat, accessory, background}` ('' clears; errors `locked`, `look`).
- `leaderboard(p_limit int default 10, p_campus varchar default null)` and `my_rank(p_campus text default null)` now also return `hat, accessory, background`.
- ~~`weekly_shoutout()`~~ — replaced by `monthly_shoutout()` in 0012.
- Weekly email gains the shout-out (monthly since 0012) after the headline.

## 0010 — Name filter
- `name_is_clean(text)` (internal) mirrors `src/lib/nameFilter.ts`. Enforced in `handle_new_user` (codes `handle` / `displayName`), `update_profile`, and `handle_available` (false for unclean handles).
- `admin_rename_user(p_user_id, p_display_name)` — admin/YACquest Chair; renames, updates active claims, notifies the user, logs `user_renamed` {from, to}.

---

## 0011 — More YACquest Chairs (`max_chairs`; 6 for 2026–27)
- `app_config.max_chairs int default 5 (set to 6 for 2026–27)` (`MAX_CHAIRS` in src/config.ts).
- `set_role(p_user_id, p_role)` now accepts 'participant' | 'admin' | **'chair'** (caller must be a YACquest Chair). Making a YACquest Chair: target email must be confirmed (`not_verified`) and current YACquest Chairs < max_chairs (`chair_limit`: "There are already 6 YACquest Chairs." — wording since 0023). A YACquest Chair still can't demote another YACquest Chair (`forbidden`).
- `step_down_chair() → void`: caller (a YACquest Chair) becomes 'admin'; refused if they're the only YACquest Chair (`last_chair`: "You're the only YACquest Chair — make someone else a YACquest Chair first." — wording since 0023). Notifies the caller; logged as role_changed.
- `transfer_chair` unchanged. Bootstrap emails (chair_bootstrap) become YACquest Chairs on sign-up while YACquest Chairs < max_chairs.

---

## 0012 — Admins email everyone; Adventurer of the Month
- `send_announcement(...)`: same signature; **admins and YACquest Chairs** may send audience 'all' with `p_send_email = true`. Participants still get `forbidden` for any announcement.
- `monthly_shoutout() → json {userId, displayName, campus, avatar, hat, accessory, background, look, pointsThisMonth, month 'YYYY-MM', final boolean}` or null — any logged-in user. Replaces `weekly_shoutout()` (dropped, with `weekly_shoutout_data()`).
  - Counts **positive** ledger rows of the **active cycle**, **participants only** (current role), grouped by **America/New_York calendar month**.
  - Shows the winner of the most recent completed month (last month) → `final: true`. If nobody earned points last month in this cycle (e.g. the cycle started this month), falls back to the current month's leader so far → `final: false`. Older months are never shown. null if nobody earned points last month or this month.
  - Ties: whoever reached that month's total first (earliest time of their last positive row that month), then display name, then user id.
  - Internal helpers (not callable through the API): `monthly_standings()`, `monthly_shoutout_data()`, `month_label('YYYY-MM') → 'November'`.
- Badges: `my_badges()` now returns **15** badges (**16** since 0022, which adds `hot_streak`); new last one `monthly_star` ("Adventurer of the Month", goal 1) = number of completed months in this cycle the user won (same rule as above). The other 14 are unchanged. Rainbow still needs 6 badges.
- Weekly committee email stays weekly; its "⭐ Adventurer of the month" section shows `monthly_shoutout` ("<name> (<campus>) — N points in <Month>", or "Leading <Month> so far: …", or "No points earned this month yet."). When a weekly report is queued and the shout-out is `final`, the winner gets a notification "⭐ You’re Adventurer of the Month!" — at most once per calendar month.

---

## 0013 — Launch extras (anonymous feedback, sign-up email opt-in, attendance list)
- `feedback.anonymous boolean not null default false`.
- `submit_feedback(p_category, p_message, p_anonymous boolean default false) → json {id}` — same rules/codes as 0008. The old 2-argument version is dropped; 2-argument calls still work through the default. The sender (`user_id`) is always stored (10/day limit, "Voice of the Herd" badge).
- `list_feedback(p_status varchar default null, p_limit int default 50)` now also returns `anonymous boolean`. Anonymous rows: `display_name = 'Anonymous'`, `handle` and `campus` null. (`p_status` is varchar so re-running 0008 can't clash — the old `(text, int)` version is dropped.)
- `build_weekly_report()`: copy of 0012; in "💬 Feedback (last 7 days)" anonymous rows show **Anonymous** (no name, handle or campus).
- `handle_new_user()`: copy of 0011; reads `raw_user_meta_data.email_opt_in` (sign-up checkbox "Email me announcements from YAC") into `profiles.email_opt_in`. Missing → true. `email_opt_in` only controls whether **admin announcements** are also emailed (`send_announcement`); there is no participant weekly email.
- `admin_event_attendees(p_event_id uuid) → table(user_id, display_name, handle, campus, checked_in_at, points)` — admin or YACquest Chair (else `forbidden`); unknown event → `not_found`. One row per check-in ledger row (`source = 'checkin'`, `ref_id = event id`) as recorded, oldest first.
- Check-in QR links (front end only, no DB change): `<site>#/checkin?event=<eventId>&code=<password>[&title=<title>]` calls the existing `check_in()`.

## 0014 — Prize goal 350 (fewer events this year)
- YAC runs only ~6 more events and posts every other week, so `app_config.prize_goal` = **350** (column default too). Tier points (35/20/5), 4 spots and $75 are unchanged. After setting the goal it runs `refresh_prize_race(active_cycle_id())`, so anyone already at 350+ claims a spot in the order they crossed.
- `badges_for()`: copy of 0012; the `halfway` goal is now half the prize goal, rounded up (**175**), instead of a hard-coded 325. `legend` already used `prize_goal`.
- `cosmetics`: Sparkle Aura (`sparkles`) unlocks at **300** points (was 500). Same in `src/lib/cosmetics.ts`.
- `admin_overview()`: copy of 0001; `nearGoal` = within **75** of the goal (was 100).
- `report_settings.near_goal_points` default **75** (was 150); the existing row is moved from 150 to 75 (a different value chosen by a YACquest Chair is kept).
- Manual removals in `adjust_points` are capped at the goal, so now at −350.

## 0015 — Yak puns
- `yak_pun(p_seed int) → text` — internal (no API grant). One pun from a fixed list of 40: `list[|seed| mod 40]` (null seed = 0). The list is a copy of `src/lib/yakPuns.ts`, same order; `src/__tests__/yakPuns.test.ts` parses the migration and fails if they drift, so change both together.
- `yak_pun_of_the_week() → text` — internal. Seed = America/New_York ISO week as `YYYYWW` (`to_char(…, 'IYYYIW')`, e.g. 202645), same as `yakPunOfTheWeek()` in the app.
- `build_weekly_report()`: copy of 0013 plus a footer line **🐂 Yak of the week: …** (text and HTML).
- `on_prize_claim_alert()`: copy of 0004 plus the same line in both admin prize alerts (`prize_qualified`, `prize_info`). Dedupe keys unchanged. Participant announcement emails are not changed.
- App only (no DB): Home shows **🐂 Yak of the day** under the greeting (same pun for everyone each NY date, `yakPunOfTheDay()`), the login tagline shows it too, and treasure-map checkpoint pop-ups add a random pun.

## 0016 — Prize goal 300 (superseded by 0018; a no-op since the 0019 pass)
**Now does nothing.** Its statements were removed because 0018 undoes all of them and re-running them on a live database handed a prize spot to anyone at 300–349 (which 0018 then revoked). What it originally did:
- `app_config.prize_goal` = **300** (column default too); 0016 runs after 0003 (650) and 0014 (350), so running every migration in order ends at 300. 0015 does not touch the goal. Then `refresh_prize_race(active_cycle_id())` (inside a `do` block, so the SQL Editor shows no result box) gives anyone already at 300+ a spot in the order they crossed. Tier points (35/20/5), 4 spots and $75 unchanged.
- `halfway` badge: no function change — `badges_for()` from 0014 already uses half the goal rounded up, now **150**. `legend` = 300.
- `cosmetics`: Sparkle Aura (`sparkles`) unlocks at **275** points (was 300 = the goal). Same in `src/lib/cosmetics.ts`.
- `report_settings.near_goal_points` default **50** (was 75); the existing row is moved from 75 to 50 (a different value chosen by a YACquest Chair is kept). `admin_overview()` `nearGoal` stays within **75** of the goal.
- Manual removals in `adjust_points` are capped at the goal, so now at −300.

## 0017 — Consistency pass (no rule changes)
- `app_config` column defaults: `tier1_points` **35** (was 40) and `max_chairs` **6** (was 5). The existing row already had these values.
- `badges_for()`: copy of 0014; only the fallback goal used when `app_config` has no row changes from 350 to **300**.
- `handle_new_user()`: copy of 0013; only the chair-bootstrap fallback (if `max_chairs` were null) changes from 5 to **6**.
- `send_announcement()`: copy of 0012; only the email footer changes, to name the real setting: "To stop announcement emails, turn off “Email me announcements from YAC” in the app under Me → Settings."
- App only (no DB): `CYCLE.displayStart` (Nov 8, 2026, the first event) is the start date shown in Rules, Sign-up, Help and Admin → System. `CYCLE.start` and `cycles.starts_at` stay Oct 15, 2026.

## 0018 — Prize goal back to 350
- `app_config.prize_goal` = **350** (column default too); running every migration in order ends at **350** (0014 also sets 350; since the 0019 pass 0003 no longer sets 650 and 0016 is a no-op). Then `refresh_prize_race(active_cycle_id())` (inside a `do` block) gives anyone already at 350+ a spot in the order they crossed, **and revokes** any open claim (qualified / info submitted, not fulfilled) whose holder is below 350, with a "Your prize spot was released" notification. Tier points (35/20/5), 4 spots and $75 unchanged.
- `badges_for()`: copy of 0017; only the fallback goal used when `app_config` has no row changes from 300 to **350**. `halfway` = half the goal rounded up = **175**, `legend` = 350.
- `cosmetics`: Sparkle Aura (`sparkles`) back to **300** points (was 275). Same in `src/lib/cosmetics.ts`.
- `report_settings.near_goal_points` default **75** (was 50); the existing row is moved from 50 to 75 (a different value chosen by a YACquest Chair is kept). `admin_overview()` `nearGoal` stays within **75** of the goal.
- Manual removals in `adjust_points` are capped at the goal, so now at −350 again.
- App: `PRIZE.goal` = 350; treasure-map checkpoints Trailhead 50 · Camp 100 · Halfway 175 · Summit 250 · Treasure 350.

## 0019 — Consistency pass for the 350 goal (no rule changes)
- `set_role()` and `transfer_chair()`: copies of 0011; only the fallback YACquest Chair limit (used if `app_config.max_chairs` were null — it is NOT NULL, 6) changes from 5 to **6**. Same signatures and grants.
- Old migrations made re-run safe for the goal: `0003` no longer sets `prize_goal = 650`, and `0016` (goal 300) is now a no-op, so running every migration again on a live database never hands out or revokes spots at a stale goal.
- Final state after all migrations: `prize_goal` 350 (default 350), Halfway 175, Quest Legend 350, cosmetics Sunset 50 · Flower Crown 100 · Starry Night 200 · Gold Chain 250 · Sparkle Aura 300, `near_goal_points` 75 (default 75), `admin_overview()` `nearGoal` within 75 of the goal, manual removals down to −350, `max_chairs` 6.

## 0020 — Staff-only rewards (Hero of the Week, Council wardrobe + badges, Golden Yak)
Everything here is for **admins + YACquest Chairs only**; the server filters by role, not just the UI. Participants get `null` from `my_staff_rewards()`, `forbidden` from the rest, and the plain `look` / `avatar` errors if they try to wear any of it. Nothing participants already see changes: `my_badges()`, `my_unlocks()`, `leaderboard()`, `my_rank()`, `monthly_shoutout()` are untouched and only ever list participants, so a staff look can't show up there.

### New tables (RLS on, **no policies, no grants**: RPC-only, not even readable by staff directly)
- `staff_cosmetics` (id pk, slot hat|accessory|background, name, rule_type staff|reviews|announcements|hosted|grant|hero, rule_value int, sort_order). Mirrors `STAFF_COSMETICS` in `src/lib/staffRewards.ts` (kept out of the public `cosmetics` table on purpose).
- `hero_reigns` (id uuid pk, seq identity, user_id → profiles, note text ≤ 120, crowned_by, crowned_at, ended_at, ended_by). Unique partial index: at most one row with `ended_at is null` (the reigning hero). No auto-expiry.
- `staff_grants` (user_id, reward_id wizard_council_hat|royal_scepter|starlit_throne|council_mvp, granted_by, granted_at; pk user_id + reward_id).
- `profiles.normal_avatar` text: the last normal character, restored when a Golden Yak goes back to participant. `profiles.avatar` check now also accepts `golden_yak`.

### Rules (staff work counts **all-time**, not per cycle)
| Item | Slot | Unlock |
|---|---|---|
| Council Chamber | background | every admin/YACquest Chair |
| Gatekeeper’s Monocle | accessory | reviewed 25 submissions (`submissions.reviewer_id`, approved or rejected) |
| Herald’s Horn | accessory | sent 5 announcements (`announcements.created_by`) |
| Event Host Top Hat | hat | created 3 events (`events.created_by`) that each reached 5 check-ins (`attendee_count >= 5`) |
| Wizard Council Hat · Royal Scepter · Starlit Throne Room | hat · accessory · background | YACquest Chair grant only |
| Hero’s Crown · Hero’s Cape · Hall of Heroes | hat · accessory · background | only while reigning Hero of the Week; taken off automatically when the reign ends |

Council badges (`staff_badges_for(uuid)`, order = `STAFF_BADGES`): `gatekeeper` (25 reviews), `town_crier` (5 announcements), `event_host` (3 events with 5+ check-ins), `hero_week` (progress = times crowned, **not capped**, goal 1), `council_legend` (progress 0–4: the three above + crowned at least once).
**Golden Yak** (`avatar = 'golden_yak'`): staff with `council_legend` **or** a `council_mvp` grant (`legendary_for(uuid)`).

### RPCs
- `my_staff_rewards()` → json `{isHero, heroCount, unlocks: text[], badges: [{id, earned, progress, goal}], legendary, grants: text[]}`, or **null** for participants.
- `hero_board()` (admins + YACquest Chairs) → json `{current: reign|null, history: [reign…] newest first, team: [{userId, displayName, handle, role, campus, avatar, hat, accessory, background, isHero, heroCount, grants, legendary}]}`; reign = `{id, userId, displayName, campus, avatar, hat, accessory, background, note, crownedAt, crownedByName, endedAt}`.
- `crown_hero(p_user_id uuid, p_note text default '')` (YACquest Chairs): target must be admin/YACquest Chair (`not_staff`), note ≤ 120 (`note`). Ends the current reign (taking hero items off the previous hero unless it's the same person), starts a new one, notifies the hero (kind `hero_crowned`, "You’re Hero of the Week!"), logs `hero_crowned` `{note}`.
- `clear_hero()` (YACquest Chairs): ends the reign, takes hero items off, logs `hero_cleared`. `not_found` if nobody reigns.
- `grant_staff_reward(p_user_id uuid, p_reward text)` (YACquest Chairs): `reward` (unknown id), `not_staff`, `already`. Notifies (kind `staff_reward`) and logs `staff_reward_granted` `{reward, name}`. `council_mvp` = Council MVP (unlocks the Golden Yak).
- `equip_look(…)`: copy of 0009 + staff items (staff only and unlocked → else `locked`; participants get `look`, as for any unknown item).
- `update_profile(…)`: copy of 0010 + `golden_yak` only when `legendary_for(caller)` (else `avatar`); keeps `normal_avatar` up to date.
- Internal (no API access): `is_staff_user`, `staff_stats`, `staff_badges_for`, `staff_unlocks_for`, `legendary_for`, `strip_staff_look`, `hero_reign_json`.

### Back to participant
Trigger `profiles_staff_rewards_role` (before update of `role`): when an admin/YACquest Chair becomes a participant (only `set_role` can do that), staff items come off, a Golden Yak goes back to `normal_avatar` (or `yak`), and a current reign ends (logged `hero_cleared` with `{reason: 'role_changed'}`). Reigns, grants and work counts are kept, so everything returns if they become staff again.

**Re-run note:** 0007 re-creates the avatar check without `golden_yak`. If you ever re-run 0007 after 0020, run 0020 again right after (0007 fails while someone is a Golden Yak; switch them back first).

## 0021 — Council team board (staff only, view-only)
- `council_board()` (admins + YACquest Chairs; participants get `forbidden`) → json array, one row per admin/YACquest Chair: `{userId, displayName, handle, role, campus, avatar, hat, accessory, background, isHero, heroCount, badges: [{id, earned, progress, goal}] (0020 Council badges, same order), unlockCount (Council items they can wear now, hero perks included while reigning), legendary}`. Sorted: reigning hero first, then YACquest Chairs, then admins, then display name.
- Shown in Admin → **Council** (all staff). Crowning and granting stay in Admin → Heroes (YACquest Chairs). Nothing else changes.

## 0022 — Event RSVPs, monthly check-in streaks, Hot Streak badge, My Quest Card
Additive only: no point values, caps or prize rules change.

### RSVPs
- Table `event_rsvps (event_id → events on delete cascade, user_id → profiles on delete cascade, created_at; PK (event_id, user_id))`. RLS on: `select` own rows only (`user_id = auth.uid()`); no write policies (writes only through `set_rsvp`). No points.
- `set_rsvp(p_event_id uuid, p_going boolean)` (any signed-in user, participants + staff) → json `{eventId, going, goingCount}`. Idempotent. Errors: `not_found` (unknown event or not in the active cycle), `going` (null), `closed` ("RSVPs close when the event starts." — on **and** off are refused once `now() >= starts_at`).
- `event_rsvp_summary()` → json `[{eventId, goingCount, myRsvp}]` for every event of the active cycle (counts only — participant-safe). The app merges it into `listEvents()` as `goingCount` / `myRsvp`.
- `admin_event_rsvps(p_event_id uuid)` (admins + YACquest Chairs; participants get `forbidden`) → table `(user_id, display_name, handle, campus, email, rsvp_at, checked_in boolean)`, oldest RSVP first. `checked_in` = a ledger row with `source = 'checkin'` and `ref_id = event id`. `not_found` for an unknown event.
- `admin_event_rsvp_counts()` (admins + YACquest Chairs, `forbidden` otherwise) → table `(event_id, going, going_came)`. Admin → Events shows "going · came" (came = `attendee_count`) and, for past events, "RSVP'd but didn't come" = `going − going_came`.

### Monthly check-in streaks
- Internal `checkin_streak(p_user uuid)` → `(current_streak, best_streak, this_month)`: distinct America/New_York calendar months with a `ledger` row `source = 'checkin'`, `amount > 0`, active cycle. `current` = the run ending this month, or — when there's no check-in yet this month — the run ending last month (`this_month = false`, the app says "Check in this month to keep your streak!"); 0 if neither month has one. `best` = longest run this cycle.
- `my_streak()` → json `{current, best, checkedInThisMonth}`. The app adds it to the dashboard as `streak` (zeros if 0022 isn't installed yet).

### Hot Streak badge
- `badges_for()`: copy of 0018's + a 16th row `hot_streak` (goal 3, progress = `best_streak`). `my_badges()` therefore returns **16** badges. Staff Council badges (`staff_badges_for`) are unchanged.

### My Quest Card
- `my_recap()` (no arguments: always the caller) → json `{displayName, handle, campus, role, avatar, hat, accessory, background, points, earnedBadgeIds (badges.ts order), badgesEarned, badgeTotal, eventsAttended (distinct check-in events this cycle), currentStreak, bestStreak, monthWins (finished months won), cycleName, cycleEndsAt}` plus, for participants only, `{rankOverall, rankCampus, participants, campusParticipants}` (same formula as `dashboard_stats`), or for staff only `{councilBadges}` (earned Council badges). The card itself is drawn in the browser (`src/lib/questCard.ts`, lazy-loaded).

### Weekly committee email
- `build_weekly_report()`: copy of 0015 + one line before "This week": `📅 NEXT 7 DAYS (RSVPs): <title> (Tue Nov 10) · 12 going; …` (events of the active cycle starting in the next 7 days, soonest first; "No events scheduled." otherwise). Same line in the HTML.

### Grants
`badges_for`, `checkin_streak`, `build_weekly_report` are internal (revoked from everyone). `set_rsvp`, `event_rsvp_summary`, `admin_event_rsvps`, `admin_event_rsvp_counts`, `my_streak`, `my_recap`: revoked from `public, anon`, granted to `authenticated`.

## 0023 — "YACquest Chair" wording
The people with role `chair` run this app; they are not chairs of the YAC organization. 0023 only changes the human-readable text the server produces; the role value `chair`, every error **code** (the part before `': '`), rules and grants are unchanged.
- Re-created from their latest definitions with new wording only: `require_chair()` (0001; `forbidden: Only a YACquest Chair can do that.`), `set_role()` and `transfer_chair()` (0019), `step_down_chair()` (0011), `crown_hero()` and `grant_staff_reward()` (0020), `admin_event_attendees()` (0013), `admin_event_rsvps()` (0022).
- Notifications now say e.g. "You’re now a YACquest Chair", "You stepped down as YACquest Chair", "A YACquest Chair crowned you…".
- Grants restated as before: revoked from `public, anon`, granted to `authenticated`.

## 0024 — Small improvements (quick game-win award, RSVP reminders)
Additive only: no point values, caps or prize rules change.

### Quick game-win award (Admin → Events → Who came)
- `award_game_win(p_event_id uuid, p_user_id uuid, p_note text default null)` (admins + YACquest Chairs; participants get `forbidden`) → json `{points, eventId, userId}`. Awards the `game_win` activity at its tier value (Tier 2 = `tier2_points`) through the ledger exactly like `award_activity`: `source = 'manual'`, `created_by` = the admin, plus `ref_id` = the event id; reason `"Win a Game or Competition: <note>"` (default note `"Won a game at <event title>"`, trimmed, max 120 → `note`). Notifies the winner (`points_adjusted`, "+20 pts — Win a Game or Competition", body = the note). Logged by the 0004 ledger trigger as `points_added` like every manual award.
- Errors: `not_found` (unknown event / person), `not_checked_in` (no `checkin` ledger row for that event), `duplicate` (already awarded for that event — also enforced by the unique index `ledger_one_game_win` on `ledger (user_id, ref_id) where source = 'manual' and activity_id = 'game_win' and ref_id is not null`; older `award_activity` game wins have `ref_id` null and are unaffected).
- The app reads who already got one with a plain ledger select (admins can read the ledger): `source = 'manual'`, `activity_id = 'game_win'`, `ref_id = <event id>`.

### RSVP reminders (~1 hour before)
- Table `event_reminders_sent (event_id → events on delete cascade, user_id → profiles on delete cascade, sent_at; PK (event_id, user_id))`. RLS on, no policies, no grants: written only by `queue_event_reminders()`.
- `queue_event_reminders(p_now timestamptz default now())` → int (reminders queued). Service role / pg_cron only (`require_service_role`, execute revoked from everyone else). For every RSVP to an event with `p_now < starts_at <= p_now + 70 min`, not in `event_reminders_sent`, whose person has no `checkin` ledger row for it: inserts the `event_reminders_sent` row, then
  - notification `kind = 'event_reminder'`, title `"⏰ Starts in 1 hour: <title> at <location>"` (`"⏰ Starts in N min: …"` if the event starts in under 45 minutes, e.g. it was created at short notice), body `"<title> starts at 2:00 PM at <location>. Check in at the event to earn N points."` (Eastern time; N = the event's activity tier points);
  - if `profiles.email_opt_in` and the email is confirmed: `enqueue_email('event_reminder', [email], 'Reminder: <title> starts at 2:00 PM', …)` with dedupe key `reminder:<event_id>:<user_id>`. Short body: time, location, "Check in at the event to earn N points." No yak pun.
  Staff are included like anyone who RSVP'd. Deleted events (hard delete) take their RSVPs and reminder rows with them. Idempotent: calling it again (or every 10 minutes) never duplicates.
- **Trigger, no new setup:** `enqueue_weekly_report_if_due()` (which the `send-emails` Edge Function already calls at the start of every run, every 10 minutes via Supabase Cron) is re-created from 0012 with one extra first step: `perform queue_event_reminders()` inside its own `begin … exception` block (a reminder failure is logged as a warning and never blocks the weekly report or email sending). Reminders created in a run are claimed by `claim_email_batch` in the same run. Reminders go out 60–70 minutes before the start.
- `email_outbox.kind` check now also allows `'event_reminder'` (Admin → System → Email delivery log shows "Event reminder").

### Grants
`award_game_win`: revoked from `public, anon`, granted to `authenticated` (the function checks for admins). `queue_event_reminders`, `enqueue_weekly_report_if_due`: revoked from everyone, granted to `service_role` only.

### App-only changes (no SQL)
Home "📅 Today" chip + bell dot (an RSVP'd event today, Eastern time, not yet checked in — from `listEvents()`), full-screen check-in confirmation with a live clock, the "N more points to <next checkpoint>" line, "Start here" tips for brand-new players, campus-color avatar frames on Ranks / Adventurer of the Month, and **Duplicate** on Admin → Events (prefills the New event form one week later with a new password; nothing is saved until Save).

## 0025 — Admin tools (door mode data, bulk approve, stats, exports, templates, staff notes, undo)
Additive only: no point values, caps or prize rules change. Everything is staff-only (admins + YACquest Chairs) unless noted; participants get `forbidden`, anon can't call anything (execute revoked from `public, anon`, granted to `authenticated`).

### Bulk approve (Admin → Review)
- `review_submissions_bulk(p_ids uuid[])` → json `{approved, skipped, results: [{id, ok, code?, message?}]}`. Duplicate ids count once (first position kept); 0 ids → `empty`, more than 100 → `too_many`. Each id runs the existing `review_submission(id, 'approved')` inside its own sub-transaction, so its rules apply unchanged (`forbidden` own submission, `already_reviewed`, `not_found`) and one failure never rolls back the others. `message` is the friendly part of the error (no `code:` prefix). Caps are unchanged: they are enforced when proof is uploaded (pending proofs already count toward them), so approving can never push anyone past one. Each approval is logged by the 0004 submissions trigger (`submission_approved`) and notifies the person, exactly like a single approval. Rejections stay one at a time (they need a reason).

### Door mode + Who came CSV
- `admin_event_checkins(p_event_id uuid)` → table `(user_id, display_name, handle, email, campus, avatar, hat, accessory, background, checked_in_at, points)`, oldest first: the same rows as `admin_event_attendees` (0013) plus email + avatar/look. `not_found` for an unknown event. Door mode polls it (and `admin_event_rsvps`) every ~5 s.

### Stats (Admin → Stats)
- `admin_stats(p_now timestamptz default null)` → one json. **Participants only** (`role = 'participant'`); staff check-ins, RSVPs, points and sign-ups never count. Current cycle only. `p_now` (default `now()`) exists for tests.
  - `goal`, `cycle {name, startsAt, endsAt}`, `generatedAt`
  - `totals {participants, active30, points, checkins, approvals}` — `active30` = earned points (positive ledger row) in the 30 days before `p_now`
  - `signupsBefore` (joined before the cycle started), `signupsByWeek [{week, count}]` — Monday-start weeks in America/New_York from the cycle's first week to `p_now`'s week (zeros filled)
  - `events [{id, title, campus, kind, startsAt, going, came}]` — this cycle's events that have started, oldest first; `going` = participant RSVPs, `came` = participant check-ins
  - `campuses [{campus, members, active, points, perMember}]` (Duke, UNC, NC State; `perMember` rounded to 0.1 like `campus_cup`)
  - `milestones [{points, count}]` for 50, 100, ⌈goal/2⌉ (175), 250, goal (350): participants at or above
  - `distribution [{label, min, count}]` buckets 0 · 1–49 · 50–99 · 100–174 · 175–249 · 250–349 · 350+
  - `sources {event, digital, referral, staff, removed}` — positive points by ledger source (`checkin`, `submission`, `referral`, `manual`) and points removed by negative rows
  - `badges [{id, count}]` — participants who earned each badge (`badges_for`), most first
- `admin_participants_export()` → json array, **YACquest Chairs only** (admins: `forbidden`): `{displayName, handle, email, campus, points, badges[], eventsAttended, joinedAt, emailOptIn}` for every participant, by name. The app builds the CSV in the browser.

### Announcement templates (Admin → Announce → Templates ▾)
- Table `announcement_templates (id, title 1–80, body 1–1000, created_by → profiles on delete set null, created_at)`. RLS on, no policies, no grants.
- `list_announcement_templates()` → `(id, title, body, created_by, author_name, created_at, can_delete)` newest first (max 200). `save_announcement_template(p_title, p_body)` → json (trimmed; `title` / `body` errors; 30 per person → `too_many`). `delete_announcement_template(p_id)` — your own; YACquest Chairs any (`forbidden`, `not_found`). Placeholders like `{event}` are stored as typed and filled in by the app. Built-in templates live in `src/lib/announceTemplates.ts`, not the database.

### Staff notes on players (Admin → Players)
- Table `player_notes (id, user_id → profiles on delete cascade, author_id → profiles on delete set null, body 1–500, created_at)`. RLS on, **no policies, no table grants**: participants can never read notes, not even about themselves.
- `list_player_notes(p_user_id)` → `(id, body, author_id, author_name, created_at, can_delete)` newest first. `add_player_note(p_user_id, p_body)` → json (trimmed; `body` for empty / over 500; `not_found`). `delete_player_note(p_id)` — your own; YACquest Chairs any. Both write the admin action log (`player_note_added` / `player_note_deleted`, details `noteId` (+ `length` / `authorName`) — never the note text).

### Undo a points change
- `undo_points_change(p_ledger_id bigint)` → json `{ledgerId, undoOf, amount, userId}`. Appends a correcting ledger row: `amount = −original`, `source = 'manual'`, `ref_id = 'undo:<original id>'`, reason `"Undo: <original reason>"`, `created_by` = the staff member; the original row is never edited. Only `source = 'manual'` rows (Adjust points, Award activity, Game win) — else `not_manual`; never an undo row (`not_manual`); only rows in the active cycle (`old_cycle`); once per original (`already_undone`, also enforced by the unique index `ledger_one_undo on ledger (ref_id) where source = 'manual' and ref_id like 'undo:%'`). The usual ledger trigger updates points and the prize race (a winner who drops below the goal loses the spot as with any removal). Undoing a removal gives those exact points back, even above the +`tier1_points` limit for new manual additions (it reverses, it doesn't award). The person is notified (`points_adjusted`, e.g. "-20 pts from Iesha", body "Undo: …").
- `audit_ledger()` (0004) re-created: same `points_added` / `points_removed` rows, with two extra detail keys: `ledgerId` (so Admin → Log can offer Undo; rows logged before 0025 don't have it) and `undoOf` on undo rows.

### App-only (no SQL)
Event-day **Door mode** (`#/admin/door/<eventId>`, full screen, lazy-loaded: QR + password, live counter, going/here bar, recent arrivals, Wake Lock + full-screen buttons), the Stats page charts (hand-rolled SVG, lazy-loaded), and client-side CSV files (`src/lib/csv.ts`: quotes commas/quotes/line breaks; text starting with `= + - @`, tab or CR gets a leading `'` so spreadsheets don't run it as a formula).

## 0026 — Participant extras (event follow-ups, welcome tour, photo wall, my friends)
Additive, safe to re-run, **no points-rule changes**.

### Automatic follow-up after events
- `events.survey_url` (optional; `http(s)://host.tld…`, no spaces, ≤ 500 chars; check constraint + `clean_survey_url()` raising `surveyUrl: …`). `create_event` / `update_event` (re-created from 0001, otherwise unchanged) read `"surveyUrl"` from the event JSON (`""` clears it); `event_json()` returns `surveyUrl`. The app reads it for staff with `select id, survey_url from events`.
- Table `event_followups_sent (event_id pk, sent_at, sent_by null = automatic, attended, missed, emailed)` — the once-per-event marker. RLS on, no policies, no grants.
- `queue_event_followups(p_now default now())` → int. Service role / pg_cron only. Every event whose check-in window (`ends_at + check_in_grace_minutes`) closed **within the last 3 days** and has no marker: (a) everyone who checked in → notification kind `event_followup` "Thanks for coming to <title>! 🐂" with the survey link (if any) and that it counts as the **Complete a Feedback Survey** digital quest (screenshot → Tier 3 points); (b) everyone who RSVP'd but didn't check in → "Sorry we missed you at <title>" + the next upcoming event (their campus or all campuses first, else any; "Sat, Nov 21 at 6:00 PM" Eastern). Email (`email_outbox.kind = 'event_followup'`, dedupe `followup:<event>:<user>`) only for people with `email_opt_in` and a confirmed email. Logged `event_followup_sent` (actor System).
- Runs with no new setup: `enqueue_weekly_report_if_due()` is re-created (exact copy of 0024) with one more guarded step `0b` calling `queue_event_followups()`; a failure only raises a warning.
- `send_event_followup_now(p_event_id)` → `{eventId, sentAt, attended, missed, emailed, automatic:false}`. Staff. Errors: `not_found`, `already_sent`, `not_ended` (check-in still open). Logged with the staff member. This is how events older than 3 days (e.g. ones that closed before 0026) get a follow-up.
- `admin_event_followups()` → `(event_id, sent_at, sent_by_name, automatic, attended, missed, emailed)`. Staff.

### Welcome tour
- `profiles.tour_done_at` (null = show the tour once) + `mark_tour_done()` → timestamptz (sets it the first time only). Existing accounts start null, so everyone sees the tour once. The app also remembers it per device (fallback on a server without 0026).

### Event photo wall (privacy enforced in the database)
- `submissions.share_on_wall` (default false; owner sets it with `set_submission_wall_share(p_id, p_share)` — own `event_photos` submissions only: `not_found`, `not_photo`), `submissions.wall_hidden_at / wall_hidden_by` (staff: `set_photo_wall_hidden(p_id, p_hidden default true)`, logged `photo_hidden` / `photo_unhidden`), `profiles.photo_wall_opt_out` (`set_photo_wall_opt_out(p_opt_out)` hides ALL of a person's photos).
- **On the wall** = approved AND `share_on_wall` AND not hidden AND owner not opted out (`photo_on_wall(image_path)`).
- `event_photos(p_event_id)` → `(id, image_path, display_name, campus, created_at, mine)`; `event_photo_counts()` → `(event_id, photos)`. Signed-in users only.
- Storage: the `proofs` bucket stays **private**. New SELECT policy `proofs_read_wall` on `storage.objects`: a signed-in user may read an object only while `photo_on_wall(name)` is true. The app signs those paths with the user's own session (`storage.from('proofs').createSignedUrls(paths, 3600)`, which requires SELECT access), so no service role or Edge Function is involved. Un-sharing, opting out or a staff hide stops new URLs immediately; URLs already handed out expire within 1 hour. The `submissions` table RLS is unchanged (own rows or staff), so nobody can list other people's unapproved photos.

### My friends
- `my_friends()` → `(display_name, campus, avatar, hat, accessory, background, joined_at, came, bonus)` for profiles with `referred_by = auth.uid()` only. `came` = any event check-in; `bonus` = you got the `bring_new_alum` row for them this cycle. No ids, emails, handles or codes.

### Grants
Participant/staff RPCs: `revoke … from public, anon; grant … to authenticated`. `queue_event_followups` + `enqueue_weekly_report_if_due`: service_role only. Internal helpers (`clean_survey_url`, `followup_when`, `send_followup_for_event`) are not callable through the API.

### App-only (no SQL)
Welcome tour (lazy `src/components/WelcomeTour.tsx`), photo wall modal (lazy `src/components/PhotoWall.tsx`), `#/signup?code=YAC-XXXX` prefills the friend code, links in notification bodies are clickable, participant Home restyled like the admin dashboard.

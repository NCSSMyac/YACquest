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
| `admin` | helpers granted by a chair | review submissions, award/adjust points, create/edit events, see event passwords, search players, see suggestions, overview — **all campuses** |
| `chair` | the 2 YAC chairs | everything admins can + grant/remove admin, hand over chair seat, prize claims & fulfillment, export, sync, cycle reset |

- **Bootstrap:** table `chair_bootstrap(email)` seeded with `iesha.landis.yac@ncssm.edu`, `jacob.rodriguez.yac@ncssm.edu`. When an auth user is created with one of those emails, their profile starts as `chair`. (They still must confirm the email before they can log in.)
- **Max 2 chairs.** `set_role` can't create chairs. A chair passes their seat with `transfer_chair(target)` → target becomes `chair`, caller becomes `admin`, in one transaction. A chair cannot demote the other chair. Emergency recovery: run SQL in the Supabase dashboard (see SETUP.md).
- Only accounts with a **confirmed email** (`auth.users.email_confirmed_at is not null`) can be made admin or chair (`not_verified`).
- Helper SQL functions: `is_admin()` (admin or chair), `is_chair()`, both `stable security definer` reading `profiles.role` for `auth.uid()`.

## Tables (public schema)
- `app_config` (id int pk check id=1, prize_goal int 650, prize_count int 5, prize_value_usd int 50, fulfill_by date '2027-05-15', tier1_points 40, tier2_points 20, tier3_points 5, digital_per_week 1, social_tag_per_month 2, referrals_per_cycle 3, photos_per_event 1, photos_per_cycle 4)
- `cycles` (id uuid, name text, starts_at, ends_at, is_active bool, archived_at) — exactly one active. Seed: '2026–27 Pilot', 2026-10-15 → 2027-05-01 23:59:59 America/New_York. Helper `active_cycle_id()`.
- `chair_bootstrap` (email citext pk)
- `activities` (id text pk, tier int 1–3, title text, method text check in ('event_password','screenshot','photo','lead_award','referral')) — seeded with the 13 ids in `src/lib/activities.ts`.
- `profiles` (id uuid pk → auth.users on delete cascade, handle citext unique 3–20 `[a-zA-Z0-9_.]`, display_name text 2–24, email citext, campus text check in ('duke','unc','ncsu'), role text default 'participant', avatar text check in ('yak','knight','mage','ranger'), friend_code text unique like 'YAC-XXXX', referred_by uuid → profiles, email_opt_in bool default true, points int default 0 **(current cycle total, maintained by ledger trigger)**, created_at)
- `events` (id uuid, cycle_id, title, campus text check in ('duke','unc','ncsu','all'), cross_campus bool, kind text check in ('home','cross_campus','panel') **(since 0002: kind decides points — cross_campus → Tier 1 and campus forced to 'all'; home/panel → Tier 2 and need a host campus; cross_campus flag is derived)**, location, starts_at, ends_at, check_in_grace_minutes int default 60, activity_id text → activities, attendee_count int default 0, created_by uuid, created_at)
- `event_secrets` (event_id uuid pk → events on delete cascade, password text) — admins only.
- `submissions` (id uuid, cycle_id, user_id, activity_id, event_id null, image_path text — storage path in bucket `proofs`, note text ≤280, status text 'pending'|'approved'|'rejected', reviewer_id, review_reason, created_at, reviewed_at)
- `ledger` (id bigint identity, cycle_id, user_id, amount int ≠ 0, source text check in ('checkin','submission','manual','referral'), activity_id null, ref_id text null, reason text, created_by uuid null, created_at)
- `prize_claims` (id uuid, cycle_id, spot int, user_id, display_name text, campus text, qualified_at, status text 'qualified'|'info_submitted'|'fulfilled'|'revoked', reference text, contact jsonb {fullName,email,preference,notes}, fulfilled_at, revoked_at, revoke_reason). Partial unique indexes: (cycle_id, spot) where status <> 'revoked'; (cycle_id, user_id) where status <> 'revoked'.
- `notifications` (id uuid, user_id, kind text, title, body, read bool default false, created_at)
- `prize_suggestions` (id uuid, user_id, idea text ≤300, created_at)
- `sync_status` (id int pk =1, last_sync_at, rows_pushed, rows_pulled, conflicts, state text default 'not_configured', sheet_url text)

### RLS read rules
- `profiles`: own row; admins read all.
- `events`: any authenticated user. `event_secrets`: admins only.
- `activities`, `app_config`, `cycles`: any authenticated user (app_config/activities also anon).
- `submissions`, `ledger`, `notifications`: own rows; admins read all (notifications: own only).
- `prize_claims`: own rows; chairs read all. (Public view of the race is the `prize_status()` RPC — no contact info.)
- `prize_suggestions`: admins.
- `sync_status`: chairs.
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
- `adjust_points(p_user_id uuid, p_amount int, p_reason text)` — integer, ≠0, |x| ≤ 500 (`amount`); reason ≥3 chars (`reason`); ledger source 'manual' + notification.
- `award_activity(p_user_id uuid, p_activity_id text, p_note text)` — ledger tier points, source 'manual', reason "<title>: <note>" + notification.
- `search_users(p_query text, p_limit int default 20) → table(id, handle, display_name, email, campus, role, points)`
- `admin_list_events() → table(events.* + password text)` newest first
- `create_event(p_event jsonb) → json event incl. password` — keys: title, campus, crossCampus, kind, location, startsAt, endsAt, checkInGraceMinutes, password. Validates title ≥3, password ≥4, ends > starts. Derives activity_id like check_in.
- `update_event(p_id uuid, p_event jsonb) → json event`
- `delete_event(p_id uuid)` — refuse if attendee_count > 0 (`has_attendees`)
- `admin_overview() → json {participants, activeThisWeek, pointsThisWeek, pendingReviews, newSignupsThisWeek, prize (same as prize_status), nearGoal:[leaderboard rows within 100 of goal, unclaimed, top 10]}`

Chair (`is_chair()` else `forbidden`):
- `list_team() → table(id, display_name, handle, email, role, email_verified boolean)` — admins + chairs
- `set_role(p_user_id uuid, p_role text)` — p_role in ('participant','admin') only; target must not be a chair (`forbidden`); for 'admin' target email must be confirmed (`not_verified`); notify target.
- `transfer_chair(p_user_id uuid)` — target ≠ caller, email confirmed; chairs count stays ≤ 2: target → chair, caller → admin; notify both.
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

### New tables (RLS on; **chairs read**, nobody writes directly; writes via RPCs/triggers)
- `report_settings` (id int pk check id=1, weekly_enabled bool default true, weekly_day int 0–6 default 1 (0=Sunday, America/New_York), weekly_hour int 0–23 default 9, near_goal_points int default 150, recipients text[] default '{}' (extra emails), include_chairs bool default true, include_admins bool default true, prize_alerts_enabled bool default true, updated_at, updated_by uuid). Seed one row.
- `email_outbox` (id uuid, kind text check in ('weekly_report','prize_qualified','prize_info','test'), to_emails text[] not null, subject text, body_text text, body_html text, dedupe_key text unique not null, status text check in ('pending','sending','sent','failed') default 'pending', attempts int default 0, last_error text, created_at, sent_at). **dedupe_key prevents duplicate reports/alerts.**
- `admin_actions` (id bigint identity, actor_id uuid null, actor_name text, action text, target_user_id uuid null, target_name text, details jsonb default '{}', created_at default now()). Append-only.

### Recipients
`report_recipients() → text[]` (internal): distinct lower-case emails from `report_settings.recipients` ∪ (chairs if include_chairs) ∪ (admins if include_admins), only profiles whose auth email is confirmed.

### Weekly committee report
`build_weekly_report() → json {subject, text, html}` (internal). Contents: spots left (`N of 4 left`); **Close to the prize**: participants with no active claim and points ≥ goal − near_goal_points, ordered by points desc, showing name, campus, points, points to go (this is the "Johnny is dominating" shout-out list); top 5 overall; Campus Cup per-capita; this week (Mon 00:00 NY): active participants, points awarded, new sign-ups; pending reviews; days left in cycle. Simple inline-styled HTML (navy/gold), plain-text twin.
- `enqueue_weekly_report_if_due() → boolean` — **service_role only**. If weekly_enabled and now (NY) is on/after weekly_day+weekly_hour of the current ISO week, insert with dedupe_key `weekly:<IYYY-IW>` (on conflict do nothing). Returns true if a row was inserted. No recipients → do nothing.
- `send_weekly_report_now() → void` — chair; dedupe_key `weekly-manual:<epoch ms>`.
- `weekly_report_preview() → json {subject, text, html, recipients text[]}` — admin or chair.
- `send_test_email() → void` — chair; to the caller's email, kind 'test', dedupe `test:<uuid>`.

### Prize alerts (triggers on `prize_claims`, only if prize_alerts_enabled and recipients exist)
- After insert (a new winner): kind 'prize_qualified', dedupe `prize_qualified:<claim id>`, subject `🏆 YACquest: <name> won spot #N`, body says they're waiting for delivery info.
- After update when `contact` changes and is not null: kind 'prize_info', dedupe `prize_info:<claim id>:<md5(contact::text)>`, subject `URGENT 🎁 YACquest winner info: <name> (spot #N)`, body lists full name, email, phone, mailing address, gift card preference, notes, reference, campus.

### Sending (Edge Function `send-emails`, run every 10 min by Supabase Cron)
- `claim_email_batch(p_limit int default 20) → setof email_outbox` — service_role only. Picks rows with status 'pending', or 'failed' with attempts < 5, or 'sending' older than 15 min; sets status 'sending', attempts+1; returns them (`for update skip locked`).
- `mark_email_result(p_id uuid, p_ok boolean, p_error text)` — service_role only. ok → 'sent', sent_at now(), last_error null; else 'failed', last_error = left(p_error, 500).
- Chair: `email_log(p_limit int default 50) → table(id, kind, to_emails, subject, status, attempts, last_error, created_at, sent_at)` newest first; `retry_email(p_id uuid)` → status 'pending', attempts 0.
- Chair: `get_report_settings() → json` (camelCase: weeklyEnabled, weeklyDay, weeklyHour, nearGoalPoints, recipients, includeChairs, includeAdmins, prizeAlertsEnabled, updatedAt) and `update_report_settings(p_settings jsonb) → json` (same keys, any subset; validate day 0–6, hour 0–23, near_goal_points 0–1000, recipients valid emails ≤ 20).

### Winner form
`submit_claim_info(p_full_name text, p_email text, p_phone text, p_address text, p_preference text default null, p_notes text default null) → json claim` — drop the old 4-argument version. Validation codes: `fullName` (≥2), `email`, `phone` (≥7 digits), `address` (≥10 chars). Contact jsonb keys: fullName, email, phone, address, preference, notes. Everything else as before.

### Admin action log (triggers; actor = auth.uid(), null = system)
Actions: `points_added` / `points_removed` (ledger insert with created_by and source 'manual'; details {amount, reason, activityId}), `submission_approved` / `submission_rejected` (status change; details {activityId, reason}), `role_changed` (details {from, to}), `event_created` / `event_updated` / `event_deleted` (details {title, kind, campus}), `prize_fulfilled` / `prize_revoked` (details {spot, reason}), `cycle_reset` (details {name}), `report_settings_changed` (details = changed keys). actor_name/target_name are display names at the time.
- `admin_action_log(p_limit int default 100, p_before bigint default null) → table(id, actor_name, action, target_name, details, created_at)` — **chair**, newest first, keyset paging by id.

---

## 0005 — Event kinds are the three tiers
`events.kind` ∈ ('high_impact','active','digital') → activities `cross_campus_event` ("High-Impact Event", Tier 1), `home_event` ("Active Event", Tier 2), `digital_event` ("Digital Event", Tier 3, new). Campus is chosen independently ('duke','unc','ncsu','all'); `cross_campus` = (campus = 'all'). Points always come from the tier via app_config. `panel_mentorship` is no longer used for new events (kept for history).

---

## 0006 — Announcements
- Table `announcements` (admins read via RLS). `send_announcement(p_title, p_body, p_audience 'all'|'campus'|'user', p_campus, p_user_id, p_send_email) → json {id, recipients, emailed}` — admin/chair; any admin or chair may email 'all' (chair-only until 0012); 20 per sender per day (`limit`); codes `title`, `body`, `audience`, `campus`, `user`.
- Creates one `notifications` row (kind 'announcement') per target; Home shows the latest 3. Email copy → `email_outbox` kind 'announcement', ≤ 90 BCC per row, only opted-in confirmed emails (a direct message always emails that person). Logged as `announcement_sent`.
- `list_announcements(p_limit default 20)` — admin/chair, newest first, snake_case rows.

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

## 0009 — Quest extras (badges, wardrobe, weekly shout-out)
- `profiles` + `hat`, `accessory`, `background` (nullable). Table `cosmetics(id, slot, name, rule_type, rule_value, sort_order)` mirrors `src/lib/cosmetics.ts`.
- `my_badges() → table(id, earned, progress, goal)` (current cycle, order of `src/lib/badges.ts`). Badges never award points.
- `my_unlocks() → text[]`; `equip_look(p_hat, p_accessory, p_background) → json {hat, accessory, background}` ('' clears; errors `locked`, `look`).
- `leaderboard(p_limit int default 10, p_campus varchar default null)` and `my_rank(p_campus text default null)` now also return `hat, accessory, background`.
- ~~`weekly_shoutout()`~~ — replaced by `monthly_shoutout()` in 0012.
- Weekly email gains the shout-out (monthly since 0012) after the headline.

## 0010 — Name filter
- `name_is_clean(text)` (internal) mirrors `src/lib/nameFilter.ts`. Enforced in `handle_new_user` (codes `handle` / `displayName`), `update_profile`, and `handle_available` (false for unclean handles).
- `admin_rename_user(p_user_id, p_display_name)` — admin/chair; renames, updates active claims, notifies the user, logs `user_renamed` {from, to}.

---

## 0011 — Up to 5 chairs
- `app_config.max_chairs int default 5 (set to 6 for 2026–27)` (`MAX_CHAIRS` in src/config.ts).
- `set_role(p_user_id, p_role)` now accepts 'participant' | 'admin' | **'chair'** (caller must be a chair). Making a chair: target email must be confirmed (`not_verified`) and current chairs < max_chairs (`chair_limit`: "YAC already has 6 chairs."). A chair still can't demote another chair (`forbidden`).
- `step_down_chair() → void`: caller (a chair) becomes 'admin'; refused if they're the only chair (`last_chair`: "You're the only chair — make someone else a chair first."). Notifies the caller; logged as role_changed.
- `transfer_chair` unchanged. Bootstrap emails (chair_bootstrap) become chairs on sign-up while chairs < max_chairs.

---

## 0012 — Admins email everyone; Adventurer of the Month
- `send_announcement(...)`: same signature; **admins and chairs** may send audience 'all' with `p_send_email = true`. Participants still get `forbidden` for any announcement.
- `monthly_shoutout() → json {userId, displayName, campus, avatar, hat, accessory, background, look, pointsThisMonth, month 'YYYY-MM', final boolean}` or null — any logged-in user. Replaces `weekly_shoutout()` (dropped, with `weekly_shoutout_data()`).
  - Counts **positive** ledger rows of the **active cycle**, **participants only** (current role), grouped by **America/New_York calendar month**.
  - Shows the winner of the most recent completed month (last month) → `final: true`. If nobody earned points last month in this cycle (e.g. the cycle started this month), falls back to the current month's leader so far → `final: false`. Older months are never shown. null if nobody earned points last month or this month.
  - Ties: whoever reached that month's total first (earliest time of their last positive row that month), then display name, then user id.
  - Internal helpers (not callable through the API): `monthly_standings()`, `monthly_shoutout_data()`, `month_label('YYYY-MM') → 'November'`.
- Badges: `my_badges()` now returns **15** badges; new last one `monthly_star` ("Adventurer of the Month", goal 1) = number of completed months in this cycle the user won (same rule as above). The other 14 are unchanged. Rainbow still needs 6 badges.
- Weekly committee email stays weekly; its "⭐ Adventurer of the month" section shows `monthly_shoutout` ("<name> (<campus>) — N points in <Month>", or "Leading <Month> so far: …", or "No points earned this month yet."). When a weekly report is queued and the shout-out is `final`, the winner gets a notification "⭐ You’re Adventurer of the Month!" — at most once per calendar month.

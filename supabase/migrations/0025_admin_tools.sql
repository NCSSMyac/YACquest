-- =============================================================================
-- YACquest 0025 — admin tools (additive; safe to re-run; no rule changes)
--
-- Everything here is for staff (admins + YACquest Chairs) unless noted. Participants get
-- 'forbidden'; anon can't call anything. Errors follow '<code>: <message>'.
--
--   • review_submissions_bulk(p_ids uuid[]) → {approved, skipped, results:[{id, ok, code?, message?}]}
--       Admin → Review → "Approve N". Runs the existing review_submission(id, 'approved') for each id
--       in its own sub-transaction, so every rule stays exactly as it is (own submission, already
--       reviewed, not found …) and one failure never undoes the others. At most 100 ids per call.
--       Each approval is logged by the 0004 submissions trigger like a single approval.
--
--   • admin_event_checkins(p_event_id) → who checked in, oldest first, with email + avatar + look
--       (Door mode's live list and the "Who came" CSV). Same rows as admin_event_attendees (0013).
--
--   • admin_stats(p_now default now()) → one JSON for Admin → Stats (participants only; staff never
--       counted): sign-ups per week since the cycle started, attendance per event (going vs came),
--       campus breakdown (members, active in the last 30 days, points, points per member), points
--       milestones + distribution, points by source (event / proof / referral / staff awards), and
--       how many participants earned each badge.
--
--   • admin_participants_export() → every participant, for the CSV download. YACquest Chairs only.
--
--   • Announcement templates: table announcement_templates + list_announcement_templates(),
--       save_announcement_template(p_title, p_body), delete_announcement_template(p_id).
--       Staff can list and save; delete your own (YACquest Chairs can delete any). 30 per person.
--
--   • Staff notes on players: table player_notes + list_player_notes(p_user_id),
--       add_player_note(p_user_id, p_body) (1–500 chars), delete_player_note(p_id) (your own; Chairs
--       any). RLS on with NO policies and no table grants: only these staff RPCs read or write it.
--       Adding/deleting is logged ('player_note_added' / 'player_note_deleted', no note text).
--
--   • undo_points_change(p_ledger_id bigint) → {ledgerId, undoOf, amount, userId}
--       Reverses one manual ledger row (source 'manual': Adjust points, Award activity, Game win)
--       by appending a correcting row: amount = −original, source 'manual', ref_id 'undo:<id>',
--       reason 'Undo: <original reason>'. Only once per original (unique index ledger_one_undo),
--       only rows in the current cycle, never an undo row itself. The usual ledger trigger updates
--       points and the prize race; the player is notified; the 0004 trigger logs it.
--
--   • audit_ledger() (0004) re-created with two extra detail keys: ledgerId (so the Log can offer
--     Undo) and undoOf (for undo rows). Same actions, same rows.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.announcement_templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 80),
  body       text not null check (char_length(body) between 1 and 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcement_templates_created on public.announcement_templates (created_at desc);

create table if not exists public.player_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists player_notes_user on public.player_notes (user_id, created_at desc);

-- One undo per original ledger row (ref_id = 'undo:<original id>').
create unique index if not exists ledger_one_undo on public.ledger (ref_id)
  where source = 'manual' and ref_id like 'undo:%';

-- Nobody reads or writes these tables directly: only the security-definer RPCs below.
alter table public.announcement_templates enable row level security;
alter table public.player_notes enable row level security;
revoke all on public.announcement_templates, public.player_notes from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Ledger audit: same as 0004, plus ledgerId / undoOf in the details
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.audit_ledger()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.source = 'manual' and new.created_by is not null then
    perform public.log_admin_action(coalesce(auth.uid(), new.created_by),
      case when new.amount > 0 then 'points_added' else 'points_removed' end, new.user_id,
      jsonb_build_object('amount', new.amount, 'reason', new.reason, 'activityId', new.activity_id,
                         'ledgerId', new.id)
      || case when new.ref_id like 'undo:%'
              then jsonb_build_object('undoOf', substr(new.ref_id, 6)::bigint) else '{}'::jsonb end);
  end if;
  return null;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Bulk approve
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.review_submissions_bulk(p_ids uuid[])
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin   uuid := public.require_admin();
  v_ids     uuid[];
  v_id      uuid;
  v_msg     text;
  v_code    text;
  v_ok      int := 0;
  v_skip    int := 0;
  v_results jsonb := '[]'::jsonb;
begin
  -- distinct, in the order given
  select coalesce(array_agg(x.id order by x.ord), '{}') into v_ids
    from (select u.id, min(u.ord) as ord from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as u (id, ord)
           where u.id is not null group by u.id) x;
  if cardinality(v_ids) = 0 then
    perform public.api_error('empty', 'Pick at least one submission.');
  end if;
  if cardinality(v_ids) > 100 then
    perform public.api_error('too_many', 'Approve at most 100 at a time.');
  end if;
  foreach v_id in array v_ids loop
    begin
      perform public.review_submission(v_id, 'approved', null);
      v_ok := v_ok + 1;
      v_results := v_results || jsonb_build_object('id', v_id, 'ok', true);
    exception when others then
      v_msg := sqlerrm;
      v_code := case when v_msg ~ '^[A-Za-z_]+: ' then split_part(v_msg, ':', 1) else 'error' end;
      v_skip := v_skip + 1;
      v_results := v_results || jsonb_build_object('id', v_id, 'ok', false, 'code', v_code,
        'message', case when v_code = 'error' then 'Something went wrong.' else substr(v_msg, char_length(v_code) + 3) end);
    end;
  end loop;
  return json_build_object('approved', v_ok, 'skipped', v_skip, 'results', v_results);
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Who came, with avatars + emails (Door mode, "Who came" CSV)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_event_checkins(p_event_id uuid)
returns table (user_id uuid, display_name text, handle text, email text, campus text, avatar text,
               hat text, accessory text, background text, checked_in_at timestamptz, points int)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    perform public.api_error('not_found', 'That event no longer exists.');
  end if;
  return query
    select l.user_id, p.display_name, p.handle::text, p.email::text, p.campus, p.avatar,
           p.hat, p.accessory, p.background, l.created_at, l.amount
      from public.ledger l join public.profiles p on p.id = l.user_id
     where l.source = 'checkin' and l.ref_id = p_event_id::text
     order by l.created_at, l.id;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Stats (participants only)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_stats(p_now timestamptz default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_now   timestamptz := coalesce(p_now, now());
  v_cycle uuid := public.active_cycle_id();
  cyc     public.cycles;
  cfg     public.app_config;
  v_goal  int;
  r       jsonb;
begin
  perform public.require_admin();
  select * into cyc from public.cycles where id = v_cycle;
  select * into cfg from public.app_config where id = 1;
  v_goal := coalesce(cfg.prize_goal, 350);

  with
  parts as (select * from public.profiles where role = 'participant'),
  led as (
    select l.* from public.ledger l join parts p on p.id = l.user_id where l.cycle_id = v_cycle
  ),
  weeks as (
    select w::date as wk
      from generate_series(date_trunc('week', cyc.starts_at at time zone 'America/New_York'),
                           date_trunc('week', least(v_now, cyc.ends_at) at time zone 'America/New_York'),
                           interval '7 days') w
  ),
  signups as (
    select date_trunc('week', p.created_at at time zone 'America/New_York')::date as wk, count(*)::int as n
      from parts p where p.created_at >= cyc.starts_at and p.created_at <= v_now group by 1
  ),
  ev as (
    select e.id, e.title, e.campus, e.kind, e.starts_at, e.ends_at,
           (select count(*) from public.event_rsvps rv join parts p on p.id = rv.user_id where rv.event_id = e.id)::int as going,
           (select count(*) from led l where l.source = 'checkin' and l.ref_id = e.id::text and l.amount > 0)::int as came
      from public.events e
     where e.cycle_id = v_cycle and e.starts_at <= v_now
  ),
  camp as (
    select c.campus,
           (select count(*) from parts p where p.campus = c.campus)::int as members,
           (select count(distinct l.user_id) from led l join parts p on p.id = l.user_id
             where p.campus = c.campus and l.amount > 0 and l.created_at > v_now - interval '30 days' and l.created_at <= v_now)::int as active,
           (select coalesce(sum(p.points), 0) from parts p where p.campus = c.campus)::int as points
      from (values ('duke', 1), ('unc', 2), ('ncsu', 3)) as c (campus, ord)
  ),
  marks as (
    select m.pts, m.ord from (values (50, 1), (100, 2), ((v_goal + 1) / 2, 3), (250, 4), (v_goal, 5)) as m (pts, ord)
  ),
  buckets as (
    select b.lo, b.hi, b.label, b.ord
      from (values (0, 0, '0', 1), (1, 49, '1–49', 2), (50, 99, '50–99', 3),
                   (100, (v_goal + 1) / 2 - 1, '100–' || ((v_goal + 1) / 2 - 1), 4),
                   ((v_goal + 1) / 2, 249, ((v_goal + 1) / 2) || '–249', 5),
                   (250, v_goal - 1, '250–' || (v_goal - 1), 6),
                   (v_goal, 2147483647, v_goal || '+', 7)) as b (lo, hi, label, ord)
  ),
  badge_rows as (
    select b.id, b.ord, count(*) filter (where b.earned)::int as n
      from parts p cross join lateral public.badges_for(p.id) with ordinality as b (id, earned, progress, goal, ord)
     group by b.id, b.ord
  )
  select jsonb_build_object(
    'generatedAt', v_now,
    'goal', v_goal,
    'cycle', jsonb_build_object('name', cyc.name, 'startsAt', cyc.starts_at, 'endsAt', cyc.ends_at),
    'totals', jsonb_build_object(
      'participants', (select count(*) from parts),
      'active30', (select count(distinct l.user_id) from led l
                    where l.amount > 0 and l.created_at > v_now - interval '30 days' and l.created_at <= v_now),
      'points', (select coalesce(sum(points), 0) from parts),
      'checkins', (select count(*) from led where source = 'checkin' and amount > 0),
      'approvals', (select count(*) from led where source = 'submission' and amount > 0)),
    'signupsBefore', (select count(*) from parts p where p.created_at < cyc.starts_at),
    'signupsByWeek', (select coalesce(jsonb_agg(jsonb_build_object('week', w.wk, 'count', coalesce(s.n, 0)) order by w.wk), '[]'::jsonb)
                        from weeks w left join signups s on s.wk = w.wk),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', ev.id, 'title', ev.title, 'campus', ev.campus, 'kind', ev.kind,
                                                            'startsAt', ev.starts_at, 'going', ev.going, 'came', ev.came)
                                         order by ev.starts_at, ev.id), '[]'::jsonb) from ev),
    'campuses', (select jsonb_agg(jsonb_build_object('campus', c.campus, 'members', c.members, 'active', c.active, 'points', c.points,
                                                     'perMember', case when c.members = 0 then 0 else round(c.points::numeric / c.members, 1) end)
                                  order by c.campus = 'duke' desc, c.campus = 'unc' desc) from camp c),
    'milestones', (select jsonb_agg(jsonb_build_object('points', m.pts, 'count', (select count(*) from parts p where p.points >= m.pts)) order by m.ord) from marks m),
    'distribution', (select jsonb_agg(jsonb_build_object('label', b.label, 'min', b.lo,
                                                         'count', (select count(*) from parts p where greatest(p.points, 0) between b.lo and b.hi))
                                      order by b.ord) from buckets b),
    'sources', jsonb_build_object(
      'event',    (select coalesce(sum(amount), 0) from led where source = 'checkin' and amount > 0),
      'digital',  (select coalesce(sum(amount), 0) from led where source = 'submission' and amount > 0),
      'referral', (select coalesce(sum(amount), 0) from led where source = 'referral' and amount > 0),
      'staff',    (select coalesce(sum(amount), 0) from led where source = 'manual' and amount > 0),
      'removed',  (select coalesce(-sum(amount), 0) from led where amount < 0)),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'count', b.n) order by b.n desc, b.ord), '[]'::jsonb) from badge_rows b)
  ) into r;
  return r::json;
end $$;

-- Every participant, for the CSV download (YACquest Chairs only).
create or replace function public.admin_participants_export()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_cycle uuid := public.active_cycle_id();
begin
  perform public.require_chair();
  return (
    select coalesce(json_agg(json_build_object(
             'displayName', p.display_name, 'handle', p.handle::text, 'email', p.email::text, 'campus', p.campus,
             'points', p.points,
             'badges', (select coalesce(json_agg(b.id order by b.ord), '[]'::json)
                          from public.badges_for(p.id) with ordinality as b (id, earned, progress, goal, ord) where b.earned),
             'eventsAttended', (select count(distinct l.ref_id) from public.ledger l
                                 where l.user_id = p.id and l.cycle_id = v_cycle and l.source = 'checkin' and l.amount > 0),
             'joinedAt', p.created_at, 'emailOptIn', p.email_opt_in)
           order by lower(p.display_name), p.id), '[]'::json)
      from public.profiles p where p.role = 'participant');
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Announcement templates
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_announcement_templates()
returns table (id uuid, title text, body text, created_by uuid, author_name text, created_at timestamptz, can_delete boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := public.require_admin();
begin
  return query
    select t.id, t.title, t.body, t.created_by, coalesce(p.display_name, 'Former staff'), t.created_at,
           (t.created_by = v_me or public.is_chair())
      from public.announcement_templates t left join public.profiles p on p.id = t.created_by
     order by t.created_at desc, t.id
     limit 200;
end $$;

create or replace function public.save_announcement_template(p_title text, p_body text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me    uuid := public.require_admin();
  v_title text := trim(coalesce(p_title, ''));
  v_body  text := trim(coalesce(p_body, ''));
  t       public.announcement_templates;
begin
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    perform public.api_error('title', 'Give the template a name (up to 80 characters).');
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    perform public.api_error('body', 'The template message must be 1–1000 characters.');
  end if;
  if (select count(*) from public.announcement_templates where created_by = v_me) >= 30 then
    perform public.api_error('too_many', 'You have 30 saved templates. Delete one first.');
  end if;
  insert into public.announcement_templates (title, body, created_by) values (v_title, v_body, v_me) returning * into t;
  return json_build_object('id', t.id, 'title', t.title, 'body', t.body, 'createdBy', t.created_by,
                           'authorName', public.display_name_of(v_me), 'createdAt', t.created_at, 'canDelete', true);
end $$;

create or replace function public.delete_announcement_template(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := public.require_admin();
  t    public.announcement_templates;
begin
  select * into t from public.announcement_templates where id = p_id;
  if t.id is null then
    perform public.api_error('not_found', 'That template was already deleted.');
  end if;
  if t.created_by is distinct from v_me and not public.is_chair() then
    perform public.api_error('forbidden', 'You can only delete your own templates.');
  end if;
  delete from public.announcement_templates where id = p_id;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Staff notes on players
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_player_notes(p_user_id uuid)
returns table (id uuid, body text, author_id uuid, author_name text, created_at timestamptz, can_delete boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := public.require_admin();
begin
  return query
    select n.id, n.body, n.author_id, coalesce(p.display_name, 'Former staff'), n.created_at,
           (n.author_id = v_me or public.is_chair())
      from public.player_notes n left join public.profiles p on p.id = n.author_id
     where n.user_id = p_user_id
     order by n.created_at desc, n.id;
end $$;

create or replace function public.add_player_note(p_user_id uuid, p_body text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me   uuid := public.require_admin();
  v_body text := trim(coalesce(p_body, ''));
  n      public.player_notes;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if char_length(v_body) < 1 then
    perform public.api_error('body', 'Write a note first.');
  end if;
  if char_length(v_body) > 500 then
    perform public.api_error('body', 'Keep notes to 500 characters.');
  end if;
  insert into public.player_notes (user_id, author_id, body) values (p_user_id, v_me, v_body) returning * into n;
  perform public.log_admin_action(v_me, 'player_note_added', p_user_id, jsonb_build_object('noteId', n.id, 'length', char_length(v_body)));
  return json_build_object('id', n.id, 'body', n.body, 'authorId', v_me, 'authorName', public.display_name_of(v_me),
                           'createdAt', n.created_at, 'canDelete', true);
end $$;

create or replace function public.delete_player_note(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := public.require_admin();
  n    public.player_notes;
begin
  select * into n from public.player_notes where id = p_id;
  if n.id is null then
    perform public.api_error('not_found', 'That note was already deleted.');
  end if;
  if n.author_id is distinct from v_me and not public.is_chair() then
    perform public.api_error('forbidden', 'You can only delete your own notes.');
  end if;
  delete from public.player_notes where id = p_id;
  perform public.log_admin_action(v_me, 'player_note_deleted', n.user_id, jsonb_build_object('noteId', n.id, 'authorName', public.display_name_of(n.author_id)));
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Undo a manual points change
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.undo_points_change(p_ledger_id bigint)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.require_admin();
  o       public.ledger;
  v_new   bigint;
  v_name  text;
  v_reason text;
begin
  select * into o from public.ledger where id = p_ledger_id;
  if o.id is null then
    perform public.api_error('not_found', 'That points change wasn’t found.');
  end if;
  if o.source <> 'manual' then
    perform public.api_error('not_manual', 'Only manual points changes (adjustments and awards) can be undone.');
  end if;
  if o.ref_id like 'undo:%' then
    perform public.api_error('not_manual', 'That row is already an undo.');
  end if;
  if o.cycle_id is distinct from public.active_cycle_id() then
    perform public.api_error('old_cycle', 'That change is from an earlier cycle.');
  end if;
  if exists (select 1 from public.ledger where source = 'manual' and ref_id = 'undo:' || o.id) then
    perform public.api_error('already_undone', 'That change was already undone.');
  end if;
  v_reason := 'Undo: ' || coalesce(nullif(o.reason, ''), 'points change');
  begin
    insert into public.ledger (cycle_id, user_id, amount, source, ref_id, reason, created_by)
    values (o.cycle_id, o.user_id, -o.amount, 'manual', 'undo:' || o.id, v_reason, v_admin)
    returning id into v_new;
  exception when unique_violation then
    perform public.api_error('already_undone', 'That change was already undone.');
  end;
  select display_name into v_name from public.profiles where id = v_admin;
  perform public.notify(o.user_id, 'points_adjusted',
    format('%s%s pts from %s', case when -o.amount > 0 then '+' else '' end, -o.amount, v_name), v_reason);
  return json_build_object('ledgerId', v_new, 'undoOf', o.id, 'amount', -o.amount, 'userId', o.user_id);
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function
  public.review_submissions_bulk(uuid[]), public.admin_event_checkins(uuid), public.admin_stats(timestamptz),
  public.admin_participants_export(), public.list_announcement_templates(), public.save_announcement_template(text, text),
  public.delete_announcement_template(uuid), public.list_player_notes(uuid), public.add_player_note(uuid, text),
  public.delete_player_note(uuid), public.undo_points_change(bigint)
from public, anon;
grant execute on function
  public.review_submissions_bulk(uuid[]), public.admin_event_checkins(uuid), public.admin_stats(timestamptz),
  public.admin_participants_export(), public.list_announcement_templates(), public.save_announcement_template(text, text),
  public.delete_announcement_template(uuid), public.list_player_notes(uuid), public.add_player_note(uuid, text),
  public.delete_player_note(uuid), public.undo_points_change(bigint)
to authenticated;

-- Done.

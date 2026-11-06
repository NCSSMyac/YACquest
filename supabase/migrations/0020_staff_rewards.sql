-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — STAFF-ONLY rewards: Hero of the Week, Council wardrobe + badges, Golden Yak.
--   Everything here is for admins + chairs only. Participants get nothing back from any of
--   it (null / forbidden / 'look' error), and nothing participants already see changes:
--   my_badges(), my_unlocks(), leaderboard(), my_rank(), monthly_shoutout() are untouched
--   (they only ever list participants, so a staff look can't show up there).
--
--   • Hero of the Week (picked at YAC's biweekly meetings): table hero_reigns, one current
--     reign at a time (no auto-expiry). crown_hero() / clear_hero() are chair-only and logged
--     in the admin action log ('hero_crowned' / 'hero_cleared'); the new hero gets a
--     'hero_crowned' notification. While reigning: Hero's Crown (hat), Hero's Cape
--     (accessory) and Hall of Heroes (background) can be equipped; when the reign ends they
--     are taken off automatically. hero_board() (admins + chairs): current hero, Hall of
--     Heroes (newest first) and the team with their perks.
--   • Council wardrobe: table staff_cosmetics (mirrors STAFF_COSMETICS in
--     src/lib/staffRewards.ts; NOT readable through the API). Automatic unlocks count staff
--     work ALL-TIME (not per cycle): Gatekeeper's Monocle = 25 reviews, Herald's Horn =
--     5 announcements, Event Host Top Hat = 3 events created that each reached 5 check-ins,
--     Council Chamber = free for all staff. Chair-granted (grant_staff_reward(), logged as
--     'staff_reward_granted'): Royal Scepter, Starlit Throne Room, Wizard Council Hat.
--   • Council badges (staff_badges_for()): Gatekeeper, Town Crier, Event Host, Hero of the
--     Week (progress = times crowned, not capped), Council Legend (the first three + hero once).
--   • Golden Yak (avatar 'golden_yak'): profiles avatar check accepts it; update_profile()
--     only lets staff pick it with the Council Legend badge or a chair's 'council_mvp' grant.
--   • my_staff_rewards(): the caller's own staff rewards, or null for participants.
--   • equip_look(): copy of 0009 + staff items (staff only, must be unlocked).
--   • update_profile(): copy of 0010 + the Golden Yak gate; remembers the last normal
--     character in profiles.normal_avatar.
--   • Back to participant (set_role → participant, via a trigger on profiles.role): staff
--     items come off, a Golden Yak goes back to normal_avatar (or 'yak'), a current reign
--     ends. History (reigns, grants, work counts) is kept, so it all returns if they become
--     staff again.
--
-- RE-RUN NOTE: 0007 re-creates the avatar check WITHOUT 'golden_yak'. If you ever re-run
-- 0007 after this file, run 0020 again right after it (0007 fails while someone is a
-- Golden Yak; switch them back first).
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0019. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Golden Yak: avatar check + last normal character
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%avatar%'
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;
alter table public.profiles
  add constraint profiles_avatar_check check (avatar in ('yak','unicorn','dragon','knight','mage','ranger','golden_yak'));

alter table public.profiles add column if not exists normal_avatar text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tables (RPC-only: RLS on, no policies, no grants)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.staff_cosmetics (
  id         text primary key,
  slot       text not null check (slot in ('hat', 'accessory', 'background')),
  name       text not null,
  rule_type  text not null check (rule_type in ('staff', 'reviews', 'announcements', 'hosted', 'grant', 'hero')),
  rule_value int,
  sort_order int  not null default 0
);

insert into public.staff_cosmetics (id, slot, name, rule_type, rule_value, sort_order) values
  ('host_top_hat',       'hat',        'Event Host Top Hat',   'hosted',        3,  1),
  ('gatekeeper_monocle', 'accessory',  'Gatekeeper’s Monocle', 'reviews',       25, 2),
  ('heralds_horn',       'accessory',  'Herald’s Horn',        'announcements', 5,  3),
  ('council_chamber',    'background', 'Council Chamber',      'staff',         null, 4),
  ('wizard_council_hat', 'hat',        'Wizard Council Hat',   'grant',         null, 5),
  ('royal_scepter',      'accessory',  'Royal Scepter',        'grant',         null, 6),
  ('starlit_throne',     'background', 'Starlit Throne Room',  'grant',         null, 7),
  ('hero_crown',         'hat',        'Hero’s Crown',         'hero',          null, 8),
  ('hero_cape',          'accessory',  'Hero’s Cape',          'hero',          null, 9),
  ('hall_of_heroes',     'background', 'Hall of Heroes',       'hero',          null, 10)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, rule_type = excluded.rule_type,
      rule_value = excluded.rule_value, sort_order = excluded.sort_order;
delete from public.staff_cosmetics where id not in
  ('host_top_hat','gatekeeper_monocle','heralds_horn','council_chamber','wizard_council_hat',
   'royal_scepter','starlit_throne','hero_crown','hero_cape','hall_of_heroes');

create table if not exists public.hero_reigns (
  id         uuid primary key default gen_random_uuid(),
  seq        bigint generated always as identity,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  note       text not null default '' check (char_length(note) <= 120),
  crowned_by uuid references public.profiles (id) on delete set null,
  crowned_at timestamptz not null default now(),
  ended_at   timestamptz,
  ended_by   uuid references public.profiles (id) on delete set null
);
-- At most one reigning hero.
create unique index if not exists hero_reigns_one_current on public.hero_reigns ((true)) where ended_at is null;
create index if not exists hero_reigns_user on public.hero_reigns (user_id);

create table if not exists public.staff_grants (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  reward_id  text not null check (reward_id in ('wizard_council_hat', 'royal_scepter', 'starlit_throne', 'council_mvp')),
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, reward_id)
);

alter table public.staff_cosmetics enable row level security;
alter table public.hero_reigns     enable row level security;
alter table public.staff_grants    enable row level security;
revoke all on public.staff_cosmetics, public.hero_reigns, public.staff_grants from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Internal helpers (not callable through the API)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_staff_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.profiles where id = p_user and role in ('admin', 'chair'));
$$;

-- All-time staff work + hero history.
create or replace function public.staff_stats(p_user uuid)
returns table (reviews int, announcements int, hosted int, hero_count int, is_hero boolean)
language sql stable security definer set search_path = public, extensions as $$
  select
    (select count(*) from public.submissions s where s.reviewer_id = p_user and s.status in ('approved', 'rejected'))::int,
    (select count(*) from public.announcements a where a.created_by = p_user)::int,
    (select count(*) from public.events e where e.created_by = p_user and e.attendee_count >= 5)::int,
    (select count(*) from public.hero_reigns h where h.user_id = p_user)::int,
    exists (select 1 from public.hero_reigns h where h.user_id = p_user and h.ended_at is null);
$$;

-- Council badges in display order (mirrors STAFF_BADGES). hero_week progress = times crowned.
create or replace function public.staff_badges_for(p_user uuid)
returns table (id text, earned boolean, progress int, goal int)
language sql stable security definer set search_path = public, extensions as $$
  with s as (select * from public.staff_stats(p_user)),
  core (ord, bid, val, bgoal) as (
              select 1, 'gatekeeper', s.reviews,       25 from s
    union all select 2, 'town_crier', s.announcements, 5  from s
    union all select 3, 'event_host', s.hosted,        3  from s
  ),
  legend as (
    select ((select count(*) from core where core.val >= core.bgoal)
            + (select case when s.hero_count >= 1 then 1 else 0 end from s))::int as n
  )
  select x.bid, x.ok, x.prog, x.bgoal from (
              select core.ord, core.bid, core.val >= core.bgoal as ok, least(greatest(core.val, 0), core.bgoal) as prog, core.bgoal from core
    union all select 4, 'hero_week', s.hero_count >= 1, s.hero_count, 1 from s
    union all select 5, 'council_legend', legend.n >= 4, legend.n, 4 from legend
  ) x
  order by x.ord;
$$;

-- Staff cosmetic ids a user may equip right now ('{}' for participants).
create or replace function public.staff_unlocks_for(p_user uuid)
returns text[] language sql stable security definer set search_path = public, extensions as $$
  with st as (select * from public.staff_stats(p_user))
  select coalesce(array_agg(c.id order by c.sort_order, c.id), '{}'::text[])
    from public.staff_cosmetics c, st
   where public.is_staff_user(p_user)
     and case c.rule_type
           when 'staff'         then true
           when 'reviews'       then st.reviews >= c.rule_value
           when 'announcements' then st.announcements >= c.rule_value
           when 'hosted'        then st.hosted >= c.rule_value
           when 'grant'         then exists (select 1 from public.staff_grants g where g.user_id = p_user and g.reward_id = c.id)
           when 'hero'          then st.is_hero
           else false
         end;
$$;

-- Golden Yak: staff with the Council Legend badge or a 'council_mvp' grant.
create or replace function public.legendary_for(p_user uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.is_staff_user(p_user)
     and (exists (select 1 from public.staff_grants g where g.user_id = p_user and g.reward_id = 'council_mvp')
          or exists (select 1 from public.staff_badges_for(p_user) b where b.id = 'council_legend' and b.earned));
$$;

-- Takes staff items off someone's look (p_only_hero: just the hero perks).
create or replace function public.strip_staff_look(p_user uuid, p_only_hero boolean)
returns void language sql security definer set search_path = public, extensions as $$
  update public.profiles p
     set hat        = case when exists (select 1 from public.staff_cosmetics c where c.id = p.hat and (not p_only_hero or c.rule_type = 'hero')) then null else p.hat end,
         accessory  = case when exists (select 1 from public.staff_cosmetics c where c.id = p.accessory and (not p_only_hero or c.rule_type = 'hero')) then null else p.accessory end,
         background = case when exists (select 1 from public.staff_cosmetics c where c.id = p.background and (not p_only_hero or c.rule_type = 'hero')) then null else p.background end
   where p.id = p_user;
$$;

create or replace function public.hero_reign_json(h public.hero_reigns)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', h.id, 'userId', h.user_id, 'displayName', p.display_name, 'campus', p.campus, 'avatar', p.avatar,
    'hat', p.hat, 'accessory', p.accessory, 'background', p.background,
    'note', h.note, 'crownedAt', h.crowned_at, 'crownedByName', coalesce(public.display_name_of(h.crowned_by), ''),
    'endedAt', h.ended_at)
    from public.profiles p where p.id = h.user_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Back to participant: staff looks + Golden Yak come off, a reign ends (history kept)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.profiles_staff_rewards_on_role()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.role = 'participant' and old.role in ('admin', 'chair') then
    if exists (select 1 from public.staff_cosmetics c where c.id = new.hat) then new.hat := null; end if;
    if exists (select 1 from public.staff_cosmetics c where c.id = new.accessory) then new.accessory := null; end if;
    if exists (select 1 from public.staff_cosmetics c where c.id = new.background) then new.background := null; end if;
    if new.avatar = 'golden_yak' then
      new.avatar := coalesce(nullif(new.normal_avatar, 'golden_yak'), 'yak');
    end if;
    if exists (select 1 from public.hero_reigns h where h.user_id = new.id and h.ended_at is null) then
      update public.hero_reigns set ended_at = now(), ended_by = auth.uid() where user_id = new.id and ended_at is null;
      perform public.log_admin_action(auth.uid(), 'hero_cleared', new.id, jsonb_build_object('reason', 'role_changed'));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_staff_rewards_role on public.profiles;
create trigger profiles_staff_rewards_role before update of role on public.profiles
  for each row execute function public.profiles_staff_rewards_on_role();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. API: the caller's own staff rewards (null for participants)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.my_staff_rewards()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  st    record;
begin
  if not public.is_staff_user(v_uid) then
    return null;
  end if;
  select * into st from public.staff_stats(v_uid);
  return json_build_object(
    'isHero', st.is_hero,
    'heroCount', st.hero_count,
    'unlocks', to_json(public.staff_unlocks_for(v_uid)),
    'badges', (select coalesce(json_agg(json_build_object('id', b.id, 'earned', b.earned, 'progress', b.progress, 'goal', b.goal) order by b.ord), '[]'::json)
                 from public.staff_badges_for(v_uid) with ordinality as b (id, earned, progress, goal, ord)),
    'legendary', public.legendary_for(v_uid),
    'grants', (select coalesce(json_agg(g.reward_id order by g.granted_at, g.reward_id), '[]'::json) from public.staff_grants g where g.user_id = v_uid));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. API: Hero board (admins + chairs)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.hero_board()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return json_build_object(
    'current', (select public.hero_reign_json(h) from public.hero_reigns h where h.ended_at is null limit 1),
    'history', (select coalesce(json_agg(public.hero_reign_json(h) order by h.seq desc), '[]'::json) from public.hero_reigns h),
    'team', (select coalesce(json_agg(json_build_object(
                'userId', p.id, 'displayName', p.display_name, 'handle', p.handle, 'role', p.role, 'campus', p.campus,
                'avatar', p.avatar, 'hat', p.hat, 'accessory', p.accessory, 'background', p.background,
                'isHero', st.is_hero, 'heroCount', st.hero_count,
                'grants', (select coalesce(json_agg(g.reward_id order by g.granted_at, g.reward_id), '[]'::json) from public.staff_grants g where g.user_id = p.id),
                'legendary', public.legendary_for(p.id))
              order by (p.role = 'chair') desc, p.display_name, p.id), '[]'::json)
               from public.profiles p cross join lateral public.staff_stats(p.id) st
              where p.role in ('admin', 'chair')));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. API: crown / clear Hero of the Week (chairs)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.crown_hero(p_user_id uuid, p_note text default '')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  v_note  text := trim(coalesce(p_note, ''));
  t       public.profiles;
  cur     public.hero_reigns;
begin
  perform pg_advisory_xact_lock(hashtext('yacquest:hero'));
  select * into t from public.profiles where id = p_user_id;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role not in ('admin', 'chair') then
    perform public.api_error('not_staff', 'Only admins and chairs can be Hero of the Week.');
  end if;
  if char_length(v_note) > 120 then
    perform public.api_error('note', 'Keep the note to 120 characters.');
  end if;
  select * into cur from public.hero_reigns where ended_at is null for update;
  if cur.id is not null then
    update public.hero_reigns set ended_at = now(), ended_by = v_chair where id = cur.id;
    if cur.user_id <> p_user_id then
      perform public.strip_staff_look(cur.user_id, true);
    end if;
  end if;
  insert into public.hero_reigns (user_id, note, crowned_by) values (p_user_id, v_note, v_chair);
  perform public.notify(p_user_id, 'hero_crowned', 'You’re Hero of the Week!',
    case when v_note <> '' then v_note
         else coalesce(public.display_name_of(v_chair), 'A chair') || ' crowned you at the YAC meeting. Thank you!' end);
  perform public.log_admin_action(v_chair, 'hero_crowned', p_user_id, jsonb_build_object('note', nullif(v_note, '')));
end $$;

create or replace function public.clear_hero()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  cur     public.hero_reigns;
begin
  perform pg_advisory_xact_lock(hashtext('yacquest:hero'));
  select * into cur from public.hero_reigns where ended_at is null for update;
  if cur.id is null then
    perform public.api_error('not_found', 'There’s no Hero of the Week right now.');
  end if;
  update public.hero_reigns set ended_at = now(), ended_by = v_chair where id = cur.id;
  perform public.strip_staff_look(cur.user_id, true);
  perform public.log_admin_action(v_chair, 'hero_cleared', cur.user_id, '{}'::jsonb);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. API: grant a Council reward (chairs). 'council_mvp' unlocks the Golden Yak.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.grant_staff_reward(p_user_id uuid, p_reward text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  t       public.profiles;
  v_name  text := case p_reward
                    when 'wizard_council_hat' then 'Wizard Council Hat'
                    when 'royal_scepter'      then 'Royal Scepter'
                    when 'starlit_throne'     then 'Starlit Throne Room'
                    when 'council_mvp'        then 'Council MVP'
                  end;
begin
  if v_name is null then
    perform public.api_error('reward', 'Pick one of the Council rewards.');
  end if;
  select * into t from public.profiles where id = p_user_id;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role not in ('admin', 'chair') then
    perform public.api_error('not_staff', 'Only admins and chairs can get Council rewards.');
  end if;
  insert into public.staff_grants (user_id, reward_id, granted_by) values (p_user_id, p_reward, v_chair)
  on conflict (user_id, reward_id) do nothing;
  if not found then
    perform public.api_error('already', format('%s already has the %s.', t.display_name, v_name));
  end if;
  if p_reward = 'council_mvp' then
    perform public.notify(p_user_id, 'staff_reward', 'Council MVP: the Golden Yak is yours!',
      'Pick the Legendary Golden Yak under Me → Edit profile.');
  else
    perform public.notify(p_user_id, 'staff_reward', 'New Council look: ' || v_name,
      coalesce(public.display_name_of(v_chair), 'A chair') || ' gave you the ' || v_name || '. Find it in the Wardrobe.');
  end if;
  perform public.log_admin_action(v_chair, 'staff_reward_granted', p_user_id, jsonb_build_object('reward', p_reward, 'name', v_name));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. equip_look: copy of 0009 + staff items (staff only, must be unlocked)
--    Participants get the same 'look' error as for any unknown item.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.equip_look(p_hat text default null, p_accessory text default null, p_background text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid    uuid := public.require_user();
  v_unl    text[] := public.unlocks_for(v_uid);
  v_staff  text[] := public.staff_unlocks_for(v_uid);
  v_hat    text := nullif(trim(coalesce(p_hat, '')), '');
  v_acc    text := nullif(trim(coalesce(p_accessory, '')), '');
  v_bg     text := nullif(trim(coalesce(p_background, '')), '');
  v_slot   text;
  v_item   text;
begin
  foreach v_slot in array array['hat', 'accessory', 'background'] loop
    v_item := case v_slot when 'hat' then v_hat when 'accessory' then v_acc else v_bg end;
    continue when v_item is null;
    if exists (select 1 from public.cosmetics c where c.id = v_item and c.slot = v_slot) then
      if not (v_item = any (v_unl)) then
        perform public.api_error('locked', 'Unlock this first!');
      end if;
    elsif public.is_staff_user(v_uid)
          and exists (select 1 from public.staff_cosmetics c where c.id = v_item and c.slot = v_slot) then
      if not (v_item = any (v_staff)) then
        perform public.api_error('locked', 'Unlock this first!');
      end if;
    else
      perform public.api_error('look', 'That item doesn’t go there.');
    end if;
  end loop;
  update public.profiles set hat = v_hat, accessory = v_acc, background = v_bg where id = v_uid;
  return json_build_object('hat', v_hat, 'accessory', v_acc, 'background', v_bg);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. update_profile: copy of 0010 + the Golden Yak gate (+ remembers the last normal character)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.update_profile(p_display_name text default null, p_avatar text default null, p_email_opt_in boolean default null)
returns public.profiles language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  p     public.profiles;
begin
  if p_display_name is not null and char_length(trim(p_display_name)) not between 2 and 24 then
    perform public.api_error('displayName', 'Display name: 2–24 characters.');
  end if;
  if p_display_name is not null and not public.name_is_clean(trim(p_display_name)) then
    perform public.api_error('displayName', 'Please pick a different name — keep it friendly for everyone.');
  end if;
  if p_avatar is not null and p_avatar not in ('yak','unicorn','dragon','knight','mage','ranger')
     and not (p_avatar = 'golden_yak' and public.legendary_for(v_uid)) then
    perform public.api_error('avatar', 'Pick one of the avatars.');
  end if;
  update public.profiles
     set display_name  = coalesce(trim(p_display_name), display_name),
         avatar        = coalesce(p_avatar, avatar),
         normal_avatar = case when p_avatar is null then normal_avatar
                              when p_avatar <> 'golden_yak' then p_avatar
                              when avatar <> 'golden_yak' then avatar
                              else normal_avatar end,
         email_opt_in  = coalesce(p_email_opt_in, email_opt_in)
   where id = v_uid
   returning * into p;
  update public.prize_claims set display_name = p.display_name where user_id = v_uid;
  return p;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Grants (Supabase auto-grants new functions to anon + authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function
  public.is_staff_user(uuid), public.staff_stats(uuid), public.staff_badges_for(uuid), public.staff_unlocks_for(uuid),
  public.legendary_for(uuid), public.strip_staff_look(uuid, boolean), public.hero_reign_json(public.hero_reigns),
  public.profiles_staff_rewards_on_role()
from public, anon, authenticated, service_role;

revoke execute on function
  public.my_staff_rewards(), public.hero_board(), public.crown_hero(uuid, text), public.clear_hero(),
  public.grant_staff_reward(uuid, text), public.equip_look(text, text, text), public.update_profile(text, text, boolean)
from public, anon;
grant execute on function
  public.my_staff_rewards(), public.hero_board(), public.crown_hero(uuid, text), public.clear_hero(),
  public.grant_staff_reward(uuid, text), public.equip_look(text, text, text), public.update_profile(text, text, boolean)
to authenticated;

-- Done.

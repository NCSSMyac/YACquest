-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 — Up to 5 chairs.
--   • app_config.max_chairs (default 5; MAX_CHAIRS in src/config.ts).
--   • set_role can now make chairs (confirmed email + under max_chairs).
--   • step_down_chair(): a chair becomes an admin (not the last chair).
--   • transfer_chair / sign-up bootstrap use max_chairs instead of a hard 2.
-- Role changes are logged by the profiles_role_audit trigger (0004).
-- Run AFTER 0010. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Setting
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.app_config add column if not exists max_chairs int not null default 5;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. set_role: participant | admin | chair (caller must be a chair)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  t       public.profiles;
  v_max   int;
begin
  if p_role is null or p_role not in ('participant','admin','chair') then
    perform public.api_error('forbidden', 'That role isn’t allowed.');
  end if;
  if p_role = 'chair' then
    perform pg_advisory_xact_lock(hashtext('yacquest:chair_seats'));
  end if;
  select * into t from public.profiles where id = p_user_id for update;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role = 'chair' then
    if p_role = 'chair' then
      return;
    end if;
    perform public.api_error('forbidden', 'A chair can’t be demoted. Chairs step down or hand over their seat instead.');
  end if;
  if p_role in ('admin','chair')
     and not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    perform public.api_error('not_verified',
      format('They need to confirm their email before they can be %s.', case p_role when 'chair' then 'a chair' else 'an admin' end));
  end if;
  if t.role = p_role then
    return;
  end if;
  if p_role = 'chair' then
    select coalesce(max_chairs, 5) into v_max from public.app_config where id = 1;
    v_max := coalesce(v_max, 5);
    if (select count(*) from public.profiles where role = 'chair') >= v_max then
      perform public.api_error('chair_limit', format('YAC already has %s chairs.', v_max));
    end if;
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if p_role = 'chair' then
    perform public.notify(p_user_id, 'announcement', 'You’re now a YAC chair',
      'You can now manage the team, prizes and the cycle. Thanks for leading!');
  elsif p_role = 'admin' then
    perform public.notify(p_user_id, 'announcement', 'You’re now a YACquest admin',
      'You can review submissions, award points and run events. Thanks for helping!');
  else
    perform public.notify(p_user_id, 'announcement', 'Your admin access was removed',
      'You’re back in the game as a participant.');
  end if;
  -- a new participant may already qualify for an open prize spot
  perform public.refresh_prize_race(public.active_cycle_id());
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. transfer_chair (same as 0001, limit from app_config.max_chairs)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.transfer_chair(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
  t       public.profiles;
  v_name  text;
  v_max   int;
begin
  perform pg_advisory_xact_lock(hashtext('yacquest:chair_seats'));
  if p_user_id = v_chair then
    perform public.api_error('forbidden', 'You already hold a chair seat.');
  end if;
  select * into t from public.profiles where id = p_user_id for update;
  if t.id is null then
    perform public.api_error('not_found', 'That person wasn’t found.');
  end if;
  if t.role = 'chair' then
    perform public.api_error('forbidden', 'They are already a chair.');
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    perform public.api_error('not_verified', 'They need to confirm their email before they can be a chair.');
  end if;

  update public.profiles set role = 'admin' where id = v_chair;
  update public.profiles set role = 'chair' where id = p_user_id;
  select max_chairs into v_max from public.app_config where id = 1;
  v_max := coalesce(v_max, 5);
  if (select count(*) from public.profiles where role = 'chair') > v_max then
    perform public.api_error('chair_limit', format('YAC already has %s chairs.', v_max));
  end if;

  select display_name into v_name from public.profiles where id = v_chair;
  perform public.notify(p_user_id, 'announcement', 'You’re now a YAC chair',
    v_name || ' handed you their chair seat. You can now manage the team, prizes and the cycle.');
  perform public.notify(v_chair, 'announcement', 'You handed over your chair seat',
    t.display_name || ' is now a chair. You stay on as an admin.');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. step_down_chair: caller (a chair) becomes an admin
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.step_down_chair()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chair uuid := public.require_chair();
begin
  perform pg_advisory_xact_lock(hashtext('yacquest:chair_seats'));
  if (select count(*) from public.profiles where role = 'chair') <= 1 then
    perform public.api_error('last_chair', 'You’re the only chair — make someone else a chair first.');
  end if;
  update public.profiles set role = 'admin' where id = v_chair;
  perform public.notify(v_chair, 'announcement', 'You stepped down as chair',
    'You stay on as an admin. A current chair can make you a chair again any time.');
end $$;

revoke execute on function public.step_down_chair() from public, anon;
grant  execute on function public.step_down_chair() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Sign-up trigger (copy of 0010; bootstrap limit = app_config.max_chairs)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_handle    text  := nullif(trim(meta->>'handle'), '');
  v_name      text  := nullif(trim(meta->>'display_name'), '');
  v_campus    text  := coalesce(nullif(meta->>'campus', ''), 'unc');
  v_avatar    text  := coalesce(nullif(meta->>'avatar', ''), 'yak');
  v_code      text  := nullif(upper(trim(meta->>'friend_code')), '');
  v_local     text  := split_part(coalesce(new.email, ''), '@', 1);
  v_referrer  uuid;
  v_role      text  := 'participant';
  cfg         public.app_config;
begin
  select * into cfg from public.app_config where id = 1;

  if v_handle is null then
    -- fallback: email local part, cleaned, plus digits if taken
    v_handle := left(regexp_replace(v_local, '[^a-zA-Z0-9_.]', '', 'g'), 15);
    if length(v_handle) < 3 then v_handle := 'user' || v_handle; end if;
    if not public.name_is_clean(v_handle) then
      v_handle := 'player' || floor(random() * 10000)::int;
    end if;
    while exists (select 1 from public.profiles where handle = v_handle::citext) loop
      v_handle := left(v_handle, 15) || floor(random() * 10000)::int;
    end loop;
  elsif v_handle !~ '^[a-zA-Z0-9_.]{3,20}$' then
    perform public.api_error('handle', 'Username: 3–20 letters, numbers, dots or underscores.');
  elsif not public.name_is_clean(v_handle) then
    perform public.api_error('handle', 'Please pick a different name — keep it friendly for everyone.');
  elsif exists (select 1 from public.profiles where handle = v_handle::citext) then
    perform public.api_error('handle', 'That username is taken.');
  end if;

  if v_name is not null and not public.name_is_clean(v_name) then
    perform public.api_error('displayName', 'Please pick a different name — keep it friendly for everyone.');
  end if;
  v_name := coalesce(v_name, left(v_local, 24));
  -- fallback name from the email must be clean too; the handle always is.
  if char_length(v_name) < 2 or not public.name_is_clean(v_name) then v_name := v_handle; end if;
  if char_length(v_name) > 24 then
    perform public.api_error('displayName', 'Display name: 2–24 characters.');
  end if;
  if v_campus not in ('duke','unc','ncsu') then
    perform public.api_error('campus', 'Pick your campus.');
  end if;
  if v_avatar not in ('yak','unicorn','dragon','knight','mage','ranger') then
    v_avatar := 'yak';
  end if;

  if v_code is not null then
    select id into v_referrer from public.profiles where friend_code = v_code;
    if v_referrer is null then
      perform public.api_error('friendCode', 'We couldn’t find that friend code.');
    end if;
  end if;

  -- Bootstrap chairs (never more than app_config.max_chairs chairs).
  if exists (select 1 from public.chair_bootstrap where email = new.email::citext)
     and (select count(*) from public.profiles where role = 'chair') < coalesce(cfg.max_chairs, 5) then
    v_role := 'chair';
  end if;

  insert into public.profiles (id, handle, display_name, email, campus, role, avatar, friend_code, referred_by)
  values (new.id, v_handle, v_name, new.email, v_campus, v_role, v_avatar, public.make_friend_code(), v_referrer);

  perform public.notify(new.id, 'announcement', 'Welcome to YACquest!',
    format('Earn points all year. The first %s people to reach %s win a $%s gift card.',
           cfg.prize_count, cfg.prize_goal, cfg.prize_value_usd));
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- YAC's chair team for 2026–27: 6 chairs. These emails become chairs automatically
-- when they sign up and confirm their email (same as the first two).
-- ─────────────────────────────────────────────────────────────────────────────
update public.app_config set max_chairs = 6 where id = 1;
insert into public.chair_bootstrap (email) values
  ('akhil.jariwala@ncssm.edu'),
  ('seven.skinner.yac@ncssm.edu'),
  ('sam.nosalek.yac@ncssm.edu'),
  ('anna.anderson@ncssm.edu')
on conflict do nothing;

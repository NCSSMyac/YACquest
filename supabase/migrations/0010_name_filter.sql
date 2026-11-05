-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 — Name filter: keep usernames and display names friendly.
--   • name_is_clean(text): same rules + word lists as src/lib/nameFilter.ts.
--   • Enforced at sign-up (handle_new_user), in update_profile and handle_available.
--   • admin_rename_user(): admins/chairs can rename anyone if something slips through.
-- Run AFTER 0009. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. name_is_clean
-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORTANT: the two word lists below MUST match BLOCK_ANYWHERE / BLOCK_WORDS in
-- src/lib/nameFilter.ts. Change both together.
create or replace function public.name_is_clean(p text)
returns boolean language plpgsql immutable set search_path = public, extensions as $$
declare
  -- Blocked if found anywhere after removing spaces/punctuation.
  block_anywhere constant text[] := array[
    'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'retard', 'whore', 'slut', 'pussy', 'porn', 'penis',
    'vagina', 'dildo', 'twat', 'wank', 'bastard', 'asshole', 'motherf', 'hitler', 'nazi', 'kkk', 'chink',
    'tranny', 'molest', 'jizz', 'blowjob', 'boner', 'clit', 'cocksuck', 'dumbass', 'jackass', 'bollock'];
  -- Blocked only as a whole word.
  block_words constant text[] := array[
    'ass', 'arse', 'tit', 'tits', 'boob', 'boobs', 'dick', 'dicks', 'cock', 'cum', 'fag', 'fags', 'rape', 'raped',
    'rapist', 'spic', 'kike', 'pedo', 'horny', 'sex', 'sexy', 'nude', 'nudes', 'naked', 'piss', 'damnit', 'hoe', 'hoes'];
  n        text := translate(lower(coalesce(p, '')), '01!34@5$78', 'oiieaasstb');
  squashed text := regexp_replace(n, '[^a-z]', '', 'g');
  w        text;
begin
  foreach w in array block_anywhere loop
    if strpos(squashed, w) > 0 then return false; end if;
  end loop;
  if exists (select 1 from regexp_split_to_table(n, '[^a-z]+') x where x <> '' and x = any (block_words)) then
    return false;
  end if;
  return not (squashed = any (block_words));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Sign-up trigger (copy of 0007 + name checks)
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

  -- Bootstrap chairs (never more than 2 chairs).
  if exists (select 1 from public.chair_bootstrap where email = new.email::citext)
     and (select count(*) from public.profiles where role = 'chair') < 2 then
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
-- 3. update_profile (copy of 0007 + name check)
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
  if p_avatar is not null and p_avatar not in ('yak','unicorn','dragon','knight','mage','ranger') then
    perform public.api_error('avatar', 'Pick one of the avatars.');
  end if;
  update public.profiles
     set display_name = coalesce(trim(p_display_name), display_name),
         avatar       = coalesce(p_avatar, avatar),
         email_opt_in = coalesce(p_email_opt_in, email_opt_in)
   where id = v_uid
   returning * into p;
  update public.prize_claims set display_name = p.display_name where user_id = v_uid;
  return p;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. handle_available (unclean handles are never available)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_available(p_handle text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce(trim(p_handle), '') ~ '^[a-zA-Z0-9_.]{3,20}$'
     and public.name_is_clean(trim(p_handle))
     and not exists (select 1 from public.profiles where handle = trim(p_handle)::citext);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. admin_rename_user
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_rename_user(p_user_id uuid, p_display_name text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.require_admin();
  v_name  text := trim(coalesce(p_display_name, ''));
  v_old   text;
begin
  if char_length(v_name) not between 2 and 24 then
    perform public.api_error('displayName', 'Display name: 2–24 characters.');
  end if;
  if not public.name_is_clean(v_name) then
    perform public.api_error('displayName', 'Please pick a different name — keep it friendly for everyone.');
  end if;
  select display_name into v_old from public.profiles where id = p_user_id for update;
  if not found then
    perform public.api_error('not_found', 'That player doesn’t exist.');
  end if;

  update public.profiles set display_name = v_name where id = p_user_id;
  update public.prize_claims set display_name = v_name where user_id = p_user_id and status <> 'revoked';

  perform public.notify(p_user_id, 'announcement', 'Your display name was updated',
    format('Your display name is now “%s”. A YAC admin changed it to keep names friendly for everyone.', v_name));
  perform public.log_admin_action(v_admin, 'user_renamed', p_user_id,
    jsonb_build_object('from', v_old, 'to', v_name));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.name_is_clean(text) from public, anon, authenticated;
revoke execute on function public.admin_rename_user(uuid, text) from public, anon;
grant  execute on function public.admin_rename_user(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 — Two new characters: unicorn and dragon (original pixel designs in
-- NCSSM colors — a nod to the school's mascots, not copies of the official logos).
-- Run AFTER 0006. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

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
  add constraint profiles_avatar_check check (avatar in ('yak','unicorn','dragon','knight','mage','ranger'));

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
    while exists (select 1 from public.profiles where handle = v_handle::citext) loop
      v_handle := left(v_handle, 15) || floor(random() * 10000)::int;
    end loop;
  elsif v_handle !~ '^[a-zA-Z0-9_.]{3,20}$' then
    perform public.api_error('handle', 'Username: 3–20 letters, numbers, dots or underscores.');
  elsif exists (select 1 from public.profiles where handle = v_handle::citext) then
    perform public.api_error('handle', 'That username is taken.');
  end if;

  v_name := coalesce(v_name, left(v_local, 24));
  if char_length(v_name) < 2 then v_name := v_handle; end if;
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

create or replace function public.update_profile(p_display_name text default null, p_avatar text default null, p_email_opt_in boolean default null)
returns public.profiles language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.require_user();
  p     public.profiles;
begin
  if p_display_name is not null and char_length(trim(p_display_name)) not between 2 and 24 then
    perform public.api_error('displayName', 'Display name: 2–24 characters.');
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 — Announcements: admins send custom messages.
--
--   • Audience: everyone, one campus, or one person.
--   • Always shows in the app (bell + "Messages" on the Home dashboard).
--   • Optional email copy, only to people with email updates ON (profiles.email_opt_in)
--     and a confirmed email. Emailing EVERYONE is chair-only.
--   • Emails go out in batches of ≤ 90 BCC recipients (Gmail's per-message limit).
--   • Every announcement is recorded in the admin action log.
-- Run AFTER 0005. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.announcements (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 3 and 80),
  body             text not null check (char_length(body) between 1 and 1000),
  audience         text not null check (audience in ('all', 'campus', 'user')),
  campus           text check (campus in ('duke', 'unc', 'ncsu')),
  target_user_id   uuid references public.profiles (id) on delete set null,
  send_email       boolean not null default false,
  recipient_count  int not null default 0,
  email_count      int not null default 0,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists announcements_created_idx on public.announcements (created_at desc);
create index if not exists notifications_user_kind_idx on public.notifications (user_id, kind, created_at desc);

alter table public.announcements enable row level security;
drop policy if exists announcements_admin_read on public.announcements;
create policy announcements_admin_read on public.announcements for select to authenticated using (public.is_admin());

-- Allow 'announcement' emails in the outbox.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.email_outbox'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.email_outbox drop constraint %I', c);
  end loop;
end $$;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('weekly_report', 'prize_qualified', 'prize_info', 'test', 'announcement'));

-- ─────────────────────────────────────────────────────────────────────────────
-- send_announcement — admin or chair.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.send_announcement(
  p_title text, p_body text, p_audience text,
  p_campus text default null, p_user_id uuid default null, p_send_email boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin    uuid := public.require_admin();
  v_role     text;
  v_title    text := trim(coalesce(p_title, ''));
  v_body     text := trim(coalesce(p_body, ''));
  v_id       uuid;
  v_targets  uuid[];
  v_emails   text[];
  v_count    int;
  v_emailed  int := 0;
  v_chunk    text[];
  v_i        int := 0;
  v_html     text;
  v_today    int;
begin
  select role into v_role from public.profiles where id = v_admin;

  if char_length(v_title) < 3 or char_length(v_title) > 80 then
    perform public.api_error('title', 'Title: 3–80 characters.');
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    perform public.api_error('body', 'Message: 1–1000 characters.');
  end if;
  if p_audience not in ('all', 'campus', 'user') then
    perform public.api_error('audience', 'Choose who gets this message.');
  end if;
  if p_audience = 'campus' and coalesce(p_campus, '') not in ('duke', 'unc', 'ncsu') then
    perform public.api_error('campus', 'Pick a campus.');
  end if;
  if p_audience = 'user' and not exists (select 1 from public.profiles where id = p_user_id) then
    perform public.api_error('user', 'Pick the person to message.');
  end if;
  if p_audience = 'all' and coalesce(p_send_email, false) and v_role <> 'chair' then
    perform public.api_error('forbidden', 'Only a YAC chair can email everyone. Uncheck email or pick a campus.');
  end if;

  -- Simple spam guard: 20 announcements per sender per day.
  select count(*) into v_today from public.announcements
   where created_by = v_admin and created_at > now() - interval '1 day';
  if v_today >= 20 then
    perform public.api_error('limit', 'You''ve sent 20 messages today. Try again tomorrow.');
  end if;

  select coalesce(array_agg(p.id), '{}') into v_targets
    from public.profiles p
   where case p_audience
           when 'all'    then true
           when 'campus' then p.campus = p_campus
           else p.id = p_user_id
         end;
  v_count := cardinality(v_targets);
  if v_count = 0 then
    perform public.api_error('audience', 'Nobody matches that audience yet.');
  end if;

  insert into public.announcements (title, body, audience, campus, target_user_id, send_email, recipient_count, created_by)
  values (v_title, v_body, p_audience,
          case when p_audience = 'campus' then p_campus end,
          case when p_audience = 'user' then p_user_id end,
          coalesce(p_send_email, false), v_count, v_admin)
  returning id into v_id;

  insert into public.notifications (user_id, kind, title, body)
  select t, 'announcement', v_title, v_body from unnest(v_targets) t;

  if coalesce(p_send_email, false) then
    select coalesce(array_agg(distinct lower(u.email::text)), '{}') into v_emails
      from public.profiles p join auth.users u on u.id = p.id
     where p.id = any (v_targets)
       and u.email_confirmed_at is not null and u.email is not null
       and (p.email_opt_in or p_audience = 'user');   -- a direct message always emails that person
    v_emailed := cardinality(v_emails);
    v_html := public.email_layout(v_title,
      '<p style="font-size:16px;line-height:1.5;white-space:pre-wrap;margin:0 0 16px">' || public.html_escape(v_body) || '</p>'
      || '<p style="font-size:13px;color:#4a5672;margin:0">Sent by ' || public.html_escape(coalesce(public.display_name_of(v_admin), 'YAC'))
      || ' via YACquest. Change email updates in the app under Me → Settings.</p>');
    while v_i * 90 < v_emailed loop
      v_chunk := v_emails[v_i * 90 + 1 : (v_i + 1) * 90];
      perform public.enqueue_email('announcement', v_chunk, '📣 YACquest: ' || v_title,
        v_body || E'\n\n— Sent via YACquest. Change email updates in the app under Me → Settings.',
        v_html, 'announcement:' || v_id || ':' || v_i);
      v_i := v_i + 1;
    end loop;
    update public.announcements set email_count = v_emailed where id = v_id;
  end if;

  perform public.log_admin_action(v_admin, 'announcement_sent',
    case when p_audience = 'user' then p_user_id end,
    jsonb_build_object('title', v_title, 'audience', p_audience, 'campus', p_campus,
                       'recipients', v_count, 'emailed', v_emailed));

  return json_build_object('id', v_id, 'recipients', v_count, 'emailed', v_emailed);
end $$;

-- Recent announcements for the Announce screen (admin or chair).
create or replace function public.list_announcements(p_limit int default 20)
returns table (id uuid, title text, body text, audience text, campus text, target_name text,
               send_email boolean, recipient_count int, email_count int, sender_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
    select a.id, a.title, a.body, a.audience, a.campus, public.display_name_of(a.target_user_id),
           a.send_email, a.recipient_count, a.email_count, coalesce(public.display_name_of(a.created_by), 'Unknown'), a.created_at
      from public.announcements a
     order by a.created_at desc
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;

revoke execute on function public.send_announcement(text, text, text, text, uuid, boolean) from public, anon;
revoke execute on function public.list_announcements(int) from public, anon;
grant execute on function public.send_announcement(text, text, text, text, uuid, boolean) to authenticated;
grant execute on function public.list_announcements(int) to authenticated;
-- Table access for logged-in users (rows are still limited by the RLS policy above: admins only).
grant select on public.announcements to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — Council team board (STAFF ONLY, view-only).
--   council_board() (admins + chairs; participants get 'forbidden'): one row per admin/chair
--   with their full look, role, Council badges (from 0020's staff_badges_for), how many
--   Council items they have unlocked (staff_unlocks_for, hero perks included while reigning)
--   and whether they have the Golden Yak (legendary_for). Sorted: reigning hero first, then
--   chairs, then admins, then by name. Nothing else changes.
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0020. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

create or replace function public.council_board()
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return (
    select coalesce(json_agg(json_build_object(
             'userId', p.id, 'displayName', p.display_name, 'handle', p.handle, 'role', p.role, 'campus', p.campus,
             'avatar', p.avatar, 'hat', p.hat, 'accessory', p.accessory, 'background', p.background,
             'isHero', st.is_hero, 'heroCount', st.hero_count,
             'badges', (select coalesce(json_agg(json_build_object('id', b.id, 'earned', b.earned, 'progress', b.progress, 'goal', b.goal) order by b.ord), '[]'::json)
                          from public.staff_badges_for(p.id) with ordinality as b (id, earned, progress, goal, ord)),
             'unlockCount', coalesce(array_length(public.staff_unlocks_for(p.id), 1), 0),
             'legendary', public.legendary_for(p.id))
           order by st.is_hero desc, (p.role = 'chair') desc, p.display_name, p.id), '[]'::json)
      from public.profiles p cross join lateral public.staff_stats(p.id) st
     where p.role in ('admin', 'chair'));
end $$;

revoke execute on function public.council_board() from public, anon;
grant  execute on function public.council_board() to authenticated;

-- Done.

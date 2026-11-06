-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — Prize goal 300. (SUPERSEDED by 0018 — this file is now a no-op; see below.)
--   The 350 goal from 0014 looked too hard for ~6 events (in simulation fewer than 4 people
--   reached it in ~60% of runs). The goal drops to 300. Tier points stay 35/20/5, still
--   4 spots × $75. Simulation (scripts/simulate-points.py): ~7 of 300 reach 300, fewer than
--   4 winners in ~2% of runs, ~58 people get past halfway (150).
--
--   • app_config.prize_goal = 300 (0003 sets 650 and 0014 sets 350 on every re-run; this file
--     runs after them), then refresh_prize_race() so anyone already at 300+ gets a spot now.
--   • Halfway badge: badges_for() (0014) already uses half the goal rounded up → 150. No change.
--   • cosmetics: Sparkle Aura unlocks at 275 points (was 300, which equalled the goal).
--     Mirrors src/lib/cosmetics.ts.
--   • report_settings.near_goal_points ("close to the prize" in the weekly email): default
--     50 (was 75); the existing row is moved from 75 to 50 (other values are left alone).
--   • admin_overview() "Close to the goal" stays within 75 points (no change).
--
-- HOW TO USE: Supabase → SQL Editor → paste this whole file → Run.
-- Run AFTER 0015. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUPERSEDED by 0018 (goal back to 350). The statements that set the goal to 300,
-- re-ran refresh_prize_race(), moved Sparkle Aura to 275 and the "close to the prize"
-- range to 50 were removed in the 0019 consistency pass: 0018 undoes all of them, and
-- re-running them on a live database handed a prize spot to anyone at 300–349 (then
-- 0018 revoked it again, with notifications and committee emails both ways).
-- This file now does nothing; it is kept so the numbering stays complete.
-- ─────────────────────────────────────────────────────────────────────────────

-- Done.

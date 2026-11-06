/**
 * YACquest program settings — the single place to tune the game.
 *
 * How these numbers were chosen (see docs/POINTS.md for the full model):
 * - ~300 participants across Duke, UNC and NC State.
 * - Points start with the first event (Nov 8, 2026) and the cycle ends May 1, 2027.
 * - This year YAC runs only ~6 more events (4 home-campus, 2 cross-campus) and posts on social
 *   media every other week (~12 digital chances), so the goal was lowered from 650 to 350 (briefly 300, now back to 350).
 * - Goal: the prize is HARD. In simulation (scripts/simulate-points.py, GOAL = 350) about 3 of 300 reach 350
 *   (mean ~3.1–3.2, median 3), the first one around early April (~83% of the season); the 5th best ends near
 *   325, so usually a spot or two stays open (fewer than 4 winners in ~63% of runs); ~43 people get past
 *   halfway (175); the median ends near 64.
 *   A "perfect" participant who does everything tops out near 800.
 * - Every automatic award is a tier value below. Manual admin additions are capped at TIER_POINTS[1].
 *   The database has its own copy in app_config (supabase/migrations/0003…, goal set in 0018) — change both together.
 *
 * Mid-year check (around Feb 1): if almost nobody is past halfway (175), lower PRIZE.goal.
 */

export type Tier = 1 | 2 | 3;

export const CYCLE = {
  name: '2026–27 Pilot',
  /** When the database cycle opens (cycles.starts_at). Points earned from here count. Not shown to players. */
  start: '2026-10-15T00:00:00-04:00',
  /** The start date players see (posters, Rules, Sign-up, Help): the first event, Nov 8, 2026. Display only. */
  displayStart: '2026-11-08T00:00:00-05:00',
  end: '2027-05-01T23:59:59-04:00',
} as const;

export const TIER_POINTS: Record<Tier, number> = {
  1: 35, // High-impact engagement
  2: 20, // Active participation
  3: 5, // Digital & community connection (screenshot proof)
};

export const TIER_LABELS: Record<Tier, string> = {
  1: 'High-Impact',
  2: 'Active',
  3: 'Digital',
};

/** The one prize: the first N people to reach `goal` win a gift card. */
export const PRIZE = {
  goal: 350,
  count: 4,
  valueUsd: 75,
  name: '$75 gift card',
  /** Claims are fulfilled after the cycle ends. */
  fulfillBy: '2027-05-15',
} as const;

/** Anti-farming limits. Enforced by the API (mock now, backend later). */
export const CAPS = {
  /** Tier-3 digital actions (all kinds combined) per participant per week. */
  digitalPerWeek: 1,
  /** Social tag posts (Tier 2) per participant per calendar month. */
  socialTagPerMonth: 2,
  /** Friends who sign up with your code and attend an event. */
  referralsPerCycle: 3,
  /** Photo uploads that earn points, per event. */
  photosPerEvent: 1,
  /** Photo uploads that earn points, per cycle (photos are Tier 1, so this keeps them from dominating). */
  photosPerCycle: 4,
} as const;

export const CAMPUSES = [
  { id: 'duke', name: 'Duke', full: 'Duke University', city: 'Durham', color: '#00539b' },
  { id: 'unc', name: 'UNC', full: 'UNC-Chapel Hill', city: 'Chapel Hill', color: '#7bafd4' },
  { id: 'ncsu', name: 'NC State', full: 'NC State University', city: 'Raleigh', color: '#cc0000' },
] as const;

export type CampusId = (typeof CAMPUSES)[number]['id'];

export const campusName = (id: CampusId) => CAMPUSES.find((c) => c.id === id)?.name ?? id;

/** Uploads are resized in the browser before sending to keep 300 users' photos cheap. */
export const UPLOAD = {
  maxBytes: 8 * 1024 * 1024,
  maxDimension: 1280,
  jpegQuality: 0.8,
  accept: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
} as const;

/**
 * Admin → Overview "Close to the goal": unclaimed participants within this many points of PRIZE.goal
 * (admin_overview() in the database uses the same 75). The weekly email has its own chair-editable
 * range, report_settings.near_goal_points (default 75).
 */
export const ADMIN_NEAR_GOAL_POINTS = 75;

/** Polling interval for the live "prizes left" counter. */
export const PRIZE_POLL_MS = 15_000;

/** YAC contacts shown in the Rules and anywhere participants need help. */
export const CONTACT_EMAILS = ['iesha.landis.yac@ncssm.edu', 'jacob.rodriguez.yac@ncssm.edu'] as const;
export const INSTAGRAM_HANDLE = '@ncssmyoungalumni';
export const INSTAGRAM_URL = 'https://www.instagram.com/ncssmyoungalumni/';

/** Up to this many YACquest Chairs at once (the database has its own copy: app_config.max_chairs). */
export const MAX_CHAIRS = 6;

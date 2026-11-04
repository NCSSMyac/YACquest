/**
 * YACquest program settings — the single place to tune the game.
 *
 * How these numbers were chosen (see docs/POINTS.md for the full model):
 * - ~300 participants across Duke, UNC and NC State.
 * - Cycle runs from launch (mid-Oct 2026) to May 1, 2027 (~22 active weeks).
 * - Goal: about 5 people reach the prize threshold by the end of the cycle.
 *   In simulation (scripts/simulate-points.py) ~5–6 of 300 reach 650 by May 1;
 *   the median participant ends near 105. A "perfect" participant tops out near 1,080.
 *
 * Mid-year check (around Feb 1): if almost nobody is past 300, lower PRIZE.goal.
 */

export type Tier = 1 | 2 | 3;

export const CYCLE = {
  name: '2026–27 Pilot',
  start: '2026-10-15T00:00:00-04:00',
  end: '2027-05-01T23:59:59-04:00',
} as const;

export const TIER_POINTS: Record<Tier, number> = {
  1: 40, // High-impact engagement
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
  goal: 650,
  count: 5,
  valueUsd: 50,
  name: '$50 gift card',
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

/** Polling interval for the live "prizes left" counter. */
export const PRIZE_POLL_MS = 15_000;

export const CONTACT_EMAIL = 'yac@ncssm.edu'; // TODO: confirm with YAC
export const INSTAGRAM_HANDLE = '@ncssm_yac'; // TODO: confirm with YAC

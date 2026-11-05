/**
 * The ONLY module screens import data from: `import * as api from '../api'`.
 *
 * - No Supabase settings (VITE_SUPABASE_URL unset) → browser-only demo (mock.ts).
 * - Supabase settings present → the real backend (live.ts).
 *
 * The `_mustMatch` line below fails the build if live.ts is missing anything mock.ts has.
 */
import { supabaseConfigured } from '../lib/supabase';
import * as mock from './mock';
import * as live from './live';

export { ApiError } from './shared';
export type { AdminOverview, AdminUserRow, EventInput, QueueItem, SignupInput, SignupResult, TeamMember } from './shared';

type PublicApi = Omit<typeof mock, 'seed' | '__test'>;
const _mustMatch: PublicApi = live;
void _mustMatch;

const useLive = supabaseConfigured;
const impl: PublicApi = useLive ? live : mock;

export const {
  isMock,
  subscribe,
  // auth
  currentUser,
  onAuthChange,
  login,
  logout,
  signup,
  resendConfirmation,
  requestPasswordReset,
  updatePassword,
  updateProfile,
  // participant
  getDashboard,
  listActivities,
  listEvents,
  checkIn,
  canSubmit,
  submitProof,
  mySubmissions,
  myLedger,
  leaderboard,
  campusLeaders,
  campusCup,
  myRank,
  prizeStatus,
  submitClaimInfo,
  suggestPrize,
  notifications,
  unreadCountSync,
  markNotificationsRead,
  // admin
  reviewQueue,
  reviewSubmission,
  searchUsers,
  userLedger,
  adjustPoints,
  awardActivity,
  adminListEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  adminOverview,
  listSuggestions,
  weeklyReportPreview,
  sendAnnouncement,
  myBadges,
  myUnlocks,
  equipLook,
  weeklyShoutout,
  submitFeedback,
  listFeedback,
  markFeedbackReviewed,
  listAnnouncements,
  // chair
  listTeam,
  setRole,
  adminRenameUser,
  transferChair,
  listClaims,
  markFulfilled,
  exportLedgerCsv,
  resetCycle,
  archives,
  resetDemoData,
  // chair: weekly email, prize alerts, action log
  getReportSettings,
  updateReportSettings,
  sendWeeklyReportNow,
  sendTestEmail,
  emailLog,
  retryEmail,
  adminActionLog,
} = impl;

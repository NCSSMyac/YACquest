/**
 * 0030: in-app event feedback survey — rules and texts shared by the survey screen, the mock API and
 * the live API. The database (submit_event_survey in 0030_event_surveys.sql) is the real gatekeeper;
 * these mirror it so people get instant, friendly messages. Pure helpers.
 */
import { TIER_POINTS } from '../config';

/** Open from your check-in until this many days after the event ends. */
export const SURVEY_WINDOW_DAYS = 14;
/** Tier 3 points, once per person per event. Not counted toward the weekly digital cap. */
export const SURVEY_POINTS = TIER_POINTS[3];
export const SURVEY_LIMITS = { favorite: 300, leastFavorite: 300, comments: 1000 } as const;

/** Tiny labels under the pixel stars, 1★ → 5★. */
export const RATING_LABELS = ['Meh', 'Okay', 'Good', 'Great', 'Legendary!'] as const;
export const ratingLabel = (n: number) => RATING_LABELS[Math.min(5, Math.max(1, Math.round(n))) - 1];

/** In-app path of an event's survey (HashRouter: `#/survey/<id>`). */
export const surveyPath = (eventId: string) => `/survey/${eventId}`;

/** Last moment answers are accepted (ends_at + 14 days), in ms. */
export const surveyClosesAt = (endsAt: string) => new Date(endsAt).getTime() + SURVEY_WINDOW_DAYS * 86_400_000;

/** survey_window_open(ends_at, now): until exactly 14 days after the end (check-in itself is the start). */
export const surveyWindowOpen = (endsAt: string, now: number) => now <= surveyClosesAt(endsAt);

/** Show "Rate this event" for a past event card: you came, haven't answered, window still open. */
export function canRate(e: { endsAt: string; checkedIn: boolean; surveyDone?: boolean }, now: number): boolean {
  return e.checkedIn && e.surveyDone === false && surveyWindowOpen(e.endsAt, now);
}

/** Trim + drop control characters (line breaks stay), like survey_text() on the server. */
export const cleanSurveyText = (v: string | null | undefined) =>
  (v ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/^[\s]+|[\s]+$/g, '');

export interface SurveyAnswers {
  rating: number | null;
  favorite: string;
  leastFavorite?: string;
  comments?: string;
}

/** First problem as `{ code, message }` (codes match the server's errors), or null when it can be sent. */
export function surveyError(a: SurveyAnswers): { code: 'rating' | 'favorite' | 'least_favorite' | 'comments'; message: string } | null {
  if (a.rating == null || !Number.isInteger(a.rating) || a.rating < 1 || a.rating > 5) return { code: 'rating', message: 'Pick 1 to 5 stars.' };
  const fav = cleanSurveyText(a.favorite);
  if (!fav) return { code: 'favorite', message: 'Tell us your favorite part (a few words is plenty).' };
  if (fav.length > SURVEY_LIMITS.favorite) return { code: 'favorite', message: `Keep your favorite part to ${SURVEY_LIMITS.favorite} characters.` };
  if (cleanSurveyText(a.leastFavorite).length > SURVEY_LIMITS.leastFavorite) return { code: 'least_favorite', message: `Keep your least favorite part to ${SURVEY_LIMITS.leastFavorite} characters.` };
  if (cleanSurveyText(a.comments).length > SURVEY_LIMITS.comments) return { code: 'comments', message: `Keep suggestions and comments to ${SURVEY_LIMITS.comments} characters.` };
  return null;
}

/** "4.3" (one decimal) or "–" when there are no answers yet. */
export const fmtAverage = (avg: number | null | undefined) => (avg == null ? '–' : avg.toFixed(1));

/** Per-star counts [1★..5★] → average to one decimal (null when empty). */
export function averageOf(dist: readonly number[]): number | null {
  const n = dist.reduce((s, x) => s + x, 0);
  if (!n) return null;
  return Math.round((dist.reduce((s, x, i) => s + x * (i + 1), 0) / n) * 10) / 10;
}

import { CAPS, INSTAGRAM_HANDLE } from '../config';
import type { Activity } from '../types';

/**
 * Catalog of ways to earn points, from the YAC proposal (section 4).
 * Point values come from TIER_POINTS in config.ts, and limit labels from CAPS, not from here.
 */
/** Shared by every Tier 3 screenshot quest: the weekly cap counts all digital kinds together. */
const DIGITAL_LIMIT = `Digital: ${CAPS.digitalPerWeek} per week`;

export const ACTIVITIES: Activity[] = [
  // Tier 1 — High-Impact Engagement
  {
    id: 'annual_fund',
    tier: 1,
    title: 'Give to the Annual Fund',
    description: 'Contribute any amount to the NCSSM alumni annual fund. Upload your receipt or confirmation email (hide card details).',
    method: 'screenshot',
    limitLabel: 'Once per cycle',
  },
  {
    id: 'bring_new_alum',
    tier: 1,
    title: 'Bring a New Young Alum',
    description: 'A friend signs up with your friend code and checks in at their first YAC event. You BOTH get these points, automatically.',
    method: 'referral',
    limitLabel: `Up to ${CAPS.referralsPerCycle} friends`,
  },
  {
    id: 'cross_campus_event',
    tier: 1,
    title: 'High-Impact Event',
    description: 'Check in at a High-Impact YAC event (like cross-campus gatherings) with the event password.',
    method: 'event_password',
  },
  {
    id: 'event_photos',
    tier: 1,
    title: 'Upload Event Photos',
    description: 'Share a photo from a YAC event you attended. A YAC admin reviews it.',
    method: 'photo',
    limitLabel: `${CAPS.photosPerEvent} per event, ${CAPS.photosPerCycle} per cycle`,
  },

  // Tier 2 — Active Participation
  {
    id: 'home_event',
    tier: 2,
    title: 'Active Event',
    description: 'Check in at a YAC event (socials, game nights, panels, mentorship circles, service) with the event password.',
    method: 'event_password',
  },
  {
    id: 'game_win',
    tier: 2,
    title: 'Win a Game or Competition',
    description: 'Win a game at a YAC event. A YAC admin awards these on the spot.',
    method: 'lead_award',
  },
  {
    id: 'social_tag',
    tier: 2,
    title: 'Tag YAC in a Post',
    description: `Tag ${INSTAGRAM_HANDLE} in a relevant social post or shoutout. Upload a screenshot.`,
    method: 'screenshot',
    limitLabel: `${CAPS.socialTagPerMonth} per month`,
  },

  // Tier 3 — Digital & Community Connection
  {
    id: 'digital_event',
    tier: 3,
    title: 'Digital Event',
    description: 'Check in at a digital YAC event (Zoom call, online trivia, livestream) with the event password.',
    method: 'event_password',
  },
  {
    id: 'survey',
    tier: 3,
    title: 'Complete a Feedback Survey',
    description: 'Fill out an alumni or student feedback survey and screenshot the confirmation page.',
    method: 'screenshot',
    limitLabel: DIGITAL_LIMIT,
  },
  {
    id: 'follow_ig',
    tier: 3,
    title: 'Follow YAC on Instagram',
    description: `Follow ${INSTAGRAM_HANDLE} on Instagram and screenshot your follow.`,
    method: 'screenshot',
    limitLabel: 'Once per cycle',
  },
  {
    id: 'repost',
    tier: 3,
    title: 'Repost a YAC Post',
    description: `Repost a ${INSTAGRAM_HANDLE} event, announcement or poster to your story or feed.`,
    method: 'screenshot',
    limitLabel: DIGITAL_LIMIT,
  },
  {
    id: 'poll',
    tier: 3,
    title: 'Vote in a Community Poll',
    description: 'Answer a YAC digital community poll.',
    method: 'screenshot',
    limitLabel: DIGITAL_LIMIT,
  },
  {
    id: 'story_game',
    tier: 3,
    title: 'Play an Insta Story Game',
    description: `Play a game or quiz on the ${INSTAGRAM_HANDLE} Instagram story.`,
    method: 'screenshot',
    limitLabel: DIGITAL_LIMIT,
  },
];

export const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id);

/** Activities a participant can submit proof for themselves. */
export const SUBMITTABLE = ACTIVITIES.filter((a) => a.method === 'screenshot' || a.method === 'photo');

/** Activities that only exist once per cycle. */
export const ONCE_PER_CYCLE = new Set(['annual_fund', 'follow_ig']);

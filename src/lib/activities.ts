import type { Activity } from '../types';

/**
 * Catalog of ways to earn points, from the YAC proposal (section 4).
 * Point values come from TIER_POINTS in config.ts, not from here.
 */
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
    description: 'A friend signs up with your friend code and checks in at their first YAC event. Points are added automatically.',
    method: 'referral',
    limitLabel: 'Up to 3 friends',
  },
  {
    id: 'cross_campus_event',
    tier: 1,
    title: 'Cross-Campus Event',
    description: 'Check in at an all-campus YAC event, or at an event hosted by another campus.',
    method: 'event_password',
  },
  {
    id: 'event_photos',
    tier: 1,
    title: 'Upload Event Photos',
    description: 'Share a photo from a YAC event you attended. A campus lead reviews it.',
    method: 'photo',
    limitLabel: '1 per event',
  },

  // Tier 2 — Active Participation
  {
    id: 'home_event',
    tier: 2,
    title: 'Home-Campus Event',
    description: 'Check in at a YAC event on your own campus with the event password.',
    method: 'event_password',
  },
  {
    id: 'game_win',
    tier: 2,
    title: 'Win a Game or Competition',
    description: 'Win a game at a YAC event. Your campus lead awards these on the spot.',
    method: 'lead_award',
  },
  {
    id: 'social_tag',
    tier: 2,
    title: 'Tag YAC in a Post',
    description: 'Tag YAC in a relevant social post or shoutout. Upload a screenshot.',
    method: 'screenshot',
    limitLabel: '1 per week',
  },
  {
    id: 'panel_mentorship',
    tier: 2,
    title: 'Panel or Mentorship Circle',
    description: 'Take part in a campus alumni panel or mentorship circle. Check in with the event password.',
    method: 'event_password',
  },

  // Tier 3 — Digital & Community Connection (screenshot proof)
  {
    id: 'survey',
    tier: 3,
    title: 'Complete a Feedback Survey',
    description: 'Fill out an alumni or student feedback survey and screenshot the confirmation page.',
    method: 'screenshot',
    limitLabel: 'Digital: 1 per week',
  },
  {
    id: 'follow_ig',
    tier: 3,
    title: 'Follow YAC on Instagram',
    description: 'Follow the official YAC Instagram and screenshot it.',
    method: 'screenshot',
    limitLabel: 'Once per cycle',
  },
  {
    id: 'repost',
    tier: 3,
    title: 'Repost a YAC Post',
    description: 'Repost a YAC event, announcement or poster to your story or feed.',
    method: 'screenshot',
    limitLabel: 'Digital: 1 per week',
  },
  {
    id: 'poll',
    tier: 3,
    title: 'Vote in a Community Poll',
    description: 'Answer a YAC digital community poll.',
    method: 'screenshot',
    limitLabel: 'Digital: 1 per week',
  },
  {
    id: 'story_game',
    tier: 3,
    title: 'Play an Insta Story Game',
    description: 'Interact with a YAC Instagram story game or quiz.',
    method: 'screenshot',
    limitLabel: 'Digital: 1 per week',
  },
];

export const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id);

/** Activities a participant can submit proof for themselves. */
export const SUBMITTABLE = ACTIVITIES.filter((a) => a.method === 'screenshot' || a.method === 'photo');

/** Activities that only exist once per cycle. */
export const ONCE_PER_CYCLE = new Set(['annual_fund', 'follow_ig']);

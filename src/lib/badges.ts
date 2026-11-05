/**
 * Collectible achievement badges. Purely for fun — they never award points, so they can't
 * change the prize race. The server (my_badges() in supabase/migrations/0009_quest_extras.sql)
 * decides who has earned what; this file holds names, descriptions and display order.
 * Everything counts for the current school-year cycle only.
 */
export interface BadgeDef {
  id: string;
  name: string;
  /** How to earn it — shown to players. */
  how: string;
  /** Short flavor line shown once earned. */
  flavor: string;
}

export const BADGES: BadgeDef[] = [
  { id: 'first_checkin', name: 'First Steps', how: 'Check in at your first YAC event.', flavor: 'Every quest starts with one step.' },
  { id: 'regular', name: 'Regular', how: 'Check in at 5 events.', flavor: 'They know your name at the door.' },
  { id: 'veteran', name: 'Veteran', how: 'Check in at 10 events.', flavor: 'A true YAC adventurer.' },
  { id: 'explorer', name: 'Campus Explorer', how: 'Check in at events hosted at Duke, UNC and NC State.', flavor: 'The whole Triangle is your map.' },
  { id: 'big_moment', name: 'Big Moment', how: 'Check in at a High-Impact event.', flavor: 'You showed up when it counted.' },
  { id: 'seasons', name: 'All Seasons', how: 'Check in at events in 3 different months.', flavor: 'Rain or shine, you’re there.' },
  { id: 'digital', name: 'Digital Native', how: 'Get 3 Digital quests approved.', flavor: 'Fluent in polls and story games.' },
  { id: 'shutterbug', name: 'Shutterbug', how: 'Get an event photo approved.', flavor: 'Say cheese!' },
  { id: 'recruiter', name: 'Recruiter', how: 'Bring a friend with your friend code.', flavor: 'The herd grows stronger.' },
  { id: 'giver', name: 'Giver', how: 'Give to the NCSSM annual fund.', flavor: 'Paying it forward.' },
  { id: 'champion', name: 'Champion', how: 'Win a game or competition at an event.', flavor: 'Undefeated (this time).' },
  { id: 'voice', name: 'Voice of the Herd', how: 'Send feedback or a prize idea.', flavor: 'Thanks for helping YAC grow.' },
  { id: 'halfway', name: 'Halfway There', how: 'Reach 325 points.', flavor: 'The treasure is in sight.' },
  { id: 'legend', name: 'Quest Legend', how: 'Reach the prize goal (650 points).', flavor: 'Legendary.' },
];

export const badgeById = (id: string) => BADGES.find((b) => b.id === id);

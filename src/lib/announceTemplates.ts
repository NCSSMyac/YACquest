/**
 * Announcement templates (Admin → Announce → Templates ▾). Built-ins live here; staff can also save
 * their own (announcement_templates, 0025). Placeholders like {event} are filled from live data when
 * a template is picked; anything we can't fill stays as {placeholder} so it's easy to spot and edit.
 * Unit tested in src/__tests__/adminTools.test.ts.
 */
import { ANNOUNCEMENT_LIMITS } from './validate';

export interface TemplateDef {
  id: string;
  title: string;
  body: string;
}

export const BUILTIN_TEMPLATES: (TemplateDef & { name: string })[] = [
  {
    id: 'builtin:reminder',
    name: 'Event reminder',
    title: 'Reminder: {event} is {date}!',
    body: 'Don’t forget: {event} is {date} at {location}. Come say hi, check in with the password at the door, and earn points toward the {goal}-point prize. Bring a friend!',
  },
  {
    id: 'builtin:thanks',
    name: 'Thank you for coming',
    title: 'Thanks for coming to {event}! 💙',
    body: 'Thank you to everyone who came to {event}! Your check-in points are already on your quest. Took photos? Upload one in Earn for bonus points. See you at the next one!',
  },
  {
    id: 'builtin:prize',
    name: 'Prize update',
    title: 'Prize race: {spotsLeft} spots left!',
    body: 'The first adventurers to reach {goal} points win a prize, and only {spotsLeft} spots are left. Open the Prize page to see how close you are, then grab some points at the next event.',
  },
  {
    id: 'builtin:welcome',
    name: 'Welcome / how to earn',
    title: 'Welcome to YACquest! 🐂',
    body: 'Here’s how to earn points: check in at YAC events (the password is announced at the door), finish digital quests in Earn, and bring friends with your friend code. Reach {goal} points to win a prize. Happy questing!',
  },
  {
    id: 'builtin:star',
    name: 'Adventurer of the Month',
    title: '⭐ Adventurer of the Month: {adventurer}',
    body: 'Big congrats to {adventurer}, our Adventurer of the Month for {month}! Want to be next? Every check-in and quest counts.',
  },
];

export type TemplateVars = Partial<Record<'event' | 'date' | 'location' | 'goal' | 'spotsLeft' | 'adventurer' | 'month', string | number>>;

/** Placeholders a template uses, in order, without duplicates: "{event} {date}" → ['event', 'date']. */
export function placeholders(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{([A-Za-z]+)\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Replaces {name} with vars[name] when we have a value; unknown or empty ones stay as {name}. */
export function fillTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (whole, key: string) => {
    const v = (vars as Record<string, string | number | undefined>)[key];
    return v === undefined || v === null || v === '' ? whole : String(v);
  });
}

/** A template ready for the form: filled, and clipped to the announcement limits. */
export function applyTemplate(t: TemplateDef, vars: TemplateVars): { title: string; body: string; missing: string[] } {
  const title = fillTemplate(t.title, vars).slice(0, ANNOUNCEMENT_LIMITS.titleMax);
  const body = fillTemplate(t.body, vars).slice(0, ANNOUNCEMENT_LIMITS.bodyMax);
  return { title, body, missing: placeholders(title + ' ' + body) };
}

/** "Sat, Nov 14 at 6:00 PM" in the viewer's time zone. */
export function eventDateText(startsAt: string): string {
  const d = new Date(startsAt);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

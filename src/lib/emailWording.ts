/**
 * Wording for the member email choices (unit tested), used by Sign-up, Me → Settings, the #/unsubscribe page,
 * Privacy and Admin → Announce / Players.
 *
 * 0039: three choices per person instead of one switch (profiles.email_announcements / email_events / email_wrapped):
 *   "Announcements" · "Event reminders and thank-yous" (reminders + post-event follow-ups) · "Yearly Wrapped".
 * Sign-up keeps ONE box ("Email me YACquest updates") that sets all three. Account emails (confirmation, password
 * reset) and staff emails don't depend on them. profiles.email_opt_in is still there: "any of the three on".
 */
import { EMAIL_TYPE_LABEL, EMAIL_TYPE_PHRASE, emailTypeOf, type EmailType } from '../../supabase/functions/_shared/emailCore';
import type { EmailPrefKey, EmailPrefs } from '../types';

/** Sign-up: one box that sets all three. */
export const EMAIL_OPT_IN_LABEL = 'Email me YACquest updates';
export const EMAIL_OPT_IN_HINT =
  'Announcements, event reminders, post-event thank-yous and your yearly Wrapped. You’ll still see everything in the app.';
export const SIGNUP_EMAIL_SMALL_PRINT = 'You can pick which ones you get any time in Me → Settings → Emails.';

/** Me → Settings: the small "Emails" group. */
export const EMAIL_PREFS_TITLE = 'Emails';
export const EMAIL_PREFS_EXPLAINER = 'Pick what we email you. Everything still shows up in the app.';

export const EMAIL_PREF_ITEMS: readonly { key: EmailPrefKey; type: EmailType; label: string; hint: string }[] = [
  { key: 'announcements', type: 'announcement', label: EMAIL_TYPE_LABEL.announcement, hint: 'News and invites from the YAC team.' },
  { key: 'events', type: 'events', label: EMAIL_TYPE_LABEL.events, hint: 'A heads-up before events you RSVP to, and a thank-you after.' },
  { key: 'wrapped', type: 'wrapped', label: EMAIL_TYPE_LABEL.wrapped, hint: 'Your year in YACquest, once a year.' },
];

const PREF_KEY_OF_TYPE: Record<EmailType, EmailPrefKey> = { announcement: 'announcements', events: 'events', wrapped: 'wrapped' };
export const prefKeyOfType = (t: EmailType): EmailPrefKey => PREF_KEY_OF_TYPE[t];

/** A person's three choices; a server without 0039 only has the one switch, which then stands for all three. */
export function emailPrefsOf(u: { emailOptIn: boolean; emailPrefs?: EmailPrefs } | null | undefined): EmailPrefs {
  if (u?.emailPrefs) return { ...u.emailPrefs };
  const on = u?.emailOptIn !== false;
  return { announcements: on, events: on, wrapped: on };
}
export const anyEmailOn = (p: EmailPrefs) => p.announcements || p.events || p.wrapped;

/** Staff view (Players, Announce): "Announcements ✓ · Events ✓ · Wrapped ✗" as short parts. */
export const EMAIL_PREF_SHORT: Record<EmailPrefKey, string> = { announcements: 'Announcements', events: 'Events', wrapped: 'Wrapped' };
export function emailPrefsSummary(p: EmailPrefs): string {
  if (!anyEmailOn(p)) return 'All emails off';
  if (p.announcements && p.events && p.wrapped) return 'All emails on';
  return (Object.keys(EMAIL_PREF_SHORT) as EmailPrefKey[]).map((k) => `${EMAIL_PREF_SHORT[k]} ${p[k] ? 'on' : 'off'}`).join(' · ');
}

// ───────────── #/unsubscribe (the one-click link, or Gmail's Unsubscribe button) ─────────────

/** "announcement" / "event reminder and thank-you" / "yearly Wrapped" for a kind or type (null = not a member email type). */
export function unsubTypePhrase(kindOrType: string | null | undefined): string | null {
  const t = emailTypeOf(kindOrType);
  return t ? EMAIL_TYPE_PHRASE[t] : null;
}
/** 0039: a typed link (?k=announcement) turned off only that type. */
export const unsubTypeDone = (phrase: string) => `You’re unsubscribed from ${phrase} emails.`;
export const unsubTypeAlready = (phrase: string) => `${phrase[0].toUpperCase()}${phrase.slice(1)} emails were already off.`;
export const UNSUB_TYPE_REST = 'Your other YACquest email choices didn’t change. Everything still shows up in the app.';
export const UNSUB_ALSO_ALL = 'Also turn off all YACquest emails';
export const unsubTurnBackOn = (phrase: string) => `Turn ${phrase} emails back on`;
export const unsubTypeBackOn = (phrase: string) => `${phrase[0].toUpperCase()}${phrase.slice(1)} emails are back on.`;
export const UNSUB_MANAGE = 'Manage all email choices in Me → Settings';

/** Old links (no k), or "Also turn off all": every member email. */
export const UNSUB_DONE =
  'You won’t get YACquest emails anymore: announcements, event reminders, event follow-ups or Wrapped. Everything still shows up in the app.';
export const UNSUB_STILL_GET = 'You’ll still get account emails you ask for, like a password reset.';
export const UNSUB_CHANGE_MIND = 'Changed your mind? Turn any of them back on in Me → Settings → Emails.';
export const UNSUB_BACK_ON =
  'You’re back on the list. We’ll email you announcements, event reminders, event follow-ups and your yearly Wrapped again.';

/** Admin → Announce, "Also send as an email". */
export const ANNOUNCE_EMAIL_HINT_ONE =
  `They always get it in the app. It’s emailed only if they have “${EMAIL_TYPE_LABEL.announcement}” emails on and a confirmed email address (and it isn’t bouncing).`;
export const ANNOUNCE_EMAIL_HINT_GROUP =
  `Only to people who have “${EMAIL_TYPE_LABEL.announcement}” emails on and a confirmed email address. Gmail allows about 500 emails a day, so save email for important news.`;

/** What the #/unsubscribe page shows (pure, unit tested). */
export interface UnsubView {
  /** The bold line (role="status"). */
  headline: string;
  /** Lines under it. */
  lines: string[];
  /** "Also turn off all YACquest emails" (typed link, other emails still on). */
  alsoAll: boolean;
  /** The "back on" button's label (logged in only), or null. */
  backOn: string | null;
  /** "Log in to change email settings" instead (logged out). */
  login: boolean;
  /** "Manage all email choices in Me → Settings". */
  manage: string;
}

export function unsubView(o: {
  /** The link's k (an email kind), already checked; null = old link (everything). */
  kind: string | null;
  /** What the server did: one type, or everything ('all'). */
  scope: 'type' | 'all';
  alreadyOff: boolean;
  othersOn: boolean;
  loggedIn: boolean;
}): UnsubView {
  const phrase = o.scope === 'type' ? unsubTypePhrase(o.kind) : null;
  if (phrase) {
    return {
      headline: o.alreadyOff ? unsubTypeAlready(phrase) : unsubTypeDone(phrase),
      lines: [UNSUB_TYPE_REST],
      alsoAll: o.othersOn,
      backOn: o.loggedIn ? unsubTurnBackOn(phrase) : null,
      login: !o.loggedIn,
      manage: UNSUB_MANAGE,
    };
  }
  return {
    headline: o.alreadyOff ? 'You were already unsubscribed.' : 'You’re unsubscribed.',
    lines: [UNSUB_DONE, UNSUB_STILL_GET, UNSUB_CHANGE_MIND],
    alsoAll: false,
    backOn: o.loggedIn ? 'Turn emails back on' : null,
    login: !o.loggedIn,
    manage: UNSUB_MANAGE,
  };
}

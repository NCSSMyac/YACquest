/**
 * 0037: wording for the one email setting (profiles.email_opt_in). It covers every optional member email:
 * announcements, event reminders, event follow-ups ("thanks for coming") and the yearly Wrapped.
 * Account emails (confirmation, password reset) and staff emails don't depend on it.
 * Used by Sign-up, Me → Settings, the #/unsubscribe page and Admin → Announce (unit tested).
 */
export const EMAIL_OPT_IN_LABEL = 'Email me YACquest updates';
export const EMAIL_OPT_IN_HINT =
  'Announcements, event reminders, post-event thank-yous and your yearly Wrapped. You’ll still see everything in the app.';

/** #/unsubscribe after the one-click link (or Gmail's Unsubscribe button). */
export const UNSUB_DONE =
  'You won’t get YACquest emails anymore: announcements, event reminders, event follow-ups or Wrapped. Everything still shows up in the app.';
export const UNSUB_STILL_GET = 'You’ll still get account emails you ask for, like a password reset.';
export const UNSUB_CHANGE_MIND = `Changed your mind? Turn “${EMAIL_OPT_IN_LABEL}” back on in Me → Settings.`;
export const UNSUB_BACK_ON =
  'You’re back on the list. We’ll email you announcements, event reminders, event follow-ups and your yearly Wrapped again.';

/** Admin → Announce, "Also send as an email". */
export const ANNOUNCE_EMAIL_HINT_ONE =
  `They always get it in the app. It’s emailed only if they have “${EMAIL_OPT_IN_LABEL}” on and a confirmed email address (and it isn’t bouncing).`;
export const ANNOUNCE_EMAIL_HINT_GROUP =
  `Only to people who have “${EMAIL_OPT_IN_LABEL}” on and a confirmed email address. Gmail allows about 500 emails a day, so save email for important news.`;

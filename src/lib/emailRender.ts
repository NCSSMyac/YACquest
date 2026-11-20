/**
 * Per-recipient email rendering (0032) — the TypeScript twin of public.email_expand_outbox() in
 * supabase/migrations/0032_email_personalization_tracking.sql. The demo backend uses it; the database
 * does the real thing. Greeting, fill-ins, campus-pun sign-off and the footer go into the markers that
 * the email layout leaves: <!--yac:greeting-->, <!--yac:signoff-->, <!--yac:footer-->…<!--/yac:footer-->.
 */
import { EMAIL_TYPE_PHRASE, appUnsubscribeUrl, emailTypeOf } from '../../supabase/functions/_shared/emailCore';
import { campusPun, punSeed } from './campusPuns';
import { escapeHtml, fillValues, greetingLine, renderFillIns, type FillContext, type FillPerson } from './emailFill';
import type { EmailPrefs } from '../types';

export const PARTICIPANT_EMAIL_KINDS = ['announcement', 'event_reminder', 'event_followup', 'wrapped'] as const;
export const isParticipantEmail = (kind: string) => (PARTICIPANT_EMAIL_KINDS as readonly string[]).includes(kind);

export const APP_URL = 'https://ncssmyac.github.io/YACquest/';
/** The one-click link in a member email (0039: `kind` adds &k=<kind> so only that email type is turned off). */
export const unsubscribeUrl = (token: string, appUrl = APP_URL, kind?: string | null) => appUnsubscribeUrl(appUrl, token, kind);

export const IDENTITY_LINE = 'YACquest · NCSSM Young Alumni Council';
/** 0039: staff emails (weekly report, prize alerts, test). Same words in HTML and plain text (SQL email_staff_footer_text()). */
export const STAFF_FOOTER = "You get this because you're on the YACquest staff email list. Manage these in Admin → System.";
export const staffFooterText = () => `—\n${STAFF_FOOTER}\n${IDENTITY_LINE}`;

/** "announcement" / "event reminder and thank-you" / "yearly Wrapped" (SQL email_type_phrase()). */
const phraseOf = (kind: string) => {
  const t = emailTypeOf(kind);
  return t ? EMAIL_TYPE_PHRASE[t] : '';
};

/** Member email footer (SQL email_footer_html_for()): names the type; the one-click link turns off only that type. */
export function participantFooterHtml(unsubUrl: string | null, kind: string): string {
  return (
    `You're getting this because you have YACquest ${phraseOf(kind)} emails on. ` +
    (unsubUrl ? `<a href="${escapeHtml(unsubUrl)}" style="color:#0b2a5b;">Unsubscribe from these in one click</a> · ` : '') +
    `Manage all email choices in the app (Me → Settings)<br>${IDENTITY_LINE}`
  );
}

export function participantFooterText(unsubUrl: string | null, kind: string): string {
  return (
    `—\nYou're getting this because you have YACquest ${phraseOf(kind)} emails on.` +
    (unsubUrl ? `\nUnsubscribe from these in one click: ${unsubUrl}` : '') +
    `\nManage all email choices in the app: Me → Settings\n${IDENTITY_LINE}`
  );
}

/** 0039: does this person want this kind of email? Staff / account kinds: always. (SQL email_type_on().) */
export function emailKindOn(kind: string, prefs: EmailPrefs): boolean {
  const t = emailTypeOf(kind);
  return t === 'announcement' ? prefs.announcements : t === 'events' ? prefs.events : t === 'wrapped' ? prefs.wrapped : true;
}

/** "Event reminder and thank-you emails are off for this person." (SQL email_type_off_error()). */
export function emailTypeOffError(kind: string): string {
  const ph = phraseOf(kind);
  return ph ? `${ph[0].toUpperCase()}${ph.slice(1)} emails are off for this person.` : 'Email updates are off for this person.';
}

/** The shared email look (same as public.email_layout in 0032), with the per-recipient markers. */
export function emailLayout(title: string, innerHtml: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHtml(title)}</title></head>` +
    '<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#1c2333;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;"><tr><td align="center" style="padding:16px 8px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e7ef;">' +
    '<tr><td style="background:#0b2a5b;padding:18px 20px;border-bottom:4px solid #f2b33d;">' +
    '<div style="color:#f2b33d;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">YACquest</div>' +
    `<div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;margin-top:4px;">${escapeHtml(title)}</div>` +
    '</td></tr>' +
    `<tr><td style="padding:20px;font-size:15px;line-height:1.5;"><!--yac:greeting-->${innerHtml}<!--yac:signoff--></td></tr>` +
    '<tr><td style="padding:14px 20px;background:#f4f6fa;color:#5b6475;font-size:12px;line-height:1.5;"><!--yac:footer-->' +
    `${STAFF_FOOTER}<br>${IDENTITY_LINE}<!--/yac:footer--></td></tr></table></td></tr></table></body></html>`
  );
}

/** Same rule as SQL: "http(s)://…" in the (escaped) text becomes a link; a trailing . , ! ? ; : ) stays outside. */
export function linkifyEscaped(escaped: string): string {
  return escaped.replace(/(https?:\/\/[^\s<]*[^\s<.,!?;:)])/g, '<a href="$1" style="color:#0b2a5b;">$1</a>');
}

export interface RenderInput {
  kind: string;
  subject: string;
  text: string;
  html: string;
  campaignId: string;
}

export interface RenderOptions extends FillContext {
  /** The person's unsubscribe token (participant emails). */
  unsubToken?: string | null;
  appUrl?: string;
}

/** One person's copy of a queued email. `person` null = a staff address with no account. */
export function renderForRecipient(e: RenderInput, person: (FillPerson & { emailOptIn?: boolean }) | null, o: RenderOptions = {}) {
  let { subject, text, html } = e;
  if (!isParticipantEmail(e.kind)) {
    if (!text.includes('Admin → System')) text = `${text.replace(/[\n ]+$/, '')}\n\n${staffFooterText()}`;
    html = html.replace('<!--yac:greeting-->', '').replace('<!--yac:signoff-->', '');
    return { subject, text, html };
  }
  const values = person ? fillValues(person, { ...o, seedKey: e.campaignId }) : null;
  const unsub = o.unsubToken ? unsubscribeUrl(o.unsubToken, o.appUrl, e.kind) : null;
  const greet = greetingLine(person?.displayName);
  const pun =
    person && ((e.kind === 'event_followup' && e.subject.startsWith('Thanks for coming')) || e.kind === 'wrapped')
      ? campusPun(person.campus, punSeed(e.campaignId))
      : null;
  text = text.replace(/\s*You get this because[^\n]*$/, '');
  html = html.replace(/<p style="font-size:12px;color:#4a5672;margin:0">You get this because[^<]*<\/p>/g, '');
  if (values) {
    subject = renderFillIns(subject, values);
    text = renderFillIns(text, values);
    html = renderFillIns(html, values, { html: true });
  }
  text = `${greet}\n\n${text}${pun ? `\n\n${pun}` : ''}\n\n${participantFooterText(unsub, e.kind)}`;
  html = html.replace('<!--yac:greeting-->', `<p style="margin:0 0 12px;font-size:16px;">${escapeHtml(greet)}</p>`);
  if (pun) html = html.replace('<!--yac:signoff-->', `<p style="margin:14px 0 0;color:#4a5672;font-style:italic;">${escapeHtml(pun)}</p>`);
  html = html.replace(/<!--yac:footer-->[\s\S]*<!--\/yac:footer-->/, participantFooterHtml(unsub, e.kind)).replace('<!--yac:signoff-->', '');
  return { subject, text, html };
}

/** Announcement email body (same structure as send_announcement in 0032). Tokens stay for the per-recipient step. */
export function announcementEmail(title: string, body: string, senderName: string, appUrl = APP_URL) {
  const link = appUrl.replace(/\/+$/, '') + '/';
  const html = emailLayout(
    title,
    `<p style="font-size:16px;line-height:1.5;white-space:pre-wrap;margin:0 0 16px">${linkifyEscaped(escapeHtml(body))}</p>` +
      `<p style="margin:0 0 16px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Open YACquest</a></p>` +
      `<p style="font-size:13px;color:#4a5672;margin:0">Sent by ${escapeHtml(senderName)} via YACquest.</p>`,
  );
  const text = `${body}\n\nOpen YACquest: ${link}\n\n— Sent by ${senderName} via YACquest.`;
  return { subject: `YACquest: ${title}`, text, html };
}

/**
 * 0039: "YACquest winner info received" (SQL prize_info_email()): who, which spot, where to look, the deadline and the
 * reference. Never the winner's delivery details (they're only shown in the app, Admin → Prizes, YACquest Chairs).
 */
export function prizeInfoEmail(
  o: { name: string; campusName?: string | null; spot: number; reference?: string | null; valueUsd: number; deadline: string },
  appUrl = APP_URL,
) {
  const link = `${appUrl.replace(/\/+$/, '')}/#/admin/prizes`;
  const lead = `${o.name || 'A winner'}${o.campusName ? ` (${o.campusName})` : ''} sent their delivery details for prize spot #${o.spot}.`;
  const chair = "A YACquest chair can see them in Admin → Prizes (only chairs can open it). If you're not a chair, please pass this on to one.";
  const ref = o.reference || '—';
  const value = `$${o.valueUsd}`;
  return {
    subject: `YACquest winner info received: ${o.name || 'A winner'} (spot #${o.spot})`,
    text:
      `${lead} Open YACquest → Admin → Prizes to see them and send the ${value} gift card by ${o.deadline}. For privacy, delivery details are only shown in the app.\n\n` +
      `${chair}\nOpen Admin → Prizes: ${link}\n\nReference: ${ref}`,
    html: emailLayout(
      `Winner info received: spot #${o.spot}`,
      `<p style="margin:0 0 12px;font-size:16px;">${escapeHtml(lead)}</p>` +
        '<p style="margin:0 0 12px;background:#fff6e3;border:1px solid #f2b33d;border-radius:8px;padding:10px 12px;">' +
        `Open YACquest → <b>Admin → Prizes</b> to see them and send the <b>${escapeHtml(value)} gift card</b> by <b>${escapeHtml(o.deadline)}</b>. For privacy, delivery details are only shown in the app.</p>` +
        `<p style="margin:0 0 12px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#f2b33d;color:#0b2a5b;font-weight:700;padding:10px 14px;text-decoration:none;border-radius:6px">Open Admin → Prizes</a></p>` +
        `<p style="margin:0 0 12px;color:#5b6475;font-size:13px;">${escapeHtml(chair)}</p>` +
        `<p style="margin:0;font-size:13px;color:#5b6475;">Reference: <b style="color:#1c2333;">${escapeHtml(ref)}</b></p>`,
    ),
  };
}

/**
 * Per-recipient email rendering (0032) — the TypeScript twin of public.email_expand_outbox() in
 * supabase/migrations/0032_email_personalization_tracking.sql. The demo backend uses it; the database
 * does the real thing. Greeting, fill-ins, campus-pun sign-off and the footer go into the markers that
 * the email layout leaves: <!--yac:greeting-->, <!--yac:signoff-->, <!--yac:footer-->…<!--/yac:footer-->.
 */
import { campusPun, punSeed } from './campusPuns';
import { escapeHtml, fillValues, greetingLine, renderFillIns, type FillContext, type FillPerson } from './emailFill';

export const PARTICIPANT_EMAIL_KINDS = ['announcement', 'event_reminder', 'event_followup', 'wrapped'] as const;
export const isParticipantEmail = (kind: string) => (PARTICIPANT_EMAIL_KINDS as readonly string[]).includes(kind);

export const APP_URL = 'https://ncssmyac.github.io/YACquest/';
export const unsubscribeUrl = (token: string, appUrl = APP_URL) => `${appUrl.replace(/\/+$/, '')}/#/unsubscribe?t=${token}`;

export const IDENTITY_LINE = 'YACquest · NCSSM Young Alumni Council';
export const STAFF_FOOTER = 'You get this because you are on the YAC committee list. Manage these in Admin → System.';

export function participantFooterHtml(unsubUrl: string | null): string {
  return (
    "You're getting this because you have YACquest emails on. " +
    (unsubUrl ? `<a href="${escapeHtml(unsubUrl)}" style="color:#0b2a5b;">Unsubscribe in one click</a> · ` : '') +
    `Manage in the app (Me → Settings)<br>${IDENTITY_LINE}`
  );
}

export function participantFooterText(unsubUrl: string | null): string {
  return (
    "—\nYou're getting this because you have YACquest emails on." +
    (unsubUrl ? `\nUnsubscribe in one click: ${unsubUrl}` : '') +
    `\nManage in the app: Me → Settings\n${IDENTITY_LINE}`
  );
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
    if (!text.includes('Admin → System')) text += `\n\n—\n${IDENTITY_LINE}. Manage these in Admin → System.`;
    html = html.replace('<!--yac:greeting-->', '').replace('<!--yac:signoff-->', '');
    return { subject, text, html };
  }
  const values = person ? fillValues(person, { ...o, seedKey: e.campaignId }) : null;
  const unsub = o.unsubToken ? unsubscribeUrl(o.unsubToken, o.appUrl) : null;
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
  text = `${greet}\n\n${text}${pun ? `\n\n${pun}` : ''}\n\n${participantFooterText(unsub)}`;
  html = html.replace('<!--yac:greeting-->', `<p style="margin:0 0 12px;font-size:16px;">${escapeHtml(greet)}</p>`);
  if (pun) html = html.replace('<!--yac:signoff-->', `<p style="margin:14px 0 0;color:#4a5672;font-style:italic;">${escapeHtml(pun)}</p>`);
  html = html.replace(/<!--yac:footer-->[\s\S]*<!--\/yac:footer-->/, participantFooterHtml(unsub)).replace('<!--yac:signoff-->', '');
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

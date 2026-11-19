/**
 * Email delivery wording + small pure helpers for Admin → Stats → Email, Admin → System and the
 * Announce composer (0032). Unit tested in src/__tests__/emailStats.test.ts.
 */
import type { EmailQueueStatus, EmailRecipientRow, EmailStatus } from '../types';

export const EMAIL_KIND_LABEL: Record<string, string> = {
  weekly_report: 'Weekly report',
  prize_qualified: 'Prize: new winner',
  prize_info: 'Prize: winner info',
  test: 'Test',
  announcement: 'Announcement',
  event_reminder: 'Event reminder',
  event_followup: 'Event follow-up',
  wrapped: 'Wrapped',
  verify_email: 'Email confirmation',
};

export const EMAIL_STATUS_LABEL: Record<EmailStatus | 'queued', string> = {
  pending: 'Waiting',
  queued: 'Waiting',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  bounced: 'Bounced',
  skipped_expired: 'Skipped — too late (budget)',
  skipped_opted_out: 'Skipped — emails off',
  skipped_bouncing: 'Skipped — address bouncing',
  skipped_unverified: 'Skipped — email not confirmed',
};

/** Chip colour class for each status (theme.css chips). */
export const EMAIL_STATUS_CHIP: Record<EmailStatus | 'queued', string> = {
  pending: 'pending',
  queued: 'pending',
  sending: 't2',
  sent: 'approved',
  failed: 'rejected',
  bounced: 'rejected',
  skipped_expired: 'neutral',
  skipped_opted_out: 'neutral',
  skipped_bouncing: 'neutral',
  skipped_unverified: 'neutral',
};

/** "Today: 132 / 450 sent · 40 waiting · next batch in ~6 min". */
export function queueLine(q: EmailQueueStatus, now: Date = new Date()): string {
  const parts = [`Today: ${q.sent24h} / ${q.budget} sent`, `${q.waiting} waiting`];
  if (!q.lastRunAt) parts.push('the sender hasn’t run yet');
  else if (q.waiting > 0 || q.nextRunAt) {
    const mins = q.nextRunAt ? Math.ceil((new Date(q.nextRunAt).getTime() - now.getTime()) / 60_000) : 0;
    parts.push(mins > 0 ? `next batch in ~${mins} min` : 'next batch any minute');
  }
  return parts.join(' · ');
}

/** Bounce checking is on only when the last run read Gmail's bounce notices. */
export const bounceCheckOn = (q: Pick<EmailQueueStatus, 'bounceCheck'>) => q.bounceCheck === 'ok';

/** Share of the 24 h budget used, 0–100. */
export const budgetPct = (q: Pick<EmailQueueStatus, 'sent24h' | 'budget'>) =>
  q.budget > 0 ? Math.min(100, Math.round((q.sent24h / q.budget) * 100)) : 0;

/** "42%" of the base, "—" when there's nothing to divide by. */
export const pctText = (part: number, base: number) => (base > 0 ? `${Math.round((part / base) * 100)}%` : '—');

/** Events the text names that already started: staff are warned before sending. Titles shorter than 4 letters are ignored. */
export function startedEventsMentioned<E extends { title: string; startsAt: string }>(text: string, events: readonly E[], now: Date = new Date()): E[] {
  const t = text.toLowerCase();
  return events.filter((e) => e.title.trim().length >= 4 && t.includes(e.title.trim().toLowerCase()) && new Date(e.startsAt).getTime() <= now.getTime());
}

/** CSV rows for one email's recipients (drill-down "⬇ CSV"). */
export function recipientCsvRows(rows: readonly EmailRecipientRow[]): (string | number)[][] {
  return rows.map((r) => [
    r.name,
    r.campus ?? '',
    r.email,
    EMAIL_STATUS_LABEL[r.status] ?? r.status,
    r.sentAt ?? '',
    r.opened ? 'yes' : 'no',
    r.clickedUrls.join(' '),
    r.bounced ? 'yes' : 'no',
    r.unsubscribed ? 'yes' : 'no',
  ]);
}
export const RECIPIENT_CSV_HEADERS = ['name', 'campus', 'email', 'status', 'sent_at', 'opened', 'clicked_links', 'bounced', 'unsubscribed'];

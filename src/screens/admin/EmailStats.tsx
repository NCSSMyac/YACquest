/**
 * Admin → Stats → Email (0032, staff, lazy-loaded): sent / delivered / opened / clicked / bounced /
 * unsubscribed for the last 7 or 30 days, a per-day chart, every announcement and automatic email
 * with a recipient drill-down (CSV). Data: email_stats(), email_campaign_recipients().
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { campusName } from '../../config';
import { Card } from '../../components/Blocks';
import { EmailDailyChart, EmailQueueCard, Kpi } from '../../components/EmailBlocks';
import { Empty, ErrorText, Loading, Modal } from '../../components/ui';
import { csvDateTime, csvFilename, downloadCsv, toCsv } from '../../lib/csv';
import { EMAIL_KIND_LABEL, EMAIL_STATUS_CHIP, EMAIL_STATUS_LABEL, RECIPIENT_CSV_HEADERS, pctText, recipientCsvRows } from '../../lib/emailStats';
import { fmtDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import type { EmailCampaignStat } from '../../types';
import './stats.css';

export default function EmailStats() {
  const [days, setDays] = useState<7 | 30>(30);
  const s = useAsync(() => api.emailStats(days), [days]);
  const [open, setOpen] = useState<EmailCampaignStat | null>(null);
  const t = s.data?.totals;

  return (
    <div className="stack stats">
      <p className="muted stats-intro">
        <Link to="/admin/stats" className="dash-more stats-refresh">‹ Stats</Link>
        Every email YACquest sent, one per person.
        <button type="button" className="dash-more stats-refresh" onClick={() => void s.reload()}>Refresh</button>
      </p>
      <div className="tabs" role="radiogroup" aria-label="Time range">
        {([7, 30] as const).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => setDays(n)}>Last {n} days</button>
        ))}
      </div>

      <Card glyph="chart" title={`Email · last ${days} days`}>
        {s.loading && !t ? <Loading lines={4} /> : s.error ? <ErrorText error={s.error} /> : t && s.data && (
          <>
            <div className="em-kpis">
              <Kpi n={t.sent} label="Sent" />
              <Kpi n={t.delivered} label="Delivered (sent − bounced)" />
              <Kpi n={t.opened} label={`Opened ~${pctText(t.opened, t.delivered)} (unique)`} />
              <Kpi n={t.clicked} label={`Clicked · ${t.ctr}% click-through`} />
              <Kpi n={t.bounced} label="Bounced" />
              <Kpi n={t.unsubscribed} label="Unsubscribed" />
              <Kpi n={t.skipped} label={`Skipped (${t.expired} too late)`} />
              <Kpi n={t.failed} label="Failed" />
            </div>
            <EmailDailyChart data={s.data} />
            <p className="muted stats-foot">
              Opens are approximate: Apple Mail loads images for privacy (counts as opened even if unread), and some apps block images
              (never counted). Clicks are reliable.
            </p>
          </>
        )}
      </Card>

      <Card
        glyph="scroll"
        title="Each email"
        action={s.data?.campaigns.length ? (
          <button type="button" className="btn small ghost stats-csv" aria-label="Export each email as CSV"
            onClick={() => downloadCsv(csvFilename('emails', `${days}d`), toCsv(
              ['email', 'kind', 'first_sent', 'recipients', 'sent', 'opened', 'clicked', 'bounced', 'unsubscribed', 'skipped', 'waiting', 'failed'],
              s.data!.campaigns.map((c) => [c.label, EMAIL_KIND_LABEL[c.kind] ?? c.kind, csvDateTime(c.firstAt), c.recipients, c.sent, c.opened, c.clicked, c.bounced, c.unsubscribed, c.skipped, c.waiting, c.failed]),
            ))}>⬇ CSV</button>
        ) : undefined}
      >
        {s.loading && !s.data ? <Loading lines={3} /> : !s.data?.campaigns.length ? <Empty>No emails in this period.</Empty> : (
          <ul className="em-camps">
            {s.data.campaigns.map((c) => (
              <li key={c.id}>
                <button type="button" className="em-camp" onClick={() => setOpen(c)}>
                  <span className="em-camp-top">
                    <b>{c.label}<span className="sr-only"> — see who got it</span></b>
                    <span className="chip neutral">{EMAIL_KIND_LABEL[c.kind] ?? c.kind}</span>
                  </span>
                  <span className="em-camp-nums">
                    <span>{fmtDateTime(c.firstAt)}</span>
                    <span><b>{c.sent}</b> sent</span>
                    <span><b>{c.opened}</b> opened ({pctText(c.opened, c.sent - c.bounced)})</span>
                    <span><b>{c.clicked}</b> clicked</span>
                    {c.bounced > 0 && <span><b>{c.bounced}</b> bounced</span>}
                    {c.unsubscribed > 0 && <span><b>{c.unsubscribed}</b> unsubscribed</span>}
                    {c.skipped > 0 && <span><b>{c.skipped}</b> skipped</span>}
                    {c.waiting > 0 && <span><b>{c.waiting}</b> waiting</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EmailQueueCard />

      {open && <Recipients campaign={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Recipients({ campaign, onClose }: { campaign: EmailCampaignStat; onClose: () => void }) {
  const r = useAsync(() => api.emailCampaignRecipients(campaign.id), [campaign.id]);
  return (
    <Modal open onClose={onClose} title={campaign.label}>
      <div className="stack" style={{ gap: 8 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {EMAIL_KIND_LABEL[campaign.kind] ?? campaign.kind} · {fmtDateTime(campaign.firstAt)} · {campaign.recipients} {campaign.recipients === 1 ? 'recipient' : 'recipients'}
        </p>
        {r.data && r.data.length > 0 && (
          <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start' }}
            onClick={() => downloadCsv(csvFilename('email-recipients', campaign.label.slice(0, 30)), toCsv(RECIPIENT_CSV_HEADERS, recipientCsvRows(r.data!)))}>
            ⬇ Recipients CSV
          </button>
        )}
        {r.loading && !r.data ? <Loading lines={4} /> : r.error ? <ErrorText error={r.error} /> : !r.data?.length ? <Empty>No recipients.</Empty> : (
          <ul className="em-rcpts" aria-label="Recipients">
            {r.data.map((x) => (
              <li key={x.messageId}>
                <div className="em-r-top">
                  <b>{x.name || x.email}</b>
                  <span className={`chip ${EMAIL_STATUS_CHIP[x.status] ?? 'neutral'}`}>{EMAIL_STATUS_LABEL[x.status] ?? x.status}</span>
                </div>
                <small>{x.campus ? `${campusName(x.campus)} · ` : ''}{x.email}</small>
                <div className="em-tags">
                  {x.opened && <span className="chip approved">Opened{x.openedAt ? ` ${fmtDateTime(x.openedAt)}` : ''}</span>}
                  {x.clickedUrls.map((u) => <span key={u} className="chip t2 wrap-anywhere">Clicked {u.replace(/^https?:\/\//, '')}</span>)}
                  {x.unsubscribed && <span className="chip rejected">Unsubscribed</span>}
                </div>
                {x.error && x.status !== 'sent' && <small>{x.error}</small>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

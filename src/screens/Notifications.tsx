import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { PageHeader } from '../components/Layout';
import { Sprite } from '../components/Sprite';
import { TodayChip } from '../components/TodayEvent';
import { Empty, ErrorText, Loading, Panel } from '../components/ui';
import { Card, ShowMore, useShowMore } from '../components/Blocks';
import { groupByDay } from '../lib/listing';
import { linkParts } from '../lib/linkify';
import { SURVEY_POINTS } from '../lib/eventSurvey';
import { timeAgo } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import type { NotificationKind } from '../types';

const KIND: Record<NotificationKind, { icon: string; color: string }> = {
  submission_approved: { icon: '✔', color: 'var(--green-text)' },
  submission_rejected: { icon: '✖', color: 'var(--red-text)' },
  points_adjusted: { icon: '★', color: 'var(--gold-500)' },
  prize_qualified: { icon: '🏆', color: 'var(--gold-500)' },
  prize_update: { icon: '🎁', color: 'var(--purple)' },
  announcement: { icon: '📣', color: 'var(--blue-500)' },
  // staff only (0020)
  hero_crowned: { icon: '🦸', color: 'var(--gold-500)' },
  staff_reward: { icon: '👑', color: 'var(--purple)' },
  // 0024: "⏰ Starts in 1 hour" (RSVP reminder)
  event_reminder: { icon: '📅', color: 'var(--blue-500)' },
  // 0026: "Thanks for coming" / "Sorry we missed you" after an event
  event_followup: { icon: '🐂', color: 'var(--green-text)' },
  // 0028: "Your YACquest Wrapped is here!" and new seasonal wardrobe items
  wrapped: { icon: '🎁', color: 'var(--gold-500)' },
  seasonal: { icon: '🎉', color: 'var(--purple)' },
};

/** 0028: a link under these notifications. */
const LINKS: Partial<Record<NotificationKind, { to: string; text: string }>> = {
  wrapped: { to: '/wrapped', text: 'Open my Wrapped ›' },
  seasonal: { to: '/prize?tab=wardrobe&cat=seasonal', text: 'See the item and what it honors ›' },
};

const NOTE_STEP = 20;

/**
 * Body text with web links; 0030: an in-app survey link (`#/survey/<id>`) is taken out of the sentence and
 * shown as a "Rate this event" button under it.
 */
function NoteText({ body }: { body: string }) {
  const parts = linkParts(body);
  const survey = parts.find((p) => p.to);
  // "…(takes a minute): #/survey/x Or fill out…" → "…(takes a minute). Or fill out…" + the button
  const shown = parts.flatMap((p, i) => (p.to ? [] : parts[i + 1]?.to && !p.href ? [{ ...p, text: p.text.replace(/:\s*$/, '.') }] : [p]));
  return (
    <>
      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {shown.map((p, i) => (p.href ? <a key={i} href={p.href} target="_blank" rel="noreferrer noopener">{p.text}</a> : <span key={i}>{p.text}</span>))}
      </div>
      {survey?.to && <Link to={survey.to} className="btn small note-survey">📝 Rate this event (+{SURVEY_POINTS})</Link>}
    </>
  );
}

export default function Notifications() {
  const { data, loading, error, reload } = useAsync(() => api.notifications(), [], { live: true });
  const unread = data?.filter((n) => !n.read).length ?? 0;
  const more = useShowMore(NOTE_STEP);

  // Auto-mark read shortly after opening (the highlight stays until then).
  useEffect(() => {
    const t = setTimeout(() => {
      api.markNotificationsRead().then(reload).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markAll() {
    await api.markNotificationsRead();
    reload();
  }

  return (
    <div className="stack">
      <PageHeader title="Notifications" back />
      <TodayChip />
      {unread > 0 && (
        <button className="btn small blue" onClick={markAll} style={{ alignSelf: 'flex-start' }}>Mark all read ({unread})</button>
      )}
      <ErrorText error={error} />
      {loading && !data ? (
        <Loading lines={3} />
      ) : data && data.length === 0 ? (
        <Panel>
          <Empty>
            <Sprite id="yak" size={64} className="bob" />
            <p>All quiet in the meadow. No notifications yet!</p>
          </Empty>
        </Panel>
      ) : data ? (
        <>
          {groupByDay(data.slice(0, more.limit), (n) => n.createdAt).map((g) => (
            <Card key={g.key} title={g.label} glyph={g.key === 'today' ? 'star' : 'scroll'} action={<span className="chip neutral">{g.items.length}</span>}>
              <ul className="note-list">
                {g.items.map((n) => {
                  const k = KIND[n.kind] ?? KIND.announcement;
                  return (
                    <li key={n.id} className={n.read ? undefined : 'unread'}>
                      <span className="note-icon" aria-hidden style={{ color: k.color }}>{k.icon}</span>
                      <div className="note-body">
                        <div className="spread" style={{ alignItems: 'flex-start' }}>
                          <b>{n.title}</b>
                          {!n.read && <span className="chip t1">New</span>}
                        </div>
                        <NoteText body={n.body} />
                        {LINKS[n.kind] && <Link to={LINKS[n.kind]!.to} className="dash-link note-link">{LINKS[n.kind]!.text}</Link>}
                        <div className="muted" style={{ fontSize: 13 }}>{timeAgo(n.createdAt)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
          <ShowMore shown={Math.min(more.limit, data.length)} total={data.length} step={NOTE_STEP} onMore={() => more.more(data.length)} />
        </>
      ) : null}
    </div>
  );
}

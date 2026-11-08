/**
 * 0030: Admin → Events → 📊 Survey: one event's in-app survey results (staff only, lazy-loaded).
 * Average with pixel stars, answers per star, response rate, the three text answers and a CSV.
 * Anonymous answers never carry a name (the server leaves it out; the CSV keeps the name blank).
 */
import * as api from '../../api';
import { campusName } from '../../config';
import { StarRow } from '../../components/PixelStars';
import { Empty, ErrorText, Loading } from '../../components/ui';
import { csvDateTime, csvFilename, downloadCsv, toCsv } from '../../lib/csv';
import { fmtAverage, ratingLabel } from '../../lib/eventSurvey';
import { fmtDate } from '../../lib/format';
import { pctOf } from '../../lib/adminTools';
import { useAsync } from '../../lib/useAsync';
import type { EventSurveyResults, EventSurveyRow } from '../../types';
import './surveyResults.css';

/** CSV rows for one event's answers (anonymous → name and campus left blank). Pure; exported for tests. */
export function surveyCsv(r: EventSurveyResults): string {
  return toCsv(
    ['rating', 'favorite_part', 'least_favorite_part', 'suggestions_comments', 'name', 'campus', 'anonymous', 'submitted'],
    r.rows.map((x) => [x.rating, x.favorite, x.leastFavorite, x.comments, x.anonymous ? '' : x.name ?? '', x.anonymous || !x.campus ? '' : campusName(x.campus), x.anonymous, csvDateTime(x.createdAt)]),
  );
}

const who = (x: EventSurveyRow) => (x.anonymous || !x.name ? 'Anonymous' : x.name);

export default function SurveyResults({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const res = useAsync<EventSurveyResults>(() => api.adminEventSurvey(eventId), [eventId]);
  if (res.loading && !res.data) return <Loading lines={4} />;
  if (res.error || !res.data) return <ErrorText error={res.error ?? 'Couldn’t load the survey.'} />;
  const r = res.data;
  const max = Math.max(1, ...r.distribution);
  const least = r.rows.filter((x) => x.leastFavorite);
  const comments = r.rows.filter((x) => x.comments);
  return (
    <div className="stack sres">
      <p className="muted sres-sub">{fmtDate(r.startsAt)} · in-app survey (+5 for attendees)</p>
      {r.responses === 0 ? (
        <Empty>No answers yet. Everyone who checked in can rate it for 14 days after it ends.</Empty>
      ) : (
        <>
          <section className="sres-top" aria-label="Average rating">
            <div className="sres-avg">
              <b className="sres-num">{fmtAverage(r.average)}</b>
              <span className="sres-of">/ 5</span>
            </div>
            <div className="sres-avg-side">
              <StarRow value={r.average} size={22} />
              <span className="sres-word">{r.average != null ? ratingLabel(r.average) : ''}</span>
            </div>
          </section>
          <p className="sres-rate">
            <b>{r.responses}</b> response{r.responses === 1 ? '' : 's'} of <b>{r.attendees}</b> attendee{r.attendees === 1 ? '' : 's'} <span className="chip neutral">{pctOf(r.responses, r.attendees)}%</span>
          </p>
          <ul className="sres-dist" aria-label="Answers per star">
            {[5, 4, 3, 2, 1].map((s) => {
              const n = r.distribution[s - 1] ?? 0;
              return (
                <li key={s} aria-label={`${s} star${s === 1 ? '' : 's'}: ${n}`}>
                  <span className="sres-dist-lbl" aria-hidden>{s}★</span>
                  <span className="sres-bar" aria-hidden><span style={{ width: `${n ? Math.max(4, (n / max) * 100) : 0}%` }} /></span>
                  <b aria-hidden>{n}</b>
                </li>
              );
            })}
          </ul>
          <Answers title="💛 Favorite parts" rows={r.rows} text={(x) => x.favorite} />
          <Answers title="🤔 Least favorite parts" rows={least} text={(x) => x.leastFavorite} empty="Nothing here. Nice!" />
          <Answers title="💬 Suggestions, comments & concerns" rows={comments} text={(x) => x.comments} empty="No suggestions yet." />
        </>
      )}
      <div className="btn-row">
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        <button type="button" className="btn blue" disabled={!r.responses} onClick={() => downloadCsv(csvFilename('survey', r.title), surveyCsv(r))}>⬇ CSV</button>
      </div>
    </div>
  );
}

function Answers({ title, rows, text, empty }: { title: string; rows: EventSurveyRow[]; text: (x: EventSurveyRow) => string; empty?: string }) {
  return (
    <section className="sres-sec">
      <h3 className="sres-h">{title} <span className="chip neutral">{rows.length}</span></h3>
      {rows.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>{empty}</p>
      ) : (
        <ul className="sres-list">
          {rows.map((x, i) => (
            <li key={i}>
              <p className="sres-quote">{text(x)}</p>
              <span className="sres-who">
                <StarRow value={x.rating} size={12} /> {who(x)}{!x.anonymous && x.campus ? ` · ${campusName(x.campus)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

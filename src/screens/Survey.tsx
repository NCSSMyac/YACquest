/**
 * 0030: in-app event feedback survey (#/survey/<eventId>). Lazy-loaded.
 * Anyone who checked in can answer once, from check-in until 14 days after the event ends, for +5 points
 * (not part of the weekly digital limit). Rules: src/lib/eventSurvey.ts; server: submit_event_survey (0030).
 */
import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as api from '../api';
import { PageHeader } from '../components/Layout';
import { StarPicker } from '../components/PixelStars';
import { Sprite } from '../components/Sprite';
import { ErrorText, Loading, Panel, ProgressBar } from '../components/ui';
import { useAuth } from '../lib/auth';
import { Burst, noteCelebratedPoints, useCelebrate } from '../lib/celebrate';
import { SURVEY_LIMITS, SURVEY_POINTS, SURVEY_WINDOW_DAYS, cleanSurveyText, surveyError } from '../lib/eventSurvey';
import { fmtDate } from '../lib/format';
import { errorMessage, useAsync } from '../lib/useAsync';
import './survey.css';

type Field = 'rating' | 'favorite' | 'least_favorite' | 'comments';

export default function Survey() {
  const { eventId = '' } = useParams();
  const status = useAsync(() => api.mySurveyStatus(eventId), [eventId]);
  const [donePts, setDonePts] = useState<number | null>(null);
  const s = status.data;

  return (
    <div className="stack survey">
      <PageHeader title="Event survey" back />
      {donePts != null && s ? (
        <SurveyThanks title={s.title} points={donePts} />
      ) : status.loading && !s ? (
        <Loading lines={4} />
      ) : status.error ? (
        <ErrorText error={status.error} />
      ) : !s ? null : s.done ? (
        <Blocked title={s.title} emoji="✓" text="You already rated this event. Thanks for helping make YAC events better!" />
      ) : !s.checkedIn ? (
        <Blocked title={s.title} emoji="🎟️" text="This survey is for people who checked in to this event. See you at the next one!" />
      ) : !s.open ? (
        <Blocked title={s.title} emoji="⌛" text={`This survey closed ${SURVEY_WINDOW_DAYS} days after the event. Thanks anyway!`} />
      ) : (
        <SurveyForm eventId={s.eventId} title={s.title} startsAt={s.startsAt} points={s.points || SURVEY_POINTS} onDone={setDonePts} />
      )}
    </div>
  );
}

function Blocked({ title, emoji, text }: { title: string; emoji: string; text: string }) {
  return (
    <Panel className="survey-card center">
      <p className="survey-blocked-emoji" aria-hidden>{emoji}</p>
      <h2 className="survey-title">{title}</h2>
      <p className="muted">{text}</p>
      <Link to="/earn" className="btn block">Back to Quests</Link>
    </Panel>
  );
}

function SurveyForm({ eventId, title, startsAt, points, onDone }: { eventId: string; title: string; startsAt: string; points: number; onDone: (pts: number) => void }) {
  const { user } = useAuth();
  const celebrate = useCelebrate();
  const [rating, setRating] = useState<number | null>(null);
  const [favorite, setFavorite] = useState('');
  const [least, setLeast] = useState('');
  const [comments, setComments] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [errs, setErrs] = useState<Partial<Record<Field, string>>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const ids = { rating: `${id}-rating`, fav: `${id}-fav`, least: `${id}-least`, comm: `${id}-comm` };
  const answered = (rating ? 1 : 0) + (cleanSurveyText(favorite) ? 1 : 0);

  async function send(ev: FormEvent) {
    ev.preventDefault();
    setFormErr(null);
    const err = surveyError({ rating, favorite, leastFavorite: least, comments });
    if (err) {
      setErrs({ [err.code]: err.message });
      const focusId = err.code === 'rating' ? null : err.code === 'favorite' ? ids.fav : err.code === 'least_favorite' ? ids.least : ids.comm;
      if (focusId) document.getElementById(focusId)?.focus();
      else document.querySelector<HTMLButtonElement>('.star-btn')?.focus();
      return;
    }
    setErrs({});
    setBusy(true);
    try {
      const r = await api.submitEventSurvey({ eventId, rating: rating!, favorite, leastFavorite: least, comments, anonymous });
      if (user) noteCelebratedPoints(user.id, r.points);
      celebrate({ title: 'Survey done!', subtitle: 'Thanks for the feedback 🐂', points: r.points });
      onDone(r.points);
      window.scrollTo({ top: 0 });
    } catch (x) {
      const code = (x as { code?: string }).code as Field | undefined;
      if (code && ['rating', 'favorite', 'least_favorite', 'comments'].includes(code)) setErrs({ [code]: errorMessage(x) });
      else setFormErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack survey-form" onSubmit={send} noValidate>
      <Panel className="survey-card">
        <div className="survey-head">
          <Sprite id="yak" size={48} className="bob" />
          <div style={{ minWidth: 0 }}>
            <p className="survey-kicker">{fmtDate(startsAt)} · 1 minute · +{points} points</p>
            <h2 className="survey-title" id={ids.rating}>How was {title}?</h2>
          </div>
        </div>
        <ProgressBar value={answered} max={2} label={answered === 2 ? 'Ready to send ✓' : `${answered} of 2 required`} />
        <StarPicker value={rating} onChange={(n) => { setRating(n); setErrs((e) => ({ ...e, rating: undefined })); }} labelledBy={ids.rating} invalid={!!errs.rating} describedBy={errs.rating ? `${ids.rating}-err` : undefined} />
        {errs.rating && <p className="field-error survey-err" id={`${ids.rating}-err`} role="alert">{errs.rating}</p>}
      </Panel>

      <Panel className="survey-card">
        <div className="stack survey-fields">
          <label className="field" htmlFor={ids.fav}>
            <span>What was your favorite part? <em className="survey-req">required</em></span>
            <textarea
              id={ids.fav} className="input survey-short" rows={2} value={favorite} maxLength={SURVEY_LIMITS.favorite} placeholder="The trivia round, the snacks, meeting people…"
              onChange={(e) => { setFavorite(e.target.value); setErrs((x) => ({ ...x, favorite: undefined })); }}
              aria-invalid={!!errs.favorite || undefined} aria-describedby={errs.favorite ? `${ids.fav}-err` : undefined} required
            />
            {errs.favorite ? <small className="field-error" id={`${ids.fav}-err`} role="alert">{errs.favorite}</small> : <Counter n={favorite.length} max={SURVEY_LIMITS.favorite} />}
          </label>
          <label className="field" htmlFor={ids.least}>
            <span>What was your least favorite part? <em className="survey-opt">optional</em></span>
            <textarea
              id={ids.least} className="input survey-short" rows={2} value={least} maxLength={SURVEY_LIMITS.leastFavorite} placeholder="Anything that could be better"
              onChange={(e) => { setLeast(e.target.value); setErrs((x) => ({ ...x, least_favorite: undefined })); }}
              aria-invalid={!!errs.least_favorite || undefined}
            />
            {errs.least_favorite ? <small className="field-error" role="alert">{errs.least_favorite}</small> : <Counter n={least.length} max={SURVEY_LIMITS.leastFavorite} />}
          </label>
          <label className="field" htmlFor={ids.comm}>
            <span>Any suggestions, comments or concerns? <em className="survey-opt">optional</em></span>
            <textarea
              id={ids.comm} className="input" rows={3} value={comments} maxLength={SURVEY_LIMITS.comments} placeholder="Ideas for next time are always welcome"
              onChange={(e) => { setComments(e.target.value); setErrs((x) => ({ ...x, comments: undefined })); }}
              aria-invalid={!!errs.comments || undefined}
            />
            {errs.comments ? <small className="field-error" role="alert">{errs.comments}</small> : <Counter n={comments.length} max={SURVEY_LIMITS.comments} />}
          </label>
          <label className="check survey-anon">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            <span>
              Send anonymously to the YAC team
              <small className="muted" style={{ display: 'block' }}>You still get your points. The team sees your answers without your name.</small>
            </span>
          </label>
        </div>
      </Panel>

      <ErrorText error={formErr} />
      <button className="btn green block survey-send" disabled={busy}>
        {busy ? 'Sending…' : <>Send · <span className="coin" aria-hidden /> +{points}</>}
      </button>
      <p className="muted survey-foot">Optional, never required. Doesn’t count toward the weekly digital quest limit.</p>
    </form>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  return <small className={`muted survey-count ${n > max * 0.9 ? 'near' : ''}`}>{n}/{max}</small>;
}

function SurveyThanks({ title, points }: { title: string; points: number }) {
  return (
    <Panel className="survey-card survey-thanks center" >
      <div className="survey-thanks-art">
        <Burst count={16} spread={130} />
        <Sprite id="yak" size={80} />
      </div>
      <p className="survey-thanks-pts" role="status"><span className="coin" aria-hidden /> +{points} points</p>
      <p className="survey-thanks-msg">Thanks for helping make YAC events better! 🐂</p>
      <p className="muted" style={{ margin: 0 }}>Your feedback on <b>{title}</b> is on its way to the YAC team.</p>
      <div className="btn-row survey-thanks-btns">
        <Link to="/earn" className="btn ghost">Quests</Link>
        <Link to="/" className="btn">Home</Link>
      </div>
    </Panel>
  );
}

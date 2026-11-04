import { useState, type FormEvent } from 'react';
import * as api from '../../api';
import { CAMPUSES, campusName, type CampusId } from '../../config';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { ANNOUNCEMENT_LIMITS, announcementError } from '../../lib/validate';
import type { AnnouncementAudience, AnnouncementInput } from '../../types';

/** Admins send a custom message to everyone, one campus, or one person (in-app + optional email). */
export default function Announce() {
  const { user } = useAuth();
  const toast = useToast();
  const isChair = user?.role === 'chair';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [campus, setCampus] = useState<CampusId>(user?.campus ?? 'duke');
  const [person, setPerson] = useState<api.AdminUserRow | null>(null);
  const [search, setSearch] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const people = useAsync(
    () => (audience === 'user' && search.trim().length >= 2 ? api.searchUsers(search.trim(), 6) : Promise.resolve([] as api.AdminUserRow[])),
    [audience, search],
  );
  const sent = useAsync(() => api.listAnnouncements(15), [], { live: true });

  const emailBlocked = audience === 'all' && sendEmail && !isChair;
  const input: AnnouncementInput = { title, body, audience, campus: audience === 'campus' ? campus : undefined, userId: person?.id, sendEmail };
  const audienceText =
    audience === 'all' ? 'everyone' : audience === 'campus' ? `everyone at ${campusName(campus)}` : person ? person.displayName : 'one person';

  function review(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const problem = announcementError(input);
    if (problem) return setErr(problem.message);
    if (emailBlocked) return setErr('Only a YAC chair can email everyone. Uncheck email or pick a campus.');
    setConfirm(true);
  }

  async function send() {
    setBusy(true);
    try {
      const r = await api.sendAnnouncement(input);
      toast(`Sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}${r.emailed ? ` · emailed ${r.emailed}` : ''}`, 'success');
      setTitle('');
      setBody('');
      setPerson(null);
      setSearch('');
      setSendEmail(false);
      setConfirm(false);
    } catch (e) {
      setErr(errorMessage(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Panel title="📣 Send a message">
        <form className="stack" onSubmit={review}>
          <label className="field">
            <span>Title</span>
            <input className="input" value={title} maxLength={ANNOUNCEMENT_LIMITS.titleMax} onChange={(e) => setTitle(e.target.value)} placeholder="Pickleball is Sunday!" required />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea value={body} maxLength={ANNOUNCEMENT_LIMITS.bodyMax} onChange={(e) => setBody(e.target.value)} placeholder="Courts open at 2pm. The check-in password will be announced there." required />
            <small className="muted">{body.length}/{ANNOUNCEMENT_LIMITS.bodyMax}</small>
          </label>

          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="pixel" style={{ fontSize: 14, marginBottom: 6 }}>Send to</legend>
            {(['all', 'campus', 'user'] as AnnouncementAudience[]).map((a) => (
              <label key={a} className="check">
                <input type="radio" name="audience" checked={audience === a} onChange={() => setAudience(a)} />
                {a === 'all' ? 'Everyone' : a === 'campus' ? 'One campus' : 'One person'}
              </label>
            ))}
          </fieldset>

          {audience === 'campus' && (
            <label className="field">
              <span>Campus</span>
              <select value={campus} onChange={(e) => setCampus(e.target.value as CampusId)}>
                {CAMPUSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}

          {audience === 'user' && (
            <div className="stack">
              {person ? (
                <div className="spread panel flat" style={{ padding: 10 }}>
                  <span><strong>{person.displayName}</strong> <span className="muted">@{person.handle} · {campusName(person.campus)}</span></span>
                  <button type="button" className="btn small ghost" onClick={() => setPerson(null)}>Change</button>
                </div>
              ) : (
                <>
                  <label className="field">
                    <span>Find the person</span>
                    <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, username or email" />
                  </label>
                  {people.data?.length ? (
                    <ul className="list">
                      {people.data.map((p) => (
                        <li key={p.id}>
                          <button type="button" className="btn small ghost block" onClick={() => setPerson(p)}>
                            {p.displayName} · @{p.handle} · {campusName(p.campus)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : search.trim().length >= 2 && !people.loading ? <small className="muted">No matches.</small> : null}
                </>
              )}
            </div>
          )}

          <label className="check">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            <span>
              Also send as an email
              <br />
              <small className="muted">
                {audience === 'user'
                  ? 'Goes to their account email.'
                  : 'Only to people who left email updates on. Gmail allows about 500 emails a day, so save email for important news.'}
              </small>
            </span>
          </label>
          {emailBlocked && <p className="field-error">Only a YAC chair can email everyone. Uncheck email or pick a campus.</p>}

          <ErrorText error={err} />
          <button className="btn" disabled={busy || emailBlocked}>Review & send</button>
        </form>
      </Panel>

      <Panel title="Recently sent">
        {sent.loading && !sent.data ? <Loading /> : sent.error ? <ErrorText error={sent.error} /> : !sent.data?.length ? (
          <Empty>No messages yet.</Empty>
        ) : (
          <ul className="list">
            {sent.data.map((a) => (
              <li key={a.id} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <strong>{a.title}</strong>
                  <span className="chip neutral">{a.audience === 'all' ? 'Everyone' : a.audience === 'campus' ? campusName(a.campus!) : a.targetName ?? 'One person'}</span>
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.body}</p>
                <small className="muted">
                  {a.senderName} · {fmtDateTime(a.createdAt)} · {a.recipientCount} in app{a.sendEmail ? ` · ${a.emailCount} emailed` : ''}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Send this message?">
        <div className="stack">
          <p style={{ margin: 0 }}>To <strong>{audienceText}</strong>{sendEmail ? ' (in the app and by email)' : ' (in the app)'}:</p>
          <div className="panel flat" style={{ padding: 10 }}>
            <strong>{title}</strong>
            <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{body}</p>
          </div>
          <p className="muted" style={{ margin: 0 }}>Messages can’t be unsent.</p>
          <div className="grid-2">
            <button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="btn" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../../api';
import { CAMPUSES, campusName, type CampusId } from '../../config';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { ShowMore, useShowMore } from '../../components/Blocks';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { ANNOUNCEMENT_LIMITS, announcementError } from '../../lib/validate';
import type { AnnouncementAudience, AnnouncementInput, AnnouncementTemplate, YacEvent } from '../../types';
import { BUILTIN_TEMPLATES, applyTemplate, eventDateText, placeholders, type TemplateDef, type TemplateVars } from '../../lib/announceTemplates';
import { eventPhase } from '../../lib/adminDashboard';
import { monthName } from '../../lib/format';

/** Admins send a custom message to everyone, one campus, or one person (in-app + optional email). */
export default function Announce() {
  const { user } = useAuth();
  const toast = useToast();
  // 0028: /admin/announce?template=builtin:year_end starts from a built-in template (End-of-year checklist).
  const [params] = useSearchParams();
  const [start] = useState(() => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === params.get('template'));
    return t ? applyTemplate(t, {}) : null;
  });
  const [title, setTitle] = useState(start?.title ?? '');
  const [body, setBody] = useState(start?.body ?? '');
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
  const [tplOpen, setTplOpen] = useState(false);
  const left = placeholders(`${title} ${body}`);

  function pickTemplate(t: TemplateDef, vars: TemplateVars) {
    if ((title.trim() || body.trim()) && !window.confirm('Replace the title and message with this template?')) return;
    const r = applyTemplate(t, vars);
    setTitle(r.title);
    setBody(r.body);
    setErr(null);
    setTplOpen(false);
    toast(r.missing.length ? `Template added. Fill in: ${r.missing.map((m) => `{${m}}`).join(', ')}` : 'Template added. Check it, then send.', 'info');
  }
  const sentMore = useShowMore(5);

  const input: AnnouncementInput = { title, body, audience, campus: audience === 'campus' ? campus : undefined, userId: person?.id, sendEmail };
  const audienceText =
    audience === 'all' ? 'everyone' : audience === 'campus' ? `everyone at ${campusName(campus)}` : person ? person.displayName : 'one person';

  function review(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const problem = announcementError(input);
    if (problem) return setErr(problem.message);
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
          <div className="tpl-row">
            <button type="button" className="btn small navy" aria-expanded={tplOpen} aria-controls="tpl-panel" onClick={() => setTplOpen((v) => !v)}>
              Templates {tplOpen ? '▴' : '▾'}
            </button>
            <SaveTemplate title={title} body={body} />
          </div>
          {tplOpen && <TemplatePanel onPick={pickTemplate} onClose={() => setTplOpen(false)} />}
          <label className="field">
            <span>Title</span>
            <input className="input" value={title} maxLength={ANNOUNCEMENT_LIMITS.titleMax} onChange={(e) => setTitle(e.target.value)} placeholder="Pickleball is Sunday!" required />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea value={body} maxLength={ANNOUNCEMENT_LIMITS.bodyMax} onChange={(e) => setBody(e.target.value)} placeholder="Courts open at 2pm. The check-in password will be announced there." required />
            <small className="muted">{body.length}/{ANNOUNCEMENT_LIMITS.bodyMax}</small>
            {left.length > 0 && (
              <small className="tpl-left">Still to fill in: {left.map((p) => `{${p}}`).join(' ')}</small>
            )}
          </label>

          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-legend">Send to</legend>
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
                          <button type="button" className="row-btn" onClick={() => setPerson(p)}>
                            <span><strong>{p.displayName}</strong> <span className="muted">@{p.handle} · {campusName(p.campus)}</span></span>
                            <span aria-hidden>▶</span>
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
                  : 'Only to people who left “Email me announcements from YAC” on. Gmail allows about 500 emails a day, so save email for important news.'}
              </small>
            </span>
          </label>

          <ErrorText error={err} />
          <button className="btn" disabled={busy}>Review and send</button>
        </form>
      </Panel>

      <Panel title="Recently sent">
        {sent.loading && !sent.data ? <Loading /> : sent.error ? <ErrorText error={sent.error} /> : !sent.data?.length ? (
          <Empty>No messages yet.</Empty>
        ) : (
          <ul className="list">
            {sent.data.slice(0, sentMore.limit).map((a) => (
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
        {sent.data && <ShowMore shown={Math.min(sentMore.limit, sent.data.length)} total={sent.data.length} step={5} onMore={() => sentMore.more(sent.data?.length ?? 0)} />}
      </Panel>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Send this message?">
        <div className="stack">
          <p style={{ margin: 0 }}>To <strong>{audienceText}</strong>{sendEmail ? ' (in the app and by email)' : ' (in the app)'}:</p>
          <div className="panel flat" style={{ padding: 10 }}>
            <strong>{title}</strong>
            <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{body}</p>
          </div>
          <p className="muted" style={{ margin: 0 }}>Messages can’t be unsent.</p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="btn" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** "Save as template": the current title + message (placeholders like {event} are kept as-is). */
function SaveTemplate({ title, body }: { title: string; body: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api.saveAnnouncementTemplate(title, body);
      toast('Saved to your templates.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn small ghost" disabled={busy || !title.trim() || !body.trim()} onClick={() => void save()} title="Save this title and message as a template">
      {busy ? 'Saving…' : '☆ Save as template'}
    </button>
  );
}

/** Templates ▾: built-ins + saved ones, filled from the chosen event, the prize race and the Adventurer of the Month. */
function TemplatePanel({ onPick, onClose }: { onPick: (t: TemplateDef, vars: TemplateVars) => void; onClose: () => void }) {
  const toast = useToast();
  const saved = useAsync(() => api.listAnnouncementTemplates(), [], { live: true });
  const events = useAsync(() => api.adminListEvents(), []);
  const prize = useAsync(() => api.prizeStatus(), []);
  const star = useAsync(() => api.monthlyShoutout().catch(() => null), []);
  // Upcoming + live first (soonest first), then the most recent past ones.
  const choices = useMemo(() => {
    const list = events.data ?? [];
    const soon = list.filter((e) => eventPhase(e) !== 'Past').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = list.filter((e) => eventPhase(e) === 'Past').sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 5);
    return [...soon, ...past];
  }, [events.data]);
  const [eventId, setEventId] = useState('');
  const ev: YacEvent | undefined = choices.find((e) => e.id === eventId) ?? choices[0];
  const vars: TemplateVars = {
    event: ev?.title,
    date: ev ? eventDateText(ev.startsAt) : undefined,
    location: ev?.location,
    goal: prize.data?.goal,
    spotsLeft: prize.data?.remaining,
    adventurer: star.data?.displayName,
    month: star.data ? monthName(star.data.month) : undefined,
  };

  async function del(t: AnnouncementTemplate) {
    if (!window.confirm(`Delete the template “${t.title}”?`)) return;
    try {
      await api.deleteAnnouncementTemplate(t.id);
      saved.setData((d) => (d ?? []).filter((x) => x.id !== t.id));
      toast('Template deleted.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  return (
    <div id="tpl-panel" className="tpl-panel" role="region" aria-label="Announcement templates">
      <label className="field">
        <span>Fill in details from</span>
        <select value={ev?.id ?? ''} onChange={(e) => setEventId(e.target.value)} disabled={!choices.length}>
          {!choices.length && <option value="">No events yet</option>}
          {choices.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} · {eventDateText(e.startsAt)}{eventPhase(e) === 'Past' ? ' (past)' : ''}
            </option>
          ))}
        </select>
      </label>
      <h3 className="dash-sub">Built-in</h3>
      <ul className="tpl-list">
        {BUILTIN_TEMPLATES.map((t) => (
          <li key={t.id}>
            <button type="button" className="tpl-pick" onClick={() => onPick(t, vars)}>
              <b>{t.name}</b>
              <span>{applyTemplate(t, vars).title}</span>
            </button>
          </li>
        ))}
      </ul>
      <h3 className="dash-sub">Saved by the team</h3>
      {saved.loading && !saved.data ? <Loading lines={1} /> : saved.error ? <ErrorText error={saved.error} /> : !saved.data?.length ? (
        <p className="muted tpl-empty">None yet. Write a message, then “☆ Save as template”.</p>
      ) : (
        <ul className="tpl-list">
          {saved.data.map((t) => (
            <li key={t.id} className="tpl-saved">
              <button type="button" className="tpl-pick" onClick={() => onPick(t, vars)}>
                <b>{t.title}</b>
                <span>{t.authorName} · {fmtDateTime(t.createdAt)}</span>
              </button>
              {t.canDelete && (
                <button type="button" className="tpl-del" onClick={() => void del(t)} aria-label={`Delete template ${t.title}`} title="Delete template">×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="dash-more" onClick={onClose}>Close templates</button>
    </div>
  );
}

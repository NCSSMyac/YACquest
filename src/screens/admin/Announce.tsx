import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../../api';
import { CAMPUSES, campusName, type CampusId } from '../../config';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { ShowMore, useShowMore } from '../../components/Blocks';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { ANNOUNCEMENT_LIMITS, announcementError } from '../../lib/validate';
import type { Announcement, AnnouncementAudience, AnnouncementInput, AnnouncementTemplate, AudienceCount, YacEvent } from '../../types';
import { BUILTIN_TEMPLATES, applyTemplate, eventDateText, type TemplateDef, type TemplateVars } from '../../lib/announceTemplates';
import { eventPhase } from '../../lib/adminDashboard';
import { monthName } from '../../lib/format';
import { FILL_INS, SAMPLE_PERSON, fillValues, greetingLine, renderFillIns, unknownFillIns, type FillInToken, type FillPerson } from '../../lib/emailFill';
import { startedEventsMentioned } from '../../lib/emailStats';
import { ANNOUNCE_EMAIL_HINT_GROUP, ANNOUNCE_EMAIL_HINT_ONE } from '../../lib/emailWording';
import { audienceLine, cancelLabel, cancelOpen, capLine, minutesLeft, capReached, capReachedMessage, confirmWindowNote, recentStatus, sentMessage } from '../../lib/announceSafeguards';

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
  // 0038: the weekly cap on all-member emails, the cancel window, and who it reaches
  const cap = useAsync(() => api.announcementEmailCap(), [], { live: true });
  const count = useAsync<AudienceCount | null>(
    () => (audience === 'user' && !person ? Promise.resolve(null) : api.announcementAudienceCount(audience, campus, person?.id)),
    [audience, campus, person?.id],
    { live: true },
  );
  const allCapped = audience === 'all' && capReached(cap.data);
  const emailOn = sendEmail && !allCapped;
  const holdMinutes = cap.data?.holdMinutes ?? 0;
  const [tplOpen, setTplOpen] = useState(false);
  // 0032: anything in {braces} that isn't a fill-in (template leftovers like {event}, typos) blocks sending
  const left = unknownFillIns(`${title} ${body}`);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<'title' | 'body'>('body');
  const allEvents = useAsync(() => api.adminListEvents(), []);
  const started = useMemo(() => {
    const list = allEvents.data ?? [];
    const now = new Date();
    return startedEventsMentioned(`${title} ${body}`, list, now).filter(
      (e) => !list.some((x) => x.title.trim().toLowerCase() === e.title.trim().toLowerCase() && new Date(x.startsAt) > now),
    );
  }, [allEvents.data, title, body]);

  /** Insert ▾: puts {token} at the cursor of the field used last (message by default). */
  function insertToken(token: FillInToken) {
    const isTitle = lastField.current === 'title';
    const el = isTitle ? titleRef.current : bodyRef.current;
    const cur = isTitle ? title : body;
    const max = isTitle ? ANNOUNCEMENT_LIMITS.titleMax : ANNOUNCEMENT_LIMITS.bodyMax;
    const tok = `{${token}}`;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = (cur.slice(0, start) + tok + cur.slice(end)).slice(0, max);
    (isTitle ? setTitle : setBody)(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = Math.min(next.length, start + tok.length);
      el?.setSelectionRange(pos, pos);
    });
  }

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
  // 0038: the cancel countdown ticks; when a window closes the list reloads (Cancel disappears)
  const [now, setNow] = useState(() => new Date());
  const [cancelling, setCancelling] = useState<Announcement | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const openWindows = (sent.data ?? []).filter((a) => a.sendEmail && !a.cancelledAt && a.emailHoldUntil && new Date(a.emailHoldUntil) > now).length;
  useEffect(() => {
    if (!openWindows) return;
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, [openWindows]);
  useEffect(() => setNow(new Date()), [sent.data]);
  const reloadSent = sent.reload;
  useEffect(() => {
    const next = (sent.data ?? [])
      .map((a) => (a.emailHoldUntil && !a.cancelledAt ? new Date(a.emailHoldUntil).getTime() : 0))
      .filter((t) => t > Date.now())
      .sort((x, y) => x - y)[0];
    if (!next) return;
    const t = setTimeout(() => { setNow(new Date()); void reloadSent(); }, next - Date.now() + 500);
    return () => clearTimeout(t);
  }, [sent.data, reloadSent]);

  async function cancelIt() {
    if (!cancelling) return;
    setCancelBusy(true);
    try {
      await api.cancelAnnouncement(cancelling.id);
      toast('Cancelled. The emails won’t go out, and it’s gone from everyone’s app.', 'success');
      setCancelling(null);
      void sent.reload();
      void cap.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
      setCancelling(null);
      void sent.reload();
    } finally {
      setCancelBusy(false);
    }
  }

  const input: AnnouncementInput = { title, body, audience, campus: audience === 'campus' ? campus : undefined, userId: person?.id, sendEmail: emailOn };
  const reach = count.data ? audienceLine(count.data, audience, emailOn) : null;
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
      toast(sentMessage(r), 'success');
      setTitle('');
      setBody('');
      setPerson(null);
      setSearch('');
      setSendEmail(false);
      setConfirm(false);
    } catch (e) {
      setErr(errorMessage(e));
      setConfirm(false);
      void cap.reload();
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
            <InsertMenu onPick={insertToken} />
          </div>
          {tplOpen && <TemplatePanel onPick={pickTemplate} onClose={() => setTplOpen(false)} />}
          <label className="field">
            <span>Title</span>
            <input ref={titleRef} className="input" value={title} maxLength={ANNOUNCEMENT_LIMITS.titleMax} onFocus={() => (lastField.current = 'title')} onChange={(e) => setTitle(e.target.value)} placeholder="Pickleball is Sunday!" required />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea ref={bodyRef} value={body} maxLength={ANNOUNCEMENT_LIMITS.bodyMax} onFocus={() => (lastField.current = 'body')} onChange={(e) => setBody(e.target.value)} placeholder="Hi {first_name}! Courts open at 2pm. The check-in password will be announced there." required />
            <small className="muted">{body.length}/{ANNOUNCEMENT_LIMITS.bodyMax}</small>
            {left.length > 0 && (
              <small className="tpl-left" role="status">Fill in or remove before sending: {left.map((p) => `{${p}}`).join(' ')} (not a fill-in)</small>
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
            <input
              type="checkbox"
              checked={emailOn}
              disabled={allCapped}
              aria-describedby={audience === 'all' && cap.data ? 'email-cap' : undefined}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            <span>
              Also send as an email
              <br />
              <small className="muted">
                {audience === 'user' ? ANNOUNCE_EMAIL_HINT_ONE : ANNOUNCE_EMAIL_HINT_GROUP}
              </small>
            </span>
          </label>
          {/* 0038: at most N all-member emails a week (all senders); campus and one-person emails aren't limited */}
          {audience === 'all' && cap.data && allCapped && (
            <p id="email-cap" className="fill-warn" role="status">{capReachedMessage(cap.data.cap)}</p>
          )}
          {audience === 'all' && cap.data && !allCapped && emailOn && (
            <small id="email-cap" className="ann-cap" role="status">{capLine(cap.data)}</small>
          )}
          <p className="ann-reach" role="status" aria-live="polite">
            {reach ? <>Goes to <b>{reach}</b></> : audience === 'user' && !person ? 'Pick the person to see who gets it.' : count.error ? 'Couldn’t count the recipients.' : 'Counting recipients…'}
          </p>

          {started.length > 0 && (
            <p className="fill-warn" role="status">
              Heads up: this mentions {started.map((e) => `“${e.title}”`).join(', ')}, which already started. People may read it after the event.
            </p>
          )}

          <FillPreview title={title} body={body} sendEmail={emailOn} person={audience === 'user' ? person : null} events={allEvents.data ?? []} />

          <ErrorText error={err} />
          <button className="btn" disabled={busy}>Review and send</button>
        </form>
      </Panel>

      <Panel title="Recently sent">
        {sent.loading && !sent.data ? <Loading /> : sent.error ? <ErrorText error={sent.error} /> : !sent.data?.length ? (
          <Empty>No messages yet.</Empty>
        ) : (
          <ul className="list">
            {sent.data.slice(0, sentMore.limit).map((a) => {
              const status = recentStatus(a, now);
              return (
                <li key={a.id} className={`stack${a.cancelledAt ? ' ann-cancelled' : ''}`} style={{ gap: 4 }}>
                  <div className="spread">
                    <strong>{a.title}</strong>
                    <span className="row" style={{ gap: 6 }}>
                      {a.cancelledAt && <span className="chip rejected">Cancelled</span>}
                      <span className="chip neutral">{a.audience === 'all' ? 'Everyone' : a.audience === 'campus' ? campusName(a.campus!) : a.targetName ?? 'One person'}</span>
                    </span>
                  </div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.body}</p>
                  <small className="muted">
                    {a.senderName} · {fmtDateTime(a.createdAt)} · {a.cancelledAt ? 'removed from the app' : `${a.recipientCount} in app`}
                    {a.sendEmail ? (a.cancelledAt ? ' · emails cancelled' : ` · ${a.emailCount} ${minutesLeft(a.emailHoldUntil, now) > 0 ? 'by email' : 'emailed'}`) : ''}
                  </small>
                  {status && <small className={a.cancelledAt ? 'ann-status' : 'ann-status muted'}>{status}</small>}
                  {cancelOpen(a, now) && (
                    <button type="button" className="btn small red ann-cancel" onClick={() => setCancelling(a)}>
                      {cancelLabel(a.emailHoldUntil, now)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {sent.data && <ShowMore shown={Math.min(sentMore.limit, sent.data.length)} total={sent.data.length} step={5} onMore={() => sentMore.more(sent.data?.length ?? 0)} />}
      </Panel>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Send this message?">
        <div className="stack">
          <p style={{ margin: 0 }}>
            To <strong>{audienceText}</strong>{emailOn ? ' (in the app and by email)' : ' (in the app)'}{reach ? <>: <b>{reach}</b></> : ':'}
          </p>
          <div className="panel flat" style={{ padding: 10 }}>
            <strong>{title}</strong>
            <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{body}</p>
          </div>
          {started.length > 0 && (
            <p className="fill-warn" style={{ margin: 0 }}>
              It mentions {started.map((e) => `“${e.title}”`).join(', ')}, which already started. Send anyway?
            </p>
          )}
          {emailOn && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Each person gets their own email (“Hi {'{first_name}'},” and fill-ins filled in for them).</p>}
          {emailOn && holdMinutes > 0 ? (
            <p className="ann-window" style={{ margin: 0 }}>⏱ {confirmWindowNote(holdMinutes)}</p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Messages can’t be unsent.</p>
          )}
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="btn" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this announcement?">
        <div className="stack">
          <p style={{ margin: 0 }}>
            <strong>{cancelling?.title}</strong>
          </p>
          <p style={{ margin: 0 }}>The emails won’t go out, and the message is removed from everyone’s app. It frees this week’s all-member email slot if it used one.</p>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{cancelling ? `${cancelLabel(cancelling.emailHoldUntil, now).replace('Cancel · ', '')} to cancel.` : ''}</p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setCancelling(null)}>Keep it</button>
            <button className="btn red" onClick={() => void cancelIt()} disabled={cancelBusy}>{cancelBusy ? 'Cancelling…' : 'Cancel announcement'}</button>
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

/** 0032: Insert ▾ — fill-ins filled per person ({first_name}, {campus_pun}, …). */
function InsertMenu({ onPick }: { onPick: (t: FillInToken) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="fill-menu" ref={wrap}>
      {/* mousedown keeps the cursor where it was in the title / message */}
      <button type="button" className="btn small blue" aria-expanded={open} aria-controls="fill-list" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)}>
        Insert {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul id="fill-list" className="fill-list" aria-label="Fill-ins">
          {FILL_INS.map((f) => (
            <li key={f.token}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(f.token); setOpen(false); }}>
                <span><code>{`{${f.token}}`}</code> {f.label}</span>
                <small>{f.hint}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PREVIEW_PEOPLE: (FillPerson & { key: string })[] = [
  { key: 'duke', ...SAMPLE_PERSON },
  { key: 'unc', displayName: 'Ben K.', campus: 'unc', points: 245, friendCode: 'YAC-M3RT' },
  { key: 'ncsu', displayName: 'Chloe W.', campus: 'ncsu', points: 40, friendCode: 'YAC-Q8ZP' },
];

/** Live preview for one person: what their copy looks like (in the app, and the email if it's on). */
function FillPreview({ title, body, sendEmail, person, events }: {
  title: string;
  body: string;
  sendEmail: boolean;
  person: api.AdminUserRow | null;
  events: YacEvent[];
}) {
  const [who, setWho] = useState('duke');
  const p: FillPerson = person
    ? { displayName: person.displayName, campus: person.campus, points: person.points, friendCode: 'YAC-????' }
    : PREVIEW_PEOPLE.find((x) => x.key === who) ?? SAMPLE_PERSON;
  const values = fillValues(p, { events, seedKey: 'preview' });
  const t = renderFillIns(title.trim() || 'Your title', values);
  const b = renderFillIns(body.trim() || 'Your message…', values);
  return (
    <section className="stack" style={{ gap: 6 }} aria-label="Preview">
      <div className="spread" style={{ flexWrap: 'wrap', gap: 6 }}>
        <h3 className="dash-sub" style={{ margin: 0 }}>Preview{sendEmail ? ' (email)' : ' (in the app)'}</h3>
        {person ? (
          <small className="muted">as {person.displayName}</small>
        ) : (
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <span>as</span>
            <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Preview as">
              {PREVIEW_PEOPLE.map((x) => <option key={x.key} value={x.key}>{x.displayName} · {campusName(x.campus!)}</option>)}
            </select>
          </label>
        )}
      </div>
      {sendEmail ? (
        <div className="email-preview">
          <div className="email-preview-head"><small>YACquest</small><b>{t}</b></div>
          <div className="email-preview-body">{greetingLine(p.displayName)}{'\n\n'}{b}</div>
          <div className="email-preview-foot">
            You’re getting this because you have YACquest emails on. <u>Unsubscribe in one click</u> · Manage in the app (Me → Settings)
          </div>
        </div>
      ) : (
        <div className="panel flat" style={{ padding: 10 }}>
          <strong style={{ overflowWrap: 'anywhere' }}>{t}</strong>
          <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{b}</p>
        </div>
      )}
      <small className="muted">The {'{campus_pun}'} line rotates with each send.</small>
    </section>
  );
}

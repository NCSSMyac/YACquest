import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { CYCLE } from '../../config';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { fmtCycleDate, fmtCycleRange, fmtDate, fmtDateTime, timeAgo } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { DAY_NAMES, hourLabel, isEmail } from '../../lib/validate';
import type { EmailLogRow, ReportSettings } from '../../types';

export default function System() {
  const toast = useToast();
  const arch = useAsync(() => api.archives(), []);
  const [exporting, setExporting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await api.exportLedgerCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `yacquest-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  }

  async function reset() {
    setResetting(true);
    setErr(null);
    try {
      await api.resetCycle(confirmText);
      toast('Cycle archived and points reset.', 'success');
      setResetOpen(false);
      setConfirmText('');
      void arch.reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="stack">
      <WeeklyEmail />
      <EmailLog />

      <Panel title="Export">
        <p className="muted">Full points ledger as CSV, for audits and the year-end archive.</p>
        <button className="btn" disabled={exporting} onClick={exportCsv}>{exporting ? 'Preparing…' : 'Export ledger CSV'}</button>
      </Panel>

      <Panel title="Current cycle">
        <p><strong>{CYCLE.name}</strong></p>
        <p className="muted">Quest runs {fmtCycleRange(CYCLE.displayStart, CYCLE.end)} (as shown to players; the first event is the start).</p>
        <p className="muted" style={{ fontSize: 13 }}>The database cycle opened {fmtCycleDate(CYCLE.start)}, so points earned before the first event still count.</p>
      </Panel>

      <Panel title="Past cycles">
        {arch.loading && !arch.data ? <Loading /> : !arch.data?.length ? <Empty>No archived cycles yet.</Empty> : (
          <ul className="list">
            {arch.data.map((a, i) => (
              <li key={i}>
                <strong>{a.cycle}</strong> <span className="muted">archived {fmtDate(a.archivedAt)} · {a.ledgerRows} ledger rows · {a.winners.length} winners</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Danger zone">
        <p>Ending the cycle archives all history and zeroes everyone’s points. This can’t be undone.</p>
        <button className="btn red" onClick={() => { setResetOpen(true); setErr(null); setConfirmText(''); }}>End cycle &amp; reset points</button>
      </Panel>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="End cycle & reset?">
        <div className="stack">
          <p>This archives the ledger and prize winners, then sets every participant to 0 points and clears claims and submissions. Everyone is notified.</p>
          <label className="field">
            <span>Type RESET to confirm</span>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </label>
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setResetOpen(false)}>Cancel</button>
            <button className="btn red" disabled={confirmText !== 'RESET' || resetting} onClick={reset}>{resetting ? 'Resetting…' : 'Reset'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ───────────────────────────── weekly committee email ─────────────────────────────

function WeeklyEmail() {
  const toast = useToast();
  const settings = useAsync(() => api.getReportSettings(), []);
  const [form, setForm] = useState<ReportSettings | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'test' | 'now' | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  if (settings.loading && !form) return <Panel title="Weekly committee email"><Loading lines={3} /></Panel>;
  if (!form) return <Panel title="Weekly committee email"><ErrorText error={settings.error ?? 'Could not load settings.'} /></Panel>;

  const dirty = JSON.stringify({ ...form, updatedAt: undefined }) !== JSON.stringify({ ...settings.data, updatedAt: undefined });
  const patch = (p: Partial<ReportSettings>) => setForm((f) => (f ? { ...f, ...p } : f));

  function addRecipient() {
    const e = newEmail.trim().toLowerCase();
    if (!e) return;
    if (!isEmail(e)) return setEmailErr('That doesn’t look like an email address.');
    if (form!.recipients.includes(e)) return setEmailErr('Already on the list.');
    if (form!.recipients.length >= 20) return setEmailErr('Up to 20 extra recipients.');
    patch({ recipients: [...form!.recipients, e] });
    setNewEmail('');
    setEmailErr(null);
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const { updatedAt: _u, ...body } = form!;
      const next = await api.updateReportSettings(body);
      settings.setData(next);
      setForm(next);
      toast('Email settings saved.', 'success');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function run(kind: 'test' | 'now') {
    setBusy(kind);
    try {
      if (kind === 'test') await api.sendTestEmail();
      else await api.sendWeeklyReportNow();
      toast(kind === 'test' ? 'Test email queued — check your inbox in a few minutes.' : 'This week’s report is queued to send.', 'success');
      setConfirmSend(false);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Weekly committee email">
      <form className="stack" onSubmit={save}>
        <p className="muted" style={{ margin: 0 }}>
          A summary for the YAC team: spots left, who’s close to the prize, top 5, Campus Cup and this week’s numbers. Times are Eastern.
        </p>
        <label className="check">
          <input type="checkbox" checked={form.weeklyEnabled} onChange={(e) => patch({ weeklyEnabled: e.target.checked })} />
          <span>Send the weekly email automatically</span>
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Day</span>
            <select value={form.weeklyDay} onChange={(e) => patch({ weeklyDay: Number(e.target.value) })} disabled={!form.weeklyEnabled}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Time (Eastern)</span>
            <select value={form.weeklyHour} onChange={(e) => patch({ weeklyHour: Number(e.target.value) })} disabled={!form.weeklyEnabled}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>“Close to the prize” = within this many points of the goal</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            step={5}
            value={Number.isFinite(form.nearGoalPoints) ? form.nearGoalPoints : ''}
            onChange={(e) => patch({ nearGoalPoints: e.target.value === '' ? NaN : Math.round(Number(e.target.value)) })}
          />
        </label>

        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
          <legend className="field-legend">Who gets it</legend>
          <label className="check">
            <input type="checkbox" checked={form.includeChairs} onChange={(e) => patch({ includeChairs: e.target.checked })} />
            <span>All YACquest Chairs</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.includeAdmins} onChange={(e) => patch({ includeAdmins: e.target.checked })} />
            <span>All admins</span>
          </label>
          {form.recipients.length > 0 && (
            <ul className="list" aria-label="Extra recipients">
              {form.recipients.map((r) => (
                <li key={r} className="spread" style={{ padding: '6px 0' }}>
                  <span className="wrap-anywhere" style={{ minWidth: 0 }}>{r}</span>
                  <button type="button" className="btn small ghost" aria-label={`Remove ${r}`} onClick={() => patch({ recipients: form.recipients.filter((x) => x !== r) })}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1, minWidth: 0 }}>
              <span>Add another email</span>
              <input
                className="input"
                type="email"
                inputMode="email"
                value={newEmail}
                placeholder="someone@ncssm.edu"
                aria-invalid={!!emailErr || undefined}
                aria-describedby={emailErr ? 'recipient-err' : undefined}
                onChange={(e) => { setNewEmail(e.target.value); setEmailErr(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
              />
            </label>
            <button type="button" className="btn small blue" onClick={addRecipient} style={{ minHeight: 44 }}>Add</button>
          </div>
          {emailErr && <span id="recipient-err" className="field-error" role="alert">{emailErr}</span>}
        </fieldset>

        <label className="check">
          <input type="checkbox" checked={form.prizeAlertsEnabled} onChange={(e) => patch({ prizeAlertsEnabled: e.target.checked })} />
          <span>Prize alerts: email the same people right away when someone wins a spot and when a winner sends their delivery info</span>
        </label>

        <ErrorText error={err} />
        <button className="btn green" disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save email settings' : 'Saved'}</button>
        {form.updatedAt && <span className="muted" style={{ fontSize: 13 }}>Last changed {fmtDateTime(form.updatedAt)}</span>}
      </form>

      <div className="stack" style={{ marginTop: 14, gap: 8 }}>
        <button type="button" className="btn blue" disabled={busy !== null} onClick={() => void run('test')}>{busy === 'test' ? 'Queuing…' : 'Send test email to me'}</button>
        <button type="button" className="btn" disabled={busy !== null} onClick={() => setConfirmSend(true)}>Send report now</button>
        <Link to="/admin" className="btn small ghost" style={{ textDecoration: 'none' }}>Preview this week’s report</Link>
        {dirty && <span className="muted" style={{ fontSize: 13 }}>Save your changes first so the report uses them.</span>}
      </div>

      <Modal open={confirmSend} onClose={() => setConfirmSend(false)} title="Send the report now?">
        <div className="stack">
          <p>This emails this week’s report to everyone on the list right away. The automatic weekly email still goes out as scheduled.</p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setConfirmSend(false)}>Cancel</button>
            <button className="btn green" disabled={busy !== null} onClick={() => void run('now')}>{busy === 'now' ? 'Queuing…' : 'Send now'}</button>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}

// ───────────────────────────── delivery log ─────────────────────────────

const KIND_LABEL: Record<string, string> = {
  weekly_report: 'Weekly report',
  prize_qualified: 'Prize: new winner',
  prize_info: 'Prize: winner info',
  test: 'Test',
  announcement: 'Announcement',
};

const STATUS_CHIP: Record<EmailLogRow['status'], string> = { sent: 'approved', failed: 'rejected', pending: 'pending', sending: 't2' };

function EmailLog() {
  const toast = useToast();
  const log = useAsync(() => api.emailLog(50), [], { live: true });
  const [retrying, setRetrying] = useState<string | null>(null);

  async function retry(id: string) {
    setRetrying(id);
    try {
      await api.retryEmail(id);
      toast('Queued to try again.', 'success');
      void log.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setRetrying(null);
    }
  }

  return (
    <Panel title="Email delivery log" action={<button className="btn small ghost" onClick={() => void log.reload()}>Refresh</button>}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Emails go out within about 10 minutes. Failed ones are retried automatically up to 5 times.</p>
      {log.loading && !log.data ? <Loading /> : log.error ? <ErrorText error={log.error} /> : !log.data?.length ? <Empty>No emails yet. Try “Send test email to me”.</Empty> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <caption className="muted" style={{ textAlign: 'left', paddingBottom: 6 }}>Newest first</caption>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th scope="col" style={th}>Email</th>
                <th scope="col" style={th}>Status</th>
                <th scope="col" style={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {log.data.map((r) => (
                <tr key={r.id} style={{ borderTop: '2px dashed var(--rule)', verticalAlign: 'top' }}>
                  <td style={td}>
                    <strong style={{ display: 'block' }}>{r.subject || '(no subject)'}</strong>
                    <span className="muted">{KIND_LABEL[r.kind] ?? r.kind} · {fmtDateTime(r.createdAt)}</span>
                    <span className="wrap-anywhere" style={{ display: 'block' }}>To: {r.toEmails.join(', ')}</span>
                    {r.lastError && <span className="field-error" style={{ display: 'block', fontSize: 13 }}>{r.lastError}</span>}
                  </td>
                  <td style={td}>
                    <span className={`chip ${STATUS_CHIP[r.status] ?? 'neutral'}`}>{r.status}</span>
                    <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
                      {r.attempts} {r.attempts === 1 ? 'try' : 'tries'}
                      {r.sentAt && <> · {timeAgo(r.sentAt)}</>}
                    </span>
                  </td>
                  <td style={td}>
                    {r.status === 'failed' && (
                      <button className="btn small" disabled={retrying === r.id} onClick={() => void retry(r.id)}>{retrying === r.id ? '…' : 'Retry'}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

const th: React.CSSProperties = { padding: '6px 6px 6px 0', fontFamily: 'var(--font-pixel)', fontSize: 13 };
const td: React.CSSProperties = { padding: '8px 6px 8px 0' };

/**
 * "🐞 Report a problem" (0027): a small form that saves a Bug / problem feedback row with technical
 * details attached (page, app version, browser, screen, online, theme, time, last errors). No emails or
 * tokens are attached. Logged out, it opens an email to the YACquest Chairs with the same details.
 */
import { useMemo, useState, type FormEvent } from 'react';
import * as api from '../api';
import { CONTACT_EMAILS } from '../config';
import { buildBugContext, contextLines, currentTheme, type BugContext } from '../lib/bugContext';
import { recentErrors } from '../lib/errorBuffer';
import { isOnline } from '../lib/online';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/useAsync';
import { versionTag, builtDate } from '../lib/version';
import { ErrorText, Modal, useToast } from './ui';

/** Everything we attach, built at the moment the form opens. */
export function collectBugContext(trying?: string): BugContext {
  const w = typeof window === 'undefined' ? undefined : window;
  const d = builtDate();
  return buildBugContext({
    route: w ? w.location.hash.replace(/^#/, '') || '/' : '/',
    trying,
    version: `${versionTag()}${d ? ` (${d})` : ''}`,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    width: w?.innerWidth ?? 0,
    height: w?.innerHeight ?? 0,
    online: isOnline() && (typeof navigator === 'undefined' || navigator.onLine !== false),
    theme: currentTheme(),
    now: new Date(),
    errors: recentErrors(),
  });
}

export function ReportProblemButton({ className = 'btn small ghost block', label = '🐞 Report a problem' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      <ReportProblemModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ReportProblemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="🐞 Report a problem">
      {open && <ReportProblemForm onDone={onClose} />}
    </Modal>
  );
}

function ReportProblemForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [what, setWhat] = useState('');
  const [trying, setTrying] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Snapshot when the form opens (route, errors so far); `trying` is added on send.
  const base = useMemo(() => collectBugContext(), []);
  const lines = contextLines(base);

  async function send(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (what.trim().length < 3) return setErr('Tell us what happened (at least 3 characters).');
    const context = { ...base, ...collectBugContext(trying), route: base.route, errors: base.errors.length ? base.errors : recentErrors() };
    if (!user) {
      const body = `What happened:\n${what.trim()}\n\n${trying.trim() ? `What I was trying to do:\n${trying.trim()}\n\n` : ''}Technical details:\n${contextLines(context).join('\n')}`;
      window.location.href = `mailto:${CONTACT_EMAILS.join(',')}?subject=${encodeURIComponent('YACquest problem report')}&body=${encodeURIComponent(body)}`;
      onDone();
      return;
    }
    setBusy(true);
    try {
      await api.submitBugReport(what, context);
      toast('Thanks! The YAC team got your report.', 'success');
      onDone();
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={send}>
      <label className="field">
        <span>What happened?</span>
        <textarea rows={3} value={what} maxLength={1000} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. The Prize page stays blank after I tap Send." required />
      </label>
      <label className="field">
        <span>What were you trying to do? <small className="muted">(optional)</small></span>
        <input className="input" value={trying} maxLength={500} onChange={(e) => setTrying(e.target.value)} placeholder="e.g. Send my delivery info" />
      </label>
      <details className="tech-details">
        <summary>What we’ll attach</summary>
        <pre className="tech-pre">{lines.join('\n')}</pre>
        <small className="muted">No passwords, emails or login tokens. {user ? 'Saved with your name for the YAC team.' : 'Opens an email to the YACquest Chairs.'}</small>
      </details>
      <ErrorText error={err} />
      <button className="btn blue" disabled={busy}>{busy ? 'Sending…' : user ? 'Send report' : 'Email the report'}</button>
      <button type="button" className="btn ghost" onClick={onDone} disabled={busy}>Cancel</button>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api';
import { Sprite } from '../components/Sprite';
import { ErrorText, Panel, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/useAsync';
import { yakPunOfTheDay } from '../lib/yakPuns';
import { PendingCheckInBanner } from './CheckInLink';

export default function Login() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resending, setResending] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNeedsConfirm(false);
    try {
      const user = await api.login(handle, password);
      setUser(user);
      nav('/');
    } catch (err) {
      setError(errorMessage(err));
      setNeedsConfirm(err instanceof api.ApiError && err.code === 'not_verified');
      setBusy(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      await api.resendConfirmation(handle.trim());
      nav('/check-email', { state: { email: handle.trim(), justSent: true } });
    } catch (err) {
      toast(errorMessage(err), 'error');
      setResending(false);
    }
  }

  return (
    <div className="app-shell" style={{ paddingTop: 24 }}>
      <div className="stack">
        <div className="center">
          <Sprite id="yak" size={96} className="bob" />
          <h1 style={{ fontFamily: 'var(--font-pixel)', color: 'var(--gold-500)', textShadow: '2px 2px 0 var(--navy-900)', margin: '12px 0 4px' }}>YACquest</h1>
          <p className="muted" style={{ margin: 0 }}>Earn points. Join the quest. Win prizes.</p>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13, fontStyle: 'italic' }}>🐂 {yakPunOfTheDay()}</p>
        </div>
        <PendingCheckInBanner />
        <Panel title="Log in">
          <form className="stack" onSubmit={submit}>
            <label className="field">
              <span>{api.isMock ? 'Email (or demo username)' : 'Email'}</span>
              <input className="input" type={api.isMock ? 'text' : 'email'} value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete={api.isMock ? 'username' : 'email'} autoCapitalize="none" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <ErrorText error={error} />
            {needsConfirm && (
              <button type="button" className="btn block ghost" disabled={resending} onClick={resend}>
                {resending ? 'Sending…' : 'Resend confirmation email'}
              </button>
            )}
            <button className="btn block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
            <div className="spread" style={{ flexWrap: 'wrap' }}>
              <Link to="/signup">Create account</Link>
              <Link to="/forgot">Forgot password?</Link>
            </div>
            <p className="center" style={{ margin: 0 }}><Link to="/help">Need help?</Link></p>
          </form>
        </Panel>
        {api.isMock && (
          <Panel title="Demo accounts" tone="flat">
            <ul className="list" style={{ fontSize: 15 }}>
              <li><b>yak001</b> — participant (Duke)</li>
              <li><b>admin</b> — admin helper</li>
              <li><b>iesha</b>, <b>jacob</b> — YACquest Chairs</li>
            </ul>
            <p className="muted" style={{ margin: '6px 0 0' }}>Any password works in the demo.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

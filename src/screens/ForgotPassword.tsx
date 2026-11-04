import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { Sprite } from '../components/Sprite';
import { ErrorText, Panel } from '../components/ui';
import { errorMessage } from '../lib/useAsync';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell" style={{ paddingTop: 24 }}>
      <div className="stack">
        <div className="center"><Sprite id="yak" size={72} className="bob" /></div>
        <Panel title="Forgot password?">
          {sent ? (
            <div className="stack">
              <p style={{ margin: 0 }} role="status">If an account exists, we sent a reset link to that email. Check your inbox (and spam folder).</p>
              <Link className="btn block" to="/login">Back to log in</Link>
            </div>
          ) : (
            <form className="stack" onSubmit={submit}>
              <p className="muted" style={{ margin: 0 }}>Enter your email and we’ll send you a link to reset your password.</p>
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              <ErrorText error={error} />
              <button className="btn block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
              <Link to="/login">Back to log in</Link>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}

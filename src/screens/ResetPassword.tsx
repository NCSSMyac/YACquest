import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import { Sprite } from '../components/Sprite';
import { ErrorText, Panel, useToast } from '../components/ui';
import { errorMessage } from '../lib/useAsync';

/** Reached from the password-reset email link (which logs the person in). */
export default function ResetPassword() {
  const toast = useToast();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    try {
      await api.updatePassword(password);
      toast('Password updated!', 'success');
      nav('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="app-shell" role="main" style={{ paddingTop: 24 }}>
      <div className="stack">
        <div className="center"><Sprite id="yak" size={72} className="bob" /></div>
        <Panel title="Choose a new password">
          <form className="stack" onSubmit={submit} noValidate>
            <label className="field">
              <span>New password (8+ characters)</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
            <ErrorText error={error} />
            <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
            <button className="btn block ghost" type="button" disabled={busy} onClick={() => nav('/', { replace: true })}>Skip for now</button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

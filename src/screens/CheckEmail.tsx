import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as api from '../api';
import { Sprite } from '../components/Sprite';
import { ErrorText, Panel, useToast } from '../components/ui';
import { errorMessage } from '../lib/useAsync';
import { YAC_SENDER_EMAIL } from '../config';

const COOLDOWN_S = 60;

/** Shown after sign-up (live backend): the account exists but the email link must be clicked first. */
export default function CheckEmail() {
  const toast = useToast();
  const state = (useLocation().state ?? {}) as { email?: string; justSent?: boolean };
  const [email, setEmail] = useState(state.email ?? '');
  const [wait, setWait] = useState(state.justSent ? COOLDOWN_S : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await api.resendConfirmation(email);
      toast('Sent! Check your inbox.', 'success');
      setWait(COOLDOWN_S);
    } catch (err) {
      setError(errorMessage(err));
      // Rate-limited: still back off so people don't hammer the button.
      if (err instanceof api.ApiError && err.code === 'rate_limit') setWait(COOLDOWN_S);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell" role="main" style={{ paddingTop: 24 }}>
      <div className="stack">
        <div className="center"><Sprite id="yak" size={72} className="bob" /></div>
        <h1 className="sr-only">Check your inbox</h1>
        <Panel title="Check your inbox">
          <div className="stack">
            <p style={{ margin: 0 }} role="status">
              We sent a confirmation link to {state.email ? <b className="wrap-anywhere">{state.email}</b> : 'your email'}. Tap it to finish creating your account, then you can log in.
            </p>
            <SpamTip />
            {!state.email && (
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
            )}
            <ErrorText error={error} />
            <button className="btn block ghost" type="button" disabled={busy || wait > 0 || !email.trim()} onClick={resend}>
              {busy ? 'Sending…' : wait > 0 ? `Resend in ${wait}s` : 'Resend confirmation email'}
            </button>
            <Link className="btn block" to="/login">Go to log in</Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** 0032: helps the first emails land in the inbox (free Gmail senders often start in Spam/Promotions). */
export function SpamTip({ sender = YAC_SENDER_EMAIL }: { sender?: string }) {
  return (
    <div className="spam-tip" role="note">
      <p style={{ margin: 0 }}>
        <b>Can’t find it?</b> Check <b>Spam</b> or <b>Promotions</b> and tap <b>“Not spam”</b> — that helps future YACquest emails land in your inbox.
      </p>
      <p style={{ margin: '6px 0 0' }}>
        {sender ? (
          <>Add <b className="wrap-anywhere">{sender}</b> to your contacts.</>
        ) : (
          <>Add the YACquest sender (“YACquest · NCSSM Young Alumni”) to your contacts.</>
        )}
      </p>
    </div>
  );
}

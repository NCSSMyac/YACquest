/**
 * 0034 `#/verify?t=<token>` — the link in "Confirm your YACquest email". Public: works logged in or out
 * (the token is enough), in any browser. Shows a cute success; expired / used / invalid links explain
 * what to do (logged in: "Send a new link").
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { Sprite } from '../components/Sprite';
import { Avatar } from '../components/Avatar';
import { Panel, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { Burst } from '../lib/celebrate';
import { playCoin } from '../lib/sound';
import { maskEmail, tokenFromQuery } from '../lib/quickstart';
import { errorMessage } from '../lib/useAsync';

type State = { kind: 'working' } | { kind: 'done'; already: boolean } | { kind: 'error'; code: string; message: string };

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = tokenFromQuery(params.get('t'));
  const { user, ready, refresh } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<State>(() => (token ? { kind: 'working' } : { kind: 'error', code: 'invalid', message: 'That confirmation link isn’t complete. Open the newest email from YACquest and tap the button again.' }));
  const [sending, setSending] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.verifyEmail(token).then(
      (r) => {
        setState({ kind: 'done', already: r.status === 'already' });
        if (r.status === 'verified') playCoin();
        void refresh().catch(() => {});
      },
      (e) => {
        const code = e instanceof api.ApiError ? e.code : 'network';
        // A used link means the email is already confirmed: that's good news, not an error.
        if (code === 'used') {
          setState({ kind: 'done', already: true });
          void refresh().catch(() => {});
        } else setState({ kind: 'error', code, message: errorMessage(e) });
      },
    );
  }, [token, refresh]);

  async function resend() {
    setSending(true);
    try {
      const r = await api.resendVerification();
      toast(`New link sent to ${maskEmail(r.sentTo || user?.email || '')}!`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSending(false);
    }
  }

  const home = user ? '/' : '/login';
  return (
    <div className="app-shell verify-page" role="main">
      {state.kind === 'working' && (
        <div className="stack center verify-working" aria-live="polite">
          <Sprite id="yak" size={88} className="bob" />
          <h1 className="pixel verify-title">Confirming…</h1>
          <p className="muted">One tiny moment, adventurer.</p>
        </div>
      )}
      {state.kind === 'done' && (
        <div className="verify-success" aria-live="polite">
          <div className="verify-hero" aria-hidden="true">
            <span className="verify-burst"><Burst count={16} spread={130} /></span>
            <span className="verify-stars">✦ ✧ ✦</span>
            <span className="verify-char bob">
              {user ? <Avatar id={user.avatar} look={{ ...user.look, background: undefined }} campus={user.campus} size={104} /> : <Sprite id="yak" size={104} />}
            </span>
            <span className="verify-mail">💌</span>
          </div>
          <h1 className="pixel verify-title">{state.already ? 'All set!' : 'Email confirmed!'}</h1>
          <Panel tone="gold" className="verify-card">
            <p className="verify-lead">{state.already ? 'Your email was already confirmed ✓' : <>Thanks{user ? `, ${user.displayName.split(/\s+/)[0]}` : ''}! ✓</>}</p>
            <ul className="verify-perks">
              <li><span aria-hidden="true">🔒</span> Your points are locked in</li>
              <li><span aria-hidden="true">🏆</span> You can win a prize spot</li>
              <li><span aria-hidden="true">💌</span> Event news can reach your inbox</li>
            </ul>
            <Link className="btn block" to={home}>{user ? 'Back to my quest' : 'Log in to play'}</Link>
          </Panel>
        </div>
      )}
      {state.kind === 'error' && (
        <div className="stack verify-error">
          <div className="center"><Sprite id="yak" size={80} /></div>
          <h1 className="pixel verify-title center">{state.code === 'expired' ? 'This link expired' : 'Hmm, that link didn’t work'}</h1>
          <Panel>
            <div className="stack">
              <p style={{ margin: 0 }} role="alert">{state.message}</p>
              {ready && user ? (
                <button type="button" className="btn block" onClick={resend} disabled={sending}>{sending ? 'Sending…' : 'Send me a new link'}</button>
              ) : (
                <Link className="btn block" to="/login">Log in</Link>
              )}
              <Link className="btn block ghost" to={home}>{user ? 'Back to my quest' : 'Back'}</Link>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

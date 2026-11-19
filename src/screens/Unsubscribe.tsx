import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { Sprite } from '../components/Sprite';
import { ErrorText, Loading, Panel, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/useAsync';

/**
 * 0032: the "Unsubscribe in one click" link in every participant email: #/unsubscribe?t=<token>.
 * Public (no login). The token is random per person (never the user id) and can only turn that
 * person's YACquest emails off. Logged-in people can turn them right back on.
 */
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = (params.get('t') ?? '').trim();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<'working' | 'done' | 'already' | 'error'>('working');
  const [error, setError] = useState<string | null>(null);
  const [back, setBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (!token) {
      setState('error');
      setError('This unsubscribe link is missing its code. You can turn emails off in YACquest under Me → Settings.');
      return;
    }
    api
      .unsubscribeByToken(token)
      .then((r) => setState(r.alreadyOff ? 'already' : 'done'))
      .catch((e) => {
        setState('error');
        setError(errorMessage(e));
      });
  }, [token]);

  async function resubscribe() {
    setBusy(true);
    try {
      await api.updateProfile({ emailOptIn: true });
      await refresh();
      setBack(true);
      toast('YACquest emails are back on.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell" role="main" style={{ paddingTop: 32 }}>
      <div className="stack">
        <div className="center"><Sprite id="yak" size={80} /></div>
        <h1 className="center" style={{ margin: 0, fontSize: 22 }}>{state === 'error' ? 'Hmm, that didn’t work' : 'Email settings'}</h1>
        <Panel>
          {state === 'working' ? (
            <Loading lines={2} />
          ) : state === 'error' ? (
            <ErrorText error={error} />
          ) : back ? (
            <p style={{ margin: 0 }} role="status">You’re back on the list. We’ll email you YAC news and event reminders again.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <p style={{ margin: 0, fontSize: 17 }} role="status">
                <b>{state === 'already' ? 'You were already unsubscribed.' : 'You’re unsubscribed.'}</b>
              </p>
              <p style={{ margin: 0 }}>
                You won’t get YACquest announcement or reminder emails anymore. Everything still shows up in the app.
              </p>
              <p className="muted" style={{ margin: 0 }}>Changed your mind? Turn emails back on in Me → Settings.</p>
            </div>
          )}
        </Panel>
        {state !== 'working' && !back && (user ? (
          <button type="button" className="btn block" disabled={busy} onClick={() => void resubscribe()}>
            {busy ? 'Turning on…' : 'Turn emails back on'}
          </button>
        ) : (
          <Link className="btn block ghost" to="/login">Log in to change email settings</Link>
        ))}
        {user && <Link className="btn block ghost" to="/">Open YACquest</Link>}
      </div>
    </div>
  );
}

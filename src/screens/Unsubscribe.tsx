import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { Sprite } from '../components/Sprite';
import { ErrorText, Loading, Panel, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/useAsync';
import { UNSUB_ALSO_ALL, UNSUB_BACK_ON, prefKeyOfType, unsubTypeBackOn, unsubTypePhrase, unsubView } from '../lib/emailWording';
import { emailTypeOf, parseUnsubKind } from '../../supabase/functions/_shared/emailCore';

/**
 * 0032: the "Unsubscribe in one click" link in every member email: #/unsubscribe?t=<token>.
 * 0039: links carry the email's kind, #/unsubscribe?t=<token>&k=announcement — then only that type is turned off
 * ("You're unsubscribed from announcement emails.", with "Also turn off all YACquest emails" and, when logged in,
 * "Turn announcement emails back on"). A link without k (older emails) turns everything off, as before.
 * Public (no login). The token is random per person (never the user id) and can only turn that person's emails off.
 * What it shows: unsubView() in src/lib/emailWording.ts (unit tested).
 */
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = (params.get('t') ?? '').trim();
  const kind = parseUnsubKind(params.get('k'));
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<'working' | 'done' | 'already' | 'error'>('working');
  /** 'all' = every member email is off now (old link, or "Also turn off all"). */
  const [scope, setScope] = useState<'type' | 'all'>(kind ? 'type' : 'all');
  const [othersOn, setOthersOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [back, setBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const once = useRef(false);
  const type = emailTypeOf(kind);
  const phrase = unsubTypePhrase(kind);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (!token) {
      setState('error');
      setError('This unsubscribe link is missing its code. You can turn emails off in YACquest under Me → Settings.');
      return;
    }
    api
      .unsubscribeByToken(token, kind)
      .then((r) => {
        setScope(r.type && r.type !== 'all' ? 'type' : 'all');
        setOthersOn(r.othersOn ?? false);
        setState(r.alreadyOff ? 'already' : 'done');
      })
      .catch((e) => {
        setState('error');
        setError(errorMessage(e));
      });
  }, [token, kind]);

  async function turnOffAll() {
    setBusy(true);
    try {
      await api.unsubscribeByToken(token);
      if (user) await refresh();
      setScope('all');
      setOthersOn(false);
      setState('done');
      toast('All YACquest emails are off.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function resubscribe() {
    setBusy(true);
    try {
      if (scope === 'type' && type) await api.setEmailPrefs({ [prefKeyOfType(type)]: true });
      else await api.updateProfile({ emailOptIn: true });
      await refresh();
      setBack(true);
      toast(scope === 'type' && phrase ? unsubTypeBackOn(phrase) : 'YACquest emails are back on.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const v = unsubView({ kind, scope, alreadyOff: state === 'already', othersOn, loggedIn: !!user });
  const ready = state === 'done' || state === 'already';
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
            <p style={{ margin: 0 }} role="status">{scope === 'type' && phrase ? unsubTypeBackOn(phrase) : UNSUB_BACK_ON}</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <p style={{ margin: 0, fontSize: 17 }} role="status"><b>{v.headline}</b></p>
              {v.lines.map((l, i) => (
                <p key={l} className={i === 0 ? undefined : 'muted'} style={{ margin: 0 }}>{l}</p>
              ))}
            </div>
          )}
        </Panel>
        {ready && !back && v.alsoAll && (
          <button type="button" className="btn block ghost" disabled={busy} onClick={() => void turnOffAll()}>
            {UNSUB_ALSO_ALL}
          </button>
        )}
        {ready && !back && v.backOn && (
          <button type="button" className="btn block" disabled={busy} onClick={() => void resubscribe()}>
            {busy ? 'One moment…' : v.backOn}
          </button>
        )}
        {state !== 'working' && !user && <Link className="btn block ghost" to="/login">Log in to change email settings</Link>}
        {user ? (
          <Link className="btn block ghost" to="/me">{v.manage}</Link>
        ) : (
          state !== 'working' && <p className="muted center" style={{ margin: 0, fontSize: 14 }}>{v.manage} after you log in.</p>
        )}
      </div>
    </div>
  );
}

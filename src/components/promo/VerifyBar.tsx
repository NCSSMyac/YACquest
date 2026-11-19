/**
 * 0034 follow-up: RED "confirm your email" bar, stuck right under the top bar on every logged-in screen
 * (admin too) until the email is confirmed. Resend (server rate limit: 3 an hour) → "Sent! Check spam too";
 * "Wrong email?" → how to reach the YACquest Chairs. × hides it for this page view only (back on the next
 * navigation or reload). Gentle pulse about once a minute (none with reduced motion). role="alert" the first
 * time per session, then role="status". Its height is published as --verify-bar-h so sticky headers sit below.
 * Hidden on the Coffee Pass (outside the app chrome) and while the reward reveal is open (body.takeover-open).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as api from '../../api';
import { CONTACT_EMAILS } from '../../config';
import { useAuth } from '../../lib/auth';
import { markVerifyBarAlerted, showVerifyBar, verifyBarRole, verifyBarText } from '../../lib/quickstart';
import { errorMessage } from '../../lib/useAsync';
import { useToast } from '../ui';

export function VerifyBar() {
  const { user } = useAuth();
  const loc = useLocation();
  const { pathname } = loc;
  // One "page view" = this history entry (key) at this address (hash links opened from outside all get key 'default').
  const key = `${loc.key}|${pathname}${loc.search}`;
  const toast = useToast();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  // role="alert" only on the page view where the bar first appears this session; role="status" after that.
  const [firstView] = useState(() => (verifyBarRole() === 'alert' ? key : null));
  const role = firstView === key ? 'alert' : 'status';
  const ref = useRef<HTMLDivElement>(null);
  const show = showVerifyBar(user, pathname, dismissed, key);

  useEffect(() => {
    if (show) markVerifyBarAlerted();
  }, [show]);
  useEffect(() => setHelp(false), [key]);

  // Publish the bar's height so sticky headers (Quest tabs, Ranks you-bar) sit below it.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!show || !el) {
      root.style.removeProperty('--verify-bar-h');
      return;
    }
    const set = () => root.style.setProperty('--verify-bar-h', `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty('--verify-bar-h');
    };
  }, [show, help]);

  if (!show || !user) return null;

  async function resend() {
    setBusy(true);
    try {
      await api.resendVerification();
      setSent(true);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="verify-bar" role={role} aria-label="Confirm your email">
      <div className="verify-bar-row">
        <p className="verify-bar-text">{verifyBarText(user)}</p>
        <button type="button" className="verify-bar-x" onClick={() => setDismissed(key)} aria-label="Hide for now (comes back on the next page)">×</button>
      </div>
      <div className="verify-bar-btns">
        <button type="button" className="verify-bar-btn" onClick={resend} disabled={busy || sent}>
          {busy ? 'Sending…' : sent ? 'Sent! Check spam too' : 'Resend email'}
        </button>
        <button type="button" className="verify-bar-btn ghost" aria-expanded={help} onClick={() => setHelp((h) => !h)}>Wrong email?</button>
      </div>
      {help && (
        <p className="verify-bar-help">
          Signed up with the wrong email? Email a YACquest Chair from the right address and we’ll fix it:{' '}
          {CONTACT_EMAILS.map((e, i) => (
            <span key={e}>{i > 0 && ' or '}<a href={`mailto:${e}?subject=${encodeURIComponent('YACquest: wrong email on my account')}`}>{e}</a></span>
          ))}
          . Tell us your username (@{user.handle}).
        </p>
      )}
    </div>
  );
}

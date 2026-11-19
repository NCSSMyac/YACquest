/**
 * 0034 "Bring-a-friend moment": after a check-in (reward reveal, Coffee Pass bottom, the normal CHECKED IN
 * pass). Share (phone share sheet with the sign-up link + code), Copy, or a QR of the sign-up link a friend
 * can scan off your screen (qrcode is lazy-loaded). Hidden once all friend bonuses are used (3/3).
 */
import { useEffect, useState } from 'react';
import * as api from '../../api';
import { TIER_POINTS } from '../../config';
import { useAuth } from '../../lib/auth';
import { signupLink } from '../../lib/friends';
import { bringFriendText, canBringFriend } from '../../lib/promo';
import { qrDataUrl } from '../../lib/qr';
import { siteUrl } from '../../lib/supabase';
import { useToast } from '../ui';

export function BringFriendCard({ tone = 'light', onEngage }: { tone?: 'light' | 'dark'; onEngage?: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [used, setUsed] = useState<number | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => {
    let alive = true;
    api.getDashboard().then((d) => alive && setUsed(d.referralsUsed), () => {});
    return () => {
      alive = false;
    };
  }, []);
  const code = user?.friendCode ?? '';
  const base = `${siteUrl().replace(/\/+$/, '')}/#/signup`;
  const link = signupLink(code, base);
  useEffect(() => {
    if (!showQr || qr) return;
    let alive = true;
    qrDataUrl(link, 480).then((u) => alive && setQr(u), () => alive && toast('Couldn’t make the QR code here. Use Share instead.', 'error'));
    return () => {
      alive = false;
    };
  }, [showQr, qr, link, toast]);
  if (!user || !code || !canBringFriend(used)) return null;

  async function share() {
    onEngage?.();
    const text = bringFriendText(code, base);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Join me on YACquest', text, url: link });
        return;
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return;
      }
    }
    await copy();
  }
  async function copy() {
    onEngage?.();
    try {
      await navigator.clipboard.writeText(link);
      toast('Sign-up link copied — send it to your friend!', 'success');
    } catch {
      toast(`Your code is ${code}`, 'info');
    }
  }
  return (
    <section className={`friend-moment ${tone}`} aria-labelledby="friend-moment-title">
      <h2 id="friend-moment-title" className="friend-moment-head"><span aria-hidden="true">👯 </span>Got a friend here?</h2>
      <p className="friend-moment-text">
        Share your code <b className="friend-moment-code">{code}</b> — you both get <b>+{TIER_POINTS[1]}</b> when they check in today!
      </p>
      <div className="friend-moment-btns">
        <button type="button" className="btn small" onClick={share}>Share</button>
        <button type="button" className="btn small ghost" onClick={copy}>Copy link</button>
        <button type="button" className="btn small blue" aria-expanded={showQr} onClick={() => { onEngage?.(); setShowQr((s) => !s); }}>{showQr ? 'Hide QR' : 'Show QR'}</button>
      </div>
      {showQr && (
        <div className="friend-moment-qr">
          {qr ? <img src={qr} alt={`QR code: YACquest sign-up link with friend code ${code}`} width={200} height={200} /> : <span className="friend-moment-qr-wait" aria-live="polite">Making your QR…</span>}
          <small>Your friend scans this to sign up with your code.</small>
        </div>
      )}
    </section>
  );
}

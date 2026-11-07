/**
 * 0026 "My friends" (Me, linked from the friend-code row on Home): people who joined with your code,
 * whether they came to an event yet, your code with Copy / Share, and the X/3 friend bonuses used.
 */
import * as api from '../api';
import { CAPS, TIER_POINTS, campusName } from '../config';
import { friendStatus, shareText, signupLink } from '../lib/friends';
import { fmtDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Avatar } from './Avatar';
import { Card } from './Blocks';
import { ErrorText, Loading, useToast } from './ui';

export function MyFriends({ code, id }: { code: string; id?: string }) {
  const toast = useToast();
  const { data, error, loading } = useAsync(() => api.myFriends(), [], { live: true });
  const used = Math.min(CAPS.referralsPerCycle, (data ?? []).filter((f) => f.bonus).length);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast('Friend code copied!', 'success');
    } catch {
      toast(`Couldn’t copy. Your code is ${code}`, 'error');
    }
  }

  async function share() {
    const text = shareText(code);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Join me on YACquest', text });
        return;
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Invite copied — paste it in a text or group chat!', 'success');
    } catch {
      toast(`Share this link: ${signupLink(code)}`, 'info');
    }
  }

  return (
    <Card id={id} glyph="userplus" title="My friends" action={<span className="chip t1" title="Friend bonuses used this cycle">{used}/{CAPS.referralsPerCycle} used</span>}>
      <div className="friend-code-box">
        <span className="friend-text">
          <span className="dash-eyebrow" style={{ fontSize: 10 }}>Your friend code</span>
          <span className="friend-code">{code}</span>
        </span>
        <button type="button" className="btn small ghost" onClick={copy} aria-label={`Copy friend code ${code}`}>Copy</button>
        <button type="button" className="btn small" onClick={share}>Share</button>
      </div>
      <p className="muted friends-note">Bring a friend: you both get <b>+{TIER_POINTS[1]}</b> when they come to their first YAC event (up to {CAPS.referralsPerCycle} friends per year).</p>
      {loading && !data ? (
        <Loading lines={2} />
      ) : error && !data ? (
        <ErrorText error={error} />
      ) : !data?.length ? (
        <p className="muted" style={{ margin: 0 }}>Nobody has joined with your code yet. Tap Share to send an invite!</p>
      ) : (
        <ul className="mini-list friend-list">
          {data.map((f) => (
            <li key={`${f.displayName}-${f.joinedAt}`}>
              <Avatar id={f.avatar} look={f.look} campus={f.campus} size={40} title={f.displayName} />
              <span className="mini-main">
                <span className="mini-title">{f.displayName}</span>
                <span className="mini-meta">{campusName(f.campus)} · joined {fmtDate(f.joinedAt)}</span>
                <span className={`chip ${f.came ? 'approved' : 'neutral'} friend-chip`}>{friendStatus(f)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { Sprite } from '../components/Sprite';
import { Panel, useToast } from '../components/ui';
import { CAPS, CONTACT_EMAILS, CYCLE, INSTAGRAM_HANDLE, INSTAGRAM_URL, PRIZE, TIER_LABELS, TIER_POINTS } from '../config';
import { useAuth } from '../lib/auth';
import { fmtCycleRange } from '../lib/format';
import { serverInfo } from '../lib/supabase';

/** Lets a long email address wrap after the @ instead of mid-word. */
const breakableEmail = (email: string) => {
  const at = email.indexOf('@');
  return at < 0 ? email : <>{email.slice(0, at)}<wbr />{email.slice(at)}</>;
};

/** Help page: quick answers + one-tap email to the YAC chairs. Works logged in or out. */
export default function Help() {
  const { user } = useAuth();
  const toast = useToast();
  const subject = encodeURIComponent('YACquest help');
  const body = encodeURIComponent(
    `Hi YAC team,\n\n[Tell us what you need help with]\n\n—\nName: ${user?.displayName ?? ''}\nUsername: ${user ? '@' + user.handle : ''}\nCampus: ${user?.campus ?? ''}`,
  );
  const mailAll = `mailto:${CONTACT_EMAILS.join(',')}?subject=${subject}&body=${body}`;

  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      toast('Email copied!', 'success');
    } catch {
      toast(email, 'info');
    }
  }

  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: 'How do I earn points?',
      a: (
        <>
          Check in at events with the password announced there, and complete quests on the {user ? <Link to="/earn">Quests</Link> : 'Quests'} page.
          {' '}Points: {TIER_LABELS[1]} +{TIER_POINTS[1]}, {TIER_LABELS[2]} +{TIER_POINTS[2]}, {TIER_LABELS[3]} +{TIER_POINTS[3]}.
        </>
      ),
    },
    {
      q: 'My event check-in didn’t work.',
      a: 'Check-in opens 30 minutes before the event and closes a little after it ends. Double-check the password with the host. Each event can only be checked into once.',
    },
    {
      q: 'Why was my screenshot not approved?',
      a: `The reason is in your notifications (🔔). Make sure the screenshot clearly shows the YAC post or confirmation. Digital quests are limited to ${CAPS.digitalPerWeek} per week.`,
    },
    {
      q: 'How do I win the prize?',
      a: `The first ${PRIZE.count} people to reach ${PRIZE.goal} points each win a ${PRIZE.name}. Points must be earned fairly — if points are removed and you drop below ${PRIZE.goal}, the spot goes to the next person.`,
    },
    {
      q: 'I didn’t get my confirmation or password email.',
      a: 'Check your spam or promotions folder. On the login page you can resend the confirmation email or use “Forgot password?”.',
    },
    {
      q: 'When does the year end?',
      a: `This school year’s quest runs ${fmtCycleRange(CYCLE.displayStart, CYCLE.end)}. Points reset to 0 for the next school year.`,
    },
  ];

  return (
    <div className="app-shell" style={{ paddingTop: 16 }}>
      <div className="stack">
        <PageHeader title="Help" back />

        <Panel tone="gold">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Sprite id="yak" size={56} className="bob" />
            <div className="stack" style={{ gap: 6 }}>
              <strong>Need a hand? The YAC team is here.</strong>
              <span>Email us about anything — points, events, prizes, your account, or ideas.</span>
            </div>
          </div>
          <a className="btn navy block" style={{ marginTop: 12 }} href={mailAll}>✉️ Email the YAC team</a>
        </Panel>

        <Panel title="Contact">
          <ul className="list">
            {CONTACT_EMAILS.map((email) => (
              <li key={email} className="spread">
                <a href={`mailto:${email}?subject=${subject}&body=${body}`} className="wrap-anywhere" style={{ fontWeight: 700, minWidth: 0 }}>{breakableEmail(email)}</a>
                <button type="button" className="btn small ghost" onClick={() => copy(email)} aria-label={`Copy ${email}`}>Copy</button>
              </li>
            ))}
            <li className="spread">
              <span>Instagram: <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>{INSTAGRAM_HANDLE}</a></span>
            </li>
          </ul>
          <small className="muted">If the email button doesn’t open an app, copy an address above and email us from any account.</small>
        </Panel>

        <Panel title="Quick answers">
          <ul className="list">
            {faqs.map((f) => (
              <li key={f.q}>
                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{f.q}</summary>
                  <p style={{ margin: '8px 0 0' }}>{f.a}</p>
                </details>
              </li>
            ))}
          </ul>
          {user && <p style={{ margin: '8px 0 0' }}>Full details: <Link to="/rules">Rules</Link></p>}
        </Panel>

        <p className="muted center" style={{ fontSize: 12, margin: 0 }}>App server: {serverInfo}</p>
      </div>
    </div>
  );
}

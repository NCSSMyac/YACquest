import { CAMPUSES, CAPS, CONTACT_EMAILS, CYCLE, INSTAGRAM_HANDLE, INSTAGRAM_URL, PRIZE, TIER_LABELS, TIER_POINTS, type Tier } from '../config';
import { ACTIVITIES } from '../lib/activities';
import { PageHeader } from '../components/Layout';
import { TierChip } from '../components/ui';
import { fmtLongDate as longDate } from '../lib/format';
const TIERS: Tier[] = [1, 2, 3];

/** Rules text, generated from config so it can never disagree with the game. Also shown in the signup modal. */
export function RulesContent() {
  return (
    <div className="stack" style={{ fontSize: 16 }}>
      <section>
        <h3>How points work</h3>
        <p>
          Join YAC events and do quests to earn points. Each quest belongs to a tier:{' '}
          {TIERS.map((t, i) => (
            <span key={t}>{i > 0 && ', '}<b>{TIER_LABELS[t]}</b> ({TIER_POINTS[t]} pts)</span>
          ))}
          . The three campuses ({CAMPUSES.map((c) => c.name).join(', ')}) each have a leaderboard, and there is an overall one too.
        </p>
        {TIERS.map((t) => (
          <div key={t} style={{ marginBottom: 10 }}>
            <TierChip tier={t} />
            <ul className="list">
              {ACTIVITIES.filter((a) => a.tier === t).map((a) => (
                <li key={a.id}>
                  <b>{a.title}</b>
                  {a.limitLabel && <span className="muted"> ({a.limitLabel})</span>}
                  <div className="muted">{a.description}</div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section>
        <h3>The prize race</h3>
        <p>
          The first {PRIZE.count} people to reach {PRIZE.goal} points each win a {PRIZE.name}. Spots go in the order people reach the goal. When the {PRIZE.count} spots are gone, they’re gone, but you can keep climbing the leaderboard! Prizes are delivered after the cycle ends, by {longDate(PRIZE.fulfillBy)}.
        </p>
        <p>
          Prizes must be earned legitimately: if points are later removed and you drop below {PRIZE.goal}, your prize spot is revoked and goes to the next person who qualified.
        </p>
      </section>
      <section>
        <h3>Verification</h3>
        <ul>
          <li>Event check-ins use a password announced by a YAC organizer at the event.</li>
          <li>Screenshots and photos are reviewed by YAC admins.</li>
          <li>False or doctored submissions are removed, and points may be taken back.</li>
        </ul>
      </section>
      <section>
        <h3>Fair play limits</h3>
        <ul>
          <li>Digital quests: {CAPS.digitalPerWeek} per week in total.</li>
          <li>Social tag posts: {CAPS.socialTagPerMonth} per month.</li>
          <li>Friend referrals: up to {CAPS.referralsPerCycle} per cycle, and your friend must attend an event.</li>
          <li>Event photos: {CAPS.photosPerEvent} per event, {CAPS.photosPerCycle} per cycle.</li>
          <li>Some quests can only be done once per cycle.</li>
        </ul>
      </section>
      <section>
        <h3>The cycle</h3>
        <p>
          The {CYCLE.name} cycle ends on {longDate(CYCLE.end)}. At the end, everyone’s points reset to 0 and the history is archived.
        </p>
      </section>
      <section>
        <h3>Good to know</h3>
        <ul>
          <li>Points are not cash and can’t be transferred.</li>
          <li>
            Questions? Email{' '}
            {CONTACT_EMAILS.map((email, i) => (
              <span key={email}>
                {i > 0 && ' or '}
                <a href={`mailto:${email}`}>{email}</a>
              </span>
            ))}
            .
          </li>
          <li>
            Follow us on Instagram:{' '}
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
              {INSTAGRAM_HANDLE}
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

export default function Rules() {
  return (
    <div className="stack">
      <PageHeader title="Rules" back />
      <div className="panel">
        <RulesContent />
      </div>
    </div>
  );
}

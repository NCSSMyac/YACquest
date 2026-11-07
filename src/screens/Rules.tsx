import { CAMPUSES, CAPS, CONTACT_EMAILS, CYCLE, INSTAGRAM_HANDLE, INSTAGRAM_URL, PRIZE, TIER_LABELS, TIER_POINTS, type Tier } from '../config';
import { ACTIVITIES } from '../lib/activities';
import { PageHeader } from '../components/Layout';
import { TierChip } from '../components/ui';
import { Accordion, Card } from '../components/Blocks';
import { fmtCycleDate, fmtCycleRange, fmtLongDate as longDate } from '../lib/format';
const TIERS: Tier[] = [1, 2, 3];

/**
 * Rules text, generated from config so it can never disagree with the game. Also shown in the signup modal.
 * A short "quick version" up top, then every section as a collapsible row so the page stays short.
 */
export function RulesContent({ expanded = false }: { expanded?: boolean }) {
  return (
    <div className="stack" style={{ fontSize: 16 }}>
      <Card glyph="scroll" title="The quick version" tone="gold">
        <ul className="tldr">
          <li><b>{fmtCycleRange(CYCLE.displayStart, CYCLE.end)}</b>: earn points at YAC events and by doing quests.</li>
          <li>
            {TIERS.map((t, i) => (
              <span key={t}>{i > 0 && ' · '}<b>{TIER_LABELS[t]}</b> +{TIER_POINTS[t]}</span>
            ))}
          </li>
          <li>First <b>{PRIZE.count}</b> to reach <b>{PRIZE.goal}</b> points each win a {PRIZE.name}.</li>
          <li>Play fair: proof is checked, and points can be taken back.</li>
        </ul>
      </Card>

      <Accordion defaultOpen={expanded} glyph="star" title="How points work" summary={`${ACTIVITIES.length} quests in 3 tiers`}>
        <p>
          Join YAC events and do quests to earn points. Each quest belongs to a tier:{' '}
          {TIERS.map((t, i) => (
            <span key={t}>{i > 0 && ', '}<b>{TIER_LABELS[t]}</b> ({TIER_POINTS[t]} pts)</span>
          ))}
          . The three campuses ({CAMPUSES.map((c) => c.name).join(', ')}) each have a leaderboard, and there is an overall one too.
        </p>
        {TIERS.map((t) => (
          <div key={t} style={{ marginTop: 10 }}>
            <TierChip tier={t} />
            <ul className="rules-quests">
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
      </Accordion>

      <Accordion defaultOpen={expanded} glyph="chest" title="The prize race" summary={`First ${PRIZE.count} to ${PRIZE.goal} points win`}>
        <p>
          The first {PRIZE.count} people to reach {PRIZE.goal} points each win a {PRIZE.name}. Spots go in the order people reach the goal. When the {PRIZE.count} spots are gone, they’re gone, but you can keep climbing the leaderboard! Prizes are delivered after the cycle ends, by {longDate(PRIZE.fulfillBy)}.
        </p>
        <p style={{ margin: 0 }}>
          Prizes must be earned legitimately: if points are later removed and you drop below {PRIZE.goal}, your prize spot is revoked and goes to the next person who qualified.
        </p>
      </Accordion>

      <Accordion defaultOpen={expanded} glyph="check" title="Verification" summary="Event passwords and reviewed proof">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Event check-ins use a password announced by a YAC organizer at the event.</li>
          <li>Screenshots and photos are reviewed by YAC admins.</li>
          <li>False or doctored submissions are removed, and points may be taken back.</li>
        </ul>
      </Accordion>

      <Accordion defaultOpen={expanded} glyph="shield" title="Fair play limits" summary={`Digital: ${CAPS.digitalPerWeek} per week · referrals: ${CAPS.referralsPerCycle}`}>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Digital quests: {CAPS.digitalPerWeek} per week in total.</li>
          <li>Social tag posts: {CAPS.socialTagPerMonth} per month.</li>
          <li>Friend referrals: up to {CAPS.referralsPerCycle} per cycle, and your friend must attend an event.</li>
          <li>Event photos: {CAPS.photosPerEvent} per event, {CAPS.photosPerCycle} per cycle.</li>
          <li>Some quests can only be done once per cycle.</li>
        </ul>
      </Accordion>

      <Accordion defaultOpen={expanded} glyph="calendar" title="The cycle" summary={`Ends ${fmtCycleDate(CYCLE.end)}, then points reset`}>
        <p style={{ margin: 0 }}>
          The {CYCLE.name} cycle runs from {fmtCycleDate(CYCLE.displayStart)} to {fmtCycleDate(CYCLE.end)}. At the end, everyone’s points reset to 0 and the history is archived.
        </p>
      </Accordion>

      <Accordion defaultOpen={expanded} glyph="chat" title="Good to know" summary="Points aren’t cash · how to reach us">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Points are not cash and can’t be transferred.</li>
          <li>
            Questions? Email{' '}
            {CONTACT_EMAILS.map((email, i) => (
              <span key={email}>
                {i > 0 && ' or '}
                <a href={`mailto:${email}`} className="wrap-anywhere">{email}</a>
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
      </Accordion>
    </div>
  );
}

export default function Rules() {
  return (
    <div className="stack">
      <PageHeader title="Rules" back />
      <RulesContent />
    </div>
  );
}

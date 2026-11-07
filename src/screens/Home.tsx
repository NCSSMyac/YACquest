import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { CAPS, CYCLE, INSTAGRAM_HANDLE, INSTAGRAM_URL, PRIZE, TIER_POINTS, campusName } from '../config';
import { Avatar } from '../components/Avatar';
import { InstallButton, showInstallButton } from '../components/InstallApp';
import { Shoutout } from '../components/Shoutout';
import { StarterTips } from '../components/StarterTips';
import { TodayChip } from '../components/TodayEvent';
import { TreasureMap, checkpointsCrossed } from '../components/TreasureMap';
import { nextStopText } from '../lib/checkpoints';
import { isNewAdventurer } from '../lib/starterTips';
import { ErrorText, Loading, StatusChip, useToast } from '../components/ui';
import { Card } from '../components/Blocks';
import { recentActivity } from '../lib/listing';
import { getLastSeenPoints, setLastSeenPoints, takeCelebratedPoints, useCelebrate } from '../lib/celebrate';
import { activityById } from '../lib/activities';
import { fmtCycleDate, fmtDate, fmtPts, timeAgo } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { randomYakPun, yakPunOfTheDay } from '../lib/yakPuns';
import { useStaffRewards } from '../lib/useStaffRewards';

export default function Home() {
  const toast = useToast();
  const { data, loading, error } = useAsync(() => api.getDashboard(), [], { live: true });
  const celebrate = useCelebrate();
  // Staff only (0020): the reigning Hero of the Week gets a gold glow. Always null for participants.
  const isHero = !!useStaffRewards().data?.isHero;
  const userId = data?.user.id;
  const points = data?.points;

  // Celebrate treasure-map checkpoints crossed since the last time this player saw Home.
  // (Point pop-ups for approvals / adjustments come from NotificationPopups; check-ins pop on Quests.)
  useEffect(() => {
    if (!userId || points === undefined) return;
    const prev = getLastSeenPoints(userId);
    setLastSeenPoints(userId, points);
    takeCelebratedPoints(userId); // clear the legacy "already celebrated" counter
    if (prev === null || points <= prev) return;
    for (const c of checkpointsCrossed(prev, points)) {
      celebrate(
        c.label === 'Treasure'
          ? { title: 'Treasure found!', subtitle: `You reached ${c.points} points!`, hint: randomYakPun(), size: 'big' }
          : { title: 'Checkpoint reached!', subtitle: `${c.label} · ${c.points} points`, hint: randomYakPun(), size: 'big' },
      );
    }
  }, [userId, points, celebrate]);

  if (loading && !data) return <Loading lines={4} />;
  if (error && !data) return <ErrorText error={error} />;
  if (!data) return null;
  const d = data;
  const toGo = Math.max(0, PRIZE.goal - d.points);
  const isNew = isNewAdventurer(d);

  async function copy() {
    try {
      await navigator.clipboard.writeText(d.user.friendCode);
      toast('Friend code copied!', 'success');
    } catch {
      toast(`Couldn’t copy. Your code is ${d.user.friendCode}`, 'error');
    }
  }

  const messages = d.messages.slice(0, 2);
  const activity = recentActivity(d.recentLedger, d.recentSubmissions, 3);

  return (
    <div className="stack">
      <TodayChip />
      <div className="home-hello">
        <Avatar id={d.user.avatar} look={d.user.look} campus={d.user.campus} size={56} hero={isHero} />
        <div style={{ minWidth: 0 }}>
          <h1>Hi, {d.user.displayName}!</h1>
          {isHero && <span className="chip t1" style={{ margin: '2px 0' }}>🦸 Hero of the Week</span>}
          <div className="muted">{campusName(d.user.campus)} adventurer</div>
          <div className="muted" style={{ fontStyle: 'italic' }}>🐂 Yak of the day: {yakPunOfTheDay()}</div>
        </div>
      </div>

      <Card glyph="megaphone" title="Messages" action={<Link to="/notifications" className="dash-link">See all ›</Link>}>
        {messages.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No messages yet. Announcements from YAC will show up here.</p>
        ) : (
          <div>
            {messages.map((m) => (
              <div key={m.id} className={`home-msg${m.read ? '' : ' unread'}`}>
                <div className="spread">
                  <strong style={{ minWidth: 0 }}>{m.title}</strong>
                  <small className="muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(m.createdAt)}</small>
                </div>
                <p>{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card glyph="coin" tone="gold" title="Your points" action={d.streak.current >= 2 ? (
        <span className="chip streak" title="Months in a row with an event check-in">🔥 {d.streak.current}-month streak</span>
      ) : undefined}>
        <div className="row" style={{ marginBottom: 8, gap: 8 }}>
          <span className="coin" aria-hidden />
          <span style={{ fontFamily: 'var(--font-num)', fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{d.points}</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            {d.myClaim ? (
              <>You won spot #{d.myClaim.spot}! <Link to="/prize">Claim your {PRIZE.name}</Link></>
            ) : d.prize.remaining === 0 ? (
              <>All prizes claimed. Keep climbing!</>
            ) : (
              <>· {toGo} more to win</>
            )}
          </span>
        </div>
        {/* At most two short lines: the next treasure-map stop, then the streak nudge. */}
        <div className="points-lines">
          <p className="next-stop">{nextStopText(d.points, { claimSpot: d.myClaim?.spot, prizesLeft: d.prize.remaining })}</p>
          {d.streak.current >= 1 && !d.streak.checkedInThisMonth && (
            <p className="streak-hint">🔥 Check in this month to keep your streak!</p>
          )}
        </div>
        <TreasureMap points={d.points} avatar={d.user.avatar} look={{ ...d.user.look, background: undefined }} />
        <div className="home-stats">
          <Link to="/prize" aria-label={`${d.prize.remaining} of ${PRIZE.count} prizes left. Open the Treasure Vault.`}><b>{d.prize.remaining}/{PRIZE.count}</b><span>prizes left ▸</span></Link>
          <Link to="/ranks" aria-label={`Rank ${d.rankOverall} of ${d.participants}, ${d.rankCampus} at ${campusName(d.user.campus)}. Open the leaderboard.`}><b>#{d.rankOverall}</b><span>#{d.rankCampus} at {campusName(d.user.campus)}</span></Link>
          <div><b>{d.daysLeft}</b><span>{d.daysLeft === 1 ? 'day' : 'days'} left</span></div>
        </div>
        <p className="home-fine">Quest ends {fmtCycleDate(CYCLE.end)}. Prizes must be earned legitimately: if points are later removed and you drop below {PRIZE.goal}, your prize spot is revoked and goes to the next person who qualified.</p>
      </Card>

      <div className="grid-2">
        <Link className="btn block" to="/earn">Check in</Link>
        <Link className="btn block blue" to="/earn?tab=quests">Do a quest</Link>
      </div>

      <Shoutout meId={d.user.id} />

      <div className="quick-links">
        <a className="btn blue block" href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label={`YAC on Instagram, ${INSTAGRAM_HANDLE}`}>📷 Insta</a>
        <Link className="btn block" to="/help">❓ Help</Link>
        {showInstallButton() && <InstallButton />}
      </div>

      {isNew ? (
        <StarterTips />
      ) : (
        <Card glyph="scroll" title="Recent activity" action={<Link to="/me" className="dash-link">History ›</Link>}>
          {activity.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Nothing yet. Pick a quest to get started!</p>
          ) : (
            <ul className="mini-list">
              {activity.map((a) => (
                <li key={a.id}>
                  <span className="mini-main">
                    <span className="mini-title">{a.kind === 'points' ? a.title : `Proof: ${activityById(a.activityId)?.title ?? 'Quest'}`}</span>
                    <span className="mini-meta">{fmtDate(a.at)}</span>
                    {a.kind === 'proof' && a.status === 'rejected' && a.reason && <span className="field-error" style={{ fontSize: 13 }}>Reason: {a.reason}</span>}
                  </span>
                  {a.kind === 'points' ? (
                    <b className={`mini-val ${a.amount < 0 ? 'minus' : 'plus'}`}>{fmtPts(a.amount)}</b>
                  ) : (
                    <StatusChip status={a.status} />
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="card-foot">
            <Link to="/earn?tab=proofs" className="dash-link">My proofs ›</Link>
            <Link to="/me" className="dash-link">Points history ›</Link>
          </div>
        </Card>
      )}

      <section className="panel friend-row" aria-label="Your friend code">
        <span className="friend-text">
          <span className="dash-eyebrow" style={{ fontSize: 10 }}>Friend code</span>
          <span className="friend-code">{d.user.friendCode}</span>
          Bring a friend: you both get +{TIER_POINTS[1]} at their first event ({d.referralsUsed}/{CAPS.referralsPerCycle} used)
        </span>
        <button className="btn small" onClick={copy} aria-label={`Copy friend code ${d.user.friendCode}`}>Copy</button>
      </section>
    </div>
  );
}

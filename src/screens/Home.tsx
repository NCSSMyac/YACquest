import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { CAPS, CYCLE, INSTAGRAM_HANDLE, INSTAGRAM_URL, PRIZE, TIER_POINTS, campusName } from '../config';
import { Avatar } from '../components/Avatar';
import { InstallButton, showInstallButton } from '../components/InstallApp';
import { Shoutout } from '../components/Shoutout';
import { Sprite } from '../components/Sprite';
import { StarterTips } from '../components/StarterTips';
import { TodayChip } from '../components/TodayEvent';
import { TreasureMap, checkpointsCrossed } from '../components/TreasureMap';
import { nextStopText } from '../lib/checkpoints';
import { isNewAdventurer } from '../lib/starterTips';
import { ErrorText, Loading, Panel, StatusChip, useToast } from '../components/ui';
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

  return (
    <div className="stack">
      <TodayChip />
      <div className="row">
        <Avatar id={d.user.avatar} look={d.user.look} campus={d.user.campus} size={56} hero={isHero} />
        <div>
          <h1 style={{ margin: 0 }}>Hi, {d.user.displayName}!</h1>
          {isHero && <span className="chip t1" style={{ margin: '2px 0' }}>🦸 Hero of the Week</span>}
          <div className="muted">{campusName(d.user.campus)} adventurer</div>
          <div className="muted" style={{ fontSize: 13, fontStyle: 'italic' }}>🐂 Yak of the day: {yakPunOfTheDay()}</div>
        </div>
      </div>

      <Panel title="📣 Messages" action={<Link to="/notifications" className="btn small ghost">See all</Link>}>
        {d.messages.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No messages yet. Announcements from YAC will show up here.</p>
        ) : (
          <ul className="list">
            {d.messages.map((m) => (
              <li key={m.id} style={m.read ? undefined : { borderLeft: '4px solid var(--gold-500)', paddingLeft: 10 }}>
                <div className="spread">
                  <strong>{m.title}</strong>
                  <small className="muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(m.createdAt)}</small>
                </div>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Shoutout meId={d.user.id} />

      <div className="grid-2" style={showInstallButton() ? { gridTemplateColumns: 'repeat(3, 1fr)' } : undefined}>
        <a className="btn blue block" href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label={`YAC on Instagram, ${INSTAGRAM_HANDLE}`}>📷 Insta</a>
        <Link className="btn block" to="/help">❓ Help</Link>
        <InstallButton />
      </div>

      <Panel tone="gold" title="Your points">
        <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
          <span className="coin" aria-hidden />
          <span style={{ fontFamily: 'var(--font-num)', fontWeight: 800, fontSize: 34 }}>{d.points}</span>
          {d.streak.current >= 2 && (
            <span className="chip streak" title="Months in a row with an event check-in">🔥 {d.streak.current}-month streak</span>
          )}
        </div>
        {/* At most two short lines: the next treasure-map stop, then the streak nudge. */}
        <div className="points-lines">
          <p className="next-stop">{nextStopText(d.points, { claimSpot: d.myClaim?.spot, prizesLeft: d.prize.remaining })}</p>
          {d.streak.current >= 1 && !d.streak.checkedInThisMonth && (
            <p className="streak-hint">🔥 Check in this month to keep your streak!</p>
          )}
        </div>
        <TreasureMap points={d.points} avatar={d.user.avatar} look={{ ...d.user.look, background: undefined }} />
        <p style={{ margin: '10px 0 0', fontSize: 18 }}>
          {d.myClaim ? (
            <>You won spot #{d.myClaim.spot}! <Link to="/prize">Claim your {PRIZE.name}</Link></>
          ) : d.prize.remaining === 0 ? (
            <>All prizes are claimed, but keep climbing the leaderboard!</>
          ) : (
            <>{toGo} more points to win</>
          )}
        </p>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Prizes must be earned legitimately: if points are later removed and you drop below {PRIZE.goal}, your prize spot is revoked and goes to the next person who qualified.</p>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Quest ends {fmtCycleDate(CYCLE.end)} · {d.daysLeft} {d.daysLeft === 1 ? 'day' : 'days'} left</p>
      </Panel>

      <Link to="/prize" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Panel tone="navy">
          <div className="spread">
            <span><Sprite id="chest" size={32} /></span>
            <b style={{ fontSize: 18 }}>{d.prize.remaining} of {PRIZE.count} prizes left</b>
            <span aria-hidden>▶</span>
          </div>
        </Panel>
      </Link>

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Panel className="stat"><div className="num">#{d.rankOverall}</div><div className="lbl">of {d.participants}</div></Panel>
        <Panel className="stat"><div className="num">#{d.rankCampus}</div><div className="lbl">at {campusName(d.user.campus)}</div></Panel>
        <Panel className="stat"><div className="num">{d.daysLeft}</div><div className="lbl">days left</div></Panel>
      </div>

      <div className="stack">
        <Link className="btn block" to="/earn">Check in at an event</Link>
        <Link className="btn block blue" to="/earn">Submit a quest</Link>
      </div>

      {isNew ? (
        <StarterTips />
      ) : (
        <>
        <Panel title="Recent proofs">
          {d.recentSubmissions.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Nothing yet. Pick a quest to get started!</p>
          ) : (
            <ul className="list">
              {d.recentSubmissions.map((s) => (
                <li key={s.id}>
                  <div className="spread">
                    <span>{activityById(s.activityId)?.title ?? 'Quest'}</span>
                    <StatusChip status={s.status} />
                  </div>
                  <div className="muted">{fmtDate(s.createdAt)}</div>
                  {s.status === 'rejected' && s.reviewReason && <div className="field-error">Reason: {s.reviewReason}</div>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent points">
          {d.recentLedger.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No points yet. Your first quest is waiting!</p>
          ) : (
            <ul className="list">
              {d.recentLedger.map((l) => (
                <li key={l.id} className="spread">
                  <span>{l.reason}<div className="muted">{fmtDate(l.createdAt)}</div></span>
                  <b style={{ color: l.amount < 0 ? 'var(--red)' : 'var(--green)' }}>{fmtPts(l.amount)}</b>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        </>
      )}

      <Panel title="Your friend code" className="friend-code">
        <div className="spread">
          <b style={{ fontFamily: 'var(--font-num)', fontWeight: 800, fontSize: 22 }}>{d.user.friendCode}</b>
          <button className="btn small" onClick={copy}>Copy</button>
        </div>
        <p style={{ margin: '8px 0 0' }}>
          Bring a friend: you both get +{TIER_POINTS[1]} when they attend their first event ({d.referralsUsed}/{CAPS.referralsPerCycle} used)
        </p>
      </Panel>
    </div>
  );
}

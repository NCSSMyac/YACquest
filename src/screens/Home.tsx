import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { CAPS, CYCLE, INSTAGRAM_HANDLE, INSTAGRAM_URL, PRIZE, TIER_POINTS, campusName } from '../config';
import { Avatar } from '../components/Avatar';
import { InstallButton, showInstallButton } from '../components/InstallApp';
import { CampusFrame } from '../components/CampusFrame';
import { PixelGlyph, type GlyphName } from '../components/PixelGlyph';
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
import { fmtCycleDate, fmtDate, fmtPts, monthName, timeAgo } from '../lib/format';
import { greetingFor, greetingName } from '../lib/adminDashboard';
import { useAsync } from '../lib/useAsync';
import { randomYakPun, yakPunOfTheDay } from '../lib/yakPuns';
import { useStaffRewards } from '../lib/useStaffRewards';

const WIDE_QUERY = '(min-width: 820px)';

/** Two columns on wide screens, like the admin dashboard. */
function useWide() {
  const query = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(WIDE_QUERY).matches;
  const [wide, setWide] = useState(query);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return wide;
}

export default function Home() {
  const toast = useToast();
  const { data, loading, error } = useAsync(() => api.getDashboard(), [], { live: true });
  const celebrate = useCelebrate();
  const wide = useWide();
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
  const kpis: [GlyphName, string, string, string | null, string][] = [
    // 5th item: extra words for screen readers only (0027: the visible text stays part of the accessible name).
    ['chest', `${d.prize.remaining}/${PRIZE.count}`, 'prizes left', '/prize', '. Open the Treasure Vault.'],
    ['trophy', `#${d.rankOverall}`, `#${d.rankCampus} at ${campusName(d.user.campus)}`, '/ranks', ` overall of ${d.participants}. Open the leaderboard.`],
    ['calendar', String(d.daysLeft), d.daysLeft === 1 ? 'day left' : 'days left', null, ' in the quest'],
  ];

  const greeting = (
    <header className="dash-hello home-greet" key="hello">
      <span className="dash-hello-yak home-greet-avatar" aria-hidden="true">
        <Avatar id={d.user.avatar} look={{ ...d.user.look, background: undefined }} campus={d.user.campus} size={50} hero={isHero} />
      </span>
      <div className="dash-hello-text">
        <div className="dash-eyebrow">
          {campusName(d.user.campus)} adventurer
          {isHero ? <span className="chip t1">🦸 Hero of the Week</span> : d.streak.current >= 2 ? <span className="chip streak">🔥 {d.streak.current}-mo streak</span> : null}
        </div>
        <h1 className="dash-hello-title">{greetingFor(new Date().getHours())}, {greetingName(d.user.displayName)}!</h1>
        <p className="dash-pun"><span className="sr-only">Yak of the day: </span>🐂 {yakPunOfTheDay()}</p>
      </div>
    </header>
  );

  const messagesCard = (
    <Card key="msgs" glyph="megaphone" title="Messages" action={<Link to="/notifications" className="dash-link">See all ›</Link>}>
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
  );

  const pointsCard = (
    <Card key="points" glyph="coin" tone="gold" title="Your points" className="home-points" >
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
      <ul className="home-kpis" aria-label="Your quest at a glance">
        {kpis.map(([g, n, l, to, aria]) => {
          const inner = (
            <>
              <PixelGlyph name={g} size={20} />
              <b className="kpi-num">{n}</b>
              <span className="kpi-lbl">{l}{to ? <span aria-hidden="true"> ›</span> : ''}</span>
              <span className="sr-only">{aria}</span>
            </>
          );
          return (
            <li key={g}>
              {to ? <Link to={to} className="panel kpi home-kpi">{inner}</Link> : <div className="panel kpi home-kpi">{inner}</div>}
            </li>
          );
        })}
      </ul>
      <p className="home-fine">Quest ends {fmtCycleDate(CYCLE.end)}. Prizes must be earned legitimately: if points are later removed and you drop below {PRIZE.goal}, your prize spot is revoked and goes to the next person who qualified.</p>
    </Card>
  );

  const actions = (
    <div className="grid-2" key="actions">
      <Link className="btn block" to="/earn">Check in</Link>
      <Link className="btn block blue" to="/earn?tab=quests">Do a quest</Link>
    </div>
  );

  const quickLinks = (
    <div className="quick-links" key="links">
      <a className="btn blue block" href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><span aria-hidden="true">📷 </span>Insta<span className="sr-only"> (YAC on Instagram, {INSTAGRAM_HANDLE})</span></a>
      <Link className="btn block" to="/help">❓ Help</Link>
      {showInstallButton() && <InstallButton />}
    </div>
  );

  const activityCard = isNew ? (
    <StarterTips key="tips" />
  ) : (
    <Card key="activity" glyph="scroll" title="Recent activity" action={<Link to="/me" className="dash-link">History ›</Link>}>
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
  );

  const friendRow = (
    <section className="panel dash-card friend-row" aria-label="Your friend code" key="friend">
      <PixelGlyph name="userplus" size={22} />
      <Link to="/me?section=friends" className="friend-text">
        <span className="dash-eyebrow" style={{ fontSize: 10 }}>Friend code · My friends<span aria-hidden="true"> ›</span></span>
        <span className="friend-code">{d.user.friendCode}</span>
        Bring a friend: you both get +{TIER_POINTS[1]} at their first event ({d.referralsUsed}/{CAPS.referralsPerCycle} used)
      </Link>
      <button className="btn small" onClick={copy} aria-label={`Copy friend code ${d.user.friendCode}`}>Copy</button>
    </section>
  );

  const star = <HomeAdventurer key="star" meId={d.user.id} />;

  return (
    <div className="stack dash home-dash">
      <TodayChip />
      {greeting}
      {wide ? (
        <div className="dash-cols">
          <div className="stack">{[messagesCard, pointsCard]}</div>
          <div className="stack">{[actions, star, quickLinks, activityCard, friendRow]}</div>
        </div>
      ) : (
        <>
          {messagesCard}
          {pointsCard}
          {actions}
          {star}
          {quickLinks}
          {activityCard}
          {friendRow}
        </>
      )}
    </div>
  );
}

/** Adventurer of the Month, in the admin dashboard's card style. */
function HomeAdventurer({ meId }: { meId: string }) {
  const { data } = useAsync(() => api.monthlyShoutout(), []);
  if (!data) return null;
  const month = monthName(data.month);
  return (
    <Card glyph="star" title={data.final ? 'Adventurer of the Month' : 'Leading this month'} action={data.userId === meId ? <span className="chip t1">That’s you! 🎉</span> : undefined}>
      <div className="adv">
        <CampusFrame campus={data.campus} label>
          <span className="adv-avatar"><Avatar id={data.avatar} look={data.look} campus={data.campus} size={48} title={data.displayName} /></span>
        </CampusFrame>
        <div style={{ minWidth: 0 }}>
          <b className="adv-name">{data.displayName}</b>
          <div className="muted adv-sub">{campusName(data.campus)} · {month}</div>
          <div className="adv-pts"><span className="coin" aria-hidden /> +{data.pointsThisMonth} pts {data.final ? `in ${month}` : 'so far'}</div>
        </div>
      </div>
    </Card>
  );
}

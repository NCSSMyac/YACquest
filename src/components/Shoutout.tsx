/** "Adventurer of the Week": whoever gained the most points in the last 7 days. */
import * as api from '../api';
import { campusName } from '../config';
import { useAsync } from '../lib/useAsync';
import { Avatar } from './Avatar';

export function Shoutout({ meId }: { meId?: string }) {
  const { data } = useAsync(() => api.weeklyShoutout(), []);
  if (!data) return null;
  const isMe = !!meId && data.userId === meId;
  return (
    <section className="panel gold shoutout" aria-label="Adventurer of the Week">
      <h2 className="panel-title">⭐ Adventurer of the Week</h2>
      <div className="row">
        <span className="shoutout-avatar">
          <Avatar id={data.avatar} look={data.look} campus={data.campus} size={56} title={data.displayName} />
        </span>
        <div style={{ minWidth: 0 }}>
          <b className="shoutout-name">{data.displayName}</b>
          <div className="shoutout-campus">{campusName(data.campus)}</div>
          <div className="shoutout-pts"><span className="coin" aria-hidden /> +{data.pointsThisWeek} points this week</div>
        </div>
      </div>
      {isMe && <p className="shoutout-me">That’s you! 🎉</p>}
    </section>
  );
}

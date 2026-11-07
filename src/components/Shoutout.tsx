/**
 * "Adventurer of the Month" (0012): the top point earner of last month (America/New_York calendar
 * months, this cycle). Until a month in the cycle has finished with points, shows who's leading this month.
 */
import * as api from '../api';
import { campusName } from '../config';
import { monthName } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Avatar } from './Avatar';
import { CampusFrame } from './CampusFrame';

export function Shoutout({ meId }: { meId?: string }) {
  const { data } = useAsync(() => api.monthlyShoutout(), []);
  if (!data) return null;
  const isMe = !!meId && data.userId === meId;
  const month = monthName(data.month);
  const title = data.final ? `Adventurer of the Month · ${month}` : `Leading this month · ${month}`;
  return (
    <section className="panel gold shoutout" aria-label={title}>
      <h2 className="panel-title">⭐ {title}</h2>
      <div className="row">
        <CampusFrame campus={data.campus} label>
          <span className="shoutout-avatar">
            <Avatar id={data.avatar} look={data.look} campus={data.campus} size={56} title={data.displayName} />
          </span>
        </CampusFrame>
        <div style={{ minWidth: 0 }}>
          <b className="shoutout-name">{data.displayName}</b>
          <div className="shoutout-campus">{campusName(data.campus)}</div>
          <div className="shoutout-pts">
            <span className="coin" aria-hidden /> +{data.pointsThisMonth} points {data.final ? `in ${month}` : 'so far'}
          </div>
        </div>
      </div>
      {isMe && <p className="shoutout-me">That’s you! 🎉</p>}
    </section>
  );
}

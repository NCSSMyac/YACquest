import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import * as api from '../api';
import { isStaff, useAuth } from '../lib/auth';
import { BellIcon, ChestIcon, HomeIcon, ShieldIcon, SwordIcon, TrophyIcon, UserIcon } from './Icons';
import { NotificationPopups } from './NotificationPopups';
import { Sprite } from './Sprite';
import { TodayEventProvider, useTodayEvent } from './TodayEvent';

/** App chrome for signed-in users: top bar + bottom tab bar. */
export function Layout() {
  return (
    <TodayEventProvider>
      <Shell />
    </TodayEventProvider>
  );
}

function Shell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(api.unreadCountSync());
  useEffect(() => api.subscribe(() => setUnread(api.unreadCountSync())), []);
  // An RSVP'd event today counts as one more thing on the bell.
  const today = useTodayEvent();
  const count = unread + (today ? 1 : 0);
  const label = `Notifications${unread ? `, ${unread} unread` : ''}${today ? `, event today: ${today.title}` : ''}`;

  return (
    <div className="app-shell">
      {user && <NotificationPopups />}
      <header className="topbar">
        <Link to="/" className="brand" aria-label="YACquest home">
          <span className="sprite-badge"><Sprite id="yak" size={30} /></span>
          YACquest
        </Link>
        <Link to="/notifications" className="icon-btn" aria-label={label}>
          <BellIcon />
          {count > 0 && <span className="badge-dot">{count > 9 ? '9+' : count}</span>}
        </Link>
      </header>
      <main>
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Main">
        <div className="inner">
          <NavLink to="/" end><HomeIcon />Home</NavLink>
          <NavLink to="/earn"><SwordIcon />Quests</NavLink>
          <NavLink to="/prize"><ChestIcon />Prize</NavLink>
          <NavLink to="/ranks"><TrophyIcon />Ranks</NavLink>
          {isStaff(user) ? <NavLink to="/admin"><ShieldIcon />Admin</NavLink> : null}
          <NavLink to="/me"><UserIcon />Me</NavLink>
        </div>
      </nav>
    </div>
  );
}

/** Back link used at the top of secondary pages. */
export function PageHeader({ title, back }: { title: string; back?: boolean }) {
  const nav = useNavigate();
  return (
    <div className="row" style={{ marginBottom: 12 }}>
      {back && (
        <button className="btn small ghost" onClick={() => nav(-1)} aria-label="Back">
          ◀
        </button>
      )}
      <h1 style={{ margin: 0 }}>{title}</h1>
    </div>
  );
}

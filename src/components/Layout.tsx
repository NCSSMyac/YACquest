import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as api from '../api';
import { isStaff, useAuth } from '../lib/auth';
import { BellIcon, ChestIcon, HomeIcon, ShieldIcon, SwordIcon, TrophyIcon, UserIcon } from './Icons';
import { NotificationPopups } from './NotificationPopups';
import { OfflineBannerInChrome, useRegisterChrome } from './OfflineBanner';
import { Sprite } from './Sprite';
import { TodayEventProvider, useTodayEvent } from './TodayEvent';
import { localTourDone, setLocalTourDone, shouldAutoShowTour, useTourRequest } from '../lib/tour';
import { claimToasts } from '../lib/seasonal';
import { useToast } from './ui';

/** 0028: once per session per person, claim seasonal items whose window is open today; toast what's new. */
const seasonalClaimedFor = new Set<string>();
function SeasonalClaimer({ userId }: { userId: string }) {
  const toast = useToast();
  useEffect(() => {
    if (seasonalClaimedFor.has(userId)) return;
    seasonalClaimedFor.add(userId);
    api.claimSeasonalItems().then(
      (r) => claimToasts(r.claimed).forEach((t, i) => setTimeout(() => toast(t, 'info'), 600 + i * 1800)),
      () => seasonalClaimedFor.delete(userId),
    );
  }, [userId, toast]);
  return null;
}

// 0026: lazy-loaded so the tour stays out of the main bundle (most visits never open it).
const WelcomeTour = lazy(() => import('./WelcomeTour'));

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
  useRegisterChrome();
  const [unread, setUnread] = useState(api.unreadCountSync());
  useEffect(() => api.subscribe(() => setUnread(api.unreadCountSync())), []);
  // An RSVP'd event today counts as one more thing on the bell.
  const today = useTodayEvent();
  const count = unread + (today ? 1 : 0);
  // The admin dashboard (and Admin → Stats, 0025) spread into two columns on wide screens; every other page keeps the phone-width column.
  // 0026: participant Home too (two columns like the admin dashboard).
  const wide = ['', '/admin', '/admin/stats'].includes(useLocation().pathname.replace(/\/+$/, ''));
  // 0027: the visible badge number is part of the accessible name.
  const label = count > 0
    ? `${count > 9 ? '9+' : count} Notifications${unread ? `, ${unread} unread` : ''}${today ? `, event today: ${today.title}` : ''}`
    : 'Notifications';

  // 0026 welcome tour: once after the first login (server flag, device fallback), or on "Replay the tour".
  const [autoTour, setAutoTour] = useState(false);
  const [replay, closeReplay] = useTourRequest();
  const userId = user?.id;
  const tourDoneAt = user?.tourDoneAt;
  useEffect(() => {
    if (userId && shouldAutoShowTour({ tourDoneAt }, localTourDone(userId))) setAutoTour(true);
  }, [userId, tourDoneAt]);
  function closeTour() {
    setAutoTour(false);
    closeReplay();
    if (userId) {
      setLocalTourDone(userId);
      void api.markTourDone();
    }
  }

  return (
    <div className={`app-shell${wide ? ' wide' : ''}`}>
      {user && <NotificationPopups />}
      {user && <SeasonalClaimer userId={user.id} />}
      {user && (autoTour || replay) && (
        <Suspense fallback={null}>
          <WelcomeTour user={user} onClose={closeTour} />
        </Suspense>
      )}
      <header className="topbar">
        <Link to="/" className="brand" aria-label="YACquest home">
          <span className="sprite-badge"><Sprite id="yak" size={30} /></span>
          YACquest
        </Link>
        <Link to="/notifications" className="icon-btn" aria-label={label}>
          <BellIcon />
          {count > 0 && <span className="badge-dot">{count > 9 ? '9+' : count}</span>}
        </Link>
        <OfflineBannerInChrome />
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

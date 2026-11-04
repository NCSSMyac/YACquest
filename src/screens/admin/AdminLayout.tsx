import { NavLink, Outlet } from 'react-router-dom';
import * as api from '../../api';
import { campusName } from '../../config';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';

export default function AdminLayout() {
  const { user } = useAuth();
  const isChair = user?.role === 'chair';
  const { data: pending } = useAsync(() => api.reviewQueue({ status: 'pending' }), [], { live: true });
  const count = pending?.length ?? 0;
  const links: { to: string; label: string; end?: boolean; badge?: number }[] = [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/review', label: 'Review', badge: count },
    { to: '/admin/players', label: 'Players' },
    { to: '/admin/events', label: 'Events' },
    ...(isChair ? [{ to: '/admin/prizes', label: 'Prizes' }, { to: '/admin/system', label: 'System' }] : []),
  ];
  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Admin</h1>
        <span className="chip t1">{isChair ? 'YAC Chair' : `${user ? campusName(user.campus) : ''} Lead`}</span>
      </div>
      <nav aria-label="Admin sections" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => `btn small ${isActive ? 'navy' : 'ghost'}`}
            style={{ flex: '0 0 auto', textDecoration: 'none' }}
          >
            {l.label}
            {!!l.badge && <span className="chip pending" style={{ marginLeft: 6 }} aria-label={`${l.badge} pending`}>{l.badge}</span>}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

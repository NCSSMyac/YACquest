import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import * as api from '../../api';
import { Modal } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import { adminPageFor, adminSectionsFor, type AdminPage } from './adminNav';

const FEEDBACK_LIMIT = 100;

/** Live counters shown as badges on the Review and Feedback tiles / menu rows. */
function useAdminCounts() {
  const { data: pending } = useAsync(() => api.reviewQueue({ status: 'pending' }), [], { live: true });
  const { data: fresh } = useAsync(() => api.listFeedback('new', FEEDBACK_LIMIT).catch(() => null), [], { live: true });
  const badge = (page: AdminPage): string | undefined => {
    const n = page.badge === 'review' ? pending?.length : page.badge === 'feedback' ? fresh?.length : undefined;
    if (!n) return undefined;
    return page.badge === 'feedback' && n >= FEEDBACK_LIMIT ? `${FEEDBACK_LIMIT - 1}+` : String(n);
  };
  return badge;
}

function Badge({ page, value }: { page: AdminPage; value?: string }) {
  if (!value) return null;
  const what = page.badge === 'review' ? 'pending' : 'new';
  return <span className="chip pending admin-badge" aria-label={`${value} ${what}`}>{value}</span>;
}

export default function AdminLayout() {
  const { user } = useAuth();
  const isChair = user?.role === 'chair';
  const { pathname } = useLocation();
  const badge = useAdminCounts();
  const sections = adminSectionsFor(isChair);
  const page = adminPageFor(pathname);

  return (
    <div className="stack">
      {page ? (
        <AdminHeader page={page} sections={sections} badge={badge} />
      ) : (
        <>
          <div className="spread">
            <h1 style={{ margin: 0 }}>Admin</h1>
            <span className="chip t1">{isChair ? 'YACquest Chair' : 'Admin'}</span>
          </div>
          <nav aria-label="Admin sections" className="stack" style={{ gap: 14 }}>
            {sections.map((s) => (
              <section key={s.title} aria-labelledby={`admin-sec-${s.title}`}>
                <h2 id={`admin-sec-${s.title}`} className="admin-section-title">{s.title}</h2>
                <div className="admin-tiles">
                  {s.pages.map((p) => (
                    <Link key={p.path} to={p.path} className="admin-tile">
                      <span className="admin-tile-top">
                        <span className="admin-tile-icon" aria-hidden="true">{p.icon}</span>
                        <Badge page={p} value={badge(p)} />
                      </span>
                      <span className="admin-tile-label">{p.label}</span>
                      <span className="admin-tile-blurb">{p.blurb}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </>
      )}
      <Outlet />
    </div>
  );
}

function AdminHeader({ page, sections, badge }: { page: AdminPage; sections: ReturnType<typeof adminSectionsFor>; badge: (p: AdminPage) => string | undefined }) {
  const [open, setOpen] = useState(false);
  const jumpRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const close = useCallback(() => setOpen(false), []);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  // Hand focus back to the "Jump to" button when the menu closes (Escape, backdrop, or a pick).
  useEffect(() => {
    if (wasOpen.current && !open) jumpRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <div className="admin-header">
        <Link to="/admin" className="btn small ghost">← Admin</Link>
        <h1 className="admin-header-title">
          <span aria-hidden="true">{page.icon}</span> {page.label}
        </h1>
        <button ref={jumpRef} type="button" className="btn small navy" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          Jump to ▾
        </button>
      </div>
      <Modal open={open} onClose={close} title="Jump to">
        <nav aria-label="Admin sections" className="stack" style={{ gap: 12 }}>
          <Link to="/admin" className="admin-jump-row" onClick={close}>
            <span className="admin-jump-icon" aria-hidden="true">🏠</span>
            <span className="admin-jump-label">Admin home</span>
          </Link>
          {sections.map((s) => (
            <div key={s.title}>
              <h3 className="admin-section-title">{s.title}</h3>
              <ul className="admin-jump-list">
                {s.pages.map((p) => {
                  const current = p.path === page.path;
                  return (
                    <li key={p.path}>
                      <Link to={p.path} className={`admin-jump-row${current ? ' current' : ''}`} aria-current={current ? 'page' : undefined} onClick={close}>
                        <span className="admin-jump-icon" aria-hidden="true">{p.icon}</span>
                        <span className="admin-jump-label">{p.label}</span>
                        <Badge page={p} value={badge(p)} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </Modal>
    </>
  );
}

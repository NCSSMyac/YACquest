import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import * as api from '../../api';
import { Modal } from '../../components/ui';
import { PixelGlyph } from '../../components/PixelGlyph';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import { adminPageFor, adminSectionsFor, type AdminPage, type AdminSection } from './adminNav';

const FEEDBACK_LIMIT = 100;

export type AdminCounts = { review?: number; feedback?: number };
type BadgeFn = (page: AdminPage) => string | undefined;

/** What AdminLayout hands to the page it wraps (the dashboard reads the live counters from here). */
export type AdminOutletContext = { counts: AdminCounts; badge: BadgeFn; sections: AdminSection[]; isChair: boolean };
export const useAdminContext = () => useOutletContext<AdminOutletContext>();

/** Live counters shown as badges on the Review and Feedback buttons / menu rows. */
function useAdminCounts(): { counts: AdminCounts; badge: BadgeFn } {
  const { data: pending } = useAsync(() => api.reviewQueue({ status: 'pending' }), [], { live: true });
  const { data: fresh } = useAsync(() => api.listFeedback('new', FEEDBACK_LIMIT).catch(() => null), [], { live: true });
  const counts: AdminCounts = { review: pending?.length, feedback: fresh?.length };
  const badge: BadgeFn = (page) => {
    const n = page.badge === 'review' ? counts.review : page.badge === 'feedback' ? counts.feedback : undefined;
    if (!n) return undefined;
    return page.badge === 'feedback' && n >= FEEDBACK_LIMIT ? `${FEEDBACK_LIMIT - 1}+` : String(n);
  };
  return { counts, badge };
}

function Badge({ page, value }: { page: AdminPage; value?: string }) {
  if (!value) return null;
  const what = page.badge === 'review' ? 'pending' : 'new';
  return <span className="qnav-badge" aria-label={`${value} ${what}`}>{value}</span>;
}

export default function AdminLayout() {
  const { user } = useAuth();
  const isChair = user?.role === 'chair';
  const { pathname } = useLocation();
  const { counts, badge } = useAdminCounts();
  const sections = adminSectionsFor(isChair);
  const page = adminPageFor(pathname);
  const ctx: AdminOutletContext = { counts, badge, sections, isChair };

  return (
    <div className="stack">
      {page && <AdminHeader page={page} sections={sections} badge={badge} />}
      <Outlet context={ctx} />
    </div>
  );
}

/**
 * Compact quick-nav: small square pixel-icon buttons. Staff pages in one row, YACquest Chair tools in a
 * second row behind a gold "Chair" tag (chairs only — `sections` is already filtered by role).
 */
export function QuickNav({ sections, badge, current, onPick }: { sections: AdminSection[]; badge: BadgeFn; current?: string; onPick?: () => void }) {
  const staff = sections.filter((s) => !s.chairOnly).flatMap((s) => s.pages);
  const chair = sections.filter((s) => s.chairOnly).flatMap((s) => s.pages);
  const btn = (p: AdminPage) => {
    const here = p.path === current;
    return (
      <Link key={p.path} to={p.path} className={`qnav-btn${here ? ' current' : ''}`} title={`${p.label}: ${p.blurb}`} aria-label={p.short ? p.label : undefined} aria-current={here ? 'page' : undefined} onClick={onPick}>
        <PixelGlyph name={p.icon} size={28} />
        <span className="qnav-label">{p.short ?? p.label}</span>
        <Badge page={p} value={badge(p)} />
      </Link>
    );
  };
  return (
    <nav aria-label="Admin sections" className={`qnav${chair.length ? ' has-chair' : ''}`}>
      <div className="qnav-row">{staff.map(btn)}</div>
      {chair.length > 0 && (
        <div className="qnav-row chair" role="group" aria-label="YACquest Chair tools">
          <span className="qnav-tag" aria-hidden="true">
            <PixelGlyph name="star" size={18} />
            Chair
          </span>
          {chair.map(btn)}
        </div>
      )}
    </nav>
  );
}

function AdminHeader({ page, sections, badge }: { page: AdminPage; sections: AdminSection[]; badge: BadgeFn }) {
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
          <PixelGlyph name={page.icon} size={22} /> <span>{page.label}</span>
        </h1>
        <button ref={jumpRef} type="button" className="btn small navy" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          Jump to ▾
        </button>
      </div>
      <Modal open={open} onClose={close} title="Jump to">
        <div className="stack" style={{ gap: 10 }}>
          <Link to="/admin" className="admin-jump-home" onClick={close}>
            <PixelGlyph name="home" size={22} />
            <span>Dashboard</span>
          </Link>
          <QuickNav sections={sections} badge={badge} current={page.path} onPick={close} />
        </div>
      </Modal>
    </>
  );
}

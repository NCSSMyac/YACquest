/**
 * The admin menu: one list drives both the tile grid on /admin and the "Jump to" menu
 * on every other admin page. Paths match the routes in App.tsx.
 */
export type AdminPage = {
  path: string;
  label: string;
  icon: string;
  blurb: string;
  /** Which live counter shows as a badge on this page's tile. */
  badge?: 'review' | 'feedback';
};

export type AdminSection = { title: string; chairOnly?: boolean; pages: AdminPage[] };

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    title: 'Events',
    pages: [
      { path: '/admin/events', label: 'Events', icon: '📅', blurb: 'Create events, QR codes, who came' },
      { path: '/admin/review', label: 'Review', icon: '✅', blurb: 'Approve or reject proof', badge: 'review' },
    ],
  },
  {
    title: 'People',
    pages: [
      { path: '/admin/players', label: 'Players', icon: '👥', blurb: 'Look up players, award points' },
      { path: '/admin/council', label: 'Council', icon: '🏛', blurb: 'Staff team board and badges' },
    ],
  },
  {
    title: 'Messages',
    pages: [
      { path: '/admin/announce', label: 'Announce', icon: '📣', blurb: 'Send news to everyone' },
      { path: '/admin/feedback', label: 'Feedback', icon: '💬', blurb: 'Read ideas and bug reports', badge: 'feedback' },
    ],
  },
  {
    title: 'YACquest Chair tools',
    chairOnly: true,
    pages: [
      { path: '/admin/prizes', label: 'Prizes', icon: '🏆', blurb: 'Prize claims and suggestions' },
      { path: '/admin/heroes', label: 'Heroes', icon: '🦸', blurb: 'Crown the Hero of the Week' },
      { path: '/admin/team', label: 'Team', icon: '🛡', blurb: 'Add or remove admins' },
      { path: '/admin/log', label: 'Log', icon: '📜', blurb: 'Who changed what, when' },
      { path: '/admin/system', label: 'System', icon: '⚙️', blurb: 'Cycles, export, weekly email' },
    ],
  },
];

/** Sections this staff member may see (chair tools only for YACquest Chairs). */
export function adminSectionsFor(isChair: boolean): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => isChair || !s.chairOnly);
}

/** The admin page a URL path belongs to (sub-paths count), or undefined for /admin itself. */
export function adminPageFor(pathname: string): AdminPage | undefined {
  const p = pathname.replace(/\/+$/, '');
  for (const s of ADMIN_SECTIONS) for (const page of s.pages) if (p === page.path || p.startsWith(page.path + '/')) return page;
  return undefined;
}

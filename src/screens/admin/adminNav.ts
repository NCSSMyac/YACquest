/**
 * The admin menu: one list drives both the compact quick-nav on /admin and the "Jump to" menu
 * on every other admin page. Paths match the routes in App.tsx.
 */
import type { GlyphName } from '../../components/PixelGlyph';

export type AdminPage = {
  path: string;
  label: string;
  /** Shorter label for the small quick-nav buttons when `label` is too wide for them. */
  short?: string;
  /** Pixel glyph (src/components/PixelGlyph.tsx). */
  icon: GlyphName;
  blurb: string;
  /** Which live counter shows as a badge on this page's button. */
  badge?: 'review' | 'feedback';
};

export type AdminSection = { title: string; chairOnly?: boolean; pages: AdminPage[] };

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    title: 'Events',
    pages: [
      { path: '/admin/events', label: 'Events', icon: 'calendar', blurb: 'Create events, QR codes, who came' },
      { path: '/admin/review', label: 'Review', icon: 'check', blurb: 'Approve or reject proof', badge: 'review' },
    ],
  },
  {
    title: 'People',
    pages: [
      { path: '/admin/players', label: 'Players', icon: 'people', blurb: 'Look up players, award points' },
      { path: '/admin/council', label: 'Council', icon: 'council', blurb: 'Staff team board and badges' },
      { path: '/admin/stats', label: 'Stats', icon: 'chart', blurb: 'Charts, trends and CSV exports' },
    ],
  },
  {
    title: 'Messages',
    pages: [
      { path: '/admin/announce', label: 'Announce', short: 'Notify', icon: 'megaphone', blurb: 'Send news to everyone' },
      { path: '/admin/feedback', label: 'Feedback', icon: 'chat', blurb: 'Read ideas and bug reports', badge: 'feedback' },
    ],
  },
  {
    title: 'YACquest Chair tools',
    chairOnly: true,
    pages: [
      { path: '/admin/prizes', label: 'Prizes', icon: 'gift', blurb: 'Prize claims and suggestions' },
      { path: '/admin/heroes', label: 'Heroes', icon: 'crown', blurb: 'Crown the Hero of the Week' },
      { path: '/admin/team', label: 'Team', icon: 'shield', blurb: 'Add or remove admins' },
      { path: '/admin/log', label: 'Log', icon: 'scroll', blurb: 'Who changed what, when' },
      { path: '/admin/system', label: 'System', icon: 'gear', blurb: 'Cycles, export, weekly email' },
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

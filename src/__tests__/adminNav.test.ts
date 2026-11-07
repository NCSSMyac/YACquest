import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, adminPageFor, adminSectionsFor } from '../screens/admin/adminNav';

const paths = (isChair: boolean) => adminSectionsFor(isChair).flatMap((s) => s.pages.map((p) => p.path));

describe('admin tile menu', () => {
  it('hides YACquest Chair tools from plain admins', () => {
    expect(paths(false)).toEqual(['/admin/events', '/admin/review', '/admin/players', '/admin/council', '/admin/announce', '/admin/feedback']);
    expect(adminSectionsFor(false).some((s) => s.chairOnly)).toBe(false);
  });
  it('shows every admin page to chairs, each once', () => {
    const all = paths(true);
    expect(all).toHaveLength(11);
    expect(new Set(all).size).toBe(all.length);
    for (const p of ['/admin/prizes', '/admin/heroes', '/admin/team', '/admin/log', '/admin/system']) expect(all).toContain(p);
  });
  it('gives every page a label, icon and short blurb', () => {
    for (const p of ADMIN_SECTIONS.flatMap((s) => s.pages)) {
      expect(p.label && p.icon).toBeTruthy();
      expect(p.blurb.length).toBeLessThanOrEqual(34);
    }
  });
  it('finds the current page from the URL path', () => {
    expect(adminPageFor('/admin')).toBeUndefined();
    expect(adminPageFor('/admin/')).toBeUndefined();
    expect(adminPageFor('/admin/events')?.label).toBe('Events');
    expect(adminPageFor('/admin/events/')?.label).toBe('Events');
    expect(adminPageFor('/admin/log')?.label).toBe('Log');
    expect(adminPageFor('/admin/review')?.badge).toBe('review');
  });
});

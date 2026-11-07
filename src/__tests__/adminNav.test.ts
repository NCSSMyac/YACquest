import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../components/PixelGlyph';
import { ADMIN_SECTIONS, adminPageFor, adminSectionsFor } from '../screens/admin/adminNav';

const paths = (isChair: boolean) => adminSectionsFor(isChair).flatMap((s) => s.pages.map((p) => p.path));

describe('admin quick-nav menu', () => {
  it('hides YACquest Chair tools from plain admins', () => {
    expect(paths(false)).toEqual(['/admin/events', '/admin/review', '/admin/players', '/admin/council', '/admin/stats', '/admin/announce', '/admin/feedback']);
    expect(adminSectionsFor(false).some((s) => s.chairOnly)).toBe(false);
  });
  it('shows every admin page to chairs, each once', () => {
    const all = paths(true);
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(all.length);
    for (const p of ['/admin/prizes', '/admin/heroes', '/admin/team', '/admin/log', '/admin/system']) expect(all).toContain(p);
  });
  it('gives every page a short label, a real pixel glyph and a short blurb', () => {
    for (const p of ADMIN_SECTIONS.flatMap((s) => s.pages)) {
      expect(p.label).toBeTruthy();
      // Quick-nav buttons are ~54px wide at 390px: labels must stay short.
      expect((p.short ?? p.label).length).toBeLessThanOrEqual(8);
      expect(GLYPHS[p.icon]).toBeDefined();
      expect(p.blurb.length).toBeLessThanOrEqual(34);
    }
  });
  it('fits the 7-column quick-nav grid: at most 7 staff pages and 5 chair pages (plus the 2-cell Chair tag)', () => {
    const pages = (chair: boolean) => ADMIN_SECTIONS.filter((s) => !!s.chairOnly === chair).flatMap((s) => s.pages);
    expect(pages(false).length).toBeLessThanOrEqual(7);
    expect(pages(true).length).toBeLessThanOrEqual(5);
  });
  it('finds the current page from the URL path', () => {
    expect(adminPageFor('/admin')).toBeUndefined();
    expect(adminPageFor('/admin/')).toBeUndefined();
    expect(adminPageFor('/admin/events')?.label).toBe('Events');
    expect(adminPageFor('/admin/events/')?.label).toBe('Events');
    expect(adminPageFor('/admin/log')?.label).toBe('Log');
    expect(adminPageFor('/admin/review')?.badge).toBe('review');
    expect(adminPageFor('/admin/stats')?.label).toBe('Stats');
    // Door mode is its own full-screen page, outside the admin header.
    expect(adminPageFor('/admin/door/evt_1')).toBeUndefined();
  });
});

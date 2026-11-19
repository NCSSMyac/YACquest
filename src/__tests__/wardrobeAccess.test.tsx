import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AvatarWardrobeLink, OutfitBadge, WardrobeButton, WARDROBE_PATH } from '../components/WardrobeLink';

const html = (node: React.ReactNode) => renderToStaticMarkup(<StaticRouter location="/">{node}</StaticRouter>);
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('easier wardrobe access', () => {
  it('the Home pill links to the Wardrobe tab with a clear label', () => {
    const out = html(<WardrobeButton />);
    expect(WARDROBE_PATH).toBe('/prize?tab=wardrobe');
    expect(out).toContain('href="/prize?tab=wardrobe"');
    expect(out).toContain('aria-label="Open wardrobe"');
    expect(out).toContain('Wardrobe');
    expect(out).toMatch(/class="btn small wardrobe-pill"/);
    expect(out).not.toContain('NEW'); // nothing unseen outside the provider
  });

  it('the avatar link and pencil badge say "Change outfit"', () => {
    const a = html(<AvatarWardrobeLink><span>yak</span></AvatarWardrobeLink>);
    expect(a).toContain('href="/prize?tab=wardrobe"');
    expect(a).toContain('aria-label="Change outfit"');
    expect(a).toContain('outfit-badge');
    const b = html(<OutfitBadge asLink />);
    expect(b).toContain('href="/prize?tab=wardrobe"');
    expect(b).toContain('aria-label="Change outfit"');
  });

  it('Home and Me use them; the Prize hub labels the tab "Wardrobe"', () => {
    const home = src('../screens/Home.tsx');
    expect(home).toContain('<WardrobeButton />');
    expect(home).toContain('<OutfitBadge asLink />');
    expect(home).toContain('onClick={tapAvatar}'); // tapping the character still says hi
    const me = src('../screens/Me.tsx');
    expect(me).toContain('<AvatarWardrobeLink>');
    expect(me).toContain('to="/prize?tab=wardrobe"');
    expect(src('../screens/Prize.tsx')).toContain("{ id: 'wardrobe', label: 'Wardrobe', icon: '👕' }");
  });
});

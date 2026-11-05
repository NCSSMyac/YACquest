import { describe, expect, it } from 'vitest';

// Same logic as normalizeUrl in src/lib/supabase.ts (kept private there).
function normalizeUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim().replace(/\/+$/, '');
  if (!v) return '';
  const ref = /^https?:\/\/([a-z0-9]{20})(?:[./]|$)/i.exec(v)?.[1];
  return ref ? `https://${ref.toLowerCase()}.supabase.co` : v;
}

describe('Supabase URL clean-up', () => {
  it('fixes common copy-paste mistakes', () => {
    const good = 'https://nfpkjehfjeikhmimvgmi.supabase.co';
    expect(normalizeUrl(good)).toBe(good);
    expect(normalizeUrl(` ${good}/ \n`)).toBe(good);
    expect(normalizeUrl('https://nfpkjehfjeikhmimvgmi/settings/api-keys.supabase.co')).toBe(good);
    expect(normalizeUrl('')).toBe('');
  });
});

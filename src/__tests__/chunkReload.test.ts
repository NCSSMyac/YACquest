import { describe, expect, it } from 'vitest';
import { CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS, cacheBustUrl, claimAutoReload, isChunkLoadError, stripVersionParam } from '../lib/chunkReload';

function memStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('isChunkLoadError', () => {
  it('matches the browsers’ stale-chunk messages', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/DoorMode-McDuUvOf.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for https://x/assets/a.css'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 42 failed.'))).toBe(true);
    const named = new Error('whatever');
    named.name = 'ChunkLoadError';
    expect(isChunkLoadError(named)).toBe(true);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true);
  });
  it('ignores ordinary bugs and junk', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
    expect(isChunkLoadError(42)).toBe(false);
  });
});

describe('claimAutoReload', () => {
  it('allows the first reload and records the time', () => {
    const s = memStorage();
    expect(claimAutoReload(1_000_000, s)).toBe(true);
    expect(s.data[CHUNK_RELOAD_KEY]).toBe('1000000');
  });
  it('blocks a second reload within the window, allows it after', () => {
    const s = memStorage();
    expect(claimAutoReload(1_000_000, s)).toBe(true);
    expect(claimAutoReload(1_000_000 + CHUNK_RELOAD_WINDOW_MS - 1, s)).toBe(false);
    expect(s.data[CHUNK_RELOAD_KEY]).toBe('1000000'); // a blocked attempt doesn't extend the window
    expect(claimAutoReload(1_000_000 + CHUNK_RELOAD_WINDOW_MS, s)).toBe(true);
  });
  it('treats junk or future timestamps as no previous reload', () => {
    expect(claimAutoReload(1_000_000, memStorage({ [CHUNK_RELOAD_KEY]: 'garbage' }))).toBe(true);
    expect(claimAutoReload(1_000_000, memStorage({ [CHUNK_RELOAD_KEY]: '9999999999' }))).toBe(true);
  });
  it('survives storage that throws or is missing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(claimAutoReload(1, broken)).toBe(true);
    expect(claimAutoReload(1, null)).toBe(true);
  });
});

describe('cacheBustUrl / stripVersionParam', () => {
  it('drops the query, adds ?v= and keeps the hash route', () => {
    const loc = { origin: 'https://ncssmyac.github.io', pathname: '/YACquest/', hash: '#/admin/door/abc?x=1' };
    expect(cacheBustUrl(loc, 123)).toBe('https://ncssmyac.github.io/YACquest/?v=123#/admin/door/abc?x=1');
  });
  it('strips only v and keeps other params', () => {
    expect(stripVersionParam({ pathname: '/YACquest/', search: '?v=123', hash: '#/me' })).toBe('/YACquest/#/me');
    expect(stripVersionParam({ pathname: '/YACquest/', search: '?confirmed=1&v=123', hash: '' })).toBe('/YACquest/?confirmed=1');
    expect(stripVersionParam({ pathname: '/YACquest/', search: '?confirmed=1', hash: '#/' })).toBeNull();
    expect(stripVersionParam({ pathname: '/YACquest/', search: '', hash: '#/' })).toBeNull();
  });
});

/**
 * Recovering from stale app files after a deploy.
 *
 * GitHub Pages caches index.html for ~10 minutes, so a browser can keep running an old main
 * bundle whose lazy chunks (e.g. DoorMode-<hash>.js) were removed by the new deploy. Loading one
 * then fails. We recover with ONE cache-busting reload (`?v=<now>`, keeping the hash route),
 * guarded by a sessionStorage timestamp so a really-down server can't cause a reload loop.
 */

export const CHUNK_RELOAD_KEY = 'yacquest-chunk-reload-at';
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i, // Chrome
  /importing a module script failed/i, // Safari
  /error loading dynamically imported module/i, // Firefox
  /unable to preload css/i, // Vite CSS preload
  /loading (css )?chunk [\w-]+ failed/i, // webpack-style ChunkLoadError
];

/** True for errors that mean "this app's code files are gone/outdated", not a real bug. */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const name = typeof err === 'object' && err && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'ChunkLoadError') return true;
  const message =
    typeof err === 'string' ? err : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Whether an automatic reload is allowed now; if so, records it. At most one per
 * CHUNK_RELOAD_WINDOW_MS. If storage is unavailable we still allow it (the reload itself
 * fetches fresh files; a broken-storage loop is bounded by the browser's own behaviour).
 */
export function claimAutoReload(now = Date.now(), storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return true;
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last >= 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

/** The cache-busting URL: same origin + path, no query except `?v=<now>`, same hash route. */
export function cacheBustUrl(loc: Pick<Location, 'origin' | 'pathname' | 'hash'>, now = Date.now()): string {
  return `${loc.origin}${loc.pathname}?v=${now}${loc.hash}`;
}

let reloadPending = false;
/** True once a cache-busting reload has started (the page is about to navigate away). */
export function isReloadPending(): boolean {
  return reloadPending;
}

/** Reload with fresh files (bypasses the cached index.html). Used by the Reload buttons too. */
export function cacheBustReload(): void {
  reloadPending = true;
  window.location.replace(cacheBustUrl(window.location));
}

/** One-time automatic recovery. Returns false if the guard blocked it (show the glitch screen). */
export function tryAutoReload(): boolean {
  if (!claimAutoReload()) return false;
  cacheBustReload();
  return true;
}

/** URL with the `v` query param removed (other params kept), or null if there is none. */
export function stripVersionParam(loc: Pick<Location, 'pathname' | 'search' | 'hash'>): string | null {
  const q = new URLSearchParams(loc.search);
  if (!q.has('v')) return null;
  q.delete('v');
  const rest = q.toString();
  return loc.pathname + (rest ? `?${rest}` : '') + loc.hash;
}

/** Install the `vite:preloadError` handler and tidy `?v=` from the address bar. Call once at startup. */
export function installChunkReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    // Let the import reject normally (the error boundary shows the glitch screen) if blocked.
    if (tryAutoReload()) event.preventDefault();
  });
  const clean = stripVersionParam(window.location);
  if (clean !== null) {
    try {
      window.history.replaceState(window.history.state, '', clean);
    } catch {
      /* ignore */
    }
  }
}

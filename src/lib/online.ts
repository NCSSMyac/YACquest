/**
 * Online/offline state for the "You're offline" banner.
 * Offline = the browser says so (navigator.onLine) OR the last server call failed with a network error.
 * The API layer calls reportNetworkFailure() / reportNetworkSuccess(); the browser's online/offline
 * events update it too. When we come back, listeners get `true` and screens refresh their data.
 */
type Listener = (online: boolean) => void;

const listeners = new Set<Listener>();
let browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
let networkFailed = false;

export const isOnline = () => browserOnline && !networkFailed;

function set(next: () => void) {
  const before = isOnline();
  next();
  const after = isOnline();
  if (before !== after) listeners.forEach((fn) => fn(after));
}

export function subscribeOnline(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const reportNetworkFailure = () => set(() => (networkFailed = true));
export const reportNetworkSuccess = () => set(() => (networkFailed = false));
export const setBrowserOnline = (on: boolean) =>
  set(() => {
    browserOnline = on;
    // The browser says we're back: give the server a fresh chance.
    if (on) networkFailed = false;
  });

/** Messages from fetch() when the network is down (Chrome, Safari, Firefox). */
export function isNetworkErrorMessage(msg: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|network ?error|err_internet_disconnected|fetch failed|the internet connection appears to be offline/i.test(msg);
}

/** Friendly text for any network failure (used by the API layer). */
export const OFFLINE_MESSAGE = 'You’re offline or the server can’t be reached. We’ll reconnect automatically: try again in a moment.';

let installed = false;
export function installOnlineListeners() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('online', () => setBrowserOnline(true));
  window.addEventListener('offline', () => setBrowserOnline(false));
}

/** Test-only reset. */
export function __resetOnline(browser = true) {
  browserOnline = browser;
  networkFailed = false;
  listeners.clear();
}

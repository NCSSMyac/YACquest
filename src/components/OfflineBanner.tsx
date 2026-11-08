import { useEffect, useState, useSyncExternalStore } from 'react';
import { emitChange } from '../api/shared';
import { isOnline, subscribeOnline } from '../lib/online';
import { useToast } from './ui';

const RETRY_MS = 15_000;

// Is the app chrome (top bar) on screen? Layout registers itself so the banner can sit inside the top bar.
let chrome = 0;
const chromeListeners = new Set<() => void>();
const chromeChanged = () => chromeListeners.forEach((fn) => fn());
const subscribeChrome = (fn: () => void) => {
  chromeListeners.add(fn);
  return () => void chromeListeners.delete(fn);
};
export function useRegisterChrome() {
  useEffect(() => {
    chrome++;
    chromeChanged();
    return () => {
      chrome--;
      chromeChanged();
    };
  }, []);
}

const useOnline = () => useSyncExternalStore((fn) => subscribeOnline(() => fn()), isOnline, () => true);

const Banner = ({ className }: { className: string }) => (
  <div className={className} role="status">
    <span aria-hidden="true">📡 </span>You’re offline — showing your last saved info. We’ll reconnect automatically.
  </div>
);

/**
 * 0027: slim "You're offline" banner. Mounted once in App: it refreshes the data on reconnect, retries
 * quietly while the server can't be reached, and shows the banner at the top of pages without the top bar.
 * Inside the app chrome, Layout shows <OfflineBannerInChrome /> right under the top bar instead.
 */
export function OfflineBanner() {
  const online = useOnline();
  const hasChrome = useSyncExternalStore(subscribeChrome, () => chrome > 0, () => false);
  const toast = useToast();
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) setWasOffline(true);
    else if (wasOffline) {
      setWasOffline(false);
      emitChange(); // header badge + live lists; every useAsync also reloads on reconnect
      toast('Back online!', 'success');
    }
  }, [online, wasOffline, toast]);

  // The browser thinks it's online but the server failed: retry quietly (any successful call clears the banner).
  useEffect(() => {
    if (online) return;
    const t = setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine !== false) emitChange();
    }, RETRY_MS);
    return () => clearInterval(t);
  }, [online]);

  if (online || hasChrome) return null;
  return <Banner className="offline-banner top" />;
}

/** The banner as the last row of the sticky top bar (Layout). */
export function OfflineBannerInChrome() {
  const online = useOnline();
  return online ? null : <Banner className="offline-banner in-chrome" />;
}

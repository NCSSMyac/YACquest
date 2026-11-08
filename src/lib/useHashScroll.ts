import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 0028: links like /admin/system#reset or /admin/stats#pace scroll to that card once it's on screen
 * (HashRouter keeps the "#reset" part in location.hash). A closed <details> there is opened.
 */
export function useHashScroll(ready = true) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash || hash.length < 2) return;
    const t = setTimeout(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ block: 'start' });
    }, 50);
    return () => clearTimeout(t);
  }, [hash, ready]);
}

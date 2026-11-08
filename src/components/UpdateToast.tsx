import { useEffect, useRef, useState } from 'react';
import { APP_VERSION, fetchDeployedVersion, isNewerBuild, VERSION_CHECK_MS } from '../lib/version';

/** 0027: "New version available — Refresh" when a newer build was deployed (checked on focus, at most every ~30 min). */
export function UpdateToast() {
  const [show, setShow] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    if (APP_VERSION.sha === 'dev') return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState === 'hidden' || Date.now() - last.current < VERSION_CHECK_MS) return;
      last.current = Date.now();
      const deployed = await fetchDeployedVersion();
      if (alive && isNewerBuild(deployed)) setShow(true);
    };
    void check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const t = setInterval(check, VERSION_CHECK_MS);
    return () => {
      alive = false;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      clearInterval(t);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="update-toast" role="status">
      <span>✨ New version available</span>
      <button type="button" className="btn small navy" onClick={() => window.location.reload()}>Refresh</button>
      <button type="button" className="btn small ghost" aria-label="Dismiss" onClick={() => setShow(false)}>✕</button>
    </div>
  );
}

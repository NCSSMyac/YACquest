import { useEffect, useState } from 'react';
import { Panel } from './ui';

/** Chrome/Android fire this before showing their own install prompt. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** "Get the app" panel: one-tap install on Android/Chrome, step-by-step on iPhone. Hidden once installed. */
export function InstallApp() {
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = () => setCanPrompt(true);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    setCanPrompt(false);
    if (outcome === 'accepted') setInstalled(true);
  }

  return (
    <Panel title="📲 Get the app">
      <p style={{ marginTop: 0 }}>Put YACquest on your home screen. It opens full-screen like a regular app. It's free, with no app store needed.</p>
      {canPrompt ? (
        <button className="btn block" onClick={install}>Install YACquest</button>
      ) : isIOS() ? (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap the <strong>Share</strong> button (square with an arrow ↑).</li>
          <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
        </ol>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Open the browser menu (⋮ in Chrome).</li>
          <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
        </ol>
      )}
    </Panel>
  );
}

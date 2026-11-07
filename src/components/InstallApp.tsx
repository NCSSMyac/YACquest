import { useEffect, useState } from 'react';
import { Modal } from './ui';
import { Accordion } from './Blocks';

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

/** Shared install state: can we show the one-tap prompt, and is it already installed? */
export function useInstall() {
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

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    setCanPrompt(false);
    if (outcome === 'accepted') setInstalled(true);
  }

  return { canPrompt, installed, install };
}

/** Instructions for this device, then the real install button when the browser offers one. */
function InstallSteps({ canPrompt, install }: { canPrompt: boolean; install: () => void }) {
  return (
    <>
      <p style={{ marginTop: 0 }}>Put YACquest on your home screen. It opens full-screen like a regular app. It’s free, with no app store needed.</p>
      {isIOS() ? (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap the <strong>Share</strong> button (square with an arrow ↑).</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
        </ol>
      ) : canPrompt ? (
        <>
          <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>
            <li>Tap <strong>Add YACquest</strong> below.</li>
            <li>Tap <strong>Install</strong> in the box that pops up.</li>
            <li>Find the yak icon on your home screen.</li>
          </ol>
          <button className="btn green block" onClick={install}>➕ Add YACquest</button>
        </>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Open the browser menu (⋮ in Chrome, or ⋯).</li>
          <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
        </ol>
      )}
    </>
  );
}

/** "Get the app" section (Me page), collapsed to one row. Hidden once installed. */
export function InstallApp() {
  const { canPrompt, installed, install } = useInstall();
  if (installed) return null;
  return (
    <Accordion icon="📲" title="Get the app" summary="Add YACquest to your home screen">
      <InstallSteps canPrompt={canPrompt} install={install} />
    </Accordion>
  );
}

/** Small "App" button (Home quick links). Tap → instructions + the real install button. Hidden once installed. */
export function InstallButton() {
  const { canPrompt, installed, install } = useInstall();
  const [open, setOpen] = useState(false);
  if (installed) return null;
  return (
    <>
      <button className="btn green block" onClick={() => setOpen(true)} aria-haspopup="dialog">📲 App</button>
      <Modal open={open} onClose={() => setOpen(false)} title="📲 Add as an app">
        <InstallSteps canPrompt={canPrompt} install={async () => { await install(); setOpen(false); }} />
        <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => setOpen(false)}>Close</button>
      </Modal>
    </>
  );
}

/** True when the Home quick-links row should make room for the App button. */
export const showInstallButton = () => typeof window !== 'undefined' && !isStandalone();

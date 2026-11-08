import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Fonts are bundled with the app (no Google Fonts request). Latin subset only to keep it small.
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';
import './styles/theme.css';
import { installErrorBuffer } from './lib/errorBuffer';
import { installOnlineListeners } from './lib/online';

// 0027: remember the last few errors (for "Report a problem") and watch online/offline.
installErrorBuffer();
installOnlineListeners();

// Apply saved light/dark preference before first paint.
try {
  const theme = localStorage.getItem('yacquest-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  /* storage blocked */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

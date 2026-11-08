import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * App version (shown in Help and attached to "Report a problem"):
 * package.json version + short git commit (GITHUB_SHA in GitHub Actions, else 'dev') + build date.
 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const APP_INFO = {
  version: pkg.version,
  sha: (process.env.GITHUB_SHA ?? '').slice(0, 7) || 'dev',
  builtAt: new Date().toISOString(),
};

/** Writes dist/version.json so a running app can notice a newer deploy ("New version available — Refresh"). */
function versionFile(): Plugin {
  return {
    name: 'yacquest-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(APP_INFO) + '\n' });
    },
  };
}

// `base: './'` lets the built site work from any path, including GitHub Pages
// (https://<user>.github.io/<repo>/). Routing uses HashRouter for the same reason.
export default defineConfig({
  plugins: [react(), versionFile()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(APP_INFO) },
  test: { environment: 'node' },
} as any);

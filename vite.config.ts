import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` lets the built site work from any path, including GitHub Pages
// (https://<user>.github.io/<repo>/). Routing uses HashRouter for the same reason.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: { environment: 'node' },
} as any);

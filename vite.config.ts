import { readFileSync } from 'node:fs';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const tauriConfig = JSON.parse(
  readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8')
) as { app: { security: { csp: string } } };

export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    headers:
      mode === 'test' ? { 'Content-Security-Policy': tauriConfig.app.security.csp } : undefined
  }
}));

/**
 * Vite configuration.
 *
 * Implements FRONTEND_ARCHITECTURE.md §38 (Build and Deployment Strategy):
 * Vite is the build tool for both dev server and production build, chosen
 * for native support of the route-based code-splitting strategy (§4.3).
 *
 * Sprint 1 scope: base React + SCSS + dev-proxy configuration only. No
 * bundle-size-budget plugin or Lighthouse CI wiring yet — those are
 * introduced once there is real page content to measure against a
 * meaningful baseline (see .github/workflows/ci.yml's Sprint 1 scope note).
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        // Lets any component do `@use 'tokens' as tokens;` without a long
        // relative path back into packages/ui — FRONTEND_ARCHITECTURE.md
        // §9.2's design-token single-entry-point rule.
        loadPaths: [
          path.resolve(__dirname, '../../packages/ui/src'),
          path.resolve(__dirname, '../../packages/ui/src/tokens'),
        ],
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Local dev only — API_SPECIFICATION.md's /api/v1 prefix, proxied to
      // apps/api running on its own port (BACKEND_ARCHITECTURE.md §18's
      // default). Production never proxies; VITE_API_BASE_URL points
      // directly at the deployed API (FRONTEND_ARCHITECTURE.md §37).
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Dev-only compatibility for `LocalStorageProvider`'s root-relative
      // `/uploads/...` media URLs — the API now actually serves that path
      // itself (apps/api/src/app.js), this just forwards a same-shape
      // request from the web dev server's own origin to it, mirroring the
      // `/api` proxy above exactly. Never duplicates file serving here:
      // the API remains the one real source for the bytes. Production
      // never proxies (same as `/api`) — an S3-backed deployment's media
      // URLs are already absolute (a different origin entirely), so
      // there is nothing for this entry to intercept there.
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    // Vitest configuration (FRONTEND_ARCHITECTURE.md §35). Sprint 1 has
    // no real component tests yet — this wires the harness (jsdom env,
    // jest-dom matchers, a shared setup file) so the first real test in a
    // future sprint has nothing left to configure.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    css: true,
    // tests/e2e is Playwright's territory (playwright.config.js) — its
    // spec files use Playwright's own `test` global, which conflicts
    // with Vitest's if both try to collect the same files.
    exclude: ['**/node_modules/**', '**/tests/e2e/**'],
  },
});

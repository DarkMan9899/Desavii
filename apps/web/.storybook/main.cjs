/**
 * Storybook configuration (design-tooling setup, brief step 4) — minimal
 * smoke setup for isolated development of TOP backgrounds, listing cards,
 * header UI, and future visual/motion components. Reuses the app's own
 * Vite config (path alias + SCSS token loadPaths) via `viteFinal` rather
 * than duplicating it, so a story never resolves tokens differently than
 * the real app does.
 *
 * CommonJS (`.cjs`), not ESM — Storybook 8's config loader on this
 * toolchain (Node 22 + esbuild-register) evaluates `.storybook/main.*`
 * through a CJS `require` path regardless of the file's own extension or
 * the package's `"type": "module"`; an `import`-based config throws
 * `ReferenceError: require is not defined` here. `apps/web`'s real app
 * code stays untouched ESM — this is Storybook's own config-loading
 * quirk, isolated to this one directory.
 */

const path = require('node:path');

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: ['../src/**/*.stories.@(js|jsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import('vite');
    return mergeConfig(viteConfig, {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../src'),
        },
      },
      css: {
        preprocessorOptions: {
          scss: {
            api: 'modern-compiler',
            loadPaths: [
              path.resolve(__dirname, '../../../packages/ui/src'),
              path.resolve(__dirname, '../../../packages/ui/src/tokens'),
            ],
          },
        },
      },
    });
  },
};

module.exports = config;

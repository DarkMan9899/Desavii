/**
 * Storybook preview config — global parameters only. No global decorators/
 * providers beyond what a story itself declares (brief: minimal smoke
 * setup), so a story that DOES need i18n/router/query-client context wraps
 * itself explicitly rather than relying on hidden global wiring.
 *
 * CommonJS (`.cjs`) for the same reason as `main.cjs` — see its header
 * comment.
 */

/** @type { import('@storybook/react').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Mirrors the audit's own 390/768/1024/1440 convention (brief step 5)
    // so a story can be checked at the same breakpoints owner-review
    // screenshots use.
    viewport: {
      viewports: {
        mobile390: {
          name: 'Mobile (390)',
          styles: { width: '390px', height: '844px' },
        },
        tablet768: {
          name: 'Tablet (768)',
          styles: { width: '768px', height: '1024px' },
        },
        desktop1024: {
          name: 'Desktop (1024)',
          styles: { width: '1024px', height: '900px' },
        },
        desktop1440: {
          name: 'Desktop (1440)',
          styles: { width: '1440px', height: '900px' },
        },
      },
    },
  },
};

module.exports = preview;

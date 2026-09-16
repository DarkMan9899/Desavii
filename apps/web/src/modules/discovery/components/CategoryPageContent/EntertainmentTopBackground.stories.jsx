/**
 * Storybook smoke story (design-tooling setup) — proves the Storybook +
 * Vite + SCSS-token pipeline renders a real TOP background in isolation.
 * Picked `EntertainmentTopBackground` because it has zero external
 * dependencies (no router/i18n/query context, see the component's own
 * header comment) — a representative, low-risk smoke check, not a new
 * design surface.
 */

import EntertainmentTopBackground from './EntertainmentTopBackground.jsx';

export default {
  title: 'Discovery/CategoryTopBackground/Entertainment',
  component: EntertainmentTopBackground,
  parameters: {
    layout: 'fullscreen',
  },
};

export function Default() {
  return (
    <div style={{ height: '572px', background: '#0a1628' }}>
      <EntertainmentTopBackground />
    </div>
  );
}

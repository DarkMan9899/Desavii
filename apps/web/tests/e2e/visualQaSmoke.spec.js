/**
 * Smoke test for the visual QA screenshot helper (design-tooling setup,
 * brief step 5) — proves `captureVisualQa` actually produces a real
 * screenshot at each of the 4 breakpoints against a route `smoke.spec.js`
 * already establishes as stable. Not a visual regression check (no
 * baseline comparison, see `visualQa.js`'s header comment) — just proof
 * the helper works end-to-end.
 */

import { existsSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { captureVisualQa, VISUAL_QA_VIEWPORTS } from './visualQa.js';

test('captures a screenshot at each of the 4 owner-review breakpoints', async ({
  page,
}) => {
  const capturedPaths = await captureVisualQa(page, {
    name: 'home-smoke',
    route: '/en',
  });

  expect(capturedPaths).toHaveLength(VISUAL_QA_VIEWPORTS.length);
  capturedPaths.forEach((capturedPath) => {
    expect(existsSync(capturedPath)).toBe(true);
  });
});

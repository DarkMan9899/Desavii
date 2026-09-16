/**
 * Visual QA screenshot helper (design-tooling setup, brief step 5) —
 * reuses the existing Playwright project (`playwright.config.js`, real
 * dev server, real browser) rather than a second config. Gives future
 * owner-review passes (the pattern the Step 2.10 audit did by hand,
 * breakpoint by breakpoint, via the Browser pane) one reliable, scripted
 * convention instead of ad hoc manual capture.
 *
 * Deliberately thin: navigate, settle, screenshot, repeat per breakpoint.
 * No visual diffing/baseline-comparison here — that's a deliberate future
 * decision (toolchain, baseline storage, flake tolerance), not something
 * to slip in under a tooling-setup step.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors the Step 2.10 audit's own breakpoint set exactly.
export const VISUAL_QA_VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1024', width: 1024, height: 900 },
  { label: '1440', width: 1440, height: 900 },
];

export const VISUAL_QA_OUTPUT_DIR = path.resolve(
  __dirname,
  '../../test-results/visual-qa',
);

/**
 * Navigates `page` to `route` and captures one full-page screenshot per
 * `VISUAL_QA_VIEWPORTS` entry, written to
 * `test-results/visual-qa/<name>/<label>.png`. Returns the written paths.
 */
async function captureOneBreakpoint(page, route, name, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  const screenshotPath = path.join(
    VISUAL_QA_OUTPUT_DIR,
    name,
    `${viewport.label}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

export async function captureVisualQa(page, { name, route }) {
  // Sequential by design (`.reduce`, not `for...of`/`Promise.all`) — one
  // `page` cannot navigate/resize concurrently (see smoke.spec.js's own
  // identical reasoning for its locale loop), and this project's lint
  // config forbids both `for...of` and `no-await-in-loop`.
  return VISUAL_QA_VIEWPORTS.reduce(async (previous, viewport) => {
    const capturedPaths = await previous;
    const screenshotPath = await captureOneBreakpoint(
      page,
      route,
      name,
      viewport,
    );
    return [...capturedPaths, screenshotPath];
  }, Promise.resolve([]));
}

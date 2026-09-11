/**
 * generateFavicons.mjs — derives every favicon/manifest-icon size from the
 * single source-of-truth brand asset (`public/brand/desavii-mark.png`)
 * instead of hand-maintaining N separately-exported files that can drift
 * from the real logo. Reuses the `@playwright/test` Chromium dependency
 * already installed for E2E/prerender (scripts/prerender.mjs) so this adds
 * no new dependency — a real browser Canvas does the resizing, run headless
 * at build-asset time, never in the shipped app.
 *
 * USAGE
 *   npm run generate:favicons
 *     — regenerates every derivative below from public/brand/desavii-mark.png
 *       into public/. Re-run this whenever the source mark changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SOURCE_MARK = path.join(PUBLIC_DIR, 'brand', 'desavii-mark.png');

// [name, size, backgroundColor|null] — a background fills the square
// canvas with an 12%-padded contain-fit of the mark (apple-touch-icon
// convention: iOS applies its own rounding/shadow, a transparent PNG
// there renders on a black square in some launchers); every other size
// stays fully transparent, matching how favicons/manifest icons composite
// over whatever chrome/OS surface they sit on.
const DERIVATIVES = [
  ['favicon-32x32.png', 32, null],
  ['favicon-48x48.png', 48, null],
  ['apple-touch-icon.png', 180, '#0f2a4a'],
  ['icon-192.png', 192, null],
  ['icon-512.png', 512, null],
];

function log(message) {
  // eslint-disable-next-line no-console -- CLI build script, console output is the entire UI
  console.log(`[generate-favicons] ${message}`);
}

async function main() {
  if (!fs.existsSync(SOURCE_MARK)) {
    throw new Error(
      `generateFavicons: source mark not found at ${SOURCE_MARK}. ` +
        'Save the real desavii-mark.png there before running this script.',
    );
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sourceDataUrl = `data:image/png;base64,${fs.readFileSync(SOURCE_MARK).toString('base64')}`;

  const results = await page.evaluate(
    async ({ dataUrl, derivatives }) => {
      async function resize(url, size, background) {
        const img = new Image();
        img.src = url;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (background) {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, size, size);
        }
        const pad = background ? size * 0.12 : 0;
        const target = size - pad * 2;
        const scale = Math.min(target / img.width, target / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        return canvas.toDataURL('image/png');
      }
      const entries = await Promise.all(
        derivatives.map(async ([name, size, background]) => [
          name,
          await resize(dataUrl, size, background),
        ]),
      );
      return Object.fromEntries(entries);
    },
    { dataUrl: sourceDataUrl, derivatives: DERIVATIVES },
  );

  DERIVATIVES.forEach(([name]) => {
    const base64 = results[name].replace(/^data:image\/png;base64,/, '');
    const outPath = path.join(PUBLIC_DIR, name);
    fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
    log(`wrote ${path.relative(ROOT, outPath)}`);
  });

  await browser.close();
  log(`done — ${DERIVATIVES.length} derivatives regenerated.`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- CLI build script, console output is the entire UI
  console.error(`[generate-favicons] ${error.message}`);
  process.exitCode = 1;
});

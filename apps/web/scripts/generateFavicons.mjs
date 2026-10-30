/**
 * generateFavicons.mjs — derives every favicon/manifest-icon size from the
 * single source-of-truth brand asset (`public/brand/desavii-mark.png`)
 * instead of hand-maintaining N separately-exported files that can drift
 * from the real logo. It also derives the header's display-size copies of
 * the mark and wordmark (`public/brand/header/`, 1x/2x/3x of BrandLogo's
 * 32px height): the 1024px masters stay the source of truth, while the
 * header downloads a few kilobytes instead of ~0.7 MB (HOME-018). Reuses the `@playwright/test` Chromium dependency
 * already installed for E2E/prerender (scripts/prerender.mjs) so this adds
 * no new dependency — a real browser Canvas does the resizing, run headless
 * at build-asset time, never in the shipped app.
 *
 * USAGE
 *   npm run generate:favicons
 *     — regenerates every derivative below from the public/brand/ masters
 *       into public/. Re-run this whenever a source logo changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BRAND_DIR = path.join(PUBLIC_DIR, 'brand');
const SOURCE_MARK = path.join(BRAND_DIR, 'desavii-mark.png');
const SOURCE_WORDMARK = path.join(BRAND_DIR, 'desavii-wordmark.png');
const HEADER_LOGO_DIR = path.join(BRAND_DIR, 'header');

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

// BrandLogo renders both logos 32px tall; 1x/2x/3x cover every screen
// density. [source, output prefix] — files are `<prefix>-<height>.png`.
const HEADER_LOGO_HEIGHTS = [32, 64, 96];
const HEADER_LOGOS = [
  [SOURCE_MARK, 'desavii-mark'],
  [SOURCE_WORDMARK, 'desavii-wordmark'],
];

const toDataUrl = (file) =>
  `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

function log(message) {
  // eslint-disable-next-line no-console -- CLI build script, console output is the entire UI
  console.log(`[generate-favicons] ${message}`);
}

function writePng(outPath, dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  log(`wrote ${path.relative(ROOT, outPath)}`);
}

async function main() {
  [SOURCE_MARK, SOURCE_WORDMARK].forEach((source) => {
    if (!fs.existsSync(source)) {
      throw new Error(
        `generateFavicons: source logo not found at ${source}. ` +
          'Save the real brand file there before running this script.',
      );
    }
  });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sourceDataUrl = toDataUrl(SOURCE_MARK);

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
    writePng(path.join(PUBLIC_DIR, name), results[name]);
  });

  // Header logos keep their aspect ratio and are reduced by halving steps
  // before the final draw, which keeps thin strokes crisp at 32px.
  const headerLogos = await page.evaluate(
    async ({ logos, heights }) => {
      async function load(url) {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      }
      function draw(source, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, width, height);
        return canvas;
      }
      function toHeight(img, height) {
        const width = Math.round((img.width / img.height) * height);
        let current = draw(img, img.width, img.height);
        while (current.height / 2 >= height) {
          current = draw(
            current,
            Math.round(current.width / 2),
            Math.round(current.height / 2),
          );
        }
        return draw(current, width, height).toDataURL('image/png');
      }
      const entries = await Promise.all(
        logos.map(async ([dataUrl, prefix]) => {
          const img = await load(dataUrl);
          return heights.map((height) => [
            `${prefix}-${height}.png`,
            toHeight(img, height),
          ]);
        }),
      );
      return Object.fromEntries(entries.flat());
    },
    {
      logos: HEADER_LOGOS.map(([source, prefix]) => [
        toDataUrl(source),
        prefix,
      ]),
      heights: HEADER_LOGO_HEIGHTS,
    },
  );

  fs.mkdirSync(HEADER_LOGO_DIR, { recursive: true });
  Object.entries(headerLogos).forEach(([name, dataUrl]) => {
    writePng(path.join(HEADER_LOGO_DIR, name), dataUrl);
  });

  await browser.close();
  log(
    `done — ${DERIVATIVES.length + Object.keys(headerLogos).length} derivatives regenerated.`,
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- CLI build script, console output is the entire UI
  console.error(`[generate-favicons] ${error.message}`);
  process.exitCode = 1;
});

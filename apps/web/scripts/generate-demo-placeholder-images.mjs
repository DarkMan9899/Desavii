/**
 * Generates local SVG placeholder images for the backend's demo marketplace
 * seed (`apps/api/src/infrastructure/database/seeds/demo/seedDemoMarketplace.js`).
 *
 * No AI image-generation tool is available to produce literal photographs,
 * and CLAUDE.md's Asset Policy requires placeholders to be stored locally
 * inside the frontend project and never hotlinked/CDN-served — this script
 * produces that local placeholder set as plain, checked-in SVG files under
 * `apps/web/public/assets/images/demo/`, built from the same design-token
 * palette as the rest of the app (packages/ui/src/tokens/_colors.scss)
 * rather than arbitrary colors.
 *
 * Usage: node apps/web/scripts/generate-demo-placeholder-images.mjs
 * Safe to re-run — it always overwrites the same deterministic file set.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.resolve(__dirname, '../public/assets/images/demo');

const PALETTE = {
  navy: '#0f2a4a',
  royalBlue: '#1d5fd6',
  gold: '#c9a24b',
  gray100: '#f3f5f7',
  gray200: '#e4e8ec',
  white: '#ffffff',
};

const IMAGES_PER_CATEGORY = 8;

const CATEGORIES = [
  { slug: 'hotels', label: 'Hotel', icon: 'building' },
  { slug: 'apartments', label: 'Apartment', icon: 'key' },
  { slug: 'tours', label: 'Tour', icon: 'mountain' },
  { slug: 'car-rentals', label: 'Car Rental', icon: 'car' },
  { slug: 'attractions', label: 'Experience', icon: 'compass' },
];

const ICONS = {
  building: `
    <rect x="-60" y="-90" width="120" height="180" rx="4" fill="rgba(255,255,255,0.9)" />
    <rect x="-45" y="-75" width="24" height="24" fill="var(--icon-fill)" />
    <rect x="-8" y="-75" width="24" height="24" fill="var(--icon-fill)" />
    <rect x="29" y="-75" width="24" height="24" fill="var(--icon-fill)" />
    <rect x="-45" y="-38" width="24" height="24" fill="var(--icon-fill)" />
    <rect x="-8" y="-38" width="24" height="24" fill="var(--icon-fill)" />
    <rect x="29" y="-38" width="24" height="24" fill="var(--icon-fill)" />
    <rect x="-45" y="-1" width="24" height="24" fill="var(--icon-fill)" />
    <rect x="29" y="-1" width="24" height="24" fill="var(--icon-fill)" />
    <rect x="-16" y="10" width="32" height="80" fill="var(--icon-fill)" />
  `,
  key: `
    <circle cx="-30" cy="0" r="38" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="14" />
    <rect x="4" y="-9" width="90" height="18" fill="rgba(255,255,255,0.9)" />
    <rect x="70" y="9" width="16" height="22" fill="rgba(255,255,255,0.9)" />
    <rect x="46" y="9" width="16" height="16" fill="rgba(255,255,255,0.9)" />
  `,
  mountain: `
    <polygon points="-100,60 -40,-60 10,10 40,-30 100,60" fill="rgba(255,255,255,0.9)" />
    <circle cx="55" cy="-70" r="20" fill="var(--icon-fill)" />
  `,
  car: `
    <rect x="-90" y="-10" width="180" height="50" rx="16" fill="rgba(255,255,255,0.9)" />
    <polygon points="-55,-10 -35,-45 45,-45 65,-10" fill="rgba(255,255,255,0.9)" />
    <circle cx="-50" cy="45" r="22" fill="var(--icon-fill)" />
    <circle cx="55" cy="45" r="22" fill="var(--icon-fill)" />
  `,
  compass: `
    <circle cx="0" cy="0" r="95" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="12" />
    <polygon points="0,-60 20,10 -20,10" fill="rgba(255,255,255,0.9)" />
    <polygon points="0,60 20,-10 -20,-10" fill="var(--icon-fill)" />
  `,
};

function buildSvg({ label, index, icon, gradientFrom, gradientTo, iconFill }) {
  const gradientId = `g-${label.toLowerCase().replace(/\s+/g, '-')}-${index}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${label} placeholder photo ${index}">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${gradientFrom}" />
      <stop offset="100%" stop-color="${gradientTo}" />
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#${gradientId})" />
  <circle cx="700" cy="80" r="140" fill="rgba(255,255,255,0.06)" />
  <circle cx="80" cy="540" r="180" fill="rgba(255,255,255,0.05)" />
  <g transform="translate(400,250)" style="--icon-fill:${iconFill}">
    ${icon}
  </g>
  <text x="400" y="470" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="${PALETTE.white}" opacity="0.95">${label}</text>
  <text x="400" y="510" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" letter-spacing="2" fill="${PALETTE.gold}">DESAVII DEMO PLACEHOLDER</text>
</svg>
`;
}

function categoryGradient(categoryIndex, imageIndex) {
  // Alternates between navy->royalBlue and royalBlue->navy per image so a
  // single category's set isn't visually identical across every listing.
  const flipped = imageIndex % 2 === 1;
  const from = flipped ? PALETTE.royalBlue : PALETTE.navy;
  const to = flipped ? PALETTE.navy : PALETTE.royalBlue;
  return { from, to };
}

function main() {
  let written = 0;

  CATEGORIES.forEach((category, categoryIndex) => {
    const dir = path.join(OUTPUT_ROOT, category.slug);
    mkdirSync(dir, { recursive: true });
    for (let i = 1; i <= IMAGES_PER_CATEGORY; i += 1) {
      const { from, to } = categoryGradient(categoryIndex, i);
      const svg = buildSvg({
        label: category.label,
        index: i,
        icon: ICONS[category.icon],
        gradientFrom: from,
        gradientTo: to,
        iconFill: PALETTE.gold,
      });
      writeFileSync(path.join(dir, `${category.slug}-${i}.svg`), svg, 'utf8');
      written += 1;
    }
  });

  const partnerDir = path.join(OUTPUT_ROOT, 'partners');
  mkdirSync(partnerDir, { recursive: true });
  CATEGORIES.forEach((category, categoryIndex) => {
    const svg = buildSvg({
      label: `${category.label} Partner`,
      index: 1,
      icon: ICONS[category.icon],
      gradientFrom: PALETTE.navy,
      gradientTo: PALETTE.gold,
      iconFill: PALETTE.navy,
    });
    writeFileSync(
      path.join(partnerDir, `${category.slug}-logo.svg`),
      svg,
      'utf8',
    );
    written += 1;
  });

  // eslint-disable-next-line no-console -- one-off CLI script, not app runtime code
  console.log(
    `Generated ${written} demo placeholder SVGs under ${OUTPUT_ROOT}`,
  );
}

main();

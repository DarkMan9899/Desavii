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

// Emergency visual-regression recovery pass: the previous version of this
// generator produced a saturated navy->royalBlue full-bleed background with
// a large centered icon and two lines of literal text ("Entertainment",
// "DESAVII DEMO PLACEHOLDER") burned directly into the SVG. Three real,
// owner-reported problems traced back to these exact files: (1) the text
// is English regardless of route locale — a static image asset has no way
// to read `i18n`, so it leaked untranslated English onto /hy and /ru; (2)
// a solid dark-navy rectangle repeated across every card in a TOP row read
// as "a dark oversized carousel stage", not marketplace inventory; (3) the
// large centered icon + two text lines made every demo photo look like
// template/placeholder scaffolding rather than a real (if photo-less)
// listing. Fixed by dropping all baked-in text, moving to a soft light
// wash (this same brand palette, just inverted toward white) instead of a
// saturated dark gradient, and shrinking the icon so it reads as a quiet
// brand mark rather than the card's dominant visual element.
const ICON_SCALE = 0.55;

const IMAGES_PER_CATEGORY = 8;

const CATEGORIES = [
  { slug: 'hotels', label: 'Hotel', icon: 'building' },
  { slug: 'apartments', label: 'Apartment', icon: 'key' },
  { slug: 'tours', label: 'Tour', icon: 'mountain' },
  { slug: 'car-rentals', label: 'Car Rental', icon: 'car' },
  { slug: 'attractions', label: 'Experience', icon: 'compass' },
  // Sprint J: the 4 categories that had no placeholder set at all —
  // Villas/Guest Houses reuse the "house" family the same way Hotels'
  // "building" icon already implies a distinct silhouette, Restaurants
  // gets a plate/utensils glyph, Entertainment Venues a star/ticket glyph.
  { slug: 'villas', label: 'Villa', icon: 'villa' },
  { slug: 'guest-houses', label: 'Guest House', icon: 'guestHouse' },
  { slug: 'restaurants', label: 'Restaurant', icon: 'plate' },
  { slug: 'entertainment-venues', label: 'Entertainment', icon: 'star' },
];

// Base icon-shape fill/stroke, resolved via the `--icon-base` custom
// property set on each icon's wrapping <g> (buildSvg) — a muted brand navy
// on this generator's new light background, replacing the old hardcoded
// solid white that only worked against the previous dark navy->royalBlue
// fill.
const ICONS = {
  building: `
    <rect x="-60" y="-90" width="120" height="180" rx="4" fill="var(--icon-base)" />
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
    <circle cx="-30" cy="0" r="38" fill="none" stroke="var(--icon-base)" stroke-width="14" />
    <rect x="4" y="-9" width="90" height="18" fill="var(--icon-base)" />
    <rect x="70" y="9" width="16" height="22" fill="var(--icon-base)" />
    <rect x="46" y="9" width="16" height="16" fill="var(--icon-base)" />
  `,
  mountain: `
    <polygon points="-100,60 -40,-60 10,10 40,-30 100,60" fill="var(--icon-base)" />
    <circle cx="55" cy="-70" r="20" fill="var(--icon-fill)" />
  `,
  car: `
    <rect x="-90" y="-10" width="180" height="50" rx="16" fill="var(--icon-base)" />
    <polygon points="-55,-10 -35,-45 45,-45 65,-10" fill="var(--icon-base)" />
    <circle cx="-50" cy="45" r="22" fill="var(--icon-fill)" />
    <circle cx="55" cy="45" r="22" fill="var(--icon-fill)" />
  `,
  compass: `
    <circle cx="0" cy="0" r="95" fill="none" stroke="var(--icon-base)" stroke-width="12" />
    <polygon points="0,-60 20,10 -20,10" fill="var(--icon-base)" />
    <polygon points="0,60 20,-10 -20,-10" fill="var(--icon-fill)" />
  `,
  villa: `
    <polygon points="-95,15 0,-85 95,15" fill="var(--icon-base)" />
    <rect x="-70" y="15" width="140" height="85" fill="var(--icon-base)" />
    <rect x="-18" y="55" width="36" height="45" fill="var(--icon-fill)" />
    <rect x="60" y="70" width="45" height="16" rx="8" fill="var(--icon-fill)" opacity="0.55" />
  `,
  guestHouse: `
    <polygon points="-62,5 0,-62 62,5" fill="var(--icon-base)" />
    <rect x="-48" y="5" width="96" height="72" fill="var(--icon-base)" />
    <rect x="28" y="-58" width="14" height="34" fill="var(--icon-base)" />
    <circle cx="0" cy="38" r="15" fill="var(--icon-fill)" />
  `,
  plate: `
    <circle cx="0" cy="10" r="88" fill="var(--icon-base)" />
    <circle cx="0" cy="10" r="60" fill="none" stroke="var(--icon-fill)" stroke-width="4" />
    <rect x="-58" y="-70" width="10" height="130" fill="var(--icon-fill)" transform="rotate(-18)" />
    <rect x="46" y="-70" width="10" height="130" fill="var(--icon-fill)" transform="rotate(18)" />
  `,
  star: `
    <polygon points="0,-95 24,-30 92,-28 38,10 58,80 0,40 -58,80 -38,10 -92,-28 -24,-30" fill="var(--icon-base)" />
    <circle cx="72" cy="-58" r="9" fill="var(--icon-fill)" />
    <circle cx="-68" cy="52" r="7" fill="var(--icon-fill)" />
    <circle cx="0" cy="-2" r="6" fill="var(--icon-fill)" />
  `,
};

// No text at all (no category label, no "DESAVII DEMO PLACEHOLDER" — see
// this file's header comment for why), and the icon is scaled down
// (ICON_SCALE) and centered a touch above middle so it reads as a quiet
// brand mark — "support the card, not become the card" — rather than the
// dominant element of what should look like an ordinary (if photo-less)
// listing thumbnail. `role="img"`/`aria-label` stay on the root <svg> for
// hygiene (a direct `<img src="*.svg">` — this file's only real usage —
// never exposes an embedded SVG's own accessibility tree to a screen
// reader; the consuming `<img>` tag's own `alt` is what actually renders).
function buildSvg({
  label,
  index,
  icon,
  gradientFrom,
  gradientTo,
  iconFill,
  iconBase,
}) {
  const gradientId = `g-${label.toLowerCase().replace(/\s+/g, '-')}-${index}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${label} placeholder photo ${index}">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${gradientFrom}" />
      <stop offset="100%" stop-color="${gradientTo}" />
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#${gradientId})" />
  <g transform="translate(400,280) scale(${ICON_SCALE})" style="--icon-fill:${iconFill};--icon-base:${iconBase}">
    ${icon}
  </g>
</svg>
`;
}

function categoryGradient(categoryIndex, imageIndex) {
  // A soft, light wash instead of the previous saturated navy->royalBlue
  // fill (that dark treatment, repeated across every card in a TOP row,
  // was a real, reported "dark oversized carousel stage" contributor) —
  // alternates two light neutrals per image so a single category's set
  // isn't visually identical across every listing, same intent as before.
  const flipped = imageIndex % 2 === 1;
  const from = flipped ? PALETTE.white : PALETTE.gray100;
  const to = flipped ? PALETTE.gray100 : PALETTE.gray200;
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
        iconBase: PALETTE.navy,
      });
      writeFileSync(path.join(dir, `${category.slug}-${i}.svg`), svg, 'utf8');
      written += 1;
    }
  });

  const partnerDir = path.join(OUTPUT_ROOT, 'partners');
  mkdirSync(partnerDir, { recursive: true });
  CATEGORIES.forEach((category) => {
    const svg = buildSvg({
      label: `${category.label} Partner`,
      index: 1,
      icon: ICONS[category.icon],
      gradientFrom: PALETTE.navy,
      gradientTo: PALETTE.gold,
      iconFill: PALETTE.gold,
      iconBase: PALETTE.white,
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

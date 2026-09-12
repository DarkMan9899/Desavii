/**
 * categoryHeroArt — Pass 7B (category visual closure, brief §2: "Create
 * enough lightweight category presentation variants so all 9 public
 * categories can have a distinct recognizable hero treatment").
 *
 * Pass 7 shipped a curated-but-limited version of this: `DestinationArt`'s
 * mesh variant and motif were BOTH derived from the same `index % 5`, so
 * only 5 combos existed total and 4 categories had to share one with an
 * unrelated category. This pass closes that gap properly by having
 * `DestinationArt` accept an explicit `motif`/`meshVariant` override
 * (independent of each other and of the seed hash) and adding four new
 * motifs — every one of the 9 real categories now gets its OWN unique
 * motif, not just its own combo of an already-shared set.
 */

const CATEGORY_HERO_ART = Object.freeze({
  // Hospitality/architecture — an arched doorway.
  hotels: { motif: 'arch', meshVariant: 5 },
  // Calm, everyday light — a modern home's ambiance rather than a
  // hospitality doorway (brief §4: "modern home / independent stay").
  apartments: { motif: 'sun-waves', meshVariant: 3 },
  // Dramatic, premium landscape — a large-property/estate feeling.
  villas: { motif: 'peaks', meshVariant: 2 },
  // A small house + key — warmer, smaller-scale, more personal than
  // Hotel's bare arch (brief §4: "warm / local / smaller-scale").
  'guest-houses': { motif: 'door-key', meshVariant: 4 },
  // Literal cuisine — fork/knife, matching the UtensilsCrossed category
  // icon already used elsewhere for this category.
  restaurants: { motif: 'fork-knife', meshVariant: 1 },
  // Discovery/wayfinding.
  tours: { motif: 'compass', meshVariant: 1 },
  // Technical/directional — converging road-edge lines, never a
  // cinematic/editorial treatment (brief: "cleaner, more technical").
  'car-rentals': { motif: 'road', meshVariant: 4 },
  // Landmark spotlight.
  attractions: { motif: 'starburst', meshVariant: 4 },
  // Explicitly "poster/event imagery" — a ticket/pass shape.
  'entertainment-venues': { motif: 'ticket', meshVariant: 5 },
});

/**
 * @param {string} categorySlug
 * @param {number|string} fallbackSeed - used for a category outside the
 *   known 9 (shouldn't happen in production) — falls back to plain
 *   `DestinationArt` seed-hash behavior rather than a hard failure.
 * @returns {{motif?: string, meshVariant?: number, seed: number|string}}
 *   spreadable straight onto `DestinationArt`/`EditorialPageHero` props.
 */
export function resolveCategoryHeroArt(categorySlug, fallbackSeed) {
  const art = CATEGORY_HERO_ART[categorySlug];
  if (!art) return { seed: fallbackSeed };
  return { ...art, seed: fallbackSeed };
}

export default { resolveCategoryHeroArt };

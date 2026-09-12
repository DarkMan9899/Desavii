/**
 * categoryHeroArt — Pass 7 (category-specific visual identity, brief §14:
 * "Do not make 9 identical heroes with different text").
 *
 * `CategoryPageContent`/`EditorialPageHero` previously passed
 * `heroSeed={category.id}` straight into `DestinationArt` — a STABLE but
 * ACCIDENTAL art combo (whatever a raw database id happens to hash to),
 * never a deliberate choice. This module replaces that with a curated
 * seed per category slug.
 *
 * Real constraint discovered while building this (`DestinationArt.jsx`):
 * its mesh variant (`(index % 5) + 1`) and motif (`MOTIFS[index % 5]`) are
 * BOTH derived from the exact same `index % 5` — there are only 5 possible
 * combos total, not one per category. With 9 categories, at least 4 must
 * share a combo with another regardless of curation. The 5 slots are
 * spent on the two groups the owner specifically flagged as
 * indistinguishable: Apartments/Villas/Guest Houses (all `PROPERTY`) and
 * Attractions/Entertainment (both `ATTRACTION`) — every category in
 * EITHER group gets a combo no other member of that same group has.
 * Hotels/Restaurants/Tours/Car Rentals reuse a combo from the other
 * group's five, since those four already have strong differentiation
 * elsewhere (rooms/reservation, cuisine chips, itinerary, vehicle specs)
 * and were never the categories the owner called out as visually
 * confusable via hero art.
 *
 * Numeric seeds pass straight through `DestinationArt`'s `seedToIndex`
 * (`Math.abs(Math.trunc(seed))`), so the seed value IS the index — 100-104
 * are arbitrary but deliberately spaced 1 apart to land on all 5 distinct
 * `index % 5` buckets (compass/mesh-1, peaks/mesh-2, sun-waves/mesh-3,
 * starburst/mesh-4, arch/mesh-5), never the category's own id.
 */

const SEED_COMPASS_MESH_1 = 100;
const SEED_PEAKS_MESH_2 = 101;
const SEED_SUN_WAVES_MESH_3 = 102;
const SEED_STARBURST_MESH_4 = 103;
const SEED_ARCH_MESH_5 = 104;

const HERO_SEED_BY_CATEGORY_SLUG = Object.freeze({
  // The two owner-flagged "look too similar" groups — every member gets
  // its OWN combo, none shared within the same group.
  apartments: SEED_COMPASS_MESH_1,
  villas: SEED_PEAKS_MESH_2,
  'guest-houses': SEED_SUN_WAVES_MESH_3,
  attractions: SEED_STARBURST_MESH_4,
  'entertainment-venues': SEED_ARCH_MESH_5,
  // Not part of either confusable group — reuse a combo from the other
  // group; their real differentiation lives in card/detail composition,
  // not hero art.
  hotels: SEED_ARCH_MESH_5,
  restaurants: SEED_PEAKS_MESH_2,
  tours: SEED_STARBURST_MESH_4,
  'car-rentals': SEED_SUN_WAVES_MESH_3,
});

/**
 * @param {string} categorySlug
 * @param {number|string} fallbackSeed - used for a category outside the
 *   known 9 (shouldn't happen in production, but keeps this safe for a
 *   future/unseeded category) — the previous accidental-but-stable
 *   behavior, never a hard failure.
 */
export function resolveCategoryHeroSeed(categorySlug, fallbackSeed) {
  return HERO_SEED_BY_CATEGORY_SLUG[categorySlug] ?? fallbackSeed;
}

export default { resolveCategoryHeroSeed };

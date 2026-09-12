/**
 * DestinationArt — shared procedural backdrop (redesign phase, 2026).
 *
 * No real per-destination/category photography asset pipeline exists yet
 * (see `assets/images/index.js`'s own "swap for a real production asset
 * later" framing) — before this component, every destination card shared
 * one identical static illustration (`destinationMotif.svg`), which is
 * exactly the "flat, repeated" look the redesign brief calls out. This
 * replaces it with a deterministic-but-varied treatment: a gradient mesh
 * (`@desavii/ui`'s `mesh-for-index()`, five brand-derived variants) paired
 * with one of five simple line-art motifs, both keyed off the same
 * `seed` (a destination/category/listing id) — so the same item always
 * renders the same art, and a grid of different items reads as varied,
 * not one recolored illustration. Purely decorative (`aria-hidden`);
 * callers still supply their own real `alt`/heading text for the actual
 * content.
 */

import PropTypes from 'prop-types';
import styles from './DestinationArt.module.scss';

const MOTIFS = ['compass', 'peaks', 'sun-waves', 'starburst', 'arch'];
// Pass 7B (category visual closure): four more motifs, reachable ONLY via
// an explicit `motif` override prop (never via the seed hash below) — the
// hash-selectable `MOTIFS` array above stays exactly 5 entries so every
// existing caller's already-shipped deterministic art is unaffected.
const EXTRA_MOTIFS = ['door-key', 'fork-knife', 'road', 'ticket'];
const ALL_MOTIFS = [...MOTIFS, ...EXTRA_MOTIFS];
const MESH_VARIANTS = [1, 2, 3, 4, 5];

function Motif({ name }) {
  switch (name) {
    case 'peaks':
      return (
        <path
          d="M0 78 L18 52 L34 68 L52 34 L72 62 L88 46 L100 78 Z"
          fill="currentColor"
        />
      );
    case 'sun-waves':
      return (
        <>
          <circle cx="76" cy="26" r="14" fill="currentColor" />
          <path
            d="M0 60c10-8 20-8 30 0s20 8 30 0 20-8 30 0 20 8 30 0"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
          />
          <path
            d="M0 78c10-8 20-8 30 0s20 8 30 0 20-8 30 0 20 8 30 0"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            opacity="0.6"
          />
        </>
      );
    case 'starburst':
      return (
        <g stroke="currentColor" strokeWidth="2.5">
          <circle cx="50" cy="46" r="20" fill="none" opacity="0.7" />
          <path d="M50 8v20M50 64v20M12 46h20M68 46h20" />
          <path d="M22 18l14 14M64 60l14 14M78 18L64 32M36 60L22 74" />
        </g>
      );
    case 'arch':
      return (
        <path
          d="M18 90V52a32 32 0 0 1 64 0v38"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
        />
      );
    // Pass 7B — Guest House: a small house silhouette + a key, reading as
    // warmer/more personal-scale than Hotel's bare arch.
    case 'door-key':
      return (
        <g stroke="currentColor" strokeWidth="2.5" fill="none">
          <path d="M20 90V50L50 25l30 25v40" />
          <rect x="42" y="65" width="16" height="25" />
          <circle cx="72" cy="48" r="7" fill="currentColor" stroke="none" />
          <path d="M72 55v14M72 63h8" />
        </g>
      );
    // Pass 7B — Restaurant: a literal fork/knife pairing, matching the
    // UtensilsCrossed category icon already used elsewhere.
    case 'fork-knife':
      return (
        <g
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        >
          <path d="M28 8v28M22 8v14a6 6 0 0 0 12 0V8" />
          <path d="M28 36v56" />
          <path d="M72 8c-10 4-10 20-2 26l2 2v54" />
        </g>
      );
    // Pass 7B — Car Rentals: converging road-edge lines + a dashed center
    // line, a technical/directional motif (brief: "cleaner, more
    // technical, less editorial").
    case 'road':
      return (
        <g stroke="currentColor" strokeWidth="2.5" fill="none">
          <path d="M32 92 L46 8" />
          <path d="M68 92 L54 8" />
          <path d="M50 92 L50 8" strokeDasharray="8 10" />
        </g>
      );
    // Pass 7B — Entertainment: a ticket/pass shape, matching the brief's
    // explicit "poster/event imagery" language.
    case 'ticket':
      return (
        <g stroke="currentColor" strokeWidth="2.5" fill="none">
          <rect x="10" y="28" width="80" height="44" rx="8" />
          <path d="M50 28v44" strokeDasharray="5 7" />
          <circle cx="30" cy="50" r="4" fill="currentColor" stroke="none" />
          <circle cx="70" cy="50" r="4" fill="currentColor" stroke="none" />
        </g>
      );
    case 'compass':
    default:
      return (
        <g stroke="currentColor" strokeWidth="1.5" fill="none">
          <circle cx="50" cy="50" r="46" />
          <circle cx="50" cy="50" r="32" />
          <path d="M50 8v18M50 74v18M8 50h18M74 50h18" />
          <path
            d="M50 24 60 50 50 76 40 50Z"
            fill="currentColor"
            stroke="none"
          />
        </g>
      );
  }
}

Motif.propTypes = { name: PropTypes.oneOf(ALL_MOTIFS).isRequired };

/** A numeric id seeds directly; any other value (a title string, when no id is available) is hashed so it still varies instead of collapsing to one shared mesh. */
function seedToIndex(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.abs(Math.trunc(seed));
  }
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    // Modulo-bounded rather than a bitwise `| 0` wraparound (disallowed,
    // `no-bitwise`) — keeps `hash` a safe, non-negative integer through
    // every iteration without needing one.
    hash = (hash * 31 + text.charCodeAt(i)) % 2_147_483_647;
  }
  return Math.abs(hash);
}

export default function DestinationArt({
  seed,
  className = undefined,
  motif: motifOverride = undefined,
  meshVariant: meshVariantOverride = undefined,
}) {
  const index = seedToIndex(seed);
  const meshVariant = meshVariantOverride ?? (index % 5) + 1;
  const motif = motifOverride ?? MOTIFS[index % MOTIFS.length];
  const combinedClassName = [
    styles.art,
    styles[`art--mesh-${meshVariant}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={combinedClassName} aria-hidden="true">
      <svg
        className={styles.motif}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <Motif name={motif} />
      </svg>
    </div>
  );
}

DestinationArt.propTypes = {
  seed: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  className: PropTypes.string,
  // Pass 7B: overrides the seed-derived motif/mesh independently — see
  // file header. Omit both for every pre-existing caller's unchanged
  // seed-hash behavior.
  motif: PropTypes.oneOf(ALL_MOTIFS),
  meshVariant: PropTypes.oneOf(MESH_VARIANTS),
};

// Exported so other procedural-art surfaces (e.g. `CompanyAvatar`'s
// initials-avatar mesh) can key off the exact same deterministic mesh
// index this component uses, instead of re-deriving their own hash.
export { seedToIndex };

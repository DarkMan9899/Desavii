/**
 * Canonical public-listing-visibility SQL fragment — Listing Lifetime /
 * Renewal, Step B4.
 *
 * A `listings` row is publicly visible only when: its status is PUBLISHED,
 * it has not been frozen by the expiry sweep, and — if it is lifecycle-
 * managed at all — its `expires_at` has not yet passed. That last clause is
 * deliberate and load-bearing: the expiry sweep (`jobs/listingExpirySweep.js`)
 * only runs hourly, so public visibility must not depend solely on it having
 * already run, or a PUBLISHED-but-expired row would stay publicly visible
 * for up to an hour. Comparing directly against `UTC_TIMESTAMP(3)` (the DB's
 * own clock, matching every other lifecycle timestamp comparison already
 * established in Step B3's `markPublished`) closes that gap independently
 * of the sweep. Mirrors `core/domain/listingLifecycle.js`'s
 * `isPubliclyVisible` exactly, for the JS-side equivalent of this same
 * check.
 *
 * Every public-facing listing read in the codebase (Search, Category/Home
 * aggregate counts, TOP/promotion hydration, Company public profile,
 * typeahead, Favorites) is expected to AND this fragment into its WHERE/JOIN
 * clause. This is a deliberate, narrow exception to this codebase's usual
 * "each module owns a self-contained copy" convention for cross-module SQL
 * (see `CARD_METADATA_SELECT`'s own precedent in `mysqlSearchRepository.js`/
 * `mysqlFavoriteRepository.js`/`mysqlPartnerRepository.js`): that convention
 * exists to avoid a heavier one-off coupling for a large, decorative SELECT
 * column list, where a second copy drifting slightly costs nothing. This is
 * the opposite case — a tiny, security/correctness-critical WHERE predicate
 * where an accidentally drifted second copy is exactly the failure mode to
 * avoid (a listing leaking past its expiry on one surface but not another).
 *
 * Does NOT include `deleted_at` — soft-delete scoping
 * (`infrastructure/database/softDelete.js#scopeActive`) is a separate
 * concern every call site already applies on its own.
 */

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertValidAlias(alias) {
  if (alias !== '' && !IDENTIFIER.test(alias)) {
    throw new TypeError(
      `"${alias}" is not a valid SQL identifier for use as a table alias.`,
    );
  }
}

/**
 * @param {{listingAlias?: string, statusAlias?: string}} [options]
 *   `listingAlias` — the `listings` table's alias in the query (default `l`).
 *   `statusAlias` — the joined `listing_statuses` table's alias (default `ls`).
 * @returns {string} a boolean SQL expression, safe to AND into a WHERE
 *   clause or embed inside a `CASE WHEN ... THEN` condition.
 */
export function scopePubliclyVisibleListing({
  listingAlias = 'l',
  statusAlias = 'ls',
} = {}) {
  assertValidAlias(listingAlias);
  assertValidAlias(statusAlias);
  const l = listingAlias ? `${listingAlias}.` : '';
  const s = statusAlias ? `${statusAlias}.` : '';
  return `${s}code = 'PUBLISHED' AND ${l}frozen_at IS NULL AND (${l}expires_at IS NULL OR ${l}expires_at > UTC_TIMESTAMP(3))`;
}

export default scopePubliclyVisibleListing;

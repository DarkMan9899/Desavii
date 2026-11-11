/**
 * Canonical listing-card price SQL — the "from" price every public listing
 * card shows (Search, Category/Home/TOP feeds, Company profile, Favorites).
 *
 * P2.2D: the cheapest real per-unit base price (P2.2A) when the listing's
 * priced units all share one currency. The listing-level `listing_pricing`
 * fallback applies only when NO unit has a base price at all: per
 * `accommodationPriceResolution.js#resolvePriceForDate` (the precedence
 * booking actually charges), a unit's own base price always outranks the
 * listing fallback for that unit, so showing `listing_pricing` while units
 * carry prices — even in several currencies — would display a price
 * checkout cannot produce. Amount and currency come from the same scope,
 * never mixed; `MAX()` (not `GROUP BY`) so the single-currency `HAVING`
 * guard runs once over the whole set.
 *
 * A deliberate exception to the "each module owns its own copy" convention
 * for card SQL, for the same reason as `listingVisibilitySql.js`: a price
 * that drifts on one surface is a correctness bug (Favorites and the
 * Company profile used to show the bare `listing_pricing` amount).
 *
 * Requires the caller's query to alias `listings` as `l`, `LEFT JOIN
 * listing_pricing lp ON lp.listing_id = l.id` and `LEFT JOIN currencies cur
 * ON cur.id = lp.currency_id`. Yields the `price_amount` and
 * `price_currency_code` columns.
 */

const UNIT_PRICE_SCOPE = `
  WHERE bu_price.listing_id = l.id AND bu_price.deleted_at IS NULL
    AND bu_price.base_price_amount IS NOT NULL
  HAVING COUNT(DISTINCT bu_price.base_price_currency_id) = 1`;

const NO_PRICED_UNIT = (alias) => `NOT EXISTS (
    SELECT 1 FROM bookable_units ${alias}
    WHERE ${alias}.listing_id = l.id AND ${alias}.deleted_at IS NULL
      AND ${alias}.base_price_amount IS NOT NULL
  )`;

export const CARD_PRICE_SELECT = `
  COALESCE(
    (SELECT MIN(bu_price.base_price_amount)
       FROM bookable_units bu_price ${UNIT_PRICE_SCOPE}
    ),
    CASE WHEN ${NO_PRICED_UNIT('bu_any_price')} THEN lp.amount END
  ) AS price_amount,
  COALESCE(
    (SELECT MAX(cur_price.code)
       FROM bookable_units bu_price
       JOIN currencies cur_price ON cur_price.id = bu_price.base_price_currency_id
       ${UNIT_PRICE_SCOPE}
    ),
    CASE WHEN ${NO_PRICED_UNIT('bu_any_price2')} THEN cur.code END
  ) AS price_currency_code`;

export default CARD_PRICE_SELECT;

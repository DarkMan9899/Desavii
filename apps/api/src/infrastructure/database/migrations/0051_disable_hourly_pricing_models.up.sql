-- Step L6.2H1 — PER_HOUR is not a customer-bookable pricing model: the
-- booking engine has no booked-hour count, no hourly inventory (capacity is
-- consumed per calendar day) and never reads `pricing_model` when it
-- charges, so an "hourly" listing is silently charged per date x quantity.
-- Tours and Entertainment Venues were the only categories that offered it.
--
-- Metadata only: removes exactly those two category/model pairings, so the
-- Partner UI stops offering PER_HOUR and `ListingService#resolvePricing`
-- rejects it (UNKNOWN_PRICING_MODEL) for new pricing writes. Listing rows
-- are deliberately NOT rewritten — an existing PER_HOUR listing keeps its
-- stored pricing (readable), but is refused for customer booking and
-- publication until its Partner knowingly picks a supported model. The
-- `pricing_models` lookup row itself stays: those legacy `listing_pricing`
-- rows still reference it.
DELETE cpm
FROM category_pricing_models cpm
JOIN listing_categories c ON c.id = cpm.category_id
JOIN pricing_models pm ON pm.id = cpm.pricing_model_id
WHERE pm.code = 'PER_HOUR'
  AND c.slug IN ('tours', 'entertainment-venues');

-- Restores the two PER_HOUR pairings 0051 removed, at the sort order
-- `seeds/007_pricing_and_policies.js` gave them (after PER_PERSON). A
-- database whose categories or pricing models were never seeded simply
-- gets nothing back (the SELECT matches no rows).
INSERT IGNORE INTO category_pricing_models (category_id, pricing_model_id, sort_order)
SELECT c.id, pm.id, 1
FROM listing_categories c
JOIN pricing_models pm ON pm.code = 'PER_HOUR'
WHERE c.slug IN ('tours', 'entertainment-venues');

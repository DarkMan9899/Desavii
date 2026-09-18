-- Step A3.2 — contact-click attribution correction. A3/A3.1 live QA
-- confirmed the real runtime contract: `contact_click` fires only from
-- `CompanyProfilePageContent`'s contact row (`companySlug` + `contactMethod`,
-- no `listingId` at all), and `engagementAnalyticsService.js#resolveTarget`
-- resolves it via `partnerService.getPublicPartnerBySlug` — the stored
-- `analytics_events.listing_id` is always NULL for this event. Migration
-- 0049 placed `contact_clicks_count` on `listing_analytics_daily` before
-- that runtime contract existed; there is no canonical per-listing
-- attribution to aggregate into it. Moves the counter to its real owner,
-- `company_analytics_daily`, matching this event's actual partner-scoped
-- resolution. No aggregation job reads either table yet (A4) — this is a
-- schema-only correction, not a data migration.

ALTER TABLE company_analytics_daily
  ADD COLUMN contact_clicks_count BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER listing_clicks_count;

ALTER TABLE listing_analytics_daily
  DROP COLUMN contact_clicks_count;

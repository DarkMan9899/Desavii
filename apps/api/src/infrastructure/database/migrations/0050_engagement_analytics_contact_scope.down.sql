ALTER TABLE listing_analytics_daily
  ADD COLUMN contact_clicks_count BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER favorite_removes_count;

ALTER TABLE company_analytics_daily
  DROP COLUMN contact_clicks_count;

DROP TABLE IF EXISTS listing_guest_notes;

ALTER TABLE listing_amenities
  DROP INDEX uq_listing_amenities_code,
  DROP COLUMN code;

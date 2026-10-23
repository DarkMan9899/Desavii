-- Listing Detail & Admin Information rebuild
-- (docs/LISTING_DETAIL_FIELD_GAP.md §5).
--
-- 1. A stable machine code per amenity. Amenities only had a free-text
--    `name`, so nothing could tell one apart except its label: the public
--    page could only show one icon per group. The code is nullable (a
--    row added before the seed names it keeps NULL) and unique; the seed
--    sets it from each amenity's canonical name. Existing ids, listing
--    links, room links and search filters are untouched.
--
-- 2. Guest guidance lists — "what to bring", "not allowed", "know before
--    you go" — the practical lists tours, attractions, entertainment
--    venues and car rentals publish (GetYourGuide, Viator). Same shape as
--    `listing_included_items` (migration 0026/0037): an ordered, per-
--    language list authored by the partner, one full set of rows per
--    language. `note_kind` is a closed vocabulary, enforced here as well as
--    by the API.
ALTER TABLE listing_amenities
  ADD COLUMN code VARCHAR(64) NULL AFTER id,
  ADD UNIQUE KEY uq_listing_amenities_code (code);

CREATE TABLE IF NOT EXISTS listing_guest_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id BIGINT UNSIGNED NOT NULL,
  language_id BIGINT UNSIGNED NOT NULL,
  note_kind VARCHAR(20) NOT NULL,
  note_text VARCHAR(200) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_listing_guest_notes_listing_id FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_listing_guest_notes_language_id FOREIGN KEY (language_id) REFERENCES languages (id),
  CONSTRAINT fk_listing_guest_notes_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_listing_guest_notes_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT chk_listing_guest_notes_kind CHECK (note_kind IN ('BRING', 'NOT_ALLOWED', 'KNOW_BEFORE')),
  KEY idx_listing_guest_notes_listing_id (listing_id, language_id, note_kind, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

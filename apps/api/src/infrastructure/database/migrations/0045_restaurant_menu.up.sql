-- Pass 3 remediation — Restaurant vertical. Restaurant listings had no way
-- to represent an actual menu (partners were reduced to describing dishes
-- inside the free-text listing description). A clean 3-level model, one
-- Menu per listing (a listing may run more than one — e.g. lunch vs.
-- dinner), an ordered list of Sections per menu, an ordered list of Items
-- per section — mirrors migration 0026's "id, listing_id/parent FK, ...,
-- sort_order, created_at/updated_at, created_by/updated_by" shape, built
-- WITH `language_id` from day one (migration 0026 shipped without it, then
-- needed 0037 to retrofit it once mixed-language content became a real
-- bug — this table starts where that one ended up).
--
-- True per-row CRUD (not 0026's full-replace-on-write): a menu is edited
-- section-by-section/item-by-item over time, not re-submitted as one
-- wizard step, and items need independent enable/disable (`is_active`)
-- without touching sibling rows — so, unlike 0026, there is no
-- ON DELETE CASCADE assumption and no soft-delete column; the Service
-- layer owns delete semantics explicitly (deleting a section requires its
-- items already gone, matching how the rest of this schema avoids
-- cascading deletes).

CREATE TABLE IF NOT EXISTS restaurant_menus (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id BIGINT UNSIGNED NOT NULL,
  language_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_restaurant_menus_listing_id FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_restaurant_menus_language_id FOREIGN KEY (language_id) REFERENCES languages (id),
  CONSTRAINT fk_restaurant_menus_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_restaurant_menus_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  KEY idx_restaurant_menus_listing_id (listing_id, language_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_menu_sections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  menu_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_restaurant_menu_sections_menu_id FOREIGN KEY (menu_id) REFERENCES restaurant_menus (id),
  CONSTRAINT fk_restaurant_menu_sections_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_restaurant_menu_sections_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  KEY idx_restaurant_menu_sections_menu_id (menu_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_menu_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  price_amount DECIMAL(12,2) NOT NULL,
  price_currency_id BIGINT UNSIGNED NOT NULL,
  media_id BIGINT UNSIGNED NULL,
  -- Free-form, small, additive dietary markers ('vegetarian', 'vegan',
  -- 'gluten-free', 'spicy', ...) — a JSON array rather than a new lookup
  -- table + join table for a v1 feature with no existing dietary-marker
  -- taxonomy anywhere else in the schema to reuse; i18n/display labels
  -- resolve client-side from these stable codes, same convention
  -- `toFilterGroupsResponse` already documents for search filter codes.
  dietary_markers JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_restaurant_menu_items_section_id FOREIGN KEY (section_id) REFERENCES restaurant_menu_sections (id),
  CONSTRAINT fk_restaurant_menu_items_price_currency_id FOREIGN KEY (price_currency_id) REFERENCES currencies (id),
  CONSTRAINT fk_restaurant_menu_items_media_id FOREIGN KEY (media_id) REFERENCES media (id),
  CONSTRAINT fk_restaurant_menu_items_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_restaurant_menu_items_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  KEY idx_restaurant_menu_items_section_id (section_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

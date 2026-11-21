-- Restaurant menu pre-order (docs/BOOKING_WIDGET_REBUILD.md §5).
--
-- A restaurant reservation (a RESTAURANT_TABLE booking item) may carry the
-- dishes the party pre-ordered from the restaurant's own menu. Each line
-- is an immutable booking-time snapshot: the dish's title, its section and
-- its price as the customer accepted them. A later menu edit, price change
-- or deletion never rewrites what was ordered; `menu_item_id` only links
-- back while the dish still exists (menu items are hard-deleted, hence
-- ON DELETE SET NULL).
--
-- The pre-order is paid at the restaurant: it is never part of the
-- booking's charged total (a restaurant reservation stays free and
-- payment-exempt, `bookingPaymentRequirement.js`). Additive only — every
-- existing booking simply has no lines.
CREATE TABLE IF NOT EXISTS booking_item_menu_selections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_item_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NULL,
  item_title_snapshot VARCHAR(150) NOT NULL,
  section_title_snapshot VARCHAR(150) NULL,
  language_code_snapshot VARCHAR(10) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  unit_price_amount DECIMAL(12,2) NOT NULL,
  currency_id BIGINT UNSIGNED NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_booking_item_menu_selections_booking_item_id
    FOREIGN KEY (booking_item_id) REFERENCES booking_items (id),
  CONSTRAINT fk_booking_item_menu_selections_menu_item_id
    FOREIGN KEY (menu_item_id) REFERENCES restaurant_menu_items (id) ON DELETE SET NULL,
  CONSTRAINT fk_booking_item_menu_selections_currency_id
    FOREIGN KEY (currency_id) REFERENCES currencies (id),
  CONSTRAINT chk_booking_item_menu_selections_quantity CHECK (quantity > 0),
  CONSTRAINT chk_booking_item_menu_selections_price CHECK (unit_price_amount >= 0),
  KEY idx_booking_item_menu_selections_item (booking_item_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

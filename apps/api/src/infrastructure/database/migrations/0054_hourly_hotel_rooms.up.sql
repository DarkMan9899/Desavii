-- Step L6.3B — optional hourly booking for a HOTEL_ROOM.
--
-- Hourly booking is a ROOM-level opt-in, never hotel- or category-wide:
-- every existing room keeps `hourly_enabled = 0` and stays nightly-only,
-- with no guessed hourly price, duration or window (all NULL).
--
-- 1. The room's hourly configuration. A separate canonical price and
--    currency — never the nightly `base_price_amount` — plus the whole-hour
--    duration range and the same-day window (business time, Asia/Yerevan)
--    hourly stays may use. `hourly_available_until` may be 24:00:00 (the end
--    of the day). An enabled room must carry a complete, coherent
--    configuration; a disabled room may keep its last configuration so a
--    Partner can switch hourly sales back on.
ALTER TABLE bookable_units
  ADD COLUMN hourly_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER meal_plan,
  ADD COLUMN hourly_price_amount DECIMAL(12,2) NULL AFTER hourly_enabled,
  ADD COLUMN hourly_price_currency_id BIGINT UNSIGNED NULL AFTER hourly_price_amount,
  ADD COLUMN hourly_min_duration_hours TINYINT UNSIGNED NULL AFTER hourly_price_currency_id,
  ADD COLUMN hourly_max_duration_hours TINYINT UNSIGNED NULL AFTER hourly_min_duration_hours,
  ADD COLUMN hourly_available_from TIME NULL AFTER hourly_max_duration_hours,
  ADD COLUMN hourly_available_until TIME NULL AFTER hourly_available_from,
  ADD CONSTRAINT fk_bookable_units_hourly_price_currency_id
    FOREIGN KEY (hourly_price_currency_id) REFERENCES currencies (id),
  ADD CONSTRAINT chk_bookable_units_hourly_config CHECK (
    hourly_enabled = 0
    OR (
      hourly_price_amount IS NOT NULL
      AND hourly_price_amount >= 0
      AND hourly_price_currency_id IS NOT NULL
      AND hourly_min_duration_hours BETWEEN 1 AND 24
      AND hourly_max_duration_hours BETWEEN hourly_min_duration_hours AND 24
      AND hourly_available_from IS NOT NULL
      AND hourly_available_until IS NOT NULL
      AND hourly_available_from < hourly_available_until
    )
  );

-- 2. Which mode a hold and a booked item are. NIGHTLY / HOURLY for lodging;
--    NULL for every non-lodging unit type, whose date semantics have no mode.
--    A hold's mode decides how its capacity is released; an item's mode is
--    the immutable history of what was booked (never inferred from times).
ALTER TABLE reservation_holds
  ADD COLUMN booking_mode VARCHAR(10) NULL AFTER end_time;

ALTER TABLE booking_items
  ADD COLUMN booking_mode VARCHAR(10) NULL AFTER bookable_unit_id;

-- Every lodging item booked before this migration is a nightly stay: hourly
-- booking did not exist, so this is a recorded fact, not a guess.
UPDATE booking_items bi
JOIN bookable_units bu ON bu.id = bi.bookable_unit_id
JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
SET bi.booking_mode = 'NIGHTLY'
WHERE but.code IN ('HOTEL_ROOM', 'PROPERTY_UNIT');

-- 3. Timed inventory. Hourly stays never touch the date-level
--    `availability_calendar.quantity_available` (that would let a few short
--    stays exhaust a whole day); each one holds `quantity` rooms for the
--    half-open interval [start_time, end_time) on `date`. A row belongs to a
--    hold while it is held, then to the booking item it became; `released_at`
--    marks it no longer occupying (hold released/expired, booking cancelled/
--    rejected) — rows are never deleted, so the history stays auditable.
CREATE TABLE IF NOT EXISTS hourly_inventory_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bookable_unit_id BIGINT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  source_type VARCHAR(30) NOT NULL,
  reservation_hold_id BIGINT UNSIGNED NULL COMMENT 'The hold this row was reserved for; holds are deleted when consumed/released, so no FK',
  booking_item_id BIGINT UNSIGNED NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  released_at DATETIME(3) NULL,
  release_reason VARCHAR(120) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_hourly_inventory_reservations_unit_id FOREIGN KEY (bookable_unit_id) REFERENCES bookable_units (id),
  CONSTRAINT fk_hourly_inventory_reservations_booking_item_id FOREIGN KEY (booking_item_id) REFERENCES booking_items (id),
  CONSTRAINT fk_hourly_inventory_reservations_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id),
  CONSTRAINT chk_hourly_inventory_reservations_interval CHECK (start_time < end_time),
  CONSTRAINT chk_hourly_inventory_reservations_quantity CHECK (quantity > 0),
  KEY idx_hourly_inventory_reservations_unit_date (bookable_unit_id, date, released_at),
  KEY idx_hourly_inventory_reservations_hold_id (reservation_hold_id),
  KEY idx_hourly_inventory_reservations_booking_item_id (booking_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

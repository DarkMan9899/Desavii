DROP TABLE IF EXISTS hourly_inventory_reservations;

ALTER TABLE booking_items
  DROP COLUMN booking_mode;

ALTER TABLE reservation_holds
  DROP COLUMN booking_mode;

ALTER TABLE bookable_units
  DROP CHECK chk_bookable_units_hourly_config,
  DROP FOREIGN KEY fk_bookable_units_hourly_price_currency_id,
  DROP INDEX fk_bookable_units_hourly_price_currency_id,
  DROP COLUMN hourly_available_until,
  DROP COLUMN hourly_available_from,
  DROP COLUMN hourly_max_duration_hours,
  DROP COLUMN hourly_min_duration_hours,
  DROP COLUMN hourly_price_currency_id,
  DROP COLUMN hourly_price_amount,
  DROP COLUMN hourly_enabled;

ALTER TABLE bookings
  DROP FOREIGN KEY fk_bookings_display_currency_id,
  DROP COLUMN display_currency_id,
  DROP COLUMN fx_amd_per_unit,
  DROP COLUMN fx_effective_at,
  DROP COLUMN display_subtotal_amount,
  DROP COLUMN display_total_amount;

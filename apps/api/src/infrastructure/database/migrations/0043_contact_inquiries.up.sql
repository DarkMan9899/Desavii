-- Sprint G (public Contact form): the smallest coherent persistence a
-- public "contact us" inquiry needs — two small dedicated lookups
-- (mirroring `advertisement_statuses`' own precedent of a table-specific
-- lookup seeded in `001_lookups.js` despite its table living in a much
-- later migration (0010), rather than
-- reusing `moderation_statuses`, whose PENDING/APPROVED/REJECTED/
-- FLAGGED vocabulary doesn't fit a simple new/resolved inbox) plus the
-- inquiries table itself. No soft-delete triad: inquiries are never
-- deleted, only resolved, and are submitted anonymously (no
-- `created_by` — there is no authenticated submitter to attribute the
-- row to).

CREATE TABLE IF NOT EXISTS contact_inquiry_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT uq_contact_inquiry_types_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_inquiry_statuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT uq_contact_inquiry_statuses_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type_id BIGINT UNSIGNED NOT NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  resolved_at DATETIME(3) NULL,
  resolved_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_contact_inquiries_type_id FOREIGN KEY (type_id) REFERENCES contact_inquiry_types (id),
  CONSTRAINT fk_contact_inquiries_status_id FOREIGN KEY (status_id) REFERENCES contact_inquiry_statuses (id),
  CONSTRAINT fk_contact_inquiries_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (id),
  KEY idx_contact_inquiries_type_id (type_id),
  KEY idx_contact_inquiries_status_id (status_id),
  KEY idx_contact_inquiries_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

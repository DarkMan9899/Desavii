-- Sprint H (Blog + Marketing/SMM CMS). Deliberately NOT built on
-- `cms_pages`/`cms_page_translations` (Sprint G's Contact form's own
-- 001_lookups.js precedent already applies here: a genuinely new domain
-- concept gets its own additive tables rather than retrofitting a
-- table designed for something else) — `cms_pages` is a single
-- title+body pair per locale with no author/category/tag/cover/publish-
-- timestamp semantics, and article content needs all of those. Follows
-- `listings`/`listing_translations`' own shape instead: one canonical
-- slug per post (shared across locales, matching every other slugged
-- entity in this codebase — listings, partners, cms_pages), full i18n
-- content per locale via `blog_post_translations`.
--
-- Status vocabulary mirrors `listing_statuses`' shape exactly (id/code/
-- name lookup, seeded in 001_lookups.js). DRAFT -> SCHEDULED|PUBLISHED,
-- PUBLISHED <-> ARCHIVED (an editor can re-publish an archived post),
-- SCHEDULED -> PUBLISHED (via the sweep job) or back to DRAFT. No
-- hard-delete path in the domain — ARCHIVED is the "removed from public
-- view, data preserved" terminal-ish state (spec §22/§40).
--
-- `blog_categories`/`blog_category_translations` mirror
-- `listing_categories`/`listing_category_translations`' shape minus the
-- hierarchical `parent_id` (blog categories are a flat editorial list,
-- spec §12 — "Do NOT mix Blog editorial categories with public
-- marketplace listing categories"). Tags reuse the existing, currently-
-- unused `tags`/`tag_translations` tables (migration 0004) via a new
-- pivot — genuinely generic, dormant infrastructure, not something the
-- marketplace side already depends on (`listing_tag` is the only other
-- consumer, and shares the exact same reuse rationale).
--
-- Cover image reuses the existing polymorphic `media` table
-- (`mediable_type = 'blog_post'`, migration 0006) — no dedicated FK
-- column, same "no formal FK on the mediable pair" convention every
-- other mediable entity already follows.

CREATE TABLE IF NOT EXISTS blog_post_statuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT uq_blog_post_statuses_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blog_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(180) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT uq_blog_categories_slug UNIQUE (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blog_category_translations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  blog_category_id BIGINT UNSIGNED NOT NULL,
  language_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT uq_blog_category_translations_category_id_language_id UNIQUE (blog_category_id, language_id),
  CONSTRAINT fk_blog_category_translations_category_id FOREIGN KEY (blog_category_id) REFERENCES blog_categories (id),
  CONSTRAINT fk_blog_category_translations_language_id FOREIGN KEY (language_id) REFERENCES languages (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blog_posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(180) NOT NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  published_at DATETIME(3) NULL COMMENT 'Set once, the first time a post genuinely goes live — never cleared by unpublish, so "originally published" stays knowable.',
  scheduled_at DATETIME(3) NULL COMMENT 'Only meaningful while status = SCHEDULED; the sweep job (and the public read query, independently) treat the post as due once this passes.',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  published_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_blog_posts_slug UNIQUE (slug),
  CONSTRAINT fk_blog_posts_status_id FOREIGN KEY (status_id) REFERENCES blog_post_statuses (id),
  CONSTRAINT fk_blog_posts_category_id FOREIGN KEY (category_id) REFERENCES blog_categories (id),
  CONSTRAINT fk_blog_posts_author_user_id FOREIGN KEY (author_user_id) REFERENCES users (id),
  CONSTRAINT fk_blog_posts_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_blog_posts_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT fk_blog_posts_published_by FOREIGN KEY (published_by) REFERENCES users (id),
  KEY idx_blog_posts_status_id (status_id),
  KEY idx_blog_posts_category_id (category_id),
  KEY idx_blog_posts_author_user_id (author_user_id),
  KEY idx_blog_posts_published_at (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blog_post_translations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  blog_post_id BIGINT UNSIGNED NOT NULL,
  language_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  excerpt VARCHAR(500) NOT NULL,
  body MEDIUMTEXT NOT NULL COMMENT 'Markdown source, never raw HTML — rendered safely client-side (react-markdown + rehype-sanitize, no raw-HTML passthrough), spec §11/§42.',
  seo_title VARCHAR(255) NULL,
  seo_description VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT uq_blog_post_translations_post_id_language_id UNIQUE (blog_post_id, language_id),
  CONSTRAINT fk_blog_post_translations_post_id FOREIGN KEY (blog_post_id) REFERENCES blog_posts (id),
  CONSTRAINT fk_blog_post_translations_language_id FOREIGN KEY (language_id) REFERENCES languages (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blog_post_tags (
  blog_post_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (blog_post_id, tag_id),
  CONSTRAINT fk_blog_post_tags_post_id FOREIGN KEY (blog_post_id) REFERENCES blog_posts (id),
  CONSTRAINT fk_blog_post_tags_tag_id FOREIGN KEY (tag_id) REFERENCES tags (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

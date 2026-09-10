/**
 * MySQL-backed Blog repository (Sprint H).
 *
 * `blog_posts`/`blog_post_translations` follow `listings`/
 * `listing_translations`' shape (one canonical slug, full i18n content
 * per locale); translation upsert/list mirrors `mysqlCmsRepository.js`'s
 * exact convention. Cover image reuses the polymorphic `media` table
 * (`mediable_type = 'blog_post'`), following `mysqlListingRepository.js`'s
 * own `attachMedia`/`findMediaById` shape — a single-slot cover, not a
 * gallery, so no `position`/multi-row bookkeeping is needed.
 *
 * The public "is this post visible" rule lives here, not just in the
 * sweep job (spec §23: "public truth should remain safe even if a
 * background job is delayed") — `#publicVisibilityClause` treats a
 * SCHEDULED post as visible once `scheduled_at <= NOW()`, independent of
 * whether the sweep has already flipped its status row to PUBLISHED.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';

function toPostDomain(row) {
  return {
    id: row.id,
    slug: row.slug,
    statusCode: row.status_code,
    categoryId: row.category_id,
    categorySlug: row.category_slug ?? null,
    authorUserId: row.author_user_id,
    authorFirstName: row.author_first_name,
    authorLastName: row.author_last_name,
    publishedAt: row.published_at,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTranslationDomain(row) {
  return {
    languageId: row.language_id,
    languageCode: row.language_code,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

function toMediaDomain(row) {
  return {
    id: row.id,
    url: row.url,
    mimeType: row.mime_type,
    altText: row.alt_text ?? null,
  };
}

const POST_SELECT = `
  SELECT p.id, p.slug, p.category_id, p.author_user_id, p.published_at,
         p.scheduled_at, p.created_at, p.updated_at,
         bps.code AS status_code,
         bc.slug AS category_slug,
         u.first_name AS author_first_name, u.last_name AS author_last_name
  FROM blog_posts p
  JOIN blog_post_statuses bps ON bps.id = p.status_id
  LEFT JOIN blog_categories bc ON bc.id = p.category_id
  JOIN users u ON u.id = p.author_user_id
`;

export class MySqlBlogRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async #run(sql, params, connection = this.#pool) {
    try {
      return await connection.query(sql, params);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async findStatusIdByCode(code, connection = this.#pool) {
    const [rows] = await this.#run(
      'SELECT id FROM blog_post_statuses WHERE code = ?',
      [code],
      connection,
    );
    return rows[0]?.id ?? null;
  }

  /** Mirrors `mysqlCmsRepository.js#findLanguageIdByCode` exactly — kept
   * on this repository (rather than calling the shared
   * `resolveLocaleIds` helper directly from the Service) so
   * `BlogService` stays fully unit-testable against a mocked
   * repository, the same DI convention every other method here follows. */
  async findLanguageIdByCode(code, connection = this.#pool) {
    const [rows] = await this.#run(
      'SELECT id FROM languages WHERE code = ?',
      [code],
      connection,
    );
    return rows[0]?.id ?? null;
  }

  async findCategoryIdBySlug(slug, connection = this.#pool) {
    const [rows] = await this.#run(
      'SELECT id FROM blog_categories WHERE slug = ?',
      [slug],
      connection,
    );
    return rows[0]?.id ?? null;
  }

  /** Localized, alphabetically-stable category list for pickers/filters. */
  async listCategories(languageCode) {
    const [rows] = await this.#run(
      `SELECT bc.id, bc.slug, COALESCE(t.name, dt.name) AS name
       FROM blog_categories bc
       LEFT JOIN blog_category_translations t
         ON t.blog_category_id = bc.id
         AND t.language_id = (SELECT id FROM languages WHERE code = ? LIMIT 1)
       LEFT JOIN blog_category_translations dt
         ON dt.blog_category_id = bc.id
         AND dt.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       ORDER BY name ASC`,
      [languageCode],
    );
    return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name }));
  }

  async listTags(languageCode) {
    const [rows] = await this.#run(
      `SELECT t.id, t.slug, COALESCE(tt.name, dtt.name) AS name
       FROM tags t
       LEFT JOIN tag_translations tt
         ON tt.tag_id = t.id
         AND tt.language_id = (SELECT id FROM languages WHERE code = ? LIMIT 1)
       LEFT JOIN tag_translations dtt
         ON dtt.tag_id = t.id
         AND dtt.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       ORDER BY name ASC`,
      [languageCode],
    );
    return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name }));
  }

  /** Insert-or-reuse by slug (a Marketing author typing a brand-new tag name), matching `taxonomy` seed's own upsert-by-slug idiom. */
  async findOrCreateTagBySlug(slug, name, connection = this.#pool) {
    await this.#run(
      `INSERT INTO tags (slug, name) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE slug = slug`,
      [slug, name],
      connection,
    );
    const [rows] = await this.#run(
      'SELECT id FROM tags WHERE slug = ?',
      [slug],
      connection,
    );
    return rows[0].id;
  }

  async setPostTags(postId, tagIds, connection = this.#pool) {
    await this.#run(
      'DELETE FROM blog_post_tags WHERE blog_post_id = ?',
      [postId],
      connection,
    );
    if (tagIds.length === 0) return;
    const placeholders = tagIds.map(() => '(?, ?)').join(', ');
    const values = tagIds.flatMap((tagId) => [postId, tagId]);
    await this.#run(
      `INSERT INTO blog_post_tags (blog_post_id, tag_id) VALUES ${placeholders}`,
      values,
      connection,
    );
  }

  async listTagsForPost(postId, languageCode) {
    const [rows] = await this.#run(
      `SELECT t.id, t.slug, COALESCE(tt.name, dtt.name) AS name
       FROM blog_post_tags bpt
       JOIN tags t ON t.id = bpt.tag_id
       LEFT JOIN tag_translations tt
         ON tt.tag_id = t.id
         AND tt.language_id = (SELECT id FROM languages WHERE code = ? LIMIT 1)
       LEFT JOIN tag_translations dtt
         ON dtt.tag_id = t.id
         AND dtt.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       WHERE bpt.blog_post_id = ?
       ORDER BY name ASC`,
      [languageCode, postId],
    );
    return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name }));
  }

  async slugExists(slug, { excludeId = null } = {}) {
    const params = excludeId ? [slug, excludeId] : [slug];
    const [rows] = await this.#run(
      `SELECT id FROM blog_posts WHERE slug = ? ${excludeId ? 'AND id != ?' : ''} LIMIT 1`,
      params,
    );
    return rows.length > 0;
  }

  async create(
    { slug, statusId, categoryId, authorUserId, createdBy },
    connection = this.#pool,
  ) {
    const [result] = await this.#run(
      `INSERT INTO blog_posts
         (slug, status_id, category_id, author_user_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [slug, statusId, categoryId, authorUserId, createdBy, createdBy],
      connection,
    );
    return result.insertId;
  }

  async findById(id, connection = this.#pool) {
    const [rows] = await this.#run(
      `${POST_SELECT} WHERE p.id = ? LIMIT 1`,
      [id],
      connection,
    );
    return rows[0] ? toPostDomain(rows[0]) : null;
  }

  async findBySlug(slug, connection = this.#pool) {
    const [rows] = await this.#run(
      `${POST_SELECT} WHERE p.slug = ? LIMIT 1`,
      [slug],
      connection,
    );
    return rows[0] ? toPostDomain(rows[0]) : null;
  }

  /** Public read: only a genuinely visible post (published now, or scheduled and already due) — the sweep is a convenience, never the sole authority. */
  async findVisibleBySlug(slug) {
    const [rows] = await this.#run(
      `${POST_SELECT}
       WHERE p.slug = ?
         AND (
           bps.code = 'PUBLISHED'
           OR (bps.code = 'SCHEDULED' AND p.scheduled_at <= UTC_TIMESTAMP(3))
         )
       LIMIT 1`,
      [slug],
    );
    return rows[0] ? toPostDomain(rows[0]) : null;
  }

  async listTranslationsForPost(postId, connection = this.#pool) {
    const [rows] = await this.#run(
      `SELECT t.language_id, l.code AS language_code, t.title, t.excerpt,
              t.body, t.seo_title, t.seo_description
       FROM blog_post_translations t
       JOIN languages l ON l.id = t.language_id
       WHERE t.blog_post_id = ?
       ORDER BY l.code ASC`,
      [postId],
      connection,
    );
    return rows.map(toTranslationDomain);
  }

  async upsertTranslation(
    postId,
    languageId,
    { title, excerpt, body, seoTitle, seoDescription },
    connection = this.#pool,
  ) {
    await this.#run(
      `INSERT INTO blog_post_translations
         (blog_post_id, language_id, title, excerpt, body, seo_title, seo_description)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), excerpt = VALUES(excerpt), body = VALUES(body),
         seo_title = VALUES(seo_title), seo_description = VALUES(seo_description)`,
      [
        postId,
        languageId,
        title,
        excerpt,
        body,
        seoTitle ?? null,
        seoDescription ?? null,
      ],
      connection,
    );
  }

  /** Public read: a specific locale's translation for a visible post, falling back to the platform default language. */
  async findVisibleTranslation(slug, languageCode) {
    const post = await this.findVisibleBySlug(slug);
    if (!post) return null;

    const [rows] = await this.#run(
      `SELECT t.language_id, l.code AS language_code, t.title, t.excerpt,
              t.body, t.seo_title, t.seo_description
       FROM blog_post_translations t
       JOIN languages l ON l.id = t.language_id
       WHERE t.blog_post_id = ? AND l.code = ?
       LIMIT 1`,
      [post.id, languageCode],
    );
    if (rows[0]) return { post, translation: toTranslationDomain(rows[0]) };

    const [fallbackRows] = await this.#run(
      `SELECT t.language_id, l.code AS language_code, t.title, t.excerpt,
              t.body, t.seo_title, t.seo_description
       FROM blog_post_translations t
       JOIN languages l ON l.id = t.language_id
       WHERE t.blog_post_id = ? AND l.is_default = 1
       LIMIT 1`,
      [post.id],
    );
    return fallbackRows[0]
      ? { post, translation: toTranslationDomain(fallbackRows[0]) }
      : null;
  }

  async updateFields(id, fields, connection = this.#pool) {
    const assignments = [];
    const values = [];
    const columnByField = {
      slug: 'slug',
      statusId: 'status_id',
      categoryId: 'category_id',
      publishedAt: 'published_at',
      scheduledAt: 'scheduled_at',
      updatedBy: 'updated_by',
      publishedBy: 'published_by',
    };
    Object.entries(fields).forEach(([field, value]) => {
      const column = columnByField[field];
      if (!column || value === undefined) return;
      assignments.push(`${column} = ?`);
      values.push(value);
    });
    if (assignments.length === 0) return this.findById(id, connection);
    await this.#run(
      `UPDATE blog_posts SET ${assignments.join(', ')} WHERE id = ?`,
      [...values, id],
      connection,
    );
    return this.findById(id, connection);
  }

  /** Admin/Marketing list — every status, optional filters, simple bounded `limit` (spec §19/§37, same "no full pagination system for a moderate-volume list" convention `MySqlContactRepository#list` already establishes). */
  async list({
    limit = 50,
    statusCode,
    categoryId,
    authorUserId,
    search,
  } = {}) {
    const effectiveLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const conditions = [];
    const params = [];
    if (statusCode) {
      conditions.push('bps.code = ?');
      params.push(statusCode);
    }
    if (categoryId) {
      conditions.push('p.category_id = ?');
      params.push(categoryId);
    }
    if (authorUserId) {
      conditions.push('p.author_user_id = ?');
      params.push(authorUserId);
    }
    if (search) {
      conditions.push(
        `EXISTS (SELECT 1 FROM blog_post_translations bpt WHERE bpt.blog_post_id = p.id AND bpt.title LIKE ?)`,
      );
      params.push(`%${search}%`);
    }
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await this.#run(
      `${POST_SELECT} ${whereClause} ORDER BY p.updated_at DESC LIMIT ?`,
      [...params, effectiveLimit],
    );
    return rows.map(toPostDomain);
  }

  /** Public list — only visible posts (spec §23's same due-scheduled-post rule as `findVisibleBySlug`), optional category/tag filter. */
  async listVisible({
    limit = 20,
    cursor = 0,
    categorySlug,
    tagSlug,
    languageCode,
  }) {
    const effectiveLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const conditions = [
      `(bps.code = 'PUBLISHED' OR (bps.code = 'SCHEDULED' AND p.scheduled_at <= UTC_TIMESTAMP(3)))`,
    ];
    const params = [];
    let joinClause = '';
    if (categorySlug) {
      conditions.push('bc.slug = ?');
      params.push(categorySlug);
    }
    if (tagSlug) {
      joinClause = `JOIN blog_post_tags bpt ON bpt.blog_post_id = p.id
                     JOIN tags tg ON tg.id = bpt.tag_id`;
      conditions.push('tg.slug = ?');
      params.push(tagSlug);
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const [[{ total }]] = await this.#run(
      `SELECT COUNT(DISTINCT p.id) AS total
       FROM blog_posts p
       JOIN blog_post_statuses bps ON bps.id = p.status_id
       LEFT JOIN blog_categories bc ON bc.id = p.category_id
       ${joinClause}
       ${whereClause}`,
      params,
    );
    const [rows] = await this.#run(
      `SELECT DISTINCT p.id, p.slug, p.category_id, p.author_user_id,
              p.published_at, p.scheduled_at, p.created_at, p.updated_at,
              bps.code AS status_code, bc.slug AS category_slug,
              u.first_name AS author_first_name, u.last_name AS author_last_name,
              COALESCE(bpt_loc.title, bpt_def.title) AS title,
              COALESCE(bpt_loc.excerpt, bpt_def.excerpt) AS excerpt
       FROM blog_posts p
       JOIN blog_post_statuses bps ON bps.id = p.status_id
       LEFT JOIN blog_categories bc ON bc.id = p.category_id
       JOIN users u ON u.id = p.author_user_id
       LEFT JOIN blog_post_translations bpt_loc
         ON bpt_loc.blog_post_id = p.id
         AND bpt_loc.language_id = (SELECT id FROM languages WHERE code = ? LIMIT 1)
       LEFT JOIN blog_post_translations bpt_def
         ON bpt_def.blog_post_id = p.id
         AND bpt_def.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       ${joinClause}
       ${whereClause}
       ORDER BY p.published_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [languageCode, ...params, effectiveLimit, Number(cursor) || 0],
    );
    return {
      rows: rows.map((row) => ({
        ...toPostDomain(row),
        title: row.title,
        excerpt: row.excerpt,
      })),
      total: Number(total),
    };
  }

  async findDuePosts(connection = this.#pool) {
    const [rows] = await this.#run(
      `${POST_SELECT}
       WHERE bps.code = 'SCHEDULED' AND p.scheduled_at <= UTC_TIMESTAMP(3)`,
      [],
      connection,
    );
    return rows.map(toPostDomain);
  }

  // --- Cover media (single-slot, reuses the polymorphic `media` table) ---

  async findCoverMedia(postId, connection = this.#pool) {
    const [rows] = await this.#run(
      `SELECT m.id, m.url, m.mime_type,
              trans.alt_text
       FROM media m
       LEFT JOIN media_translations trans
         ON trans.media_id = m.id
         AND trans.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       WHERE m.mediable_type = 'blog_post' AND m.mediable_id = ?
         AND m.is_cover = 1 AND m.deleted_at IS NULL
       LIMIT 1`,
      [postId],
      connection,
    );
    return rows[0] ? toMediaDomain(rows[0]) : null;
  }

  async setCoverMedia(
    { postId, url, mimeType, fileSizeBytes, ownerUserId, altText },
    connection = this.#pool,
  ) {
    const existing = await this.findCoverMedia(postId, connection);
    if (existing) {
      await this.#run(
        `UPDATE media
         SET deleted_at = CURRENT_TIMESTAMP(3), deleted_by = ?
         WHERE id = ?`,
        [ownerUserId, existing.id],
        connection,
      );
    }

    const [[mediaType]] = await this.#run(
      "SELECT id FROM media_types WHERE code = 'IMAGE'",
      [],
      connection,
    );
    const [[completedStatus]] = await this.#run(
      "SELECT id FROM media_upload_statuses WHERE code = 'COMPLETED'",
      [],
      connection,
    );
    const [[approvedStatus]] = await this.#run(
      "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
      [],
      connection,
    );

    const [result] = await this.#run(
      `INSERT INTO media
         (mediable_type, mediable_id, media_type_id, url, position, is_cover,
          upload_status_id, moderation_status_id, mime_type, file_size_bytes,
          owner_user_id, created_by, updated_by)
       VALUES ('blog_post', ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        postId,
        mediaType.id,
        url,
        completedStatus.id,
        approvedStatus.id,
        mimeType,
        fileSizeBytes,
        ownerUserId,
        ownerUserId,
        ownerUserId,
      ],
      connection,
    );

    if (altText) {
      const [[defaultLanguage]] = await this.#run(
        'SELECT id FROM languages WHERE is_default = 1 LIMIT 1',
        [],
        connection,
      );
      await this.#run(
        `INSERT INTO media_translations (media_id, language_id, alt_text)
         VALUES (?, ?, ?)`,
        [result.insertId, defaultLanguage.id, altText],
        connection,
      );
    }

    return this.findCoverMedia(postId, connection);
  }

  async removeCoverMedia(postId, removedByUserId, connection = this.#pool) {
    await this.#run(
      `UPDATE media
       SET deleted_at = CURRENT_TIMESTAMP(3), deleted_by = ?
       WHERE mediable_type = 'blog_post' AND mediable_id = ?
         AND is_cover = 1 AND deleted_at IS NULL`,
      [removedByUserId, postId],
      connection,
    );
  }
}

export default MySqlBlogRepository;

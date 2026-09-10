/**
 * BlogService — Sprint H (Blog + Marketing/SMM CMS).
 *
 * Two independently-checked permissions (`004_roles_and_permissions.js`'s
 * own header explains the split): `blog.manage` for the authoring
 * surface, `blog.publish` for anything that changes public visibility
 * (publish/unpublish/schedule/unschedule). ADMIN/SUPER_ADMIN hold both
 * automatically; MARKETING holds both here too (see that file).
 *
 * Body content is Markdown, stored verbatim — the XSS boundary is
 * render-time (`react-markdown` + `rehype-sanitize`, no raw-HTML
 * passthrough), not a write-time filter here; see this module's README
 * or `blogService.test.js`'s own security-focused cases for the
 * reasoning (spec §11/§42).
 */

import { randomUUID } from 'node:crypto';
import {
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  ConflictError,
} from '../../../errors/AppError.js';
import { slugify } from '../../../core/domain/slugify.js';
import {
  isAllowedMimeType,
  isWithinSizeLimit,
  classifyMimeType,
} from '../../media/validators/mediaConstraints.js';
import { withTransaction } from '../../../infrastructure/database/transaction.js';

const MANAGE_PERMISSION = 'blog.manage';
const PUBLISH_PERMISSION = 'blog.publish';

function ensureNonNumericSlug(slug) {
  return /^\d+$/.test(slug) ? `post-${slug}` : slug;
}

const ASSIGN_MARKETING_PERMISSION = 'marketing.assign';

export class BlogService {
  #repository;

  #permissionResolver;

  #auditLogger;

  #storageProvider;

  #userService;

  constructor({
    repository,
    permissionResolver,
    auditLogger,
    storageProvider,
    userService,
  }) {
    this.#repository = repository;
    this.#permissionResolver = permissionResolver;
    this.#auditLogger = auditLogger;
    this.#storageProvider = storageProvider;
    this.#userService = userService;
  }

  async #assertCanManage(principal) {
    if (!principal) throw new AuthenticationError();
    const granted = await this.#permissionResolver.hasPermission(
      principal.roles,
      MANAGE_PERMISSION,
    );
    if (!granted) throw new AuthorizationError();
  }

  async #assertCanAssignMarketing(principal) {
    if (!principal) throw new AuthenticationError();
    const granted = await this.#permissionResolver.hasPermission(
      principal.roles,
      ASSIGN_MARKETING_PERMISSION,
    );
    if (!granted) throw new AuthorizationError();
  }

  // --- Marketing/SMM role assignment (spec §17, `marketing.assign`) —
  // deliberately a plain user-id input, not a user picker, same
  // rationale `ManagerService#promoteToManager`'s own header gives: an
  // Admin already knows which existing user (found via `/admin/users`)
  // they mean, and a second user-search UI here would just duplicate
  // that page. Reuses `UserService#assignRole`/`#revokeRole`, never a
  // parallel role-assignment mechanism. ---

  async promoteToMarketing(principal, userId) {
    await this.#assertCanAssignMarketing(principal);
    const user = await this.#userService.findById(userId);
    if (!user) throw new NotFoundError('User not found.');

    await this.#userService.assignRole(userId, 'MARKETING');
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'marketing.role_granted',
      targetType: 'user',
      targetId: userId,
    });
    return { userId, role: 'MARKETING', granted: true };
  }

  async demoteFromMarketing(principal, userId) {
    await this.#assertCanAssignMarketing(principal);
    const user = await this.#userService.findById(userId);
    if (!user) throw new NotFoundError('User not found.');

    await this.#userService.revokeRole(userId, 'MARKETING');
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'marketing.role_revoked',
      targetType: 'user',
      targetId: userId,
    });
    return { userId, role: 'MARKETING', granted: false };
  }

  async #assertCanPublish(principal) {
    if (!principal) throw new AuthenticationError();
    const granted = await this.#permissionResolver.hasPermission(
      principal.roles,
      PUBLISH_PERMISSION,
    );
    if (!granted) throw new AuthorizationError();
  }

  async #audit(principal, action, targetId, before, after) {
    await this.#auditLogger.record({
      actorId: principal.userId,
      action,
      targetType: 'blog_post',
      targetId,
      beforeSnapshot: before,
      afterSnapshot: after,
    });
  }

  async #assertUniqueSlug(slug, excludeId = null) {
    const exists = await this.#repository.slugExists(slug, { excludeId });
    if (exists) {
      throw new ConflictError(
        'This slug is already in use.',
        'SLUG_ALREADY_EXISTS',
      );
    }
  }

  async #composeDetail(post) {
    const [translations, tags, cover] = await Promise.all([
      this.#repository.listTranslationsForPost(post.id),
      this.#repository.listTagsForPost(post.id, 'en'),
      this.#repository.findCoverMedia(post.id),
    ]);
    return { ...post, translations, tags, cover };
  }

  // --- Marketing/Admin authoring surface (`blog.manage`) ---

  async listCategories(languageCode) {
    return this.#repository.listCategories(languageCode);
  }

  async listTags(languageCode) {
    return this.#repository.listTags(languageCode);
  }

  async createDraft(principal, { title, languageCode = 'en' }) {
    await this.#assertCanManage(principal);
    if (!title?.trim()) {
      throw new ValidationError('A title is required.', [
        { field: 'title', issue: 'REQUIRED' },
      ]);
    }

    let slug = slugify(title);
    if (!slug) slug = randomUUID().slice(0, 8);
    slug = ensureNonNumericSlug(slug);
    await this.#assertUniqueSlug(slug);

    const [statusId, localeId] = await Promise.all([
      this.#repository.findStatusIdByCode('DRAFT'),
      this.#repository.findLanguageIdByCode(languageCode),
    ]);
    if (!localeId) {
      throw new ValidationError(`Unknown language code "${languageCode}".`);
    }

    const postId = await withTransaction(async (connection) => {
      const id = await this.#repository.create(
        {
          slug,
          statusId,
          categoryId: null,
          authorUserId: principal.userId,
          createdBy: principal.userId,
        },
        connection,
      );
      await this.#repository.upsertTranslation(
        id,
        localeId,
        { title: title.trim(), excerpt: '', body: '' },
        connection,
      );
      return id;
    });

    await this.#audit(principal, 'blog.post_created', postId, null, { slug });
    return this.getPostDetail(principal, postId);
  }

  async listPosts(principal, filters = {}) {
    await this.#assertCanManage(principal);
    return this.#repository.list(filters);
  }

  async getPostDetail(principal, id) {
    await this.#assertCanManage(principal);
    const post = await this.#repository.findById(id);
    if (!post) throw new NotFoundError('Blog post not found.');
    return this.#composeDetail(post);
  }

  async updateSettings(principal, id, { slug, categorySlug, tagNames }) {
    await this.#assertCanManage(principal);
    const post = await this.#repository.findById(id);
    if (!post) throw new NotFoundError('Blog post not found.');

    const fields = { updatedBy: principal.userId };

    if (slug !== undefined) {
      const normalizedSlug = ensureNonNumericSlug(slugify(slug));
      if (!normalizedSlug) {
        throw new ValidationError('A valid slug could not be derived.', [
          { field: 'slug', issue: 'INVALID' },
        ]);
      }
      if (normalizedSlug !== post.slug) {
        await this.#assertUniqueSlug(normalizedSlug, id);
      }
      fields.slug = normalizedSlug;
    }

    if (categorySlug !== undefined) {
      if (categorySlug === null) {
        fields.categoryId = null;
      } else {
        const categoryId =
          await this.#repository.findCategoryIdBySlug(categorySlug);
        if (!categoryId) {
          throw new ValidationError('Unknown category.', [
            { field: 'categorySlug', issue: 'INVALID' },
          ]);
        }
        fields.categoryId = categoryId;
      }
    }

    const updated = await this.#repository.updateFields(id, fields);

    if (tagNames !== undefined) {
      const tagIds = await Promise.all(
        tagNames
          .map((name) => name.trim())
          .filter(Boolean)
          .slice(0, 20)
          .map((name) =>
            this.#repository.findOrCreateTagBySlug(slugify(name), name),
          ),
      );
      await this.#repository.setPostTags(id, [...new Set(tagIds)]);
    }

    await this.#audit(
      principal,
      'blog.post_settings_updated',
      id,
      post,
      updated,
    );
    return this.getPostDetail(principal, id);
  }

  async upsertTranslation(
    principal,
    id,
    languageCode,
    { title, excerpt, body, seoTitle, seoDescription },
  ) {
    await this.#assertCanManage(principal);
    const post = await this.#repository.findById(id);
    if (!post) throw new NotFoundError('Blog post not found.');

    const localeId = await this.#repository.findLanguageIdByCode(languageCode);
    if (!localeId) {
      throw new ValidationError(`Unknown language code "${languageCode}".`);
    }

    await this.#repository.upsertTranslation(id, localeId, {
      title,
      excerpt,
      body,
      seoTitle,
      seoDescription,
    });
    await this.#audit(principal, 'blog.post_translation_updated', id, null, {
      languageCode,
    });
    return this.getPostDetail(principal, id);
  }

  async attachCoverImage(principal, id, buffer, mimeType, altText) {
    await this.#assertCanManage(principal);
    const post = await this.#repository.findById(id);
    if (!post) throw new NotFoundError('Blog post not found.');

    // Cover images are photography, never video/PDF — a narrower
    // acceptance than `isAllowedMimeType`'s full image/video/document set.
    if (
      !isAllowedMimeType(mimeType) ||
      classifyMimeType(mimeType) !== 'image'
    ) {
      throw new ValidationError(
        'Cover image must be a JPEG, PNG, or WebP file.',
      );
    }
    if (!isWithinSizeLimit(mimeType, buffer.length)) {
      throw new ValidationError(
        'Cover image exceeds the maximum allowed size.',
      );
    }

    const extension = mimeType.split('/')[1];
    const key = `blog/${id}/cover-${Date.now()}.${extension}`;
    const { url } = await this.#storageProvider.put(key, buffer, {
      contentType: mimeType,
    });

    const cover = await this.#repository.setCoverMedia({
      postId: id,
      url,
      mimeType,
      fileSizeBytes: buffer.length,
      ownerUserId: principal.userId,
      altText,
    });

    await this.#audit(principal, 'blog.post_cover_updated', id, null, {
      mediaId: cover.id,
    });
    return cover;
  }

  async removeCoverImage(principal, id) {
    await this.#assertCanManage(principal);
    const post = await this.#repository.findById(id);
    if (!post) throw new NotFoundError('Blog post not found.');
    await this.#repository.removeCoverMedia(id, principal.userId);
    await this.#audit(principal, 'blog.post_cover_removed', id, null, null);
  }

  // --- Publish/unpublish/schedule (`blog.publish`) ---

  async #assertPublishable(post) {
    const translations = await this.#repository.listTranslationsForPost(
      post.id,
    );
    const hasRealContent = translations.some(
      (t) => t.title?.trim() && t.body?.trim(),
    );
    if (!hasRealContent) {
      throw new ValidationError(
        'A post needs a title and body in at least one language before it can be published.',
        [{ field: 'translations', issue: 'INCOMPLETE' }],
      );
    }
  }

  async publish(principal, id) {
    await this.#assertCanPublish(principal);
    const post = await this.#repository.findById(id);
    if (!post) throw new NotFoundError('Blog post not found.');
    await this.#assertPublishable(post);

    const statusId = await this.#repository.findStatusIdByCode('PUBLISHED');
    const updated = await this.#repository.updateFields(id, {
      statusId,
      scheduledAt: null,
      publishedAt: post.publishedAt ?? new Date(),
      publishedBy: principal.userId,
      updatedBy: principal.userId,
    });

    await this.#audit(principal, 'blog.post_published', id, post, updated);
    return this.getPostDetail(principal, id);
  }

  async unpublish(principal, id) {
    await this.#assertCanPublish(principal);
    const post = await this.#repository.findById(id);
    if (!post) throw new NotFoundError('Blog post not found.');

    const statusId = await this.#repository.findStatusIdByCode('ARCHIVED');
    const updated = await this.#repository.updateFields(id, {
      statusId,
      updatedBy: principal.userId,
    });

    await this.#audit(principal, 'blog.post_unpublished', id, post, updated);
    return this.getPostDetail(principal, id);
  }

  async schedule(principal, id, scheduledAt) {
    await this.#assertCanPublish(principal);
    const post = await this.#repository.findById(id);
    if (!post) throw new NotFoundError('Blog post not found.');
    await this.#assertPublishable(post);

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      throw new ValidationError('Scheduled time must be a real, future date.', [
        { field: 'scheduledAt', issue: 'INVALID' },
      ]);
    }

    const statusId = await this.#repository.findStatusIdByCode('SCHEDULED');
    const updated = await this.#repository.updateFields(id, {
      statusId,
      scheduledAt: scheduledDate,
      updatedBy: principal.userId,
    });

    await this.#audit(principal, 'blog.post_scheduled', id, post, updated);
    return this.getPostDetail(principal, id);
  }

  async unschedule(principal, id) {
    await this.#assertCanPublish(principal);
    const post = await this.#repository.findById(id);
    if (!post) throw new NotFoundError('Blog post not found.');

    const statusId = await this.#repository.findStatusIdByCode('DRAFT');
    const updated = await this.#repository.updateFields(id, {
      statusId,
      scheduledAt: null,
      updatedBy: principal.userId,
    });

    await this.#audit(principal, 'blog.post_unscheduled', id, post, updated);
    return this.getPostDetail(principal, id);
  }

  /** BullMQ sweep entry point (`jobs/scheduledPublishSweep.js`) — a convenience status flip, never the sole authority on public visibility (the repository's own visible-post queries already treat a due SCHEDULED post as visible). */
  async runScheduledPublishSweep() {
    const duePosts = await this.#repository.findDuePosts();
    const publishedStatusId =
      await this.#repository.findStatusIdByCode('PUBLISHED');

    await Promise.all(
      duePosts.map((post) =>
        this.#repository.updateFields(post.id, {
          statusId: publishedStatusId,
          scheduledAt: null,
          publishedAt: post.publishedAt ?? new Date(),
        }),
      ),
    );
    return { published: duePosts.length };
  }

  // --- Public read surface (no auth) ---

  async listPublicPosts({
    limit,
    cursor,
    categorySlug,
    tagSlug,
    languageCode,
  }) {
    const { rows, total } = await this.#repository.listVisible({
      limit,
      cursor,
      categorySlug,
      tagSlug,
      languageCode,
    });
    const withTags = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        tags: await this.#repository.listTagsForPost(row.id, languageCode),
        cover: await this.#repository.findCoverMedia(row.id),
      })),
    );
    return { rows: withTags, total };
  }

  async getPublicPost(slug, languageCode) {
    const result = await this.#repository.findVisibleTranslation(
      slug,
      languageCode,
    );
    if (!result) throw new NotFoundError('Post not found.');
    const [tags, cover] = await Promise.all([
      this.#repository.listTagsForPost(result.post.id, languageCode),
      this.#repository.findCoverMedia(result.post.id),
    ]);
    return { ...result.post, ...result.translation, tags, cover };
  }

  /** Simple, deterministic "same category, most recent, excluding self" — spec §27, never a recommendation engine. */
  async listRelatedPosts(post, languageCode, limit = 3) {
    if (!post.categoryId) return [];
    const { rows } = await this.#repository.listVisible({
      limit: limit + 1,
      categorySlug: post.categorySlug,
      languageCode,
    });
    return rows.filter((row) => row.id !== post.id).slice(0, limit);
  }
}

export default BlogService;

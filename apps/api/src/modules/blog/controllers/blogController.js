/**
 * Blog module Controller (Sprint H).
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> call Service ->
 * shape response. No business logic, no direct database access.
 */

import {
  toPostSummaryResponse,
  toPostDetailResponse,
  toPublicPostResponse,
  toCategoryResponse,
  toTagListResponse,
} from '../dto/blogDto.js';
import { ValidationError } from '../../../errors/AppError.js';

export function createBlogController(blogService) {
  return {
    // --- Admin/Marketing (`blog.manage` / `blog.publish`) ---

    async createDraft(req, res, next) {
      try {
        const post = await blogService.createDraft(
          req.principal,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toPostDetailResponse(post),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async list(req, res, next) {
      try {
        const rows = await blogService.listPosts(
          req.principal,
          req.validated.query,
        );
        res.status(200).json({
          success: true,
          data: rows.map(toPostSummaryResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getDetail(req, res, next) {
      try {
        const { id } = req.validated.params;
        const post = await blogService.getPostDetail(req.principal, id);
        res.status(200).json({
          success: true,
          data: toPostDetailResponse(post),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async updateSettings(req, res, next) {
      try {
        const { id } = req.validated.params;
        const post = await blogService.updateSettings(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toPostDetailResponse(post),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async upsertTranslation(req, res, next) {
      try {
        const { id, languageCode } = req.validated.params;
        const post = await blogService.upsertTranslation(
          req.principal,
          id,
          languageCode,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toPostDetailResponse(post),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async attachCover(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { altText } = req.validated.query;
        const buffer = req.body;
        const mimeType = req.headers['content-type'];

        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          throw new ValidationError('Request body must be a non-empty file.');
        }

        const cover = await blogService.attachCoverImage(
          req.principal,
          id,
          buffer,
          mimeType,
          altText,
        );
        res.status(201).json({
          success: true,
          data: { url: cover.url, alt_text: cover.altText },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async removeCover(req, res, next) {
      try {
        const { id } = req.validated.params;
        await blogService.removeCoverImage(req.principal, id);
        res.status(200).json({
          success: true,
          data: { deleted: true },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async publish(req, res, next) {
      try {
        const { id } = req.validated.params;
        const post = await blogService.publish(req.principal, id);
        res.status(200).json({
          success: true,
          data: toPostDetailResponse(post),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async unpublish(req, res, next) {
      try {
        const { id } = req.validated.params;
        const post = await blogService.unpublish(req.principal, id);
        res.status(200).json({
          success: true,
          data: toPostDetailResponse(post),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async schedule(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { scheduledAt } = req.validated.body;
        const post = await blogService.schedule(req.principal, id, scheduledAt);
        res.status(200).json({
          success: true,
          data: toPostDetailResponse(post),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async unschedule(req, res, next) {
      try {
        const { id } = req.validated.params;
        const post = await blogService.unschedule(req.principal, id);
        res.status(200).json({
          success: true,
          data: toPostDetailResponse(post),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- Public (no auth) ---

    async listPublic(req, res, next) {
      try {
        const { limit, cursor, category, tag, locale } = req.validated.query;
        const { rows, total } = await blogService.listPublicPosts({
          limit,
          cursor,
          categorySlug: category,
          tagSlug: tag,
          languageCode: locale ?? req.headers['accept-language'] ?? 'en',
        });
        res.status(200).json({
          success: true,
          data: rows.map(toPublicPostResponse),
          meta: { total },
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getPublicDetail(req, res, next) {
      try {
        const { slug } = req.validated.params;
        const { locale } = req.validated.query;
        const languageCode = locale ?? req.headers['accept-language'] ?? 'en';
        const post = await blogService.getPublicPost(slug, languageCode);
        const related = await blogService.listRelatedPosts(post, languageCode);
        res.status(200).json({
          success: true,
          data: {
            ...toPublicPostResponse(post),
            related: related.map(toPublicPostResponse),
          },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listPublicCategories(req, res, next) {
      try {
        const { locale } = req.validated.query;
        const categories = await blogService.listCategories(locale ?? 'en');
        res.status(200).json({
          success: true,
          data: categories.map(toCategoryResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listPublicTags(req, res, next) {
      try {
        const { locale } = req.validated.query;
        const tags = await blogService.listTags(locale ?? 'en');
        res.status(200).json({
          success: true,
          data: tags.map(toTagListResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- Marketing/SMM role assignment (`marketing.assign`) ---

    async promoteToMarketing(req, res, next) {
      try {
        const { userId } = req.validated.body;
        const result = await blogService.promoteToMarketing(
          req.principal,
          userId,
        );
        res.status(200).json({
          success: true,
          data: result,
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async demoteFromMarketing(req, res, next) {
      try {
        const { userId } = req.validated.body;
        const result = await blogService.demoteFromMarketing(
          req.principal,
          userId,
        );
        res.status(200).json({
          success: true,
          data: result,
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createBlogController;

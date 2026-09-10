/**
 * Blog module response DTOs (Sprint H). Public-facing shapes never
 * include `authorUserId`/email — only `author` display name (spec §14:
 * "Do not expose internal emails or sensitive account details").
 */

function toCoverResponse(cover) {
  if (!cover) return null;
  return { url: cover.url, alt_text: cover.altText };
}

function toTagResponse(tag) {
  return { id: tag.id, slug: tag.slug, name: tag.name };
}

/** Admin/Marketing list row — no translation payload, just enough to render a table row. */
export function toPostSummaryResponse(post) {
  return {
    id: post.id,
    slug: post.slug,
    status: post.statusCode,
    category_slug: post.categorySlug,
    author: `${post.authorFirstName} ${post.authorLastName}`.trim(),
    published_at: post.publishedAt,
    scheduled_at: post.scheduledAt,
    updated_at: post.updatedAt,
  };
}

/** Admin/Marketing full detail — every locale's translation, for the per-locale editor. */
export function toPostDetailResponse(post) {
  return {
    id: post.id,
    slug: post.slug,
    status: post.statusCode,
    category_id: post.categoryId,
    category_slug: post.categorySlug,
    author: `${post.authorFirstName} ${post.authorLastName}`.trim(),
    published_at: post.publishedAt,
    scheduled_at: post.scheduledAt,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    translations: post.translations.map((t) => ({
      language_code: t.languageCode,
      title: t.title,
      excerpt: t.excerpt,
      body: t.body,
      seo_title: t.seoTitle,
      seo_description: t.seoDescription,
    })),
    tags: post.tags.map(toTagResponse),
    cover: toCoverResponse(post.cover),
  };
}

/** Public list/detail — a single resolved locale, matching the visitor's own `locale`. */
export function toPublicPostResponse(post) {
  return {
    id: post.id,
    slug: post.slug,
    category_slug: post.categorySlug,
    author: `${post.authorFirstName} ${post.authorLastName}`.trim(),
    published_at: post.publishedAt,
    title: post.title,
    excerpt: post.excerpt,
    ...(post.body !== undefined ? { body: post.body } : {}),
    seo_title: post.seoTitle,
    seo_description: post.seoDescription,
    tags: post.tags.map(toTagResponse),
    cover: toCoverResponse(post.cover),
  };
}

export function toCategoryResponse(category) {
  return { id: category.id, slug: category.slug, name: category.name };
}

export function toTagListResponse(tag) {
  return toTagResponse(tag);
}

export default {
  toPostSummaryResponse,
  toPostDetailResponse,
  toPublicPostResponse,
  toCategoryResponse,
  toTagListResponse,
};

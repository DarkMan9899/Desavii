/**
 * BlogPostPageContent — `/:locale/blog/:slug` (Sprint H). New route —
 * the previous Blog experience had no article detail page at all. 404s
 * (via `usePublicPostQuery`, `GET /blog/posts/:slug`) for a draft/
 * unpublished/not-yet-due-scheduled slug — that visibility rule is
 * enforced server-side (`mysqlBlogRepository.js`), never client-side.
 *
 * Renders the body through `MarkdownContent` — the app's one XSS-safe
 * Markdown renderer (spec §42) — never a raw-HTML injection.
 */

import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { Newspaper } from 'lucide-react';
import { Badge } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { Spinner, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { Breadcrumbs } from '@desavii/ui/components/navigation';
import RouterLink from '../../../../components/RouterLink.jsx';
import MarkdownContent from '../../../../components/MarkdownContent/MarkdownContent.jsx';
import useSeo from '../../../../seo/useSeo.js';
import {
  buildBreadcrumbListSchema,
  buildArticleSchema,
} from '../../../../seo/structuredData.js';
import { usePublicPostQuery } from '../../queries/usePublicPostQuery.js';
import styles from './BlogPostPageContent.module.scss';

export default function BlogPostPageContent() {
  const { t, i18n } = useTranslation();
  const { locale, slug } = useParams();
  const {
    data: post,
    isPending,
    isError,
    error,
  } = usePublicPostQuery(slug, i18n.language);

  const breadcrumbItems = [
    { label: t('nav.home'), href: `/${locale}` },
    { label: t('blog.title'), href: `/${locale}/blog` },
    ...(post ? [{ label: post.title, href: `/${locale}/blog/${slug}` }] : []),
  ];

  useSeo({
    title: post
      ? `${post.seo_title || post.title} | ${t('app.name')}`
      : t('blog.title'),
    description: post?.seo_description || post?.excerpt,
    locale,
    path: `blog/${slug}`,
    image: post?.cover?.url,
    type: 'article',
    jsonLd: post
      ? [
          buildBreadcrumbListSchema(breadcrumbItems),
          buildArticleSchema({ post, locale, path: `blog/${slug}` }),
        ]
      : [buildBreadcrumbListSchema(breadcrumbItems)],
  });

  if (isPending) {
    return (
      <div className={styles.loading}>
        <Spinner label={t('blog.title')} />
      </div>
    );
  }

  if (isError) {
    if (error?.status === 404) {
      return (
        <ErrorState
          title={t('errors.notFound.title')}
          description={t('errors.notFound.description')}
        />
      );
    }
    return (
      <ErrorState
        title={t('blog.error.title')}
        retryLabel={t('blog.error.retry')}
      />
    );
  }

  // Derived from the real published body — never a stand-in figure — so
  // it stays truthful for a one-line post as much as a long itinerary.
  const readingMinutes = post.body
    ? Math.max(1, Math.round(post.body.trim().split(/\s+/).length / 200))
    : null;

  return (
    <article className={styles.page}>
      <Breadcrumbs items={breadcrumbItems} linkComponent={RouterLink} />

      <header className={styles.header}>
        {post.category_slug && (
          <p className={styles.eyebrow}>{post.category_slug}</p>
        )}
        <h1 className={styles.title}>{post.title}</h1>
        <p className={styles.meta}>
          {post.published_at && (
            <span>
              {new Date(post.published_at).toLocaleDateString(locale)}
            </span>
          )}
          {post.author && <span>{t('blog.by', { author: post.author })}</span>}
          {readingMinutes && (
            <span>{t('blog.readingTime', { count: readingMinutes })}</span>
          )}
        </p>
      </header>

      {post.cover && (
        <img
          className={styles.cover}
          src={post.cover.url}
          alt={post.cover.alt_text ?? post.title}
        />
      )}

      <MarkdownContent>{post.body ?? ''}</MarkdownContent>

      {post.tags?.length > 0 && (
        <div className={styles.tagsSection}>
          <p className={styles.tagsLabel}>{t('blog.tagged')}</p>
          <Inline gap="2" wrap>
            {post.tags.map((tag) => (
              <Badge
                key={tag.id}
                size="sm"
                variant="neutral"
                label={tag.name}
              />
            ))}
          </Inline>
        </div>
      )}

      {post.related?.length > 0 && (
        <Stack gap="4" className={styles.related}>
          <h2 className={styles.relatedHeading}>{t('blog.relatedPosts')}</h2>
          <div className={styles.relatedGrid}>
            {post.related.map((related) => (
              <Link
                key={related.id}
                to={`/${locale}/blog/${related.slug}`}
                className={styles.relatedCard}
              >
                {related.cover ? (
                  <img src={related.cover.url} alt="" />
                ) : (
                  <span
                    className={styles.relatedCardFallback}
                    aria-hidden="true"
                  >
                    <Newspaper size={20} />
                  </span>
                )}
                <span>{related.title}</span>
              </Link>
            ))}
          </div>
        </Stack>
      )}
    </article>
  );
}

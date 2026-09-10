/**
 * BlogPageContent — `/:locale/blog` (Sprint H). Replaces the previous
 * CMS-backed "coming soon" placeholder (`modules/cms/components/
 * BlogPageContent`, now deleted) with a real article index, backed by
 * the new `blog` module (`GET /blog/posts`, public, published/due-
 * scheduled posts only — see `mysqlBlogRepository.js`'s own header for
 * why that's server-authoritative, never filtered client-side).
 *
 * Category/tag filters live in the URL (`?category=`/`?tag=`), matching
 * FRONTEND_ARCHITECTURE.md's "search filters live in URL search params,
 * must be shareable/bookmarkable" rule every other filtered list page in
 * this app already follows.
 */

import { useCallback } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Newspaper } from 'lucide-react';
import { Select } from '@desavii/ui/components/form-controls';
import { Button, Badge } from '@desavii/ui/components/primitives';
import { Grid, Stack, Inline } from '@desavii/ui/components/layout';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import EditorialPageHero from '../../../../components/EditorialPageHero/EditorialPageHero.jsx';
import useSeo from '../../../../seo/useSeo.js';
import { buildBreadcrumbListSchema } from '../../../../seo/structuredData.js';
import { usePublicPostsQuery } from '../../queries/usePublicPostsQuery.js';
import {
  usePublicCategoriesQuery,
  usePublicTagsQuery,
} from '../../queries/usePublicTaxonomyQuery.js';
import styles from './BlogPageContent.module.scss';

const PAGE_SIZE = 12;

function BlogPostCard({ post, locale }) {
  const { t } = useTranslation();
  return (
    <Link to={`/${locale}/blog/${post.slug}`} className={styles.card}>
      <div className={styles.cardCover}>
        {post.cover ? (
          <img src={post.cover.url} alt={post.cover.alt_text ?? ''} />
        ) : (
          <span className={styles.cardCoverFallback} aria-hidden="true">
            <Newspaper size={28} />
          </span>
        )}
        {post.category_slug && (
          <Badge
            className={styles.cardCategory}
            size="sm"
            variant="neutral"
            label={post.category_slug}
          />
        )}
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{post.title}</h3>
        <p className={styles.cardExcerpt}>{post.excerpt}</p>
        <p className={styles.cardMeta}>
          {post.published_at
            ? new Date(post.published_at).toLocaleDateString(locale)
            : ''}
          {post.author ? ` · ${t('blog.by', { author: post.author })}` : ''}
        </p>
      </div>
    </Link>
  );
}

BlogPostCard.propTypes = {
  post: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    slug: PropTypes.string.isRequired,
    title: PropTypes.string,
    excerpt: PropTypes.string,
    author: PropTypes.string,
    category_slug: PropTypes.string,
    published_at: PropTypes.string,
    cover: PropTypes.shape({
      url: PropTypes.string,
      alt_text: PropTypes.string,
    }),
  }).isRequired,
  locale: PropTypes.string.isRequired,
};

function BlogPostGrid({ posts, locale, hasMore, onLoadMore }) {
  const { t } = useTranslation();
  return (
    <Stack gap="6">
      <Grid columns={3} gap="6">
        {posts.map((post) => (
          <BlogPostCard key={post.id} post={post} locale={locale} />
        ))}
      </Grid>
      {hasMore && (
        <Inline justify="center">
          <Button variant="secondary" onClick={onLoadMore}>
            {t('blog.loadMore')}
          </Button>
        </Inline>
      )}
    </Stack>
  );
}

BlogPostGrid.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- passed straight through to BlogPostCard, which validates its own shape
  posts: PropTypes.array.isRequired,
  locale: PropTypes.string.isRequired,
  hasMore: PropTypes.bool.isRequired,
  onLoadMore: PropTypes.func.isRequired,
};

export default function BlogPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') ?? undefined;
  const tag = searchParams.get('tag') ?? undefined;
  const cursor = Number(searchParams.get('cursor') ?? 0);

  const { data: categories = [] } = usePublicCategoriesQuery(i18n.language);
  const { data: tags = [] } = usePublicTagsQuery(i18n.language);
  const {
    data: postsResponse,
    isPending,
    isError,
    refetch,
  } = usePublicPostsQuery({
    limit: PAGE_SIZE,
    cursor,
    category,
    tag,
    locale: i18n.language,
  });

  const title = t('blog.title');
  const breadcrumbItems = [
    { label: t('nav.home'), href: `/${locale}` },
    { label: title, href: `/${locale}/blog` },
  ];

  useSeo({
    title: `${title} | ${t('app.name')}`,
    description: t('blog.description'),
    locale,
    path: 'blog',
    jsonLd: [buildBreadcrumbListSchema(breadcrumbItems)],
  });

  const categoryOptions = [
    { value: '', label: t('blog.filters.allCategories') },
    ...categories.map((c) => ({ value: c.slug, label: c.name })),
  ];
  const tagOptions = [
    { value: '', label: t('blog.filters.tag') },
    ...tags.map((tg) => ({ value: tg.slug, label: tg.name })),
  ];

  const updateFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('cursor');
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const handleCategoryChange = useCallback(
    (value) => updateFilter('category', value),
    [updateFilter],
  );

  const handleTagChange = useCallback(
    (value) => updateFilter('tag', value),
    [updateFilter],
  );

  const handleLoadMore = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set('cursor', String(cursor + PAGE_SIZE));
    setSearchParams(next);
  }, [searchParams, setSearchParams, cursor]);

  const posts = postsResponse?.data ?? [];
  const total = postsResponse?.meta?.total ?? 0;
  const hasMore = cursor + posts.length < total;

  let body;
  if (isError) {
    body = (
      <ErrorState
        title={t('blog.error.title')}
        retryLabel={t('blog.error.retry')}
        onRetry={refetch}
      />
    );
  } else if (isPending) {
    body = (
      <Grid columns={3} gap="6">
        {[1, 2, 3, 4, 5, 6].map((key) => (
          <Skeleton key={key} height="320px" />
        ))}
      </Grid>
    );
  } else if (posts.length === 0) {
    body = (
      <EmptyState
        title={t('blog.empty.title')}
        description={t('blog.empty.description')}
      />
    );
  } else {
    body = (
      <BlogPostGrid
        posts={posts}
        locale={locale}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
      />
    );
  }

  return (
    <div className={styles.page}>
      <EditorialPageHero
        breadcrumbItems={breadcrumbItems}
        heroSeed="blog"
        icon={Newspaper}
        title={title}
        lead={t('blog.description')}
      />

      <Inline gap="3" wrap className={styles.filters}>
        <Select
          label={t('blog.filters.category')}
          options={categoryOptions}
          value={category ?? ''}
          onChange={handleCategoryChange}
        />
        <Select
          label={t('blog.filters.tag')}
          options={tagOptions}
          value={tag ?? ''}
          onChange={handleTagChange}
        />
      </Inline>

      {body}
    </div>
  );
}

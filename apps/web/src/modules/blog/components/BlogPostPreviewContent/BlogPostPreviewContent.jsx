/**
 * BlogPostPreviewContent — `/admin/blog/:id/preview` and
 * `/marketing/posts/:id/preview` (Sprint H, spec §24). Renders the real
 * public article layout (same markup `BlogPostPageContent` uses) but
 * sourced from the AUTHENTICATED admin detail endpoint
 * (`useAdminPostDetailQuery`, gated by `blog.manage` server-side —
 * `/blog/admin/posts/:id`) instead of the public one, so a draft/
 * unpublished/not-yet-due post previews correctly without ever being
 * publicly reachable. `noindex` is set unconditionally (spec §34:
 * "Preview routes should be noindex").
 *
 * A post has one translation set per locale, not one preview per locale
 * — this shows the viewer's OWN current UI locale's translation (falling
 * back to the first authored locale so an editor working in HY still
 * gets a real preview while RU/EN are still empty), matching the
 * in-editor Tabs' own "current locale" framing rather than adding a
 * second locale switcher just for preview.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Badge } from '@desavii/ui/components/primitives';
import { Inline } from '@desavii/ui/components/layout';
import {
  Spinner,
  ErrorState,
  Alert,
} from '@desavii/ui/components/feedback-overlays';
import { Breadcrumbs } from '@desavii/ui/components/navigation';
import RouterLink from '../../../../components/RouterLink.jsx';
import MarkdownContent from '../../../../components/MarkdownContent/MarkdownContent.jsx';
import useSeo from '../../../../seo/useSeo.js';
import { useAdminPostDetailQuery } from '../../queries/useAdminPostDetailQuery.js';
import styles from '../BlogPostPageContent/BlogPostPageContent.module.scss';

export default function BlogPostPreviewContent({ basePath }) {
  const { t, i18n } = useTranslation();
  const { locale, id } = useParams();
  const postId = Number(id);
  const {
    data: post,
    isPending,
    isError,
    error,
    refetch,
  } = useAdminPostDetailQuery(postId);

  useSeo({
    title: t('marketing.editor.previewBadge'),
    locale,
    path: `${basePath}/${id}/preview`,
    noindex: true,
    nofollow: true,
  });

  if (isPending) {
    return (
      <div className={styles.loading}>
        <Spinner label={t('marketing.editor.previewAction')} />
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
        title={t('marketing.posts.error.title')}
        retryLabel={t('marketing.posts.error.retry')}
        onRetry={refetch}
      />
    );
  }

  const translation =
    post.translations.find((entry) => entry.language_code === i18n.language) ??
    post.translations[0];

  const breadcrumbItems = [
    { label: t('nav.home'), href: `/${locale}` },
    { label: t('marketing.posts.heading'), href: `/${locale}${basePath}` },
    { label: post.slug, href: `/${locale}${basePath}/${postId}` },
  ];

  return (
    <article className={styles.page}>
      <Alert variant="info">{t('marketing.editor.previewBadge')}</Alert>
      <Breadcrumbs items={breadcrumbItems} linkComponent={RouterLink} />

      {!translation && (
        <Alert variant="warning">
          {t('marketing.editor.localeTabMissingLabel', {
            code: i18n.language.toUpperCase(),
          })}
        </Alert>
      )}

      {translation && (
        <>
          {post.category_slug && (
            <Badge size="sm" variant="neutral" label={post.category_slug} />
          )}
          <h1 className={styles.title}>{translation.title}</h1>
          <p className={styles.meta}>
            {post.published_at
              ? new Date(post.published_at).toLocaleDateString(locale)
              : ''}
            {post.author ? ` · ${t('blog.by', { author: post.author })}` : ''}
          </p>

          {post.cover && (
            <img
              className={styles.cover}
              src={post.cover.url}
              alt={post.cover.alt_text ?? translation.title}
            />
          )}

          <MarkdownContent>{translation.body ?? ''}</MarkdownContent>

          {post.tags?.length > 0 && (
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
          )}
        </>
      )}
    </article>
  );
}

BlogPostPreviewContent.propTypes = {
  basePath: PropTypes.string.isRequired,
};

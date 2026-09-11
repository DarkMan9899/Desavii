/**
 * EditorialHighlights — Sprint K net-new Home section: the 3 most
 * recently published Blog posts (`usePublicPostsQuery`, the `blog`
 * module's own public export — Home had no editorial content before
 * this, confirmed by audit). Real data only: `GET /blog/posts` is
 * already server-authoritative for published/due-scheduled posts only
 * (see `usePublicPostsQuery.js`'s own header), so there is no
 * client-side draft filtering to get wrong here.
 *
 * Deliberately the one Home section that hides itself rather than
 * showing an empty/error state: a Blog trail is a supplementary
 * discovery aid, not a core marketplace function the way Categories or
 * Destinations are, so a "no articles yet" or "couldn't load" message
 * here would read as a broken/unfinished homepage for no real benefit —
 * omitting the section cleanly is the honest choice a visitor never
 * notices. The pending state still renders a skeleton (matching every
 * other Home section) so there's no layout jump if the request is slow;
 * only the empty/error outcomes collapse to nothing.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Newspaper } from 'lucide-react';
import { Container, Section, Grid } from '@desavii/ui/components/layout';
import { Skeleton } from '@desavii/ui/components/feedback-overlays';
import { usePublicPostsQuery } from '../../../blog/index.js';
import RouterLink from '../../../../components/RouterLink.jsx';
import SectionHeader from '../SectionHeader/SectionHeader.jsx';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';
import styles from './EditorialHighlights.module.scss';

const HEADING_ID = 'editorial-highlights-heading';
const POST_LIMIT = 3;

function PostCard({ post, locale }) {
  const { t } = useTranslation();
  return (
    <RouterLink href={`/${locale}/blog/${post.slug}`} className={styles.card}>
      <div className={styles.cover}>
        {post.cover ? (
          <img src={post.cover.url} alt={post.cover.alt_text ?? ''} />
        ) : (
          <span className={styles.coverFallback} aria-hidden="true">
            <Newspaper size={28} />
          </span>
        )}
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{post.title}</h3>
        <p className={styles.excerpt}>{post.excerpt}</p>
        <span className={styles.readMore}>{t('home.blog.readMore')}</span>
      </div>
    </RouterLink>
  );
}

PostCard.propTypes = {
  post: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    slug: PropTypes.string.isRequired,
    title: PropTypes.string,
    excerpt: PropTypes.string,
    cover: PropTypes.shape({
      url: PropTypes.string,
      alt_text: PropTypes.string,
    }),
  }).isRequired,
  locale: PropTypes.string.isRequired,
};

export default function EditorialHighlights() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { data, isPending, isError } = usePublicPostsQuery({
    limit: POST_LIMIT,
    locale: i18n.language,
  });
  const posts = data?.data ?? [];

  if (!isPending && (isError || posts.length === 0)) {
    return null;
  }

  return (
    <Section aria-labelledby={HEADING_ID} className={styles.section}>
      <Container size="wide">
        <ScrollReveal variant="depth">
          <SectionHeader
            id={HEADING_ID}
            eyebrow={t('home.blog.eyebrow')}
            title={t('home.blog.title')}
            subtitle={t('home.blog.subtitle')}
            viewAllHref={`/${locale}/blog`}
            viewAllLabel={t('home.blog.viewAll')}
          />

          {isPending ? (
            <Grid columns={3} gap="6">
              {[1, 2, 3].map((key) => (
                <Skeleton key={key} variant="rect" height={320} />
              ))}
            </Grid>
          ) : (
            <Grid columns={3} gap="6">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} locale={locale} />
              ))}
            </Grid>
          )}
        </ScrollReveal>
      </Container>
    </Section>
  );
}

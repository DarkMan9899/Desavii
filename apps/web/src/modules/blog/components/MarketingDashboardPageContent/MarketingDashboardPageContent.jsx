/**
 * MarketingDashboardPageContent — `/:locale/marketing` (Sprint H).
 * Deliberately has no dedicated `/blog/admin/dashboard` backend endpoint:
 * spec §36 explicitly forbids fabricating traffic/SEO analytics, and the
 * only trustworthy numbers available (draft/scheduled/published counts,
 * recently-updated posts) are already exactly what `GET /blog/admin/posts`
 * returns, so this reuses `useAdminPostsQuery` and aggregates client-side
 * rather than standing up a second endpoint for the same rows.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Grid } from '@desavii/ui/components/layout';
import { StatCard, DataTable } from '@desavii/ui/components/dashboard';
import { Badge, Card } from '@desavii/ui/components/primitives';
import { ErrorState } from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAdminPostsQuery } from '../../queries/useAdminPostsQuery.js';

const STATUS_BADGE_VARIANT = {
  DRAFT: 'neutral',
  SCHEDULED: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
};

export default function MarketingDashboardPageContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const {
    data: posts,
    isPending,
    isError,
    refetch,
  } = useAdminPostsQuery({
    limit: 200,
  });

  if (isError) {
    return (
      <Section spacing="default">
        <PageHeader title={t('marketing.dashboard.heading')} />
        <ErrorState
          title={t('marketing.posts.error.title')}
          retryLabel={t('marketing.posts.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const allPosts = posts ?? [];
  const draftCount = allPosts.filter((post) => post.status === 'DRAFT').length;
  const scheduledCount = allPosts.filter(
    (post) => post.status === 'SCHEDULED',
  ).length;
  const publishedCount = allPosts.filter(
    (post) => post.status === 'PUBLISHED',
  ).length;
  const recentPosts = [...allPosts]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5);

  const columns = [
    {
      key: 'title',
      header: t('marketing.posts.columns.title'),
      render: (row) => (
        <RouterLink href={`/${locale}/marketing/posts/${row.id}`}>
          {row.slug}
        </RouterLink>
      ),
    },
    {
      key: 'status',
      header: t('marketing.posts.columns.status'),
      render: (row) => (
        <Badge
          size="sm"
          variant={STATUS_BADGE_VARIANT[row.status] ?? 'neutral'}
          label={t(`blog.statuses.${row.status}`)}
        />
      ),
    },
    {
      key: 'updated',
      header: t('marketing.posts.columns.updated'),
      render: (row) => new Date(row.updated_at).toLocaleDateString(locale),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('marketing.dashboard.heading')}
        description={t('marketing.dashboard.description')}
      />

      <Stack gap="8">
        <Grid columns={3} gap="4">
          <StatCard
            label={t('marketing.dashboard.draftCount')}
            value={draftCount}
            variant="neutral"
            isLoading={isPending}
          />
          <StatCard
            label={t('marketing.dashboard.scheduledCount')}
            value={scheduledCount}
            variant="warning"
            isLoading={isPending}
          />
          <StatCard
            label={t('marketing.dashboard.publishedCount')}
            value={publishedCount}
            variant="success"
            isLoading={isPending}
          />
        </Grid>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <h2>{t('marketing.dashboard.recentlyUpdated')}</h2>
            <DataTable
              columns={columns}
              rows={recentPosts}
              isLoading={isPending}
              emptyTitle={t('marketing.dashboard.noRecentPosts')}
            />
          </Stack>
        </Card>
      </Stack>
    </Section>
  );
}

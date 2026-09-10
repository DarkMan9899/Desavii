/**
 * BlogPostsPageContent — shared list page for `/admin/blog` AND
 * `/marketing/posts` (Sprint H). Same "reuse via `basePath` prop rather
 * than duplicate screens" convention Sprint F's Manager Workspace
 * established for reusing Partner components — see spec §38: "do not
 * duplicate identical CMS screens if Marketing workspace components can
 * be safely reused."
 */

import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Button, Badge } from '@desavii/ui/components/primitives';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Modal, ErrorState } from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useAdminPostsQuery } from '../../queries/useAdminPostsQuery.js';
import { useCreateDraftMutation } from '../../mutations/useCreateDraftMutation.js';
import styles from './BlogPostsPageContent.module.scss';

const STATUS_FILTERS = ['', 'DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];

const STATUS_BADGE_VARIANT = {
  DRAFT: 'neutral',
  SCHEDULED: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
};

export default function BlogPostsPageContent({
  basePath,
  heading,
  description,
}) {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  // Modal's focus trap re-runs its focus-restore effect whenever this
  // identity changes (see useFocusTrap's effect deps) — an inline arrow
  // here would steal focus back to the dialog's first focusable element
  // on every keystroke inside the modal, eating all but the first
  // character typed into the title field.
  const closeCreateModal = useCallback(() => setIsCreateOpen(false), []);

  const {
    data: posts,
    isPending,
    isError,
    refetch,
  } = useAdminPostsQuery({
    status: statusFilter || undefined,
    search: searchValue || undefined,
  });
  const createDraftMutation = useCreateDraftMutation();

  const statusOptions = STATUS_FILTERS.map((code) => ({
    value: code,
    label: code
      ? t(`blog.statuses.${code}`)
      : t('marketing.posts.filters.allStatuses'),
  }));

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    try {
      const post = await createDraftMutation.mutateAsync({
        title: newTitle.trim(),
        languageCode: i18n.language,
      });
      showToast(t('marketing.posts.createSuccess'), { variant: 'success' });
      setIsCreateOpen(false);
      setNewTitle('');
      navigate(`/${locale}${basePath}/${post.id}`);
    } catch (error) {
      showToast(error.message || t('marketing.posts.createError'), {
        variant: 'danger',
      });
    }
  }, [
    newTitle,
    createDraftMutation,
    i18n.language,
    showToast,
    t,
    navigate,
    locale,
    basePath,
  ]);

  const columns = [
    {
      key: 'title',
      header: t('marketing.posts.columns.title'),
      render: (row) => (
        <RouterLink href={`/${locale}${basePath}/${row.id}`}>
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
      key: 'author',
      header: t('marketing.posts.columns.author'),
      render: (row) => row.author,
    },
    {
      key: 'category',
      header: t('marketing.posts.columns.category'),
      render: (row) => row.category_slug ?? '—',
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
        title={heading}
        description={description}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: heading, href: `/${locale}${basePath}` },
        ]}
      />

      <Stack gap="6">
        <Inline gap="3" justify="space-between" wrap align="flex-end">
          <Inline gap="3" wrap align="flex-end">
            <Select
              label={t('marketing.posts.filters.status')}
              options={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            <Input
              label={t('marketing.posts.filters.search')}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </Inline>
          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
            {t('marketing.posts.createAction')}
          </Button>
        </Inline>

        {isError ? (
          <ErrorState
            title={t('marketing.posts.error.title')}
            retryLabel={t('marketing.posts.error.retry')}
            onRetry={refetch}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={posts ?? []}
            isLoading={isPending}
            emptyTitle={t('marketing.posts.empty.title')}
            emptyDescription={t('marketing.posts.empty.description')}
          />
        )}
      </Stack>

      <Modal
        isOpen={isCreateOpen}
        onClose={closeCreateModal}
        title={t('marketing.posts.createModalTitle')}
      >
        <Stack gap="4" className={styles.createModal}>
          <Input
            label={t('marketing.posts.titleLabel')}
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            required
            error={
              createDraftMutation.isError
                ? t('marketing.posts.titleRequired')
                : undefined
            }
          />
          <Inline justify="flex-end">
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={createDraftMutation.isPending}
              disabled={!newTitle.trim()}
            >
              {t('marketing.posts.createAction')}
            </Button>
          </Inline>
        </Stack>
      </Modal>
    </Section>
  );
}

BlogPostsPageContent.propTypes = {
  basePath: PropTypes.string.isRequired,
  heading: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
};

/**
 * AdminManagersPageContent — `/:locale/admin/managers` (Sprint F, Manager
 * Workspace). Admin-only roster of every user holding the global MANAGER
 * role (`GET /managers/admin`), with a "Promote a user" action
 * (`POST /managers/admin/promote` — reuses `UserService`'s existing
 * role-assignment machinery, spec §32, never a parallel one) and a link
 * into each Manager's detail/assignment page.
 *
 * Deliberately a plain user-id input for promotion, not a user picker —
 * Admin already knows which existing user (found via `/admin/users`) they
 * mean to promote; building a second user-search UI here would duplicate
 * that page rather than reuse it (spec §32: "do not build a second full
 * user-management system").
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Card, Button, Badge } from '@desavii/ui/components/primitives';
import { Input } from '@desavii/ui/components/form-controls';
import { DataTable } from '@desavii/ui/components/dashboard';
import { ErrorState } from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import {
  useManagersQuery,
  usePromoteToManagerMutation,
} from '../../../managers/index.js';

export default function AdminManagersPageContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { showToast } = useToast();

  const { data: managers, isPending, isError, refetch } = useManagersQuery();
  const promoteMutation = usePromoteToManagerMutation();

  const [userIdInput, setUserIdInput] = useState('');

  async function handlePromote() {
    const userId = Number(userIdInput);
    if (!userId || userId <= 0) return;
    try {
      await promoteMutation.mutateAsync(userId);
      setUserIdInput('');
      showToast(t('admin.managers.promoteSuccess'), { variant: 'success' });
    } catch (error) {
      showToast(error.message || t('admin.managers.promoteError'), {
        variant: 'danger',
      });
    }
  }

  const columns = [
    {
      key: 'name',
      header: t('admin.managers.columns.name'),
      render: (manager) => (
        <RouterLink href={`/${locale}/admin/managers/${manager.user_id}`}>
          {manager.first_name} {manager.last_name}
        </RouterLink>
      ),
    },
    {
      key: 'email',
      header: t('admin.managers.columns.email'),
      render: (manager) => manager.email,
    },
    {
      key: 'assignedCompanies',
      header: t('admin.managers.columns.assignedCompanies'),
      render: (manager) => (
        <Badge
          variant={manager.assigned_company_count > 0 ? 'success' : 'neutral'}
          size="sm"
          label={String(manager.assigned_company_count)}
        />
      ),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.managers.heading')}
        description={t('admin.managers.description')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.managers.heading'),
            href: `/${locale}/admin/managers`,
          },
        ]}
      />

      <Stack gap="6">
        <Card as="div" padding="lg">
          <Stack gap="3">
            <strong>{t('admin.managers.promoteHeading')}</strong>
            <Inline gap="3" wrap align="flex-end">
              <Input
                type="number"
                label={t('admin.managers.promoteUserIdLabel')}
                placeholder={t('admin.managers.promoteUserIdPlaceholder')}
                value={userIdInput}
                onChange={(event) => setUserIdInput(event.target.value)}
              />
              <Button
                variant="primary"
                onClick={() => handlePromote()}
                loading={promoteMutation.isPending}
                disabled={!userIdInput}
              >
                {t('admin.managers.promoteAction')}
              </Button>
            </Inline>
          </Stack>
        </Card>

        {isError ? (
          <ErrorState
            title={t('admin.managers.error.title')}
            retryLabel={t('admin.managers.error.retry')}
            onRetry={refetch}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={(managers ?? []).map((manager) => ({
              ...manager,
              id: manager.user_id,
            }))}
            isLoading={isPending}
            emptyTitle={t('admin.managers.empty.title')}
            emptyDescription={t('admin.managers.empty.description')}
          />
        )}
      </Stack>
    </Section>
  );
}

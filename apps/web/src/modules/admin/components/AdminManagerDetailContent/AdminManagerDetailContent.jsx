/**
 * AdminManagerDetailContent — `/:locale/admin/managers/:id` (Sprint F).
 * One Manager's assigned companies (assign/unassign, `manager_companies`
 * — migration 0042) plus their cross-company dashboard (Admin reviewing
 * performance, spec §23), reusing the exact same `StatCard`-free simple
 * summary shape `ManagerDashboardContent` uses for the Manager's own
 * view of the same data (`GET /managers/admin/:userId` returns the
 * identical `dashboard` shape `GET /managers/mine/dashboard` does).
 *
 * Assign is a plain partnerId input, not a company picker — mirrors
 * `AdminManagersPageContent`'s "Admin already knows which record they
 * mean" reasoning; Admin can look the id up via `/admin/partners` first.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { Card, Button, Badge } from '@desavii/ui/components/primitives';
import { Input } from '@desavii/ui/components/form-controls';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { StatCard } from '@desavii/ui/components/dashboard';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import {
  useManagerDetailQuery,
  useAssignCompanyMutation,
  useUnassignCompanyMutation,
} from '../../../managers/index.js';

export default function AdminManagerDetailContent() {
  const { t } = useTranslation();
  const { locale, id } = useParams();
  const managerUserId = Number(id);
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data, isPending, isError, refetch } =
    useManagerDetailQuery(managerUserId);
  const assignMutation = useAssignCompanyMutation();
  const unassignMutation = useUnassignCompanyMutation();

  const [partnerIdInput, setPartnerIdInput] = useState('');

  async function handleAssign() {
    const partnerId = Number(partnerIdInput);
    if (!partnerId || partnerId <= 0) return;
    try {
      await assignMutation.mutateAsync({ userId: managerUserId, partnerId });
      setPartnerIdInput('');
      showToast(t('admin.managerDetail.assignSuccess'), {
        variant: 'success',
      });
    } catch (error) {
      showToast(error.message || t('admin.managerDetail.assignError'), {
        variant: 'danger',
      });
    }
  }

  async function handleUnassign(partnerId, displayName) {
    const confirmed = await confirm({
      title: t('admin.managerDetail.unassignConfirmTitle', {
        name: displayName,
      }),
      description: t('admin.managerDetail.unassignConfirmDescription'),
      confirmLabel: t('admin.managerDetail.unassignAction'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await unassignMutation.mutateAsync({ userId: managerUserId, partnerId });
      showToast(t('admin.managerDetail.unassignSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.managerDetail.unassignError'), {
        variant: 'danger',
      });
    }
  }

  if (isError) {
    return (
      <Section spacing="default">
        <ErrorState
          title={t('admin.managerDetail.error.title')}
          retryLabel={t('admin.managerDetail.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const manager = data?.manager;
  const assignments = data?.assignments ?? [];
  const dashboard = data?.dashboard;

  return (
    <Section spacing="default">
      <PageHeader
        title={
          manager
            ? `${manager.first_name} ${manager.last_name}`
            : t('admin.managerDetail.loading')
        }
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
        {isPending ? (
          <Skeleton variant="rect" height={200} />
        ) : (
          <>
            <Grid columns={3} gap="4">
              <StatCard
                label={t('admin.managerDetail.stats.companies')}
                value={dashboard?.counts?.companies}
                variant="neutral"
              />
              <StatCard
                label={t('admin.managerDetail.stats.bookings')}
                value={dashboard?.counts?.bookings}
                variant="info"
              />
              <StatCard
                label={t('admin.managerDetail.stats.listingsCreated')}
                value={data?.listings_created_count}
                variant="neutral"
              />
            </Grid>

            <Card as="div" padding="lg">
              <Stack gap="3">
                <strong>{t('admin.managerDetail.assignHeading')}</strong>
                <Inline gap="3" wrap align="flex-end">
                  <Input
                    type="number"
                    label={t('admin.managerDetail.assignPartnerIdLabel')}
                    placeholder={t(
                      'admin.managerDetail.assignPartnerIdPlaceholder',
                    )}
                    value={partnerIdInput}
                    onChange={(event) => setPartnerIdInput(event.target.value)}
                  />
                  <Button
                    variant="primary"
                    onClick={() => handleAssign()}
                    loading={assignMutation.isPending}
                    disabled={!partnerIdInput}
                  >
                    {t('admin.managerDetail.assignAction')}
                  </Button>
                </Inline>
              </Stack>
            </Card>

            <Card as="div" padding="lg">
              <Stack gap="3">
                <strong>{t('admin.managerDetail.assignmentsHeading')}</strong>
                {assignments.length === 0 ? (
                  <EmptyState
                    title={t('admin.managerDetail.assignments.empty')}
                  />
                ) : (
                  <Stack gap="2">
                    {assignments.map((assignment) => (
                      <Inline
                        key={assignment.partner_id}
                        justify="space-between"
                        align="center"
                      >
                        <RouterLink
                          href={`/${locale}/admin/partners/${assignment.partner_id}`}
                        >
                          {assignment.display_name}
                        </RouterLink>
                        <Inline gap="3" align="center">
                          <Badge
                            variant="success"
                            size="sm"
                            label={t(
                              `admin.partners.verificationStatus.${assignment.verification_status}`,
                              { defaultValue: assignment.verification_status },
                            )}
                          />
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              handleUnassign(
                                assignment.partner_id,
                                assignment.display_name,
                              )
                            }
                            loading={
                              unassignMutation.isPending &&
                              unassignMutation.variables?.partnerId ===
                                assignment.partner_id
                            }
                          >
                            {t('admin.managerDetail.unassignAction')}
                          </Button>
                        </Inline>
                      </Inline>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Card>
          </>
        )}
      </Stack>
    </Section>
  );
}

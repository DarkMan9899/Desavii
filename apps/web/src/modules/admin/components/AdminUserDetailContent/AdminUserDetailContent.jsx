/**
 * AdminUserDetailContent — `/:locale/admin/users/:id` (User Management
 * detail). Composes three independent reads (profile, booking history,
 * partnerships) — each its own query/loading/error state, since a
 * failure in one (e.g. no partnerships endpoint permission edge case)
 * shouldn't block the other two from rendering.
 *
 * Booking rows link to the admin booking detail page (Stage 11.4).
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { Card, Badge, Button } from '@desavii/ui/components/primitives';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import { createNumberFormatter } from '@desavii/ui/utils/numberFormat';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useAdminUserDetailQuery } from '../../queries/useAdminUserDetailQuery.js';
import { useAdminUserBookingsQuery } from '../../queries/useAdminUserBookingsQuery.js';
import { useAdminUserPartnershipsQuery } from '../../queries/useAdminUserPartnershipsQuery.js';
import { useUpdateUserStatusMutation } from '../../mutations/useUpdateUserStatusMutation.js';

const STATUS_BADGE_VARIANT = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  BANNED: 'danger',
  PENDING_DELETION: 'neutral',
};

export default function AdminUserDetailContent() {
  const { t, i18n } = useTranslation();
  const { locale, id } = useParams();
  const { permissions } = useAuth();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const canSuspend = permissions.includes('user.suspend');

  const userQuery = useAdminUserDetailQuery(id);
  const bookingsQuery = useAdminUserBookingsQuery(id);
  const partnershipsQuery = useAdminUserPartnershipsQuery(id);
  const updateStatusMutation = useUpdateUserStatusMutation();

  if (userQuery.isError) {
    return (
      <Section spacing="default">
        <ErrorState
          title={t('admin.userDetail.error.title')}
          retryLabel={t('admin.userDetail.error.retry')}
          onRetry={userQuery.refetch}
        />
      </Section>
    );
  }

  const user = userQuery.data;

  async function handleToggleStatus() {
    const nextStatus =
      user.status_code === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const confirmed = await confirm({
      title: t(
        nextStatus === 'SUSPENDED'
          ? 'admin.users.suspendConfirmTitle'
          : 'admin.users.activateConfirmTitle',
        { name: `${user.first_name} ${user.last_name}` },
      ),
      description: t(
        nextStatus === 'SUSPENDED'
          ? 'admin.users.suspendConfirmDescription'
          : 'admin.users.activateConfirmDescription',
      ),
      confirmLabel: t(
        nextStatus === 'SUSPENDED'
          ? 'admin.users.suspendConfirmAction'
          : 'admin.users.activateConfirmAction',
      ),
      cancelLabel: t('common.cancel'),
      variant: nextStatus === 'SUSPENDED' ? 'danger' : 'primary',
    });
    if (!confirmed) return;

    try {
      await updateStatusMutation.mutateAsync({
        id: user.id,
        status: nextStatus,
      });
      showToast(
        t(
          nextStatus === 'SUSPENDED'
            ? 'admin.users.suspendSuccess'
            : 'admin.users.activateSuccess',
        ),
        { variant: 'success' },
      );
    } catch {
      showToast(t('admin.users.statusError'), { variant: 'danger' });
    }
  }

  const bookings = bookingsQuery.data ?? [];
  const partnerships = partnershipsQuery.data ?? [];

  return (
    <Section spacing="default">
      <PageHeader
        title={
          user
            ? `${user.first_name} ${user.last_name}`
            : t('admin.userDetail.loading')
        }
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          { label: t('admin.users.heading'), href: `/${locale}/admin/users` },
        ]}
      />

      <Stack gap="6">
        <Card as="div" padding="lg">
          {userQuery.isPending ? (
            <Skeleton variant="text" width="60%" />
          ) : (
            <Stack gap="3">
              <Inline justify="space-between" align="center">
                <Stack gap="1">
                  <strong>{user.email}</strong>
                  <span>
                    {t('admin.userDetail.roles')}:{' '}
                    {user.role_codes
                      .map((code) =>
                        t(`admin.notifications.announcement.roles.${code}`, {
                          defaultValue: code,
                        }),
                      )
                      .join(', ') || '—'}
                  </span>
                  <span>
                    {t('admin.userDetail.joined', {
                      date: createDateFormatter(i18n.language, {
                        dateStyle: 'medium',
                      }).format(new Date(user.created_at)),
                    })}
                    {user.last_login_at &&
                      ` · ${t('admin.userDetail.lastLogin', {
                        date: createDateFormatter(i18n.language, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(user.last_login_at)),
                      })}`}
                  </span>
                </Stack>
                <Inline gap="3" align="center">
                  <Badge
                    variant={
                      STATUS_BADGE_VARIANT[user.status_code] ?? 'neutral'
                    }
                    label={t(`admin.users.status.${user.status_code}`, {
                      defaultValue: user.status_code,
                    })}
                  />
                  {canSuspend && (
                    <Button
                      variant={
                        user.status_code === 'SUSPENDED'
                          ? 'primary'
                          : 'destructive'
                      }
                      size="sm"
                      onClick={() => handleToggleStatus()}
                      loading={updateStatusMutation.isPending}
                    >
                      {t(
                        user.status_code === 'SUSPENDED'
                          ? 'admin.users.activateConfirmAction'
                          : 'admin.users.suspendConfirmAction',
                      )}
                    </Button>
                  )}
                </Inline>
              </Inline>
            </Stack>
          )}
        </Card>

        <Grid columns={2} gap="4">
          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('admin.userDetail.bookings.heading')}</h2>
              {bookingsQuery.isPending && (
                <Skeleton variant="text" width="80%" />
              )}
              {!bookingsQuery.isPending && bookings.length === 0 && (
                <EmptyState title={t('admin.userDetail.bookings.empty')} />
              )}
              {!bookingsQuery.isPending && bookings.length > 0 && (
                <Stack gap="2">
                  {bookings.map((booking) => (
                    <Inline
                      key={booking.id}
                      justify="space-between"
                      align="center"
                    >
                      <RouterLink
                        href={`/${locale}/admin/bookings/${booking.id}`}
                      >
                        {booking.booking_reference}
                      </RouterLink>
                      <Badge
                        variant="neutral"
                        size="sm"
                        // The `bookings.status.partner.*` override exists
                        // because the default copy is written from the
                        // customer's point of view ("Cancelled by you") —
                        // just as wrong for an admin looking at someone
                        // else's booking (see BookingStatusBadge.jsx).
                        label={
                          booking.status === 'CANCELLED_BY_CUSTOMER'
                            ? t('bookings.status.partner.CANCELLED_BY_CUSTOMER')
                            : t(`bookings.status.${booking.status}`, {
                                defaultValue: booking.status,
                              })
                        }
                      />
                      <span>
                        {createNumberFormatter(i18n.language).format(
                          booking.total_amount,
                        )}
                      </span>
                    </Inline>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('admin.userDetail.partnerships.heading')}</h2>
              {partnershipsQuery.isPending && (
                <Skeleton variant="text" width="80%" />
              )}
              {!partnershipsQuery.isPending && partnerships.length === 0 && (
                <EmptyState title={t('admin.userDetail.partnerships.empty')} />
              )}
              {!partnershipsQuery.isPending && partnerships.length > 0 && (
                <Stack gap="2">
                  {partnerships.map((membership) => (
                    <Inline
                      key={membership.partner_id}
                      justify="space-between"
                      align="center"
                    >
                      <span>{membership.display_name}</span>
                      <Badge
                        variant="info"
                        size="sm"
                        label={t(`partner.staff.roles.${membership.role}`, {
                          defaultValue: membership.role,
                        })}
                      />
                    </Inline>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid>
      </Stack>
    </Section>
  );
}

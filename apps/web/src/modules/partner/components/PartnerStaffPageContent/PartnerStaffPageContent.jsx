/**
 * PartnerStaffPageContent — `/:locale/partner/staff` (P1.4, Master
 * Roadmap). Team roster (any active member may view) plus, for a
 * caller with `MANAGE_STAFF` (`usePartnerCapability`, mirroring the
 * server-side `partnerStaffService.js` capability check), invite/
 * role-change/revoke/remove actions — same "hide/disable, server is the
 * real gate" convention `PartnerProfilePageContent.jsx` (P1.3) already
 * established.
 *
 * The OWNER row never exposes role-change/remove controls — this
 * module has no ownership-transfer flow, matching the server's own
 * refusal (`partnerStaffService.js`'s `staff.roleCode === 'OWNER'`
 * checks).
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Users, Mail } from 'lucide-react';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { Button, Badge } from '@desavii/ui/components/primitives';
import {
  Modal,
  Skeleton,
  EmptyState,
} from '@desavii/ui/components/feedback-overlays';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { DataTable } from '@desavii/ui/components/dashboard';
import {
  createDateFormatter,
  NUMERIC_DATE,
} from '@desavii/ui/utils/dateFormat';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import {
  usePartnerCapability,
  PARTNER_CAPABILITIES,
} from '../../../availability/index.js';
import { useStaffQuery } from '../../queries/useStaffQuery.js';
import { useStaffInvitationsQuery } from '../../queries/useStaffInvitationsQuery.js';
import { useInviteStaffMutation } from '../../mutations/useInviteStaffMutation.js';
import { useRevokeInvitationMutation } from '../../mutations/useRevokeInvitationMutation.js';
import { useUpdateStaffRoleMutation } from '../../mutations/useUpdateStaffRoleMutation.js';
import { useRemoveStaffMutation } from '../../mutations/useRemoveStaffMutation.js';
import StaffMemberCard from './StaffMemberCard.jsx';
import StaffInvitationCard from './StaffInvitationCard.jsx';
import styles from './PartnerStaffPageContent.module.scss';

const ASSIGNABLE_ROLES = [
  'MANAGER',
  'BOOKING_MANAGER',
  'EDITOR',
  'ANALYTICS_VIEWER',
];

function InviteStaffModal({ isOpen, onClose, onInvite, isSaving }) {
  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ defaultValues: { email: '', roleCode: 'EDITOR' } });

  const roleOptions = ASSIGNABLE_ROLES.map((code) => ({
    value: code,
    label: t(`partner.staff.roles.${code}`),
  }));

  async function onSubmit(values) {
    const ok = await onInvite(values);
    if (ok) reset();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('partner.staff.inviteModal.title')}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap="4">
          <Controller
            name="email"
            control={control}
            rules={{
              required: t('partner.staff.inviteModal.emailRequired'),
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: t('partner.staff.inviteModal.emailInvalid'),
              },
            }}
            render={({ field }) => (
              <Input
                type="email"
                label={t('partner.staff.inviteModal.emailLabel')}
                required
                error={errors.email?.message}
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...field}
              />
            )}
          />
          <Controller
            name="roleCode"
            control={control}
            render={({ field }) => (
              <Select
                label={t('partner.staff.inviteModal.roleLabel')}
                options={roleOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Inline justify="flex-end">
            <Button type="submit" variant="primary" loading={isSaving}>
              {t('partner.staff.inviteModal.submitAction')}
            </Button>
          </Inline>
        </Stack>
      </form>
    </Modal>
  );
}

InviteStaffModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onInvite: PropTypes.func.isRequired,
  isSaving: PropTypes.bool.isRequired,
};

export default function PartnerStaffPageContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { activePartnerId } = usePartnerContext();
  const canManageStaff = usePartnerCapability(
    PARTNER_CAPABILITIES.MANAGE_STAFF,
  );
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const staffQuery = useStaffQuery(activePartnerId);
  const invitationsQuery = useStaffInvitationsQuery(activePartnerId, {
    enabled: canManageStaff,
  });
  const inviteMutation = useInviteStaffMutation(activePartnerId);
  const revokeMutation = useRevokeInvitationMutation(activePartnerId);
  const updateRoleMutation = useUpdateStaffRoleMutation(activePartnerId);
  const removeMutation = useRemoveStaffMutation(activePartnerId);

  async function handleInvite(values) {
    try {
      await inviteMutation.mutateAsync({ ...values, locale });
      showToast(t('partner.staff.inviteSuccess'), { variant: 'success' });
      setIsInviteModalOpen(false);
      return true;
    } catch {
      showToast(t('partner.staff.inviteError'), { variant: 'danger' });
      return false;
    }
  }

  async function handleRoleChange(employeeId, roleCode) {
    try {
      await updateRoleMutation.mutateAsync({ employeeId, roleCode });
      showToast(t('partner.staff.roleChangeSuccess'), { variant: 'success' });
    } catch {
      showToast(t('partner.staff.roleChangeError'), { variant: 'danger' });
    }
  }

  async function handleRemove(staff) {
    const confirmed = await confirm({
      title: t('partner.staff.removeConfirmTitle', {
        name: `${staff.first_name} ${staff.last_name}`,
      }),
      description: t('partner.staff.removeConfirmDescription'),
      confirmLabel: t('partner.staff.removeConfirmAction'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await removeMutation.mutateAsync(staff.id);
      showToast(t('partner.staff.removeSuccess'), { variant: 'success' });
    } catch {
      showToast(t('partner.staff.removeError'), { variant: 'danger' });
    }
  }

  async function handleRevoke(invitation) {
    const confirmed = await confirm({
      title: t('partner.staff.revokeConfirmTitle', { email: invitation.email }),
      description: t('partner.staff.revokeConfirmDescription'),
      confirmLabel: t('partner.staff.revokeConfirmAction'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await revokeMutation.mutateAsync(invitation.id);
      showToast(t('partner.staff.revokeSuccess'), { variant: 'success' });
    } catch {
      showToast(t('partner.staff.revokeError'), { variant: 'danger' });
    }
  }

  const staffColumns = [
    {
      key: 'name',
      header: t('partner.staff.table.name'),
      render: (row) => `${row.first_name} ${row.last_name}`,
    },
    { key: 'email', header: t('partner.staff.table.email') },
    {
      key: 'role',
      header: t('partner.staff.table.role'),
      render: (row) =>
        canManageStaff && row.role !== 'OWNER' ? (
          <Select
            ariaLabel={t('partner.staff.table.role')}
            size="sm"
            options={ASSIGNABLE_ROLES.map((code) => ({
              value: code,
              label: t(`partner.staff.roles.${code}`),
            }))}
            value={row.role}
            onChange={(roleCode) => handleRoleChange(row.id, roleCode)}
          />
        ) : (
          <Badge
            variant={row.role === 'OWNER' ? 'info' : 'neutral'}
            filled={row.role === 'OWNER'}
            label={t(`partner.staff.roles.${row.role}`, {
              defaultValue: row.role_name,
            })}
          />
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        canManageStaff && row.role !== 'OWNER' ? (
          <Button variant="ghost" size="sm" onClick={() => handleRemove(row)}>
            {t('partner.staff.removeAction')}
          </Button>
        ) : null,
    },
  ];

  const invitationColumns = [
    { key: 'email', header: t('partner.staff.table.email') },
    {
      key: 'role',
      header: t('partner.staff.table.role'),
      // `role_name` (used here as `defaultValue: row.role_name` only)
      // is `partner_employee_roles.name` straight from the DB — a
      // single hardcoded English string, never localized. Rendering it
      // directly (the previous behavior) leaked raw English role names
      // into HY/RU pending-invitation rows; `role` (the real code) is
      // what the staff table's own role column already translates
      // correctly.
      render: (row) =>
        t(`partner.staff.roles.${row.role}`, { defaultValue: row.role_name }),
    },
    {
      key: 'expires_at',
      header: t('partner.staff.table.expires'),
      render: (row) =>
        createDateFormatter(locale, NUMERIC_DATE).format(
          new Date(row.expires_at),
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => handleRevoke(row)}>
          {t('partner.staff.revokeAction')}
        </Button>
      ),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('partner.staff.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('partner.nav.dashboard'), href: `/${locale}/partner` },
          {
            label: t('partner.staff.heading'),
            href: `/${locale}/partner/staff`,
          },
        ]}
        actions={
          canManageStaff && (
            <Button
              variant="primary"
              onClick={() => setIsInviteModalOpen(true)}
            >
              {t('partner.staff.inviteAction')}
            </Button>
          )
        }
      />

      <Stack gap="6">
        <Stack gap="3">
          <h2 className={styles.panelHeading}>
            <Users aria-hidden="true" focusable="false" />
            {t('partner.staff.membersHeading')}
          </h2>

          <div className={styles.desktopOnly}>
            <DataTable
              columns={staffColumns}
              rows={staffQuery.data ?? []}
              isLoading={staffQuery.isPending}
              emptyTitle={t('partner.staff.emptyStaff')}
            />
          </div>

          {staffQuery.isPending && (
            <Stack gap="2" className={styles.mobileOnly}>
              <Skeleton variant="rect" height={72} />
              <Skeleton variant="rect" height={72} />
              <Skeleton variant="rect" height={72} />
            </Stack>
          )}
          {!staffQuery.isPending && (staffQuery.data ?? []).length === 0 && (
            <div className={styles.mobileOnly}>
              <EmptyState title={t('partner.staff.emptyStaff')} />
            </div>
          )}
          {!staffQuery.isPending && (staffQuery.data ?? []).length > 0 && (
            <ul
              className={styles.mobileOnly}
              aria-label={t('partner.staff.membersHeading')}
            >
              {staffQuery.data.map((staff) => (
                <StaffMemberCard
                  key={staff.id}
                  staff={staff}
                  assignableRoles={ASSIGNABLE_ROLES}
                  canManage={canManageStaff}
                  onRoleChange={(employeeId, roleCode) =>
                    handleRoleChange(employeeId, roleCode)
                  }
                  onRemove={(member) => handleRemove(member)}
                />
              ))}
            </ul>
          )}
        </Stack>

        {canManageStaff && (
          <Stack gap="3">
            <h2 className={styles.panelHeading}>
              <Mail aria-hidden="true" focusable="false" />
              {t('partner.staff.pendingInvitationsHeading')}
            </h2>

            <div className={styles.desktopOnly}>
              <DataTable
                columns={invitationColumns}
                rows={invitationsQuery.data ?? []}
                isLoading={invitationsQuery.isPending}
                emptyTitle={t('partner.staff.emptyInvitations')}
              />
            </div>

            {invitationsQuery.isPending && (
              <Stack gap="2" className={styles.mobileOnly}>
                <Skeleton variant="rect" height={72} />
                <Skeleton variant="rect" height={72} />
              </Stack>
            )}
            {!invitationsQuery.isPending &&
              (invitationsQuery.data ?? []).length === 0 && (
                <div className={styles.mobileOnly}>
                  <EmptyState title={t('partner.staff.emptyInvitations')} />
                </div>
              )}
            {!invitationsQuery.isPending &&
              (invitationsQuery.data ?? []).length > 0 && (
                <ul
                  className={styles.mobileOnly}
                  aria-label={t('partner.staff.pendingInvitationsHeading')}
                >
                  {invitationsQuery.data.map((invitation) => (
                    <StaffInvitationCard
                      key={invitation.id}
                      invitation={invitation}
                      onRevoke={(revoked) => handleRevoke(revoked)}
                    />
                  ))}
                </ul>
              )}
          </Stack>
        )}
      </Stack>

      <InviteStaffModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={(values) => handleInvite(values)}
        isSaving={inviteMutation.isPending}
      />
    </Section>
  );
}

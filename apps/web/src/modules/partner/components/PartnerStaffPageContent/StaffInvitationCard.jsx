/**
 * StaffInvitationCard — 2026 Partner Workspace redesign (Sprint 4). The
 * mobile-only presentation of a `useStaffInvitationsQuery` row, sibling
 * to `StaffMemberCard` — same "CSS-toggled by breakpoint, one source of
 * data/handlers" reasoning.
 *
 * Renders the role via `t('partner.staff.roles.${invitation.role}')`,
 * NOT `invitation.role_name` — that field is `partner_employee_roles.name`
 * straight from the DB (`mysqlPartnerStaffRepository.js`'s own
 * `INVITATION_SELECT`), a single hardcoded English string with no
 * per-locale variant. The desktop table's staff-role column already
 * translates the code correctly; the invitations table previously
 * didn't (a real bug, fixed alongside this card, not invented for it).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import {
  createDateFormatter,
  NUMERIC_DATE,
} from '@desavii/ui/utils/dateFormat';
import styles from './StaffInvitationCard.module.scss';

export default function StaffInvitationCard({ invitation, onRevoke }) {
  const { t } = useTranslation();
  const { locale } = useParams();

  return (
    <li className={styles.card}>
      <Stack gap="2">
        <span className={styles.email}>{invitation.email}</span>
        <Inline gap="2" align="center" className={styles.meta}>
          <span>
            {t(`partner.staff.roles.${invitation.role}`, {
              defaultValue: invitation.role_name,
            })}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t('partner.staff.table.expires')}{' '}
            {createDateFormatter(locale, NUMERIC_DATE).format(
              new Date(invitation.expires_at),
            )}
          </span>
        </Inline>
        <Inline justify="flex-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRevoke(invitation)}
          >
            {t('partner.staff.revokeAction')}
          </Button>
        </Inline>
      </Stack>
    </li>
  );
}

StaffInvitationCard.propTypes = {
  invitation: PropTypes.shape({
    id: PropTypes.number.isRequired,
    email: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired,
    role_name: PropTypes.string,
    expires_at: PropTypes.string.isRequired,
  }).isRequired,
  onRevoke: PropTypes.func.isRequired,
};

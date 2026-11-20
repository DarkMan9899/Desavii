/**
 * AccountIdentityCard — Customer Account redesign (2026): a compact
 * identity block above the account nav (`CustomerAccountLayout`'s own
 * sidebar column), never shared with Partner/Admin — a brand-new,
 * customer-only component rather than an addition to the shared `ui`
 * package, so there is zero risk of it affecting either of those
 * layouts. Reads straight from `useAuth().user` (already fully
 * hydrated, same "no extra fetch" reasoning `ProfilePageContent`
 * documents) — no new query.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@desavii/ui/components/primitives';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import RouterLink from '../../../../components/RouterLink.jsx';
import styles from './AccountIdentityCard.module.scss';

export default function AccountIdentityCard({ user, locale }) {
  const { t, i18n } = useTranslation();
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const joinedYear = user.created_at
    ? createDateFormatter(i18n.language, { year: 'numeric' }).format(
        new Date(user.created_at),
      )
    : null;

  return (
    <RouterLink href={`/${locale}/account/profile`} className={styles.card}>
      <Avatar
        name={fullName}
        userId={String(user.id)}
        src={user.avatar_url}
        size="lg"
      />
      <span className={styles.text}>
        <span className={styles.name}>{fullName}</span>
        {joinedYear && (
          <span className={styles.meta}>
            {t('account.identity.memberSince', { year: joinedYear })}
          </span>
        )}
      </span>
    </RouterLink>
  );
}

AccountIdentityCard.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.number.isRequired,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    avatar_url: PropTypes.string,
    created_at: PropTypes.string,
  }).isRequired,
  locale: PropTypes.string.isRequired,
};

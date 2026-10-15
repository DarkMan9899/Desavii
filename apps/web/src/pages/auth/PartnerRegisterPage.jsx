/**
 * PartnerRegisterPage — `/:locale/partner/register`, where the Partner
 * "Start" CTA sends a visitor: step 1 of becoming a partner, their own
 * sign-in. Same `RegisterForm` as customer registration (one form, one
 * validation policy) in its `partner` variant, which continues straight
 * to the partner application instead of the customer account. Kept apart
 * from `/auth/register` so the navbar's "Register" stays a plain
 * customer sign-up with no partner choice in it.
 */

import { useTranslation } from 'react-i18next';
import { RegisterForm } from '../../modules/auth/index.js';
import styles from './AuthPages.module.scss';

export default function PartnerRegisterPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.card}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{t('auth.partnerRegister.title')}</h1>
        <p className={styles.lead}>{t('auth.partnerRegister.subtitle')}</p>
      </div>
      <RegisterForm variant="partner" />
    </div>
  );
}

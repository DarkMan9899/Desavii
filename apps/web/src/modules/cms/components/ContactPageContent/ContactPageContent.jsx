/**
 * ContactPageContent — `/:locale/contact` (Phase 10 redesign; editorial
 * redesign in the 2026 public-frontend audit's static-page pass — see
 * `EditorialPageHero`'s own file header for the shared shell this now
 * uses).
 *
 * P1.6 (Master Roadmap): title/lead now come from the real CMS backend
 * (see `AboutPageContent.jsx`'s identical comment for the fallback
 * reasoning). Also removes the phone contact row entirely — it was a
 * fabricated placeholder number (`+374 10 000 000`, an obviously fake
 * trailing-zeros number), which is worse than no phone option at all;
 * email is one real, working contact channel alongside the form below.
 *
 * Sprint G: adds a real submission form, now that `POST /contact`
 * (migration 0043, `apps/api/src/modules/contact/`) actually exists —
 * the previous version's own header comment explained the form was
 * deliberately omitted because no backend endpoint existed yet; that
 * gap is now closed. Mirrors `RegisterForm.jsx`'s exact react-hook-form
 * + `@desavii/ui` form-controls pattern (Controller per field, inline
 * `error`/`helperText`, `Button loading={isPending}`). On success the
 * form is replaced by an inline confirmation (never a toast alone — the
 * confirmation needs to persist long enough to read the reply-to email
 * back); on failure the typed values are left exactly as the visitor
 * left them (RHF's `reset()` is only ever called on success).
 */

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Mail, Clock, MessageCircle } from 'lucide-react';
import { Input, Select, Textarea } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import EditorialPageHero from '../../../../components/EditorialPageHero/EditorialPageHero.jsx';
import useSeo from '../../../../seo/useSeo.js';
import { buildBreadcrumbListSchema } from '../../../../seo/structuredData.js';
import { useCmsPageQuery } from '../../queries/useCmsPageQuery.js';
import { useSubmitContactInquiryMutation } from '../../../contact/index.js';
import styles from './ContactPageContent.module.scss';

const MESSAGE_MAX_LENGTH = 5000;
const INQUIRY_TYPE_CODES = [
  'GENERAL',
  'BOOKING_SUPPORT',
  'PARTNER_BUSINESS',
  'TECHNICAL',
];

function ContactForm() {
  const { t } = useTranslation();
  const [sentToEmail, setSentToEmail] = useState(null);
  const { mutateAsync, isPending, isError } = useSubmitContactInquiryMutation();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      inquiryType: 'GENERAL',
      name: '',
      email: '',
      subject: '',
      message: '',
    },
  });

  const inquiryTypeOptions = INQUIRY_TYPE_CODES.map((code) => ({
    value: code,
    label: t(`contact.inquiryTypes.${code}`),
  }));

  async function onSubmit(values) {
    try {
      await mutateAsync(values);
      setSentToEmail(values.email);
      reset();
    } catch {
      // Surfaced below via the mutation's `isError` state; the typed
      // values are deliberately left in place (spec §28).
    }
  }

  if (sentToEmail) {
    return (
      <Stack gap="3">
        <Alert variant="success" title={t('cms.contact.form.successTitle')}>
          {t('cms.contact.form.successBody', { email: sentToEmail })}
        </Alert>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSentToEmail(null)}
        >
          {t('cms.contact.form.sendAnotherAction')}
        </Button>
      </Stack>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="4">
        {isError && (
          <Alert variant="danger" title={t('cms.contact.form.errorTitle')}>
            {t('cms.contact.form.errorBody')}
          </Alert>
        )}

        <Controller
          name="name"
          control={control}
          rules={{ required: t('cms.contact.form.validation.nameRequired') }}
          render={({ field }) => (
            <Input
              label={t('cms.contact.form.nameLabel')}
              required
              error={errors.name?.message}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...field}
            />
          )}
        />

        <Controller
          name="email"
          control={control}
          rules={{
            required: t('cms.contact.form.validation.emailRequired'),
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: t('cms.contact.form.validation.emailInvalid'),
            },
          }}
          render={({ field }) => (
            <Input
              type="email"
              label={t('cms.contact.form.emailLabel')}
              required
              error={errors.email?.message}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...field}
            />
          )}
        />

        <Controller
          name="inquiryType"
          control={control}
          render={({ field }) => (
            <Select
              label={t('cms.contact.form.inquiryTypeLabel')}
              options={inquiryTypeOptions}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <Controller
          name="subject"
          control={control}
          rules={{
            required: t('cms.contact.form.validation.subjectRequired'),
          }}
          render={({ field }) => (
            <Input
              label={t('cms.contact.form.subjectLabel')}
              required
              error={errors.subject?.message}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...field}
            />
          )}
        />

        <Controller
          name="message"
          control={control}
          rules={{
            required: t('cms.contact.form.validation.messageRequired'),
            maxLength: {
              value: MESSAGE_MAX_LENGTH,
              message: t('cms.contact.form.validation.messageTooLong', {
                max: MESSAGE_MAX_LENGTH,
              }),
            },
          }}
          render={({ field }) => (
            <Textarea
              label={t('cms.contact.form.messageLabel')}
              required
              rows={6}
              error={errors.message?.message}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...field}
            />
          )}
        />

        <Button type="submit" variant="primary" loading={isPending}>
          {isPending
            ? t('cms.contact.form.submitting')
            : t('cms.contact.form.submitAction')}
        </Button>

        <p className={styles.responseNote}>
          {t('cms.contact.form.responseNote')}
        </p>
      </Stack>
    </form>
  );
}

export default function ContactPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { data: cmsPage } = useCmsPageQuery('contact', i18n.language);
  const title = cmsPage?.title ?? t('cms.contact.title');
  const lead = cmsPage?.content ?? t('cms.contact.lead');

  const breadcrumbItems = [
    { label: t('nav.home'), href: `/${locale}` },
    { label: title, href: `/${locale}/contact` },
  ];

  useSeo({
    title: `${title} | ${t('app.name')}`,
    description: lead,
    locale,
    path: 'contact',
    jsonLd: [buildBreadcrumbListSchema(breadcrumbItems)],
  });

  return (
    <div className={styles.page}>
      <EditorialPageHero
        breadcrumbItems={breadcrumbItems}
        heroSeed="contact"
        icon={MessageCircle}
        eyebrow={t('cms.contact.eyebrow')}
        title={title}
        lead={lead}
      />
      <div className={styles.methods}>
        <a href="mailto:support@desavii.com" className={styles.emailCard}>
          <span className={styles.methodIcon} aria-hidden="true">
            <Mail size={22} />
          </span>
          <span className={styles.methodBody}>
            <span className={styles.methodLabel}>support@desavii.com</span>
          </span>
        </a>
        <div className={styles.hoursCard}>
          <span className={styles.methodIcon} aria-hidden="true">
            <Clock size={22} />
          </span>
          <span className={styles.methodBody}>
            <span className={styles.methodLabel}>{t('cms.contact.hours')}</span>
          </span>
        </div>
      </div>
      <section className={styles.formSection}>
        <h2 className={styles.formHeading}>{t('cms.contact.formHeading')}</h2>
        <p className={styles.formDescription}>
          {t('cms.contact.formDescription')}
        </p>
        <ContactForm />
      </section>
    </div>
  );
}

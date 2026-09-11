/**
 * BasicInfoStep — step 2, and the step that actually calls
 * `POST /listings` (React Hook Form + `Controller`, per
 * FRONTEND_ARCHITECTURE.md §15.1 — same pattern `LoginForm.jsx`
 * established, kept for the non-locale-specific `partnerId`/
 * `listingType` fields). Once a `listingId` exists, `partnerId`/
 * `listingType` become read-only: `updateListingSchema`'s body has no
 * field for either (a listing's owning partner and fundamental type are
 * only ever set at creation) — so this step edits translations only
 * from then on.
 *
 * 2026 Partner Workspace redesign (Sprint 3): title/summary/description
 * are no longer a single implicit-locale form field set — they're one
 * `draftsByLocale` map (`{ hy: {...}, ru: {...}, en: {...} }`), lifted
 * above `AuthoringLocaleTabs` so switching the authoring locale never
 * discards an unsaved edit in another locale (see that component's own
 * header for how). Plain controlled `Input`/`Textarea` here, not RHF —
 * RHF's uncontrolled-by-default model fights a value that needs to
 * change out from under it on every locale switch; `ContentStep`
 * already established this same plain-controlled-fields pattern for
 * its own per-row editors, so this isn't a new convention.
 *
 * "Continue" validates and saves whichever locale is CURRENTLY active
 * (never all three, never an unrelated default) then advances the
 * wizard step — this is the only save path before a listing exists,
 * since creating one requires `partnerId`/`listingType` too. Once a
 * `listingId` exists, a second "Save {locale} translation" action lets
 * a partner persist an additional locale without leaving the step.
 */

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input, Textarea, Select } from '@desavii/ui/components/form-controls';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { useToast } from '../../../../../contexts/ToastContext.jsx';
import { useCreateListingMutation } from '../../../mutations/useCreateListingMutation.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import { LISTING_TYPES } from '../../../constants/listingTypes.js';
import { LANGUAGE_ID_BY_LOCALE } from '../../../constants/languageIds.js';
import { SUPPORTED_LOCALES } from '../../../../../translations/i18n.js';
import AuthoringLocaleTabs from '../AuthoringLocaleTabs/AuthoringLocaleTabs.jsx';
import WizardStepActions from '../WizardStepActions.jsx';
import styles from './BasicInfoStep.module.scss';

function emptyDraft() {
  return { title: '', summary: '', description: '' };
}

function buildDraftsByLocale(translations) {
  const drafts = {};
  SUPPORTED_LOCALES.forEach((code) => {
    const row = translations.find((t) => t.language_code === code);
    drafts[code] = row
      ? {
          title: row.title ?? '',
          summary: row.summary ?? '',
          description: row.description ?? '',
        }
      : emptyDraft();
  });
  return drafts;
}

export default function BasicInfoStep({
  listingId = null,
  categoryId = null,
  partnerships,
  initialTranslations = [],
  authoringLocale,
  onAuthoringLocaleChange,
  onCreated,
  onBack = undefined,
  onNext,
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const createListingMutation = useCreateListingMutation();
  const updateListingMutation = useUpdateListingMutation();
  const isSubmitting =
    createListingMutation.isPending || updateListingMutation.isPending;
  const submitError =
    createListingMutation.error || updateListingMutation.error;

  const [draftsByLocale, setDraftsByLocale] = useState(() =>
    buildDraftsByLocale(initialTranslations),
  );
  const [titleErrorLocale, setTitleErrorLocale] = useState(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      partnerId: partnerships[0]?.partner_id ?? null,
      listingType: null,
    },
  });

  const activeDraft = draftsByLocale[authoringLocale];
  const completionByLocale = SUPPORTED_LOCALES.reduce((acc, code) => {
    acc[code] = draftsByLocale[code].title.trim().length > 0;
    return acc;
  }, {});

  function updateActiveDraft(field, value) {
    setDraftsByLocale((current) => ({
      ...current,
      [authoringLocale]: { ...current[authoringLocale], [field]: value },
    }));
  }

  function translationPayloadForLocale(locale) {
    const draft = draftsByLocale[locale];
    return {
      languageId: LANGUAGE_ID_BY_LOCALE[locale],
      title: draft.title.trim(),
      summary: draft.summary.trim() || undefined,
      description: draft.description.trim() || undefined,
    };
  }

  function validateActiveTitle() {
    if (draftsByLocale[authoringLocale].title.trim().length > 0) {
      setTitleErrorLocale(null);
      return true;
    }
    setTitleErrorLocale(authoringLocale);
    return false;
  }

  // Only reachable once `listingId` exists — a listing's `partnerId`/
  // `listingType` can't be set via this endpoint, so this never needs
  // those RHF-owned fields. `advance: false` (the standalone "Save
  // translation" button) is exactly why this step ever needs a save
  // path that ISN'T also a step transition.
  async function saveActiveLocale({ advance }) {
    if (!validateActiveTitle()) return;
    await updateListingMutation.mutateAsync({
      id: listingId,
      payload: { translations: [translationPayloadForLocale(authoringLocale)] },
    });
    if (advance) {
      onNext();
    } else {
      showToast(
        t('partner.listingWizard.locale.translationSaved', {
          locale: t(`partner.listingWizard.contentLocale.${authoringLocale}`),
        }),
        { variant: 'success' },
      );
    }
  }

  // `onCreated` (wired to `wizard.completeCreationStep`) sets `listingId`
  // AND advances to the next step in one URL update — calling `onNext()`
  // separately here would race it via a second, independent
  // `setSearchParams` call and silently drop the `listingId`. Creation
  // therefore always advances; the standalone "Save translation" button
  // stays hidden until a listing exists for exactly this reason.
  //
  // Sprint L fix (real data-loss bug, reproduced live): `POST /listings`
  // only ever accepts ONE translation, so only the locale active at the
  // moment Continue is clicked was ever persisted. Switching locale tabs
  // during this same visit never loses a draft (`draftsByLocale` lives
  // above `AuthoringLocaleTabs`, Sprint 3's own fix for that) — but the
  // instant `onCreated` advances the wizard step, THIS component
  // unmounts, taking every other locale's still-unsaved draft with it.
  // Returning to this step later re-initializes `draftsByLocale` from
  // `initialTranslations` — the server's truth, which only ever had the
  // one locale saved at creation — so a partner who typed HY, then RU,
  // then hit Continue while RU was active would find HY silently gone,
  // with no error and no warning. Once `data.id` exists, saving the
  // other drafts is exactly what the "Save {locale} translation" button
  // already does, so this fires that same save for every other locale
  // with real content before advancing, instead of requiring the
  // partner to notice the loss and redo the work by hand.
  async function onPreCreationSubmit(values) {
    if (!validateActiveTitle()) return;
    const { data } = await createListingMutation.mutateAsync({
      partnerId: values.partnerId,
      listingType: values.listingType,
      translations: [translationPayloadForLocale(authoringLocale)],
      categoryIds: categoryId ? [categoryId] : undefined,
    });

    const otherLocalesWithContent = SUPPORTED_LOCALES.filter(
      (code) => code !== authoringLocale && draftsByLocale[code].title.trim(),
    );
    if (otherLocalesWithContent.length > 0) {
      try {
        await Promise.all(
          otherLocalesWithContent.map((code) =>
            updateListingMutation.mutateAsync({
              id: data.id,
              payload: { translations: [translationPayloadForLocale(code)] },
            }),
          ),
        );
      } catch {
        // Non-fatal: the listing itself was created successfully. A
        // partner can still save the locale(s) that failed here via this
        // step's own "Save {locale} translation" button, now that
        // `listingId` exists.
        showToast(
          t('partner.listingWizard.locale.autoSaveOtherLocalesFailed'),
          {
            variant: 'danger',
          },
        );
      }
    }

    onCreated(data.id);
  }

  const titleErrorMessage =
    titleErrorLocale === authoringLocale
      ? t('partner.listingWizard.validation.required')
      : undefined;

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.basicInfo')}</h2>
      <Stack gap="4">
        {submitError && <Alert variant="danger">{submitError.message}</Alert>}

        {!listingId && (
          <form
            id="basic-info-partner-type-form"
            onSubmit={handleSubmit(onPreCreationSubmit)}
            noValidate
          >
            <Stack gap="4">
              {partnerships.length > 1 && (
                <Controller
                  name="partnerId"
                  control={control}
                  rules={{
                    required: t('partner.listingWizard.validation.required'),
                  }}
                  render={({ field }) => (
                    <Select
                      label={t('partner.listingWizard.basicInfo.partner')}
                      placeholder={t('partner.listingWizard.selectPlaceholder')}
                      options={partnerships.map((partnership) => ({
                        value: partnership.partner_id,
                        label: partnership.display_name,
                      }))}
                      error={errors.partnerId?.message}
                      required
                      // eslint-disable-next-line react/jsx-props-no-spreading
                      {...field}
                    />
                  )}
                />
              )}

              <Controller
                name="listingType"
                control={control}
                rules={{
                  required: t('partner.listingWizard.validation.required'),
                }}
                render={({ field }) => (
                  <Select
                    label={t('partner.listingWizard.basicInfo.listingType')}
                    placeholder={t('partner.listingWizard.selectPlaceholder')}
                    options={LISTING_TYPES.map((code) => ({
                      value: code,
                      label: t(
                        `partner.listingWizard.listingTypes.${code}`,
                        code,
                      ),
                    }))}
                    error={errors.listingType?.message}
                    required
                    // eslint-disable-next-line react/jsx-props-no-spreading
                    {...field}
                  />
                )}
              />
            </Stack>
          </form>
        )}

        <div>
          <p className={styles.localeNotice}>
            {t('partner.listingWizard.locale.notice', {
              locale: t(
                `partner.listingWizard.contentLocale.${authoringLocale}`,
              ),
            })}
          </p>
          <AuthoringLocaleTabs
            activeLocale={authoringLocale}
            onChange={onAuthoringLocaleChange}
            completionByLocale={completionByLocale}
            ariaLabel={t('partner.listingWizard.locale.switcherLabel')}
          >
            <Stack gap="4">
              <Input
                label={t('partner.listingWizard.basicInfo.title')}
                value={activeDraft.title}
                error={titleErrorMessage}
                required
                onChange={(event) =>
                  updateActiveDraft('title', event.target.value)
                }
              />
              <Input
                label={t('partner.listingWizard.basicInfo.summary')}
                value={activeDraft.summary}
                onChange={(event) =>
                  updateActiveDraft('summary', event.target.value)
                }
              />
              <Textarea
                label={t('partner.listingWizard.basicInfo.description')}
                rows={6}
                value={activeDraft.description}
                onChange={(event) =>
                  updateActiveDraft('description', event.target.value)
                }
              />
            </Stack>
          </AuthoringLocaleTabs>
        </div>

        {listingId && (
          <Inline justify="flex-end">
            <Button
              variant="secondary"
              loading={updateListingMutation.isPending}
              onClick={() => saveActiveLocale({ advance: false })}
            >
              {t('partner.listingWizard.locale.saveTranslation', {
                locale: t(
                  `partner.listingWizard.contentLocale.${authoringLocale}`,
                ),
              })}
            </Button>
          </Inline>
        )}
      </Stack>

      <WizardStepActions
        onBack={onBack}
        onContinue={() =>
          listingId
            ? saveActiveLocale({ advance: true })
            : handleSubmit(onPreCreationSubmit)()
        }
        isSubmitting={isSubmitting}
        backLabel={t('partner.listingWizard.back')}
        continueLabel={t('partner.listingWizard.continue')}
      />
    </div>
  );
}

const partnershipShape = PropTypes.shape({
  partner_id: PropTypes.number.isRequired,
  display_name: PropTypes.string.isRequired,
});

const translationShape = PropTypes.shape({
  language_code: PropTypes.string.isRequired,
  title: PropTypes.string,
  summary: PropTypes.string,
  description: PropTypes.string,
});

BasicInfoStep.propTypes = {
  listingId: PropTypes.number,
  categoryId: PropTypes.number,
  partnerships: PropTypes.arrayOf(partnershipShape).isRequired,
  initialTranslations: PropTypes.arrayOf(translationShape),
  authoringLocale: PropTypes.oneOf(SUPPORTED_LOCALES).isRequired,
  onAuthoringLocaleChange: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};

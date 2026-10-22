/**
 * LocationStep — where the listing is: its city, its street address and its
 * exact pin.
 *
 * - **City** (required to publish — `ListingService.#checkPublishReadiness`
 *   `CITY_REQUIRED`): the localized city list Search's own destination
 *   picker uses (`GET /search/destinations`, every seeded city), so a
 *   listing is always findable by the destination guests search for.
 *   Choosing a city frames it on the map until the pin is placed.
 * - **Street address** (optional): public for venues, so guests can find
 *   them; for a private stay (PROPERTY — apartments, villas, guest houses)
 *   it stays private, matching the approximate public map.
 * - **Pin**: clicking the map sets both coordinates; the raw numbers sit
 *   behind a disclosure (Step L2) that opens itself on an error.
 *
 * `LocationPicker` is `lazy()`-loaded for the exact reason
 * `ListingLocationSection.jsx` already lazy-loads `ListingMap`: a static
 * import of `leaflet`/`react-leaflet` (plus its module-level icon-config
 * side effect) would otherwise land in whatever shared chunk this
 * wizard-steps barrel resolves to, bloating every other step with map code
 * most of them never use.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { Alert, Skeleton } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import ApiErrorAlert from '../../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import {
  parseApiError,
  getIssueMessage,
} from '../../../../../utils/apiErrorFeedback.js';
import { useDestinationsQuery } from '../../../../search/index.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import WizardStepActions from '../WizardStepActions.jsx';
import styles from './LocationStep.module.scss';

const LocationPicker = lazy(() => import('./LocationPicker.jsx'));

const ADDRESS_MAX_LENGTH = 255;

// API path -> this form's react-hook-form field name.
const FORM_FIELD_BY_API_PATH = {
  'location.cityId': 'cityId',
  'location.addressLine': 'addressLine',
  'location.latitude': 'latitude',
  'location.longitude': 'longitude',
};

export default function LocationStep({
  listingId,
  listingType = null,
  initialValues = {},
  onBack = undefined,
  onNext,
}) {
  const { t, i18n } = useTranslation();
  const updateListingMutation = useUpdateListingMutation();
  const { data: cities = [], isPending: isCitiesPending } =
    useDestinationsQuery({ locale: i18n.language });
  const isPrivateStay = listingType === 'PROPERTY';

  const {
    control,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      cityId: initialValues.cityId ?? null,
      addressLine: initialValues.addressLine ?? '',
      latitude: initialValues.latitude ?? '',
      longitude: initialValues.longitude ?? '',
    },
  });

  // Backs the map picker below — the number fields stay the field of
  // record (react-hook-form's own state), the map just reads/writes the
  // same two values so neither can drift out of sync with the other.
  const watchedLatitude = watch('latitude');
  const watchedLongitude = watch('longitude');
  const numericLatitude =
    watchedLatitude === '' ? undefined : Number(watchedLatitude);
  const numericLongitude =
    watchedLongitude === '' ? undefined : Number(watchedLongitude);
  const chosenCity = cities.find((city) => city.id === watch('cityId'));
  const cityFocus =
    chosenCity?.latitude != null
      ? [Number(chosenCity.latitude), Number(chosenCity.longitude)]
      : null;

  const handleMapPick = useCallback(
    (lat, lng) => {
      setValue('latitude', Number(lat.toFixed(6)), {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue('longitude', Number(lng.toFixed(6)), {
        shouldValidate: true,
        shouldDirty: true,
      });
    },
    [setValue],
  );

  // Step L2 — collapsed by default; auto-opens the instant either field
  // actually has a validation error (Continue clicked with no marker
  // ever placed), so the error is never hidden inside a closed
  // disclosure.
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const hasCoordinateError = Boolean(errors.latitude || errors.longitude);
  useEffect(() => {
    if (hasCoordinateError) setIsAdvancedOpen(true);
  }, [hasCoordinateError]);

  // A server-side rejection lands on the field itself (RHF's own error
  // state), which also opens the coordinates disclosure above.
  const serverError = updateListingMutation.error;
  useEffect(() => {
    parseApiError(serverError)?.issues.forEach((issue) => {
      const fieldName = FORM_FIELD_BY_API_PATH[issue.path];
      if (fieldName) {
        setError(fieldName, {
          type: 'server',
          message: getIssueMessage(t, issue),
        });
      }
    });
  }, [serverError, setError, t]);

  async function onSubmit(values) {
    // Step L4 (brief §14-16) — `Number('')` is `0`, a mathematically
    // valid latitude (the equator); RHF's own `required` rule on both
    // fields already keeps this branch unreachable in normal use, but
    // this is the direct guarantee that a blank coordinate can never
    // silently become "0,0".
    const latitude = Number(values.latitude);
    const longitude = Number(values.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    try {
      await updateListingMutation.mutateAsync({
        id: listingId,
        payload: {
          location: {
            cityId: values.cityId,
            addressLine: values.addressLine.trim(),
            latitude,
            longitude,
          },
        },
      });
    } catch {
      // Rendered from the mutation's own `error` (ApiErrorAlert + fields).
      return;
    }
    onNext();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2>{t('partner.listingWizard.steps.location')}</h2>
      <p className={styles.intro}>
        {t('partner.listingWizard.location.intro')}
      </p>
      <Stack gap="4">
        <ApiErrorAlert
          error={serverError}
          inlinePaths={Object.keys(FORM_FIELD_BY_API_PATH)}
        />

        <div className={styles.placeFields}>
          <Controller
            name="cityId"
            control={control}
            rules={{
              required: t('partner.listingWizard.location.cityRequired'),
            }}
            render={({ field }) => (
              <Select
                label={t('partner.listingWizard.location.city')}
                placeholder={
                  isCitiesPending
                    ? t('partner.listingWizard.location.cityLoading')
                    : t('partner.listingWizard.location.cityPlaceholder')
                }
                options={cities.map((city) => ({
                  value: city.id,
                  label: city.name,
                }))}
                value={field.value ?? undefined}
                onChange={field.onChange}
                error={errors.cityId?.message}
                searchable
                searchPlaceholder={t(
                  'partner.listingWizard.location.citySearch',
                )}
                noOptionsMessage={t(
                  'partner.listingWizard.location.cityNoMatch',
                )}
                required
              />
            )}
          />

          <Controller
            name="addressLine"
            control={control}
            rules={{
              maxLength: {
                value: ADDRESS_MAX_LENGTH,
                message: t('partner.listingWizard.location.addressTooLong'),
              },
            }}
            render={({ field }) => (
              <Input
                label={t('partner.listingWizard.location.address')}
                helperText={
                  isPrivateStay
                    ? t('partner.listingWizard.location.addressHintPrivate')
                    : t('partner.listingWizard.location.addressHintPublic')
                }
                maxLength={ADDRESS_MAX_LENGTH}
                error={errors.addressLine?.message}
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...field}
              />
            )}
          />
        </div>

        {isPrivateStay && (
          <Alert variant="info">
            {t('partner.listingWizard.location.privateStayNotice')}
          </Alert>
        )}

        <Suspense fallback={<Skeleton variant="rect" height={280} />}>
          <LocationPicker
            latitude={numericLatitude}
            longitude={numericLongitude}
            cityFocus={cityFocus}
            onPick={handleMapPick}
          />
        </Suspense>

        <details
          className={styles.advanced}
          open={isAdvancedOpen}
          onToggle={(event) => setIsAdvancedOpen(event.target.open)}
        >
          <summary className={styles.advancedSummary}>
            {t('partner.listingWizard.location.advancedToggle')}
          </summary>
          <Stack gap="4" className={styles.advancedContent}>
            <p className={styles.advancedHint}>
              {t('partner.listingWizard.location.advancedHint')}
            </p>
            <Controller
              name="latitude"
              control={control}
              rules={{
                required: t('partner.listingWizard.validation.required'),
                min: {
                  value: -90,
                  message: t('partner.listingWizard.validation.latitudeRange'),
                },
                max: {
                  value: 90,
                  message: t('partner.listingWizard.validation.latitudeRange'),
                },
              }}
              render={({ field }) => (
                <Input
                  type="number"
                  label={t('partner.listingWizard.location.latitude')}
                  error={errors.latitude?.message}
                  required
                  // eslint-disable-next-line react/jsx-props-no-spreading
                  {...field}
                />
              )}
            />

            <Controller
              name="longitude"
              control={control}
              rules={{
                required: t('partner.listingWizard.validation.required'),
                min: {
                  value: -180,
                  message: t('partner.listingWizard.validation.longitudeRange'),
                },
                max: {
                  value: 180,
                  message: t('partner.listingWizard.validation.longitudeRange'),
                },
              }}
              render={({ field }) => (
                <Input
                  type="number"
                  label={t('partner.listingWizard.location.longitude')}
                  error={errors.longitude?.message}
                  required
                  // eslint-disable-next-line react/jsx-props-no-spreading
                  {...field}
                />
              )}
            />
          </Stack>
        </details>
      </Stack>

      <WizardStepActions
        onBack={onBack}
        onContinue={handleSubmit(onSubmit)}
        isSubmitting={updateListingMutation.isPending}
        backLabel={t('partner.listingWizard.back')}
        continueLabel={t('partner.listingWizard.continue')}
      />
    </form>
  );
}

LocationStep.propTypes = {
  listingId: PropTypes.number.isRequired,
  /** `PROPERTY` (a private stay) keeps the street address private. */
  listingType: PropTypes.string,
  initialValues: PropTypes.shape({
    cityId: PropTypes.number,
    addressLine: PropTypes.string,
    latitude: PropTypes.number,
    longitude: PropTypes.number,
  }),
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};

/**
 * LocationStep — step 3. `ListingService.#checkPublishReadiness` only
 * ever checks `location.latitude`/`location.longitude` (never `cityId`/
 * `addressId`) for publish-gating, so those two are this step's only
 * required fields.
 *
 * KNOWN LIMITATION: no city-lookup endpoint (`GET /cities` or similar)
 * exists anywhere in the backend yet for resolving a city name to
 * `cityId` — `api/search.js`'s `searchListings` only ever *consumes* a
 * `cityId` filter, it doesn't expose a way to look one up. Rather than
 * inventing a text-to-id mapping with no real data source behind it,
 * this step only collects latitude/longitude; `cityId`/`addressId`
 * remain unset (both genuinely optional per `locationSchema`).
 *
 * `LocationPicker` is `lazy()`-loaded for the exact reason
 * `ListingLocationSection.jsx` already lazy-loads `ListingMap`: a static
 * import of `leaflet`/`react-leaflet` (plus its module-level icon-config
 * side effect) would otherwise land in whatever shared chunk this
 * wizard-steps barrel resolves to, bloating every other step (and every
 * other consumer of that barrel) with map code most of them never use.
 */

import { lazy, Suspense, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input } from '@desavii/ui/components/form-controls';
import { Alert, Skeleton } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import WizardStepActions from '../WizardStepActions.jsx';

const LocationPicker = lazy(() => import('./LocationPicker.jsx'));

export default function LocationStep({
  listingId,
  initialValues = {},
  onBack = undefined,
  onNext,
}) {
  const { t } = useTranslation();
  const updateListingMutation = useUpdateListingMutation();

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
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

  async function onSubmit(values) {
    await updateListingMutation.mutateAsync({
      id: listingId,
      payload: {
        location: {
          latitude: Number(values.latitude),
          longitude: Number(values.longitude),
        },
      },
    });
    onNext();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2>{t('partner.listingWizard.steps.location')}</h2>
      <Stack gap="4">
        {updateListingMutation.error && (
          <Alert variant="danger">{updateListingMutation.error.message}</Alert>
        )}

        <Suspense fallback={<Skeleton variant="rect" height={280} />}>
          <LocationPicker
            latitude={numericLatitude}
            longitude={numericLongitude}
            onPick={handleMapPick}
          />
        </Suspense>

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
  initialValues: PropTypes.shape({
    latitude: PropTypes.number,
    longitude: PropTypes.number,
  }),
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};

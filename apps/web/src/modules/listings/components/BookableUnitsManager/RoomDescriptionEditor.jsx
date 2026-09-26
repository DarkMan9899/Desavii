/**
 * RoomDescriptionEditor (Sprint C-1) — genuinely multilingual room
 * description authoring for one `bookable_unit`. Mirrors `ContentStep`'s
 * own "one authoring locale, lifted per-locale state, never discard an
 * unsaved edit on tab switch" pattern, just for a single Textarea instead
 * of four rich-content collections — same `AuthoringLocaleTabs` primitive,
 * same `getLocalizedItemsExact` (an empty HY tab must look empty, never
 * silently show EN content that would be saved back as if authored HY).
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Stack } from '@desavii/ui/components/layout';
import { getLocalizedItemsExact } from '../../utils/getLocalizedItems.js';
import ApiErrorAlert from '../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import useApiFieldErrors from '../../../../hooks/useApiFieldErrors.js';
import { SUPPORTED_LOCALES } from '../../../../translations/i18n.js';
import AuthoringLocaleTabs from '../PartnerListingWizard/AuthoringLocaleTabs/AuthoringLocaleTabs.jsx';
import { useUpdateBookableUnitDescriptionMutation } from '../../../availability/index.js';

// availabilityValidators.js: updateUnitDescriptionSchema description.max(4000).
const ROOM_DESCRIPTION_MAX_LENGTH = 4000;

function buildDescriptionsByLocale(translations) {
  const byLocale = {};
  SUPPORTED_LOCALES.forEach((code) => {
    const [row] = getLocalizedItemsExact(translations, code);
    byLocale[code] = row?.description ?? '';
  });
  return byLocale;
}

export default function RoomDescriptionEditor({
  unitId,
  listingId,
  translations = [],
}) {
  const { t } = useTranslation();
  const [authoringLocale, setAuthoringLocale] = useState(SUPPORTED_LOCALES[0]);
  const [descriptionsByLocale, setDescriptionsByLocale] = useState(() =>
    buildDescriptionsByLocale(translations),
  );
  const mutation = useUpdateBookableUnitDescriptionMutation();
  const { fieldError, clearFieldError } = useApiFieldErrors(mutation.error);
  // A server error belongs to the locale that was saved; after a tab
  // switch it is shown in the summary instead of under another language.
  const [savedLocale, setSavedLocale] = useState(null);
  const showsSavedLocale = savedLocale === authoringLocale;

  const completionByLocale = SUPPORTED_LOCALES.reduce((acc, code) => {
    acc[code] = descriptionsByLocale[code].trim().length > 0;
    return acc;
  }, {});

  function handleSave() {
    setSavedLocale(authoringLocale);
    mutation.mutate({
      id: unitId,
      listingId,
      description: descriptionsByLocale[authoringLocale].trim() || null,
      languageCode: authoringLocale,
    });
  }

  return (
    <Stack gap="3">
      <h4>{t('partner.listingWizard.availability.roomDescriptionHeading')}</h4>
      <ApiErrorAlert
        error={mutation.error}
        inlinePaths={showsSavedLocale ? ['description'] : []}
        fieldLabels={{
          description: t(
            'partner.listingWizard.availability.roomDescriptionLabel',
          ),
        }}
      />
      <AuthoringLocaleTabs
        activeLocale={authoringLocale}
        onChange={setAuthoringLocale}
        completionByLocale={completionByLocale}
        ariaLabel={t('partner.listingWizard.locale.switcherLabel')}
      >
        <Textarea
          label={t('partner.listingWizard.availability.roomDescriptionLabel')}
          value={descriptionsByLocale[authoringLocale]}
          maxLength={ROOM_DESCRIPTION_MAX_LENGTH}
          error={showsSavedLocale ? fieldError('description') : undefined}
          onChange={(event) => {
            setDescriptionsByLocale((current) => ({
              ...current,
              [authoringLocale]: event.target.value,
            }));
            if (showsSavedLocale) clearFieldError('description');
          }}
        />
      </AuthoringLocaleTabs>
      <Button
        variant="secondary"
        size="sm"
        loading={mutation.isPending}
        onClick={() => handleSave()}
      >
        {t('partner.listingWizard.locale.saveTranslation', {
          locale: t(`partner.listingWizard.contentLocale.${authoringLocale}`),
        })}
      </Button>
    </Stack>
  );
}

RoomDescriptionEditor.propTypes = {
  unitId: PropTypes.number.isRequired,
  listingId: PropTypes.number.isRequired,
  translations: PropTypes.arrayOf(
    PropTypes.shape({
      language_code: PropTypes.string.isRequired,
      description: PropTypes.string,
    }),
  ),
};

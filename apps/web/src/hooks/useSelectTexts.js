/**
 * The shared `Select`'s own built-in strings, translated. `@desavii/ui`
 * carries no i18n, so its defaults are English: "Select…" with no value,
 * "Search…"/"No results" once the list is searchable (explicitly, or
 * automatically past 8 options) and "Remove {label}" on multi-select
 * chips. Pass the matching entries to any Select that can reach one of
 * those states (a list that can pass 8 options, an unset value without
 * its own placeholder, a multi-select):
 *
 *   const selectTexts = useSelectTexts();
 *   <Select
 *     searchPlaceholder={selectTexts.searchPlaceholder}
 *     noOptionsMessage={selectTexts.noOptionsMessage}
 *     …
 *   />
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export default function useSelectTexts() {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      placeholder: t('common.select.placeholder'),
      searchPlaceholder: t('common.select.searchPlaceholder'),
      noOptionsMessage: t('common.select.noResults'),
      getRemoveChipLabel: (label) => t('common.select.removeOption', { label }),
    }),
    [t],
  );
}

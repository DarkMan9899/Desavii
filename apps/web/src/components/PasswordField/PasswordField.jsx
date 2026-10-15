/**
 * PasswordField — the app's one password input: `@desavii/ui`'s
 * `PasswordInput` (eye / eye-off show-hide toggle) with its button names
 * translated, so every form gets the same, localized control instead of
 * its own show/hide logic. Every other prop — label, error, the React Hook
 * Form `field` bundle, `autoComplete` — passes straight through, and the
 * `ref` reaches the real `<input>`.
 */

import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PasswordInput } from '@desavii/ui/components/form-controls';

const PasswordField = forwardRef(function PasswordField(props, ref) {
  const { t } = useTranslation();
  return (
    <PasswordInput
      // A thin localization of PasswordInput: its props pass through.
      // eslint-disable-next-line react/jsx-props-no-spreading
      {...props}
      ref={ref}
      showLabel={t('common.password.show')}
      hideLabel={t('common.password.hide')}
    />
  );
});

export default PasswordField;

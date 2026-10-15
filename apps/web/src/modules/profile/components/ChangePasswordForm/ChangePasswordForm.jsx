/**
 * ChangePasswordForm — `POST /users/:id/change-password`, owner-only
 * (`UserService.changePassword`'s "no permission fallback" rule — this
 * form is only ever rendered for the signed-in user's own account).
 * Reuses the `auth` module's `isStrongPassword` policy so the client-side
 * check matches `changePasswordSchema`'s server-side rule exactly.
 */

import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@desavii/ui/components/primitives';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import PropTypes from 'prop-types';
import PasswordField from '../../../../components/PasswordField/PasswordField.jsx';
import { isStrongPassword } from '../../../auth/schemas/passwordPolicy.js';

export default function ChangePasswordForm({
  isPending,
  error = null,
  onSave,
}) {
  const { t } = useTranslation();

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });
  const newPassword = watch('newPassword');

  async function onSubmit(values) {
    const succeeded = await onSave({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (succeeded) reset();
  }

  const errorMessage =
    error?.code === 'INVALID_CREDENTIALS'
      ? t('profile.settings.password.wrongCurrent')
      : error && t('profile.settings.password.genericError');

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="4">
        {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

        <Controller
          name="currentPassword"
          control={control}
          rules={{ required: t('profile.settings.password.currentRequired') }}
          render={({ field }) => (
            <PasswordField
              autoComplete="current-password"
              label={t('profile.settings.password.current')}
              required
              error={errors.currentPassword?.message}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...field}
            />
          )}
        />

        <Controller
          name="newPassword"
          control={control}
          rules={{
            required: t('auth.validation.passwordRequired'),
            validate: (value) =>
              isStrongPassword(value) || t('auth.validation.passwordWeak'),
          }}
          render={({ field }) => (
            <PasswordField
              autoComplete="new-password"
              label={t('profile.settings.password.new')}
              required
              helperText={
                errors.newPassword
                  ? undefined
                  : t('auth.validation.passwordWeak')
              }
              error={errors.newPassword?.message}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...field}
            />
          )}
        />

        <Controller
          name="confirmPassword"
          control={control}
          rules={{
            required: t('profile.settings.password.confirmRequired'),
            validate: (value) =>
              value === newPassword ||
              t('profile.settings.password.confirmMismatch'),
          }}
          render={({ field }) => (
            <PasswordField
              autoComplete="new-password"
              label={t('profile.settings.password.confirm')}
              required
              error={errors.confirmPassword?.message}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...field}
            />
          )}
        />

        <div>
          <Button type="submit" variant="primary" loading={isPending}>
            {t('profile.settings.password.submit')}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

ChangePasswordForm.propTypes = {
  isPending: PropTypes.bool.isRequired,
  error: PropTypes.shape({ code: PropTypes.string }),
  onSave: PropTypes.func.isRequired,
};

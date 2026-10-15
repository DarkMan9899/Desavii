/**
 * ResetPasswordForm — `POST /auth/password-reset/confirm`. The token
 * comes from the route (`auth/reset-password/:token`, matching
 * `partner/invitations/:token`'s existing path-param convention for a
 * single-use link), never a form field — the user never sees or types it.
 * Mirrors `ChangePasswordForm.jsx`'s new/confirm-password field pair
 * (minus `currentPassword`, which does not apply here: the token itself
 * is the authorization).
 */

import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@desavii/ui/components/primitives';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import PasswordField from '../../../../components/PasswordField/PasswordField.jsx';
import { useResetPasswordMutation } from '../../mutations/useResetPasswordMutation.js';
import { isStrongPassword } from '../../schemas/passwordPolicy.js';

const ERROR_MESSAGE_KEYS = {
  RESET_TOKEN_EXPIRED: 'auth.resetPassword.tokenExpired',
  RESET_TOKEN_INVALID: 'auth.resetPassword.tokenInvalid',
};

export default function ResetPasswordForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { locale, token } = useParams();
  const { mutateAsync, isPending, error } = useResetPasswordMutation();

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({ defaultValues: { newPassword: '', confirmPassword: '' } });
  const newPassword = watch('newPassword');

  async function onSubmit(values) {
    try {
      await mutateAsync({ token, newPassword: values.newPassword });
      navigate(`/${locale}/auth/login?reset=success`, { replace: true });
    } catch {
      // Surfaced below via the mutation's `error` state.
    }
  }

  const errorMessageKey = ERROR_MESSAGE_KEYS[error?.code];
  const errorMessage = error
    ? t(errorMessageKey ?? 'auth.resetPassword.genericError')
    : null;
  // Once the token itself is confirmed dead (invalid/expired), retrying
  // the same submit can only fail again — offer the one action that can
  // actually help instead of a form the user would just resubmit in vain.
  const tokenIsDead = Boolean(errorMessageKey);

  if (tokenIsDead) {
    return (
      <Stack gap="4">
        <Alert variant="danger">{errorMessage}</Alert>
        <p>
          <Link to={`/${locale}/auth/forgot-password`}>
            {t('auth.resetPassword.requestNewLink')}
          </Link>
        </p>
      </Stack>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="4">
        {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

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
              label={t('auth.resetPassword.newPassword')}
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
            required: t('auth.resetPassword.confirmRequired'),
            validate: (value) =>
              value === newPassword || t('auth.resetPassword.confirmMismatch'),
          }}
          render={({ field }) => (
            <PasswordField
              autoComplete="new-password"
              label={t('auth.resetPassword.confirmPassword')}
              required
              error={errors.confirmPassword?.message}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...field}
            />
          )}
        />

        <Button type="submit" variant="primary" fullWidth loading={isPending}>
          {t('auth.resetPassword.submit')}
        </Button>
      </Stack>
    </form>
  );
}

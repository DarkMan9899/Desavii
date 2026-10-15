/**
 * Auth and partner entry flows, end to end (seeded test accounts; one
 * disposable sign-up, removed by the next `db:seed:demo`):
 * - the navbar's "Sign up" is customer registration only;
 * - the partner page's "Start" goes straight into partner onboarding: a
 *   visitor creates their partner account and lands on the partner
 *   application (it used to bounce them to the login page and lose the
 *   partner intent); a signed-in customer applies with the account they
 *   already have; nobody signed in is offered a second account;
 * - every password field shows/hides by a real click or tap, a password
 *   and its confirmation independently;
 * - login lands each representative role on its own workspace;
 * - HY and RU keep their locale through all of it.
 */

import { test, expect, resetRateLimits } from './fixtures.js';

const CUSTOMER = {
  email: 'customer@travelhub.dev',
  password: 'DevCustomer!2024',
};
const PARTNER = { email: 'vendor@travelhub.dev', password: 'DevVendor!2024' };
const ADMIN = { email: 'admin@travelhub.dev', password: 'DevAdmin!2024' };
const NEW_PASSWORD = 'Synthetic!Pass2026';
const PHONE = { width: 390, height: 844 };
const COPY = {
  en: {
    signUp: 'Sign up',
    start: 'Get started',
    customerTitle: 'Create your account',
    partnerTitle: 'Create your partner account',
    show: 'Show password',
    hide: 'Hide password',
  },
  hy: {
    signUp: 'Գրանցվել',
    start: 'Սկսել',
    customerTitle: 'Ստեղծեք հաշիվ',
    partnerTitle: 'Ստեղծեք գործընկերոջ հաշիվ',
    show: 'Ցույց տալ գաղտնաբառը',
    hide: 'Թաքցնել գաղտնաբառը',
  },
  ru: {
    signUp: 'Регистрация',
    start: 'Начать',
    customerTitle: 'Создать аккаунт',
    partnerTitle: 'Создайте аккаунт партнёра',
    show: 'Показать пароль',
    hide: 'Скрыть пароль',
  },
};

async function login(page, { email, password }) {
  await resetRateLimits();
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

/** The header's guest "Sign up" — inside the menu drawer on a phone. */
async function pressHeaderSignUp(page, locale) {
  const visible = page
    .getByRole('button', { name: COPY[locale].signUp, exact: true })
    .and(page.locator(':visible'));
  if ((await visible.count()) === 0) {
    await page.locator('header button:visible').first().click();
  }
  await page
    .getByRole('button', { name: COPY[locale].signUp, exact: true })
    .and(page.locator(':visible'))
    .last()
    .click();
}

async function pressPartnerStart(page, locale) {
  await page.goto(`/${locale}/become-a-partner`);
  await page
    .getByRole('button', { name: COPY[locale].start, exact: true })
    .click();
}

/** Show then hide one password field by a real press; value untouched. */
async function expectToggles(field, toggleScope, locale) {
  await field.fill(NEW_PASSWORD);
  await toggleScope
    .getByRole('button', { name: COPY[locale].show })
    .first()
    .click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(field).toHaveValue(NEW_PASSWORD);
  await toggleScope
    .getByRole('button', { name: COPY[locale].hide })
    .first()
    .click();
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveValue(NEW_PASSWORD);
}

test.describe('Auth and partner entry', () => {
  test.describe('desktop (1440px)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('navbar "Sign up" opens customer registration only', async ({
      page,
    }) => {
      await page.goto('/en');
      await pressHeaderSignUp(page, 'en');

      await expect(page).toHaveURL(/\/en\/auth\/register$/);
      await expect(
        page.getByRole('heading', { level: 1, name: COPY.en.customerTitle }),
      ).toBeVisible();
      await expect(page.getByText(COPY.en.partnerTitle)).toHaveCount(0);
    });

    test('partner "Start" creates a partner account and lands on the partner application, never the customer account', async ({
      page,
    }) => {
      await resetRateLimits();
      await pressPartnerStart(page, 'en');
      await expect(page).toHaveURL(/\/en\/partner\/register$/);
      await expect(
        page.getByRole('heading', { level: 1, name: COPY.en.partnerTitle }),
      ).toBeVisible();

      await page.getByLabel('First name').fill('E2E');
      await page.getByLabel('Last name').fill('Partner Applicant');
      await page
        .getByLabel('Email')
        .fill(`e2e.partner.entry.${Date.now()}@example.test`);
      await page.getByLabel(/^Password/).fill(NEW_PASSWORD);
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page).toHaveURL(/\/en\/partner\/apply$/);
      await expect(
        page.getByRole('heading', { name: 'Partner application' }),
      ).toBeVisible();
    });

    test('password fields show and hide by a real click — login, registration, and a reset password with its confirmation independently', async ({
      page,
    }) => {
      await page.goto('/en/auth/login');
      const loginPassword = page.getByLabel(/^Password/);
      await expect(loginPassword).toHaveAttribute(
        'autocomplete',
        'current-password',
      );
      await expectToggles(loginPassword, page, 'en');

      await page.goto('/en/auth/register');
      const registerPassword = page.getByLabel(/^Password/);
      await expect(registerPassword).toHaveAttribute(
        'autocomplete',
        'new-password',
      );
      await expectToggles(registerPassword, page, 'en');

      await page.goto('/en/auth/reset-password/not-a-real-token');
      const resetFields = page.locator('input[autocomplete="new-password"]');
      const newPassword = resetFields.nth(0);
      const confirmPassword = resetFields.nth(1);
      await newPassword.fill(NEW_PASSWORD);
      await confirmPassword.fill(NEW_PASSWORD);
      await page.getByRole('button', { name: COPY.en.show }).last().click();
      await expect(confirmPassword).toHaveAttribute('type', 'text');
      await expect(newPassword).toHaveAttribute('type', 'password');
    });

    test('a signed-in customer pressing "Start" applies with their existing account, and is never offered a second one', async ({
      page,
    }) => {
      await login(page, CUSTOMER);
      await pressPartnerStart(page, 'en');
      await expect(page).toHaveURL(/\/en\/partner\/apply$/);

      await page.goto('/en/partner/register');
      await expect(page).toHaveURL(/\/en\/partner\/apply$/);
      await page.goto('/en/auth/register');
      await expect(page).toHaveURL(/\/en\/account$/);
      await page.goto('/en/auth/login');
      await expect(page).toHaveURL(/\/en\/account$/);
    });

    [
      ['a customer', CUSTOMER, /\/en\/account$/],
      ['a partner owner', PARTNER, /\/en\/partner$/],
      ['an admin', ADMIN, /\/en\/admin$/],
    ].forEach(([who, account, landing]) => {
      test(`login lands ${who} on their own workspace`, async ({ page }) => {
        await login(page, account);
        await expect(page).toHaveURL(landing);
      });
    });

    test('a signed-in partner pressing "Start" goes to their partner workspace', async ({
      page,
    }) => {
      await login(page, PARTNER);
      await pressPartnerStart(page, 'en');
      await expect(page).toHaveURL(/\/en\/partner$/);
    });
  });

  test.describe('phone (390px, touch)', () => {
    test.use({ viewport: PHONE, hasTouch: true });

    ['hy', 'ru'].forEach((locale) => {
      test(`${locale.toUpperCase()}: "Sign up" and "Start" keep the language and lead to customer vs partner registration; the password toggle works by tap`, async ({
        page,
      }) => {
        await page.goto(`/${locale}`);
        await pressHeaderSignUp(page, locale);
        await expect(page).toHaveURL(new RegExp(`/${locale}/auth/register$`));
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: COPY[locale].customerTitle,
          }),
        ).toBeVisible();

        await pressPartnerStart(page, locale);
        await expect(page).toHaveURL(
          new RegExp(`/${locale}/partner/register$`),
        );
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: COPY[locale].partnerTitle,
          }),
        ).toBeVisible();

        const password = page.locator('input[autocomplete="new-password"]');
        await password.fill(NEW_PASSWORD);
        await page.getByRole('button', { name: COPY[locale].show }).tap();
        await expect(password).toHaveAttribute('type', 'text');
        await page.getByRole('button', { name: COPY[locale].hide }).tap();
        await expect(password).toHaveAttribute('type', 'password');
        await expect(password).toHaveValue(NEW_PASSWORD);

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBe(0);
      });
    });
  });
});

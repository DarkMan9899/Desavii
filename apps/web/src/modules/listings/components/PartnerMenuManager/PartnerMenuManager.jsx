/**
 * PartnerMenuManager — Pass 6 (Restaurant vertical, owner issue #13).
 * The REQUIRED Partner Menu Authoring UI: create/rename/edit/toggle a
 * Menu, then manage its Sections/Items via `MenuPanel`. The backend CRUD
 * + ownership enforcement (`RestaurantMenuService`) already existed from
 * an earlier pass — this is the first UI to actually call it.
 *
 * A Menu is a language-SCOPED entity from creation (migration 0045:
 * `restaurant_menus.language_id NOT NULL`), never a shared entity with
 * child translation rows — so "switch authoring language" here means
 * switching which language's independent menu(s) are shown, not
 * translating one canonical menu in place. Reuses the exact
 * `AuthoringLocaleTabs` component `BasicInfoStep`/`ContentStep` already
 * use for that same "author this content in a specific, independently
 * chosen language" concept, with a real (not fabricated) completion
 * signal: a language tab shows ✓ only once at least one real menu
 * exists in it.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Card, Button, Badge } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import {
  Spinner,
  ErrorState,
  Alert,
} from '@desavii/ui/components/feedback-overlays';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useListingMenuQuery } from '../../queries/useListingMenuQuery.js';
import { useCreateListingMenuMutation } from '../../mutations/useCreateListingMenuMutation.js';
import { useUpdateListingMenuMutation } from '../../mutations/useUpdateListingMenuMutation.js';
import { useDeleteListingMenuMutation } from '../../mutations/useDeleteListingMenuMutation.js';
import { SUPPORTED_LOCALES } from '../../../../translations/i18n.js';
import AuthoringLocaleTabs from '../PartnerListingWizard/AuthoringLocaleTabs/AuthoringLocaleTabs.jsx';
import MenuForm from './MenuForm.jsx';
import MenuPanel from './MenuPanel.jsx';

function LocaleMenuList({ listingId, locale }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const menusQuery = useListingMenuQuery(listingId, locale);

  const [editingMenuId, setEditingMenuId] = useState(null);
  const [isAddingMenu, setIsAddingMenu] = useState(false);

  const createMenu = useCreateListingMenuMutation();
  const updateMenu = useUpdateListingMenuMutation();
  const deleteMenu = useDeleteListingMenuMutation();

  if (menusQuery.isPending) {
    return <Spinner label={t('partner.listingMenu.menusLoading')} />;
  }
  if (menusQuery.isError) {
    return (
      <ErrorState
        title={t('partner.listingMenu.menusErrorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={menusQuery.refetch}
      />
    );
  }

  const menus = menusQuery.data ?? [];

  async function handleDeleteMenu(menu) {
    const confirmed = await confirm({
      title: t('partner.listingMenu.deleteMenuConfirmTitle'),
      description: t('partner.listingMenu.deleteMenuConfirmDescription'),
      confirmLabel: t('partner.listingMenu.deleteMenuConfirmAction'),
      cancelLabel: t('partner.listingMenu.deleteMenuConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    deleteMenu.mutate({ menuId: menu.id, listingId, locale });
  }

  return (
    <Stack gap="4">
      {menus.length === 0 && !isAddingMenu && (
        <p>{t('partner.listingMenu.noMenus')}</p>
      )}
      {menus.map((menu) =>
        menu.id === editingMenuId ? (
          <Card key={menu.id} padding="lg">
            <MenuForm
              initialValues={{
                name: menu.name,
                description: menu.description ?? '',
                isActive: menu.is_active,
              }}
              isSubmitting={updateMenu.isPending}
              submitLabel={t('partner.listingMenu.saveMenu')}
              onSubmit={(values) =>
                updateMenu.mutate(
                  { menuId: menu.id, listingId, locale, ...values },
                  { onSuccess: () => setEditingMenuId(null) },
                )
              }
              onCancel={() => setEditingMenuId(null)}
            />
            {updateMenu.error && (
              <Alert variant="danger">{updateMenu.error.message}</Alert>
            )}
          </Card>
        ) : (
          <Card key={menu.id} padding="lg">
            <Stack gap="4">
              <Inline justify="space-between" align="flex-start">
                <Stack gap="1">
                  <Inline gap="2" align="center">
                    <strong>{menu.name}</strong>
                    {!menu.is_active && (
                      <Badge
                        variant="warning"
                        label={t('partner.listingMenu.activeLabel')}
                      />
                    )}
                  </Inline>
                  {menu.description && <span>{menu.description}</span>}
                </Stack>
                <Inline gap="2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsAddingMenu(false);
                      setEditingMenuId(menu.id);
                    }}
                  >
                    {t('partner.listingMenu.editAction')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteMenu.isPending}
                    onClick={() => handleDeleteMenu(menu)}
                  >
                    {t('partner.listingMenu.deleteAction')}
                  </Button>
                </Inline>
              </Inline>
              {deleteMenu.error && deleteMenu.variables?.menuId === menu.id && (
                <Alert variant="danger">{deleteMenu.error.message}</Alert>
              )}
              <MenuPanel menu={menu} listingId={listingId} locale={locale} />
            </Stack>
          </Card>
        ),
      )}

      {isAddingMenu ? (
        <Card padding="lg">
          <MenuForm
            initialValues={{ languageCode: locale }}
            showLanguageSelector
            isSubmitting={createMenu.isPending}
            submitLabel={t('partner.listingMenu.addMenu')}
            onSubmit={(values) =>
              createMenu.mutate(
                { listingId, locale, ...values },
                { onSuccess: () => setIsAddingMenu(false) },
              )
            }
            onCancel={() => setIsAddingMenu(false)}
          />
          {createMenu.error && (
            <Alert variant="danger">{createMenu.error.message}</Alert>
          )}
        </Card>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setEditingMenuId(null);
            setIsAddingMenu(true);
          }}
        >
          {t('partner.listingMenu.addMenu')}
        </Button>
      )}
    </Stack>
  );
}

LocaleMenuList.propTypes = {
  listingId: PropTypes.number.isRequired,
  locale: PropTypes.string.isRequired,
};

export default function PartnerMenuManager({ listingId, defaultLocale }) {
  const { t } = useTranslation();
  const [authoringLocale, setAuthoringLocale] = useState(defaultLocale);

  // A real completion signal per language tab — each locale's own menu
  // list is fetched independently (React Query caches each separately),
  // never guessed from only the currently-active tab's data.
  const menuQueriesByLocale = {
    hy: useListingMenuQuery(listingId, 'hy'),
    ru: useListingMenuQuery(listingId, 'ru'),
    en: useListingMenuQuery(listingId, 'en'),
  };
  const completionByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((code) => [
      code,
      (menuQueriesByLocale[code].data ?? []).length > 0,
    ]),
  );

  return (
    <AuthoringLocaleTabs
      activeLocale={authoringLocale}
      onChange={setAuthoringLocale}
      completionByLocale={completionByLocale}
      ariaLabel={t('partner.listingWizard.locale.switcherLabel')}
    >
      <LocaleMenuList listingId={listingId} locale={authoringLocale} />
    </AuthoringLocaleTabs>
  );
}

PartnerMenuManager.propTypes = {
  listingId: PropTypes.number.isRequired,
  defaultLocale: PropTypes.oneOf(SUPPORTED_LOCALES).isRequired,
};

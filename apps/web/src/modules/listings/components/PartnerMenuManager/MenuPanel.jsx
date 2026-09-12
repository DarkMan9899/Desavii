/**
 * MenuPanel — Pass 6 (Partner Menu Authoring). One menu's sections and
 * items: add/edit/delete a section, add/edit/delete an item within it.
 * Same accordion-style "summary row swaps for an inline form" UX
 * `BookableUnitsManager.jsx` already establishes, extended one level
 * deeper (menu -> section -> item) — `editingItemId` is a single,
 * menu-wide id (never scoped per section) since only one editor is ever
 * open at a time, the same one-open-editor discipline that component
 * follows.
 *
 * Every destructive delete goes through the shared `useConfirm()` modal
 * before calling its mutation — `BookableUnitsManager` never needed this
 * (units can't be deleted there), so this is the first real consumer of
 * that pattern in this component family.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Card, Button, Badge } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { PriceTag } from '@desavii/ui/components/data-display';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useCreateListingMenuSectionMutation } from '../../mutations/useCreateListingMenuSectionMutation.js';
import { useUpdateListingMenuSectionMutation } from '../../mutations/useUpdateListingMenuSectionMutation.js';
import { useDeleteListingMenuSectionMutation } from '../../mutations/useDeleteListingMenuSectionMutation.js';
import { useCreateListingMenuItemMutation } from '../../mutations/useCreateListingMenuItemMutation.js';
import { useUpdateListingMenuItemMutation } from '../../mutations/useUpdateListingMenuItemMutation.js';
import { useDeleteListingMenuItemMutation } from '../../mutations/useDeleteListingMenuItemMutation.js';
import SectionForm from './SectionForm.jsx';
import ItemForm from './ItemForm.jsx';

function ItemRow({ item, onEdit, onDelete }) {
  const { t } = useTranslation();
  return (
    <Card padding="sm">
      <Stack gap="1">
        <Inline justify="space-between" align="flex-start" gap="3">
          <strong>{item.title}</strong>
          <PriceTag
            amount={item.price_amount}
            currencyCode={item.price_currency_code}
            size="sm"
          />
        </Inline>
        {item.description && <span>{item.description}</span>}
        {item.dietary_markers.length > 0 && (
          <Inline gap="1" wrap>
            {item.dietary_markers.map((marker) => (
              <Badge
                key={marker}
                variant="neutral"
                size="sm"
                label={t(`pages.listingDetail.menu.dietaryMarkers.${marker}`)}
              />
            ))}
          </Inline>
        )}
        {!item.is_active && (
          <Badge
            variant="warning"
            size="sm"
            label={t('partner.listingMenu.itemActiveLabel')}
          />
        )}
        <Inline gap="2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            {t('partner.listingMenu.editAction')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            {t('partner.listingMenu.deleteAction')}
          </Button>
        </Inline>
      </Stack>
    </Card>
  );
}

ItemRow.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- passthrough item DTO
  item: PropTypes.object.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default function MenuPanel({ menu, listingId, locale }) {
  const { t } = useTranslation();
  const confirm = useConfirm();

  const [editingSectionId, setEditingSectionId] = useState(null);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [addingItemForSectionId, setAddingItemForSectionId] = useState(null);

  const createSection = useCreateListingMenuSectionMutation();
  const updateSection = useUpdateListingMenuSectionMutation();
  const deleteSection = useDeleteListingMenuSectionMutation();
  const createItem = useCreateListingMenuItemMutation();
  const updateItem = useUpdateListingMenuItemMutation();
  const deleteItem = useDeleteListingMenuItemMutation();

  async function handleDeleteSection(section) {
    const confirmed = await confirm({
      title: t('partner.listingMenu.deleteSectionConfirmTitle'),
      description: t('partner.listingMenu.deleteSectionConfirmDescription'),
      confirmLabel: t('partner.listingMenu.deleteSectionConfirmAction'),
      cancelLabel: t('partner.listingMenu.deleteSectionConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    deleteSection.mutate({ sectionId: section.id, listingId, locale });
  }

  async function handleDeleteItem(item) {
    const confirmed = await confirm({
      title: t('partner.listingMenu.deleteItemConfirmTitle'),
      description: t('partner.listingMenu.deleteItemConfirmDescription'),
      confirmLabel: t('partner.listingMenu.deleteItemConfirmAction'),
      cancelLabel: t('partner.listingMenu.deleteItemConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    deleteItem.mutate({ itemId: item.id, listingId, locale });
  }

  return (
    <Stack gap="3">
      <h4>{t('partner.listingMenu.sectionsHeading')}</h4>
      {menu.sections.length === 0 && !isAddingSection && (
        <p>{t('partner.listingMenu.noSections')}</p>
      )}
      {menu.sections.map((section) =>
        section.id === editingSectionId ? (
          <Card key={section.id} padding="md">
            <SectionForm
              initialValues={{ title: section.title }}
              isSubmitting={updateSection.isPending}
              submitLabel={t('partner.listingMenu.saveSection')}
              onSubmit={(values) =>
                updateSection.mutate(
                  { sectionId: section.id, listingId, locale, ...values },
                  { onSuccess: () => setEditingSectionId(null) },
                )
              }
              onCancel={() => setEditingSectionId(null)}
            />
            {updateSection.error && (
              <Alert variant="danger">{updateSection.error.message}</Alert>
            )}
          </Card>
        ) : (
          <Card key={section.id} padding="md">
            <Stack gap="3">
              <Inline justify="space-between">
                <strong>{section.title}</strong>
                <Inline gap="2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsAddingSection(false);
                      setEditingSectionId(section.id);
                    }}
                  >
                    {t('partner.listingMenu.editAction')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteSection.isPending}
                    onClick={() => handleDeleteSection(section)}
                  >
                    {t('partner.listingMenu.deleteAction')}
                  </Button>
                </Inline>
              </Inline>
              {deleteSection.error &&
                deleteSection.variables?.sectionId === section.id && (
                  <Alert variant="danger">{deleteSection.error.message}</Alert>
                )}

              {section.items.length === 0 &&
                addingItemForSectionId !== section.id && (
                  <p>{t('partner.listingMenu.noItems')}</p>
                )}
              <Stack gap="2">
                {section.items.map((item) =>
                  item.id === editingItemId ? (
                    <Card key={item.id} padding="sm">
                      <ItemForm
                        isEditing
                        initialValues={{
                          title: item.title,
                          description: item.description ?? '',
                          priceAmount: item.price_amount,
                          priceCurrencyCode: item.price_currency_code,
                          dietaryMarkers: item.dietary_markers,
                          isActive: item.is_active,
                        }}
                        isSubmitting={updateItem.isPending}
                        submitLabel={t('partner.listingMenu.saveItem')}
                        onSubmit={(values) =>
                          updateItem.mutate(
                            { itemId: item.id, listingId, locale, ...values },
                            { onSuccess: () => setEditingItemId(null) },
                          )
                        }
                        onCancel={() => setEditingItemId(null)}
                      />
                      {updateItem.error && (
                        <Alert variant="danger">
                          {updateItem.error.message}
                        </Alert>
                      )}
                    </Card>
                  ) : (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onEdit={() => {
                        setAddingItemForSectionId(null);
                        setEditingItemId(item.id);
                      }}
                      onDelete={() => handleDeleteItem(item)}
                    />
                  ),
                )}
              </Stack>

              {addingItemForSectionId === section.id ? (
                <Card padding="sm">
                  <ItemForm
                    isSubmitting={createItem.isPending}
                    submitLabel={t('partner.listingMenu.addItem')}
                    onSubmit={(values) =>
                      createItem.mutate(
                        { sectionId: section.id, listingId, locale, ...values },
                        { onSuccess: () => setAddingItemForSectionId(null) },
                      )
                    }
                    onCancel={() => setAddingItemForSectionId(null)}
                  />
                  {createItem.error && (
                    <Alert variant="danger">{createItem.error.message}</Alert>
                  )}
                </Card>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingItemId(null);
                    setAddingItemForSectionId(section.id);
                  }}
                >
                  {t('partner.listingMenu.addItem')}
                </Button>
              )}
            </Stack>
          </Card>
        ),
      )}

      {isAddingSection ? (
        <Card padding="md">
          <SectionForm
            isSubmitting={createSection.isPending}
            submitLabel={t('partner.listingMenu.addSection')}
            onSubmit={(values) =>
              createSection.mutate(
                { menuId: menu.id, listingId, locale, ...values },
                { onSuccess: () => setIsAddingSection(false) },
              )
            }
            onCancel={() => setIsAddingSection(false)}
          />
          {createSection.error && (
            <Alert variant="danger">{createSection.error.message}</Alert>
          )}
        </Card>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setEditingSectionId(null);
            setIsAddingSection(true);
          }}
        >
          {t('partner.listingMenu.addSection')}
        </Button>
      )}
    </Stack>
  );
}

MenuPanel.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- passthrough menu DTO
  menu: PropTypes.object.isRequired,
  listingId: PropTypes.number.isRequired,
  locale: PropTypes.string.isRequired,
};

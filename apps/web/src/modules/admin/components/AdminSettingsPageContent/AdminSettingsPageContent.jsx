/**
 * AdminSettingsPageContent — `/:locale/admin/settings` (Stage 11.9:
 * Settings). Two tabs, same `Tabs`-of-CRUD-panels shape
 * `AdminMarketplaceConfigPageContent` established: System Settings
 * (generic key/JSON-value store, `SettingsPanel`) and Feature Flags
 * (named boolean toggles, `FeatureFlagsPanel`). Neither table is large
 * enough to warrant pagination, matching that same precedent.
 *
 * New feature flags don't change app behavior yet — no consuming code
 * checks `isEnabled` anywhere else in this codebase. This page builds
 * the control plane only, a deliberate, documented Stage 11.9 scope
 * boundary (mirroring how Stage 11.5 deferred the EAV config editors).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack } from '@desavii/ui/components/layout';
import { Tabs } from '@desavii/ui/components/navigation';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useAdminConfigResource } from '../../hooks/useAdminConfigResource.js';
import {
  getSettings,
  createSetting,
  updateSetting,
  deleteSetting,
  getFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
} from '../../../../api/admin.js';
import SettingsPanel from './SettingsPanel.jsx';
import FeatureFlagsPanel from './FeatureFlagsPanel.jsx';

export default function AdminSettingsPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { permissions } = useAuth();
  const canManageSettings = permissions.includes('settings.manage');
  const [activeTabId, setActiveTabId] = useState('systemSettings');

  const settingsResource = useAdminConfigResource({
    queryKey: ['admin', 'settings'],
    list: getSettings,
    create: createSetting,
    update: updateSetting,
    remove: deleteSetting,
  });

  const featureFlagsResource = useAdminConfigResource({
    queryKey: ['admin', 'feature-flags'],
    list: getFeatureFlags,
    create: createFeatureFlag,
    update: updateFeatureFlag,
    remove: deleteFeatureFlag,
  });

  const dateFormatter = createDateFormatter(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const tabs = [
    {
      id: 'systemSettings',
      label: t('admin.settings.tabs.systemSettings'),
      panel: (
        <Stack gap="4">
          <Alert
            variant="info"
            title={t('admin.settings.systemSettings.notice.title')}
          >
            {t('admin.settings.systemSettings.notice.description')}
          </Alert>
          <SettingsPanel
            resource={settingsResource}
            dateFormatter={dateFormatter}
            canWrite={canManageSettings}
            copy={{
              heading: t('admin.settings.systemSettings.heading'),
              addLabel: t('admin.settings.systemSettings.addLabel'),
              table: {
                key: t('admin.settings.systemSettings.table.key'),
                value: t('admin.settings.systemSettings.table.value'),
                description: t(
                  'admin.settings.systemSettings.table.description',
                ),
                updatedAt: t('admin.settings.systemSettings.table.updatedAt'),
              },
              fields: {
                key: t('admin.settings.systemSettings.fields.key'),
                value: t('admin.settings.systemSettings.fields.value'),
                description: t(
                  'admin.settings.systemSettings.fields.description',
                ),
              },
              valueHelperText: t(
                'admin.settings.systemSettings.valueHelperText',
              ),
              invalidValueError: t(
                'admin.settings.systemSettings.invalidValueError',
              ),
              formCreateTitle: t(
                'admin.settings.systemSettings.formCreateTitle',
              ),
              formEditTitle: t('admin.settings.systemSettings.formEditTitle'),
              deleteConfirmTitle: (key) =>
                t('admin.settings.systemSettings.deleteConfirmTitle', { key }),
              deleteConfirmDescription: t(
                'admin.settings.systemSettings.deleteConfirmDescription',
              ),
              saveAction: t('common.save'),
              cancelAction: t('common.cancel'),
              editAction: t('admin.settings.editAction'),
              deleteAction: t('admin.settings.deleteAction'),
              emptyTitle: t('admin.settings.systemSettings.emptyTitle'),
              emptyDescription: t(
                'admin.settings.systemSettings.emptyDescription',
              ),
              errorTitle: t('admin.settings.systemSettings.errorTitle'),
              errorRetry: t('admin.settings.errorRetry'),
              createSuccess: t('admin.settings.systemSettings.createSuccess'),
              updateSuccess: t('admin.settings.systemSettings.updateSuccess'),
              deleteSuccess: t('admin.settings.systemSettings.deleteSuccess'),
              saveError: t('admin.settings.saveError'),
              deleteError: t('admin.settings.deleteError'),
            }}
          />
        </Stack>
      ),
    },
    {
      id: 'featureFlags',
      label: t('admin.settings.tabs.featureFlags'),
      panel: (
        <Stack gap="4">
          <Alert
            variant="info"
            title={t('admin.settings.featureFlags.notice.title')}
          >
            {t('admin.settings.featureFlags.notice.description')}
          </Alert>
          <FeatureFlagsPanel
            resource={featureFlagsResource}
            canWrite={canManageSettings}
            copy={{
              heading: t('admin.settings.featureFlags.heading'),
              addLabel: t('admin.settings.featureFlags.addLabel'),
              table: {
                code: t('admin.settings.featureFlags.table.code'),
                name: t('admin.settings.featureFlags.table.name'),
                description: t('admin.settings.featureFlags.table.description'),
                enabled: t('admin.settings.featureFlags.table.enabled'),
              },
              fields: {
                code: t('admin.settings.featureFlags.fields.code'),
                name: t('admin.settings.featureFlags.fields.name'),
                description: t(
                  'admin.settings.featureFlags.fields.description',
                ),
              },
              enabledSwitchLabel: (name) =>
                t('admin.settings.featureFlags.enabledSwitchLabel', { name }),
              formCreateTitle: t('admin.settings.featureFlags.formCreateTitle'),
              deleteConfirmTitle: (name) =>
                t('admin.settings.featureFlags.deleteConfirmTitle', { name }),
              deleteConfirmDescription: t(
                'admin.settings.featureFlags.deleteConfirmDescription',
              ),
              saveAction: t('common.save'),
              cancelAction: t('common.cancel'),
              deleteAction: t('admin.settings.deleteAction'),
              emptyTitle: t('admin.settings.featureFlags.emptyTitle'),
              emptyDescription: t(
                'admin.settings.featureFlags.emptyDescription',
              ),
              errorTitle: t('admin.settings.featureFlags.errorTitle'),
              errorRetry: t('admin.settings.errorRetry'),
              createSuccess: t('admin.settings.featureFlags.createSuccess'),
              deleteSuccess: t('admin.settings.featureFlags.deleteSuccess'),
              saveError: t('admin.settings.saveError'),
              deleteError: t('admin.settings.deleteError'),
            }}
          />
        </Stack>
      ),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.settings.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.settings.heading'),
            href: `/${locale}/admin/settings`,
          },
        ]}
      />
      <Stack gap="4">
        <Tabs
          tabs={tabs}
          activeTabId={activeTabId}
          onChange={setActiveTabId}
          ariaLabel={t('admin.settings.heading')}
        />
      </Stack>
    </Section>
  );
}

/**
 * PartnerConnectionsPageContent — `/:locale/partner/connections` (Phase
 * 17 §15-28: the Connections/Sync Center). Configure inventory
 * connections (Manual/iCal/CSV/API/Webhook), test/sync them on demand,
 * map an external resource id to one of the listing's bookable units,
 * and review sync history + unresolved conflicts — every query/mutation
 * hook here (`useInventoryConnectionsQuery`, `useCreateInventory
 * ConnectionMutation`, `useSyncInventoryConnectionMutation`, etc.) was
 * already built in the `availability` module for the read-only Admin
 * Inventory Oversight page; this is their first write-capable consumer.
 *
 * `MANAGE_CONNECTIONS` gates every write action (create/update/disconnect/
 * mapping/test/sync/resolve); a role with only `VIEW_SYNC_LOGS` (e.g.
 * `ANALYTICS_VIEWER`) still sees the list, sync history, and conflicts,
 * matching `PartnerCalendarPageContent`'s established per-action
 * capability-gating pattern.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Select, Input } from '@desavii/ui/components/form-controls';
import { Button, Card, Badge } from '@desavii/ui/components/primitives';
import {
  EmptyState,
  ErrorState,
  Modal,
} from '@desavii/ui/components/feedback-overlays';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Tabs } from '@desavii/ui/components/navigation';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import { useMyListingsQuery } from '../../../listings/index.js';
import {
  useBookableUnitsQuery,
  useInventoryConnectionsQuery,
  useConnectionSyncRunsQuery,
  useConnectionConflictsQuery,
  useCreateInventoryConnectionMutation,
  useDisconnectInventoryConnectionMutation,
  useSetInventoryConnectionMappingMutation,
  useTestInventoryConnectionMutation,
  useSyncInventoryConnectionMutation,
  useResolveConnectionConflictMutation,
  usePartnerCapability,
  PARTNER_CAPABILITIES,
  CONNECTOR_TYPES,
  CONNECTION_DIRECTIONS,
} from '../../../availability/index.js';
import useSelectTexts from '../../../../hooks/useSelectTexts.js';

const EMPTY_CREATE_FORM = {
  name: '',
  connectorType: 'MANUAL',
  direction: 'IMPORT',
  listingId: '',
  feedUrl: '',
};

function exportFeedUrl(token) {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
  const path = `${base}/inventory-connections/export/${token}`;
  return base.startsWith('/') ? `${window.location.origin}${path}` : path;
}

export default function PartnerConnectionsPageContent() {
  const selectTexts = useSelectTexts();
  const { t } = useTranslation();
  const { locale } = useParams();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { activePartnerId } = usePartnerContext();

  const canManage = usePartnerCapability(
    PARTNER_CAPABILITIES.MANAGE_CONNECTIONS,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [selectedId, setSelectedId] = useState(null);
  const [detailTab, setDetailTab] = useState('syncRuns');
  const [mappingForm, setMappingForm] = useState({
    externalResourceId: 'default',
    bookableUnitId: '',
  });

  const listingsQuery = useMyListingsQuery({ partnerId: activePartnerId });
  const listings = listingsQuery.data?.pages?.[0]?.results ?? [];

  const connectionsQuery = useInventoryConnectionsQuery(activePartnerId);
  const connections = connectionsQuery.data ?? [];
  const selectedConnection = connections.find((c) => c.id === selectedId);

  const syncRunsQuery = useConnectionSyncRunsQuery(selectedId, {
    enabled: Boolean(selectedId),
  });
  const conflictsQuery = useConnectionConflictsQuery(selectedId, {
    enabled: Boolean(selectedId),
  });
  const unitsForSelectedListing = useBookableUnitsQuery(
    selectedConnection?.listing_id,
  );

  const createMutation = useCreateInventoryConnectionMutation(activePartnerId);
  const disconnectMutation =
    useDisconnectInventoryConnectionMutation(activePartnerId);
  const mappingMutation =
    useSetInventoryConnectionMappingMutation(activePartnerId);
  const testMutation = useTestInventoryConnectionMutation();
  const syncMutation = useSyncInventoryConnectionMutation(activePartnerId);
  const resolveConflictMutation = useResolveConnectionConflictMutation();

  const listingOptions = listings.map((listing) => ({
    value: String(listing.id),
    label: listing.title ?? listing.slug,
  }));
  const connectorOptions = CONNECTOR_TYPES.map((code) => ({
    value: code,
    label: t(`partner.connections.connectorTypes.${code}`),
  }));
  const directionOptions = CONNECTION_DIRECTIONS.map((code) => ({
    value: code,
    label: t(`partner.connections.directions.${code}`),
  }));
  const unitOptions = (unitsForSelectedListing.data ?? []).map((unit) => ({
    value: String(unit.id),
    label:
      unit.unit_label ||
      t(`partner.listingWizard.bookableUnitTypes.${unit.bookable_unit_type}`, {
        defaultValue: unit.bookable_unit_type,
      }),
  }));

  // Stable reference: `Modal`'s `onClose` feeds `useFocusTrap`'s effect
  // deps — a fresh function every render would tear down and rebuild the
  // keydown/focus-restore listener on every keystroke in the form below
  // (the same bug already fixed once in `ConfigEntityPanel`'s reject
  // dialog).
  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateForm(EMPTY_CREATE_FORM);
  }, []);

  async function handleCreate() {
    try {
      await createMutation.mutateAsync({
        partnerId: activePartnerId,
        listingId: createForm.listingId
          ? Number(createForm.listingId)
          : undefined,
        connectorType: createForm.connectorType,
        direction: createForm.direction,
        name: createForm.name,
        config:
          createForm.connectorType === 'ICAL' && createForm.feedUrl
            ? { feedUrl: createForm.feedUrl }
            : undefined,
      });
      showToast(t('partner.connections.createSuccess'), {
        variant: 'success',
      });
      closeCreate();
    } catch {
      showToast(t('partner.connections.createError'), { variant: 'danger' });
    }
  }

  async function handleTest(connection) {
    try {
      // `apiClient` never unwraps the `{success, data, meta, error}`
      // envelope (its response interceptor is an identity function) —
      // every api/*.js wrapper resolves to that full envelope, so a
      // mutation's resolved value is always `{ data: <controller
      // payload> }`, never the payload itself.
      const response = await testMutation.mutateAsync({ id: connection.id });
      const result = response.data;
      showToast(
        result.ok
          ? t('partner.connections.testSuccess', { message: result.message })
          : t('partner.connections.testFailure', { message: result.message }),
        { variant: result.ok ? 'success' : 'danger' },
      );
    } catch {
      showToast(t('partner.connections.testError'), { variant: 'danger' });
    }
  }

  async function handleSync(connection) {
    try {
      const response = await syncMutation.mutateAsync({ id: connection.id });
      const run = response.data;
      showToast(
        t('partner.connections.syncSuccess', {
          status: t(`partner.connections.syncStatuses.${run.status}`, {
            defaultValue: run.status,
          }),
        }),
        { variant: run.status === 'FAILED' ? 'danger' : 'success' },
      );
    } catch {
      showToast(t('partner.connections.syncError'), { variant: 'danger' });
    }
  }

  async function handleDisconnect(connection) {
    const confirmed = await confirm({
      title: t('partner.connections.disconnectConfirmTitle', {
        name: connection.name,
      }),
      description: t('partner.connections.disconnectConfirmDescription'),
      confirmLabel: t('partner.connections.disconnectConfirmAction'),
      cancelLabel: t('partner.connections.cancelAction'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await disconnectMutation.mutateAsync({ id: connection.id });
      showToast(t('partner.connections.disconnectSuccess'), {
        variant: 'success',
      });
      if (selectedId === connection.id) setSelectedId(null);
    } catch {
      showToast(t('partner.connections.disconnectError'), {
        variant: 'danger',
      });
    }
  }

  async function handleSetMapping() {
    if (!selectedId || !mappingForm.bookableUnitId) return;
    try {
      await mappingMutation.mutateAsync({
        id: selectedId,
        externalResourceId: mappingForm.externalResourceId || undefined,
        bookableUnitId: Number(mappingForm.bookableUnitId),
      });
      showToast(t('partner.connections.mappingSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.connections.mappingError'), { variant: 'danger' });
    }
  }

  async function handleResolveConflict(conflict) {
    const confirmed = await confirm({
      title: t('partner.connections.resolveConfirmTitle'),
      description: t('partner.connections.resolveConfirmDescription'),
      confirmLabel: t('partner.connections.resolveConfirmAction'),
      cancelLabel: t('partner.connections.cancelAction'),
    });
    if (!confirmed) return;
    try {
      await resolveConflictMutation.mutateAsync({
        id: selectedId,
        conflictId: conflict.id,
      });
      showToast(t('partner.connections.resolveSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.connections.resolveError'), { variant: 'danger' });
    }
  }

  const connectionColumns = [
    { key: 'name', header: t('partner.connections.columns.name') },
    {
      key: 'connector_type',
      header: t('partner.connections.columns.type'),
      render: (row) =>
        t(`partner.connections.connectorTypes.${row.connector_type}`),
    },
    {
      key: 'direction',
      header: t('partner.connections.columns.direction'),
      render: (row) => t(`partner.connections.directions.${row.direction}`),
    },
    {
      key: 'status',
      header: t('partner.connections.columns.status'),
      render: (row) => (
        <Badge
          variant={row.status === 'ACTIVE' ? 'success' : 'danger'}
          label={t(`partner.connections.statuses.${row.status}`, {
            defaultValue: row.status,
          })}
        />
      ),
    },
    {
      key: 'lastSync',
      header: t('partner.connections.columns.lastSync'),
      render: (row) =>
        row.last_successful_sync_at
          ? new Date(row.last_successful_sync_at).toLocaleString(locale)
          : t('partner.connections.neverSynced'),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Inline gap="2" wrap>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedId(row.id)}
          >
            {t('partner.connections.detailsAction')}
          </Button>
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleTest(row)}
                loading={
                  testMutation.isPending &&
                  testMutation.variables?.id === row.id
                }
              >
                {t('partner.connections.testAction')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSync(row)}
                loading={
                  syncMutation.isPending &&
                  syncMutation.variables?.id === row.id
                }
              >
                {t('partner.connections.syncAction')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDisconnect(row)}
              >
                {t('partner.connections.disconnectAction')}
              </Button>
            </>
          )}
        </Inline>
      ),
    },
  ];

  const syncRunColumns = [
    {
      key: 'started_at',
      header: t('partner.connections.syncRuns.columns.startedAt'),
      render: (row) => new Date(row.started_at).toLocaleString(locale),
    },
    {
      key: 'trigger_code',
      header: t('partner.connections.syncRuns.columns.trigger'),
      render: (row) =>
        t(`partner.connections.syncTriggers.${row.trigger_code}`, {
          defaultValue: row.trigger_code,
        }),
    },
    {
      key: 'status',
      header: t('partner.connections.syncRuns.columns.status'),
      render: (row) => (
        <Badge
          variant={row.status === 'FAILED' ? 'danger' : 'success'}
          label={t(`partner.connections.syncStatuses.${row.status}`, {
            defaultValue: row.status,
          })}
        />
      ),
    },
    {
      key: 'records',
      header: t('partner.connections.syncRuns.columns.records'),
      render: (row) =>
        t('partner.connections.syncRuns.recordsSummary', {
          created: row.records_created ?? 0,
          skipped: row.records_skipped ?? 0,
        }),
    },
    {
      key: 'error',
      header: t('partner.connections.syncRuns.columns.error'),
      render: (row) => row.error_message || '—',
    },
  ];

  const conflictColumns = [
    {
      key: 'external_event_uid',
      header: t('partner.connections.conflicts.columns.event'),
      render: (row) => row.external_event_uid || '—',
    },
    {
      key: 'conflict_type',
      header: t('partner.connections.conflicts.columns.type'),
      render: (row) =>
        t(`partner.connections.conflictTypes.${row.conflict_type}`, {
          defaultValue: row.conflict_type,
        }),
    },
    {
      key: 'created_at',
      header: t('partner.connections.conflicts.columns.createdAt'),
      render: (row) => new Date(row.created_at).toLocaleString(locale),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canManage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleResolveConflict(row)}
          >
            {t('partner.connections.resolveAction')}
          </Button>
        ),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('partner.connections.heading')}
        breadcrumbs={[
          { label: t('partner.nav.dashboard'), href: `/${locale}/partner` },
          {
            label: t('partner.connections.heading'),
            href: `/${locale}/partner/connections`,
          },
        ]}
      />
      <p>{t('partner.connections.description')}</p>

      {canManage && (
        <Inline justify="flex-end">
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            {t('partner.connections.addAction')}
          </Button>
        </Inline>
      )}

      {connectionsQuery.isError ? (
        <ErrorState
          title={t('partner.connections.errorTitle')}
          retryLabel={t('partner.connections.errorRetry')}
          onRetry={connectionsQuery.refetch}
        />
      ) : (
        <DataTable
          columns={connectionColumns}
          rows={connections}
          isLoading={connectionsQuery.isPending}
          emptyTitle={t('partner.connections.emptyTitle')}
          emptyDescription={t('partner.connections.emptyDescription')}
        />
      )}

      {selectedConnection && (
        <Card as="div" padding="lg">
          <Stack gap="4">
            <Inline justify="space-between" align="center">
              <h2>{selectedConnection.name}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedId(null)}
              >
                {t('partner.connections.closeDetailsAction')}
              </Button>
            </Inline>

            {selectedConnection.export_token &&
              ['EXPORT', 'BOTH'].includes(selectedConnection.direction) && (
                <Stack gap="1">
                  <span>{t('partner.connections.exportFeed.label')}</span>
                  <Input
                    readOnly
                    value={exportFeedUrl(selectedConnection.export_token)}
                    aria-label={t('partner.connections.exportFeed.label')}
                  />
                </Stack>
              )}

            <Tabs
              ariaLabel={t('partner.connections.detailTabsLabel')}
              activeTabId={detailTab}
              onChange={setDetailTab}
              tabs={[
                {
                  id: 'syncRuns',
                  label: t('partner.connections.syncRuns.tabLabel'),
                  panel: (
                    <DataTable
                      columns={syncRunColumns}
                      rows={syncRunsQuery.data ?? []}
                      isLoading={syncRunsQuery.isPending}
                      emptyTitle={t('partner.connections.syncRuns.emptyTitle')}
                    />
                  ),
                },
                {
                  id: 'conflicts',
                  label: t('partner.connections.conflicts.tabLabel', {
                    count: (conflictsQuery.data ?? []).length,
                  }),
                  panel: (
                    <DataTable
                      columns={conflictColumns}
                      rows={conflictsQuery.data ?? []}
                      isLoading={conflictsQuery.isPending}
                      emptyTitle={t('partner.connections.conflicts.emptyTitle')}
                    />
                  ),
                },
                canManage && {
                  id: 'mapping',
                  label: t('partner.connections.mapping.tabLabel'),
                  panel: (
                    <Stack gap="3">
                      {!selectedConnection.listing_id ? (
                        <EmptyState
                          title={t(
                            'partner.connections.mapping.noListingTitle',
                          )}
                        />
                      ) : (
                        <>
                          <Inline gap="3" wrap align="flex-end">
                            <Input
                              label={t(
                                'partner.connections.mapping.externalResourceIdLabel',
                              )}
                              value={mappingForm.externalResourceId}
                              onChange={(event) =>
                                setMappingForm((prev) => ({
                                  ...prev,
                                  externalResourceId: event.target.value,
                                }))
                              }
                            />
                            <Select
                              placeholder={selectTexts.placeholder}
                              searchPlaceholder={selectTexts.searchPlaceholder}
                              noOptionsMessage={selectTexts.noOptionsMessage}
                              label={t('partner.connections.mapping.unitLabel')}
                              options={unitOptions}
                              value={mappingForm.bookableUnitId}
                              onChange={(value) =>
                                setMappingForm((prev) => ({
                                  ...prev,
                                  bookableUnitId: value,
                                }))
                              }
                            />
                          </Inline>
                          <Inline>
                            <Button
                              variant="primary"
                              onClick={() => handleSetMapping()}
                              loading={mappingMutation.isPending}
                              disabled={!mappingForm.bookableUnitId}
                            >
                              {t('partner.connections.mapping.saveAction')}
                            </Button>
                          </Inline>
                        </>
                      )}
                    </Stack>
                  ),
                },
              ].filter(Boolean)}
            />
          </Stack>
        </Card>
      )}

      {createOpen && (
        <Modal
          isOpen
          onClose={closeCreate}
          title={t('partner.connections.form.title')}
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={() => closeCreate()}>
                {t('partner.connections.cancelAction')}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleCreate()}
                loading={createMutation.isPending}
                disabled={!createForm.name}
              >
                {t('partner.connections.form.saveAction')}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <Input
              label={t('partner.connections.form.nameLabel')}
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
            <Select
              label={t('partner.connections.form.connectorTypeLabel')}
              options={connectorOptions}
              value={createForm.connectorType}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, connectorType: value }))
              }
            />
            <Select
              label={t('partner.connections.form.directionLabel')}
              options={directionOptions}
              value={createForm.direction}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, direction: value }))
              }
            />
            <Select
              placeholder={selectTexts.placeholder}
              searchPlaceholder={selectTexts.searchPlaceholder}
              noOptionsMessage={selectTexts.noOptionsMessage}
              label={t('partner.connections.form.listingLabel')}
              options={listingOptions}
              value={createForm.listingId}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, listingId: value }))
              }
            />
            {createForm.connectorType === 'ICAL' && (
              <Input
                label={t('partner.connections.form.feedUrlLabel')}
                value={createForm.feedUrl}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    feedUrl: event.target.value,
                  }))
                }
              />
            )}
          </Stack>
        </Modal>
      )}
    </Section>
  );
}

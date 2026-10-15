/**
 * AdminInventoryPageContent — `/:locale/admin/inventory` (Phase 17 §31,
 * redesigned Admin Sprint 5). Two real parts:
 *
 * 1. An admin-wide "needs attention" Overview (NEW) — every active
 *    connection and every unresolved sync conflict across every
 *    partner, sourced from two new, genuinely admin-wide reads
 *    (`GET /inventory-connections/admin/overview` and `.../admin/
 *    conflicts`). Every other list this module offers requires a
 *    `partnerId`/`listingId`/`connectionId` the caller must already
 *    know — a real, confirmed backend gap this closes for exactly the
 *    admin-oversight case, without inventing a capability the backend
 *    doesn't have (see the two new repository/service methods for the
 *    honest reasoning).
 *
 * 2. The existing per-listing lookup + diagnostic tabs, now with real
 *    write actions wired in (Test/Sync/Disconnect a connection, Resolve
 *    a conflict, Release a block, Cancel an external reservation) —
 *    every mutation hook already existed in this module, built for
 *    `PartnerConnectionsPageContent`'s write-capable UI (Phase 17's
 *    first real consumer) but never wired into this page, which
 *    previously had zero write affordances by its own admission. The
 *    UX pattern (loading states, confirm dialogs, capability gating)
 *    mirrors that page's proven pattern, adapted for cross-partner
 *    scope: `inventory.manage_all` gates every write here, same as
 *    `inventory.view_all` already gates every read.
 *
 * Listing lookup now uses `useAdminListingDetailQuery` (bypasses public
 * visibility) instead of the public `GET /listings/:id` the previous
 * version used — a real fix for the documented "an unpublished/draft
 * listing isn't searchable here" gap.
 *
 * `connectorType` guard: only `MANUAL` and `ICAL` have real connector
 * implementations (`ConnectorRegistry`); Test/Sync are disabled for the
 * other three accepted-but-unimplemented types (`CSV`/`GENERIC_API`/
 * `GENERIC_WEBHOOK`) rather than letting them throw an untyped error —
 * not inventing support for them, just not exposing a broken action.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { Button, Card, Badge } from '@desavii/ui/components/primitives';
import {
  Spinner,
  EmptyState,
  ErrorState,
  Modal,
} from '@desavii/ui/components/feedback-overlays';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Tabs } from '@desavii/ui/components/navigation';
import { Search } from 'lucide-react';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import {
  useListingBookableUnitsQuery,
  getLocalizedTranslation,
} from '../../../listings/index.js';
import { useAdminListingDetailQuery } from '../../queries/useAdminListingDetailQuery.js';
import {
  useUnitBreakdownQuery,
  useUnitLedgerQuery,
  useUnitHoldsQuery,
  useInventoryBlocksQuery,
  useExternalReservationsQuery,
  useInventoryConnectionsQuery,
  useConnectionSyncRunsQuery,
  useConnectionConflictsQuery,
  useAdminInventoryOverviewQuery,
  useAdminInventoryConflictsOverviewQuery,
  useTestInventoryConnectionMutation,
  useSyncInventoryConnectionMutation,
  useDisconnectInventoryConnectionMutation,
  useResolveConnectionConflictMutation,
  useReleaseInventoryBlockMutation,
  useCancelExternalReservationMutation,
  BOOKABLE_UNIT_TYPES,
} from '../../../availability/index.js';
import useSelectTexts from '../../../../hooks/useSelectTexts.js';

const REAL_CONNECTOR_TYPES = ['MANUAL', 'ICAL'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function rollingWindow(days = 14) {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + days - 1);
  return { from: toDateString(from), to: toDateString(to) };
}

function unitLabel(unit, t) {
  if (unit.unit_label) return unit.unit_label;
  if (unit.time_slot_start) return unit.time_slot_start.slice(0, 5);
  return BOOKABLE_UNIT_TYPES.includes(unit.bookable_unit_type)
    ? t(`partner.listingWizard.bookableUnitTypes.${unit.bookable_unit_type}`)
    : unit.bookable_unit_type;
}

export default function AdminInventoryPageContent() {
  const selectTexts = useSelectTexts();
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { permissions } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canManage = permissions.includes('inventory.manage_all');

  const [searchParams, setSearchParams] = useSearchParams();
  const [listingIdInput, setListingIdInput] = useState(
    searchParams.get('listingId') ?? '',
  );
  const [lookupListingId, setLookupListingId] = useState(
    searchParams.get('listingId')
      ? Number(searchParams.get('listingId'))
      : null,
  );
  const [unitId, setUnitId] = useState(null);
  const [detailTab, setDetailTab] = useState('breakdown');
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [resolveTarget, setResolveTarget] = useState(null);
  const [overviewStatusFilter, setOverviewStatusFilter] = useState('');

  const { from, to } = useMemo(() => rollingWindow(14), []);

  const overviewQuery = useAdminInventoryOverviewQuery();
  const conflictsOverviewQuery = useAdminInventoryConflictsOverviewQuery();

  const listingQuery = useAdminListingDetailQuery(lookupListingId);
  const unitsQuery = useListingBookableUnitsQuery(lookupListingId);
  const units = unitsQuery.data ?? [];
  const effectiveUnitId = unitId ?? units[0]?.id ?? null;
  const effectiveUnit = units.find((u) => u.id === effectiveUnitId);

  const breakdownQuery = useUnitBreakdownQuery(effectiveUnitId, from, to);
  const ledgerQuery = useUnitLedgerQuery(effectiveUnitId, from, to);
  const holdsQuery = useUnitHoldsQuery(effectiveUnitId, from, to);
  const blocksQuery = useInventoryBlocksQuery(lookupListingId);
  const externalQuery = useExternalReservationsQuery(lookupListingId);
  const connectionsQuery = useInventoryConnectionsQuery(
    listingQuery.data?.partner_id,
  );
  const syncRunsQuery = useConnectionSyncRunsQuery(selectedConnectionId, {
    enabled: Boolean(selectedConnectionId),
  });
  const conflictsQuery = useConnectionConflictsQuery(selectedConnectionId, {
    enabled: Boolean(selectedConnectionId),
  });

  const testMutation = useTestInventoryConnectionMutation();
  const syncMutation = useSyncInventoryConnectionMutation();
  const disconnectMutation = useDisconnectInventoryConnectionMutation(
    listingQuery.data?.partner_id,
  );
  const resolveConflictMutation = useResolveConnectionConflictMutation();
  const releaseBlockMutation =
    useReleaseInventoryBlockMutation(lookupListingId);
  const cancelExternalMutation =
    useCancelExternalReservationMutation(lookupListingId);

  const activeBlocksForUnit = (blocksQuery.data ?? []).filter(
    (b) => b.bookable_unit_id === effectiveUnitId && !b.released_at,
  );
  const activeExternalForUnit = (externalQuery.data ?? []).filter(
    (r) => r.bookable_unit_id === effectiveUnitId && !r.cancelled_at,
  );

  const listingTitle = listingQuery.data
    ? (getLocalizedTranslation(listingQuery.data.translations, locale)?.title ??
      listingQuery.data.slug)
    : null;

  function lookupListing(id) {
    setLookupListingId(id);
    setUnitId(null);
    setSelectedConnectionId(null);
    setListingIdInput(String(id));
    setSearchParams({ listingId: String(id) });
  }

  function handleLookup() {
    const parsed = Number(listingIdInput);
    if (Number.isInteger(parsed) && parsed > 0) lookupListing(parsed);
  }

  // Keep the input in sync if the URL's `listingId` changes from outside
  // this page (e.g. a link from Admin Listing Detail's Commercial &
  // operations section).
  useEffect(() => {
    const fromUrl = searchParams.get('listingId');
    if (fromUrl && Number(fromUrl) !== lookupListingId) {
      setLookupListingId(Number(fromUrl));
      setListingIdInput(fromUrl);
      setUnitId(null);
      setSelectedConnectionId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL is the source of truth on mount/external navigation only, not on every local lookup
  }, [searchParams]);

  function isRealConnector(connectorType) {
    return REAL_CONNECTOR_TYPES.includes(connectorType);
  }

  async function handleTest(connection) {
    try {
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
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await disconnectMutation.mutateAsync({ id: connection.id });
      showToast(t('partner.connections.disconnectSuccess'), {
        variant: 'success',
      });
      if (selectedConnectionId === connection.id) setSelectedConnectionId(null);
    } catch {
      showToast(t('partner.connections.disconnectError'), {
        variant: 'danger',
      });
    }
  }

  function openResolveDialog(connectionId, conflict) {
    setResolveTarget({ connectionId, conflict });
  }

  async function handleConfirmResolve() {
    try {
      await resolveConflictMutation.mutateAsync({
        id: resolveTarget.connectionId,
        conflictId: resolveTarget.conflict.id,
      });
      showToast(t('partner.connections.resolveSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.connections.resolveError'), { variant: 'danger' });
    } finally {
      setResolveTarget(null);
    }
  }

  async function handleReleaseBlock(block) {
    const confirmed = await confirm({
      title: t('admin.inventory.blocks.releaseConfirmTitle'),
      description: t('admin.inventory.blocks.releaseConfirmDescription'),
      confirmLabel: t('admin.inventory.blocks.releaseAction'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await releaseBlockMutation.mutateAsync({ id: block.id });
      showToast(t('admin.inventory.blocks.releaseSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.inventory.actionError'), { variant: 'danger' });
    }
  }

  async function handleCancelExternal(reservation) {
    const confirmed = await confirm({
      title: t('admin.inventory.external.cancelConfirmTitle'),
      description: t('admin.inventory.external.cancelConfirmDescription'),
      confirmLabel: t('admin.inventory.external.cancelAction'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await cancelExternalMutation.mutateAsync({ id: reservation.id });
      showToast(t('admin.inventory.external.cancelSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.inventory.actionError'), { variant: 'danger' });
    }
  }

  const dateTimeFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const overviewConnections = (overviewQuery.data ?? []).filter(
    (row) => !overviewStatusFilter || row.status === overviewStatusFilter,
  );

  const overviewConnectionColumns = [
    {
      key: 'partner',
      header: t('admin.inventory.overview.columns.partner'),
      render: (row) => (
        <RouterLink href={`/${locale}/admin/partners/${row.partner_id}`}>
          {row.partner_display_name}
        </RouterLink>
      ),
    },
    { key: 'name', header: t('admin.inventory.connections.columns.name') },
    {
      key: 'type',
      header: t('admin.inventory.connections.columns.type'),
      render: (row) =>
        t(`partner.connections.connectorTypes.${row.connector_type}`, {
          defaultValue: row.connector_type,
        }),
    },
    {
      key: 'status',
      header: t('admin.inventory.connections.columns.status'),
      render: (row) => (
        <Badge
          variant={row.status === 'ACTIVE' ? 'success' : 'danger'}
          label={t(`admin.inventory.connections.statuses.${row.status}`, {
            defaultValue: row.status,
          })}
        />
      ),
    },
    {
      key: 'lastSync',
      header: t('admin.inventory.connections.columns.lastSync'),
      render: (row) =>
        row.last_successful_sync_at
          ? dateTimeFormatter.format(new Date(row.last_successful_sync_at))
          : t('admin.inventory.connections.neverSynced'),
    },
    {
      key: 'lastError',
      header: t('admin.inventory.overview.columns.lastError'),
      render: (row) => row.last_error || '—',
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => lookupListing(row.listing_id)}
        >
          {t('admin.inventory.overview.inspectAction')}
        </Button>
      ),
    },
  ];

  const overviewConflictColumns = [
    {
      key: 'partner',
      header: t('admin.inventory.overview.columns.partner'),
      render: (row) => (
        <RouterLink href={`/${locale}/admin/partners/${row.partner_id}`}>
          {row.partner_display_name}
        </RouterLink>
      ),
    },
    {
      key: 'conflict_type',
      header: t('admin.inventory.conflicts.columns.type'),
      render: (row) =>
        t(`partner.connections.conflictTypes.${row.conflict_type}`, {
          defaultValue: row.conflict_type,
        }),
    },
    {
      key: 'external_event_uid',
      header: t('admin.inventory.conflicts.columns.event'),
      render: (row) => row.external_event_uid || '—',
    },
    {
      key: 'created_at',
      header: t('admin.inventory.conflicts.columns.createdAt'),
      render: (row) => dateTimeFormatter.format(new Date(row.created_at)),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Inline gap="2" wrap>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => lookupListing(row.listing_id)}
          >
            {t('admin.inventory.overview.inspectAction')}
          </Button>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openResolveDialog(row.connection_id, row)}
            >
              {t('partner.connections.resolveAction')}
            </Button>
          )}
        </Inline>
      ),
    },
  ];

  const breakdownColumns = [
    { key: 'date', header: t('admin.inventory.breakdown.columns.date') },
    { key: 'total', header: t('admin.inventory.breakdown.columns.total') },
    {
      key: 'available',
      header: t('admin.inventory.breakdown.columns.available'),
    },
    {
      key: 'confirmed',
      header: t('admin.inventory.breakdown.columns.confirmed'),
    },
    { key: 'held', header: t('admin.inventory.breakdown.columns.held') },
    {
      key: 'external',
      header: t('admin.inventory.breakdown.columns.external'),
    },
    { key: 'manual', header: t('admin.inventory.breakdown.columns.manual') },
  ];

  const ledgerColumns = [
    { key: 'date', header: t('admin.inventory.ledger.columns.date') },
    {
      key: 'source_type',
      header: t('admin.inventory.ledger.columns.source'),
      render: (row) =>
        t(`admin.inventory.ledger.sourceTypes.${row.source_type}`, {
          defaultValue: row.source_type,
        }),
    },
    { key: 'delta', header: t('admin.inventory.ledger.columns.delta') },
    {
      key: 'quantity',
      header: t('admin.inventory.ledger.columns.quantity'),
      render: (row) => `${row.quantity_before} → ${row.quantity_after}`,
    },
    { key: 'reason', header: t('admin.inventory.ledger.columns.reason') },
    {
      key: 'created_at',
      header: t('admin.inventory.ledger.columns.createdAt'),
      render: (row) => dateTimeFormatter.format(new Date(row.created_at)),
    },
  ];

  const blockColumns = [
    {
      key: 'range',
      header: t('admin.inventory.blocks.columns.range'),
      render: (row) => `${row.date_from} – ${row.date_to}`,
    },
    { key: 'quantity', header: t('admin.inventory.blocks.columns.quantity') },
    {
      key: 'reason',
      header: t('admin.inventory.blocks.columns.reason'),
      render: (row) =>
        t(`partner.calendar.blocks.reasonCodes.${row.reason_code}`),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canManage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleReleaseBlock(row)}
            loading={
              releaseBlockMutation.isPending &&
              releaseBlockMutation.variables?.id === row.id
            }
          >
            {t('admin.inventory.blocks.releaseAction')}
          </Button>
        ),
    },
  ];

  const externalColumns = [
    {
      key: 'range',
      header: t('admin.inventory.external.columns.range'),
      render: (row) => `${row.date_from} – ${row.date_to}`,
    },
    {
      key: 'source',
      header: t('admin.inventory.external.columns.source'),
      render: (row) =>
        t(`partner.calendar.external.sourceCodes.${row.source_code}`),
    },
    {
      key: 'guest',
      header: t('admin.inventory.external.columns.guest'),
      render: (row) => row.guest_name || '—',
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canManage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCancelExternal(row)}
            loading={
              cancelExternalMutation.isPending &&
              cancelExternalMutation.variables?.id === row.id
            }
          >
            {t('admin.inventory.external.cancelAction')}
          </Button>
        ),
    },
  ];

  const connectionColumns = [
    { key: 'name', header: t('admin.inventory.connections.columns.name') },
    {
      key: 'type',
      header: t('admin.inventory.connections.columns.type'),
      render: (row) =>
        t(`partner.connections.connectorTypes.${row.connector_type}`, {
          defaultValue: row.connector_type,
        }),
    },
    {
      key: 'status',
      header: t('admin.inventory.connections.columns.status'),
      render: (row) => (
        <Badge
          variant={row.status === 'ACTIVE' ? 'success' : 'danger'}
          label={t(`admin.inventory.connections.statuses.${row.status}`, {
            defaultValue: row.status,
          })}
        />
      ),
    },
    {
      key: 'lastSync',
      header: t('admin.inventory.connections.columns.lastSync'),
      render: (row) =>
        row.last_successful_sync_at
          ? dateTimeFormatter.format(new Date(row.last_successful_sync_at))
          : t('admin.inventory.connections.neverSynced'),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Inline gap="2" wrap>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedConnectionId(row.id)}
          >
            {t('admin.inventory.connections.detailsAction')}
          </Button>
          {canManage && isRealConnector(row.connector_type) && (
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
            </>
          )}
          {canManage && !isRealConnector(row.connector_type) && (
            <Badge
              variant="neutral"
              size="sm"
              label={t('admin.inventory.connections.notImplemented')}
            />
          )}
          {canManage && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDisconnect(row)}
            >
              {t('partner.connections.disconnectAction')}
            </Button>
          )}
        </Inline>
      ),
    },
  ];

  const holdColumns = [
    {
      key: 'range',
      header: t('admin.inventory.holds.columns.range'),
      render: (row) => `${row.date_from} – ${row.date_to}`,
    },
    { key: 'user_id', header: t('admin.inventory.holds.columns.user') },
    {
      key: 'expires_at',
      header: t('admin.inventory.holds.columns.expiresAt'),
      render: (row) => dateTimeFormatter.format(new Date(row.expires_at)),
    },
  ];

  const syncRunColumns = [
    {
      key: 'started_at',
      header: t('admin.inventory.syncRuns.columns.startedAt'),
      render: (row) => dateTimeFormatter.format(new Date(row.started_at)),
    },
    {
      key: 'trigger_code',
      header: t('admin.inventory.syncRuns.columns.trigger'),
      render: (row) =>
        t(`partner.connections.syncTriggers.${row.trigger_code}`, {
          defaultValue: row.trigger_code,
        }),
    },
    {
      key: 'status',
      header: t('admin.inventory.syncRuns.columns.status'),
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
      header: t('admin.inventory.syncRuns.columns.records'),
      render: (row) =>
        t('admin.inventory.syncRuns.recordsSummary', {
          created: row.records_created ?? 0,
          skipped: row.records_skipped ?? 0,
        }),
    },
    {
      key: 'error_message',
      header: t('admin.inventory.syncRuns.columns.error'),
      render: (row) => row.error_message || '—',
    },
  ];

  const conflictColumns = [
    {
      key: 'external_event_uid',
      header: t('admin.inventory.conflicts.columns.event'),
      render: (row) => row.external_event_uid || '—',
    },
    {
      key: 'conflict_type',
      header: t('admin.inventory.conflicts.columns.type'),
      render: (row) =>
        t(`partner.connections.conflictTypes.${row.conflict_type}`, {
          defaultValue: row.conflict_type,
        }),
    },
    {
      key: 'created_at',
      header: t('admin.inventory.conflicts.columns.createdAt'),
      render: (row) => dateTimeFormatter.format(new Date(row.created_at)),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canManage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openResolveDialog(selectedConnectionId, row)}
          >
            {t('partner.connections.resolveAction')}
          </Button>
        ),
    },
  ];

  const statusFilterOptions = [
    { value: '', label: t('admin.inventory.overview.statusAll') },
    {
      value: 'ACTIVE',
      label: t('admin.inventory.connections.statuses.ACTIVE'),
    },
    { value: 'ERROR', label: t('admin.inventory.connections.statuses.ERROR') },
    {
      value: 'PAUSED',
      label: t('admin.inventory.connections.statuses.PAUSED'),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.inventory.heading')}
        breadcrumbs={[
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.inventory.heading'),
            href: `/${locale}/admin/inventory`,
          },
        ]}
      />
      <p>{t('admin.inventory.description')}</p>

      <Stack gap="4">
        <Card as="div" padding="lg">
          <Stack gap="3">
            <Inline justify="space-between" align="center" wrap>
              <h2>{t('admin.inventory.overview.connectionsHeading')}</h2>
              <Select
                placeholder={selectTexts.placeholder}
                searchPlaceholder={selectTexts.searchPlaceholder}
                noOptionsMessage={selectTexts.noOptionsMessage}
                ariaLabel={t('admin.inventory.overview.statusFilterLabel')}
                options={statusFilterOptions}
                value={overviewStatusFilter}
                onChange={setOverviewStatusFilter}
              />
            </Inline>
            {overviewQuery.isError ? (
              <ErrorState
                title={t('admin.inventory.overview.errorTitle')}
                retryLabel={t('admin.inventory.overview.errorRetry')}
                onRetry={overviewQuery.refetch}
              />
            ) : (
              <DataTable
                columns={overviewConnectionColumns}
                rows={overviewConnections}
                isLoading={overviewQuery.isPending}
                emptyTitle={t('admin.inventory.overview.connectionsEmptyTitle')}
              />
            )}
          </Stack>
        </Card>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <h2>{t('admin.inventory.overview.conflictsHeading')}</h2>
            {conflictsOverviewQuery.isError ? (
              <ErrorState
                title={t('admin.inventory.overview.errorTitle')}
                retryLabel={t('admin.inventory.overview.errorRetry')}
                onRetry={conflictsOverviewQuery.refetch}
              />
            ) : (
              <DataTable
                columns={overviewConflictColumns}
                rows={conflictsOverviewQuery.data ?? []}
                isLoading={conflictsOverviewQuery.isPending}
                emptyTitle={t('admin.inventory.overview.conflictsEmptyTitle')}
                emptyDescription={t(
                  'admin.inventory.overview.conflictsEmptyDescription',
                )}
              />
            )}
          </Stack>
        </Card>

        <Card as="div" padding="lg">
          <Inline gap="3" align="flex-end" wrap>
            <Input
              label={t('admin.inventory.lookup.label')}
              type="number"
              value={listingIdInput}
              onChange={(event) => setListingIdInput(event.target.value)}
              placeholder={t('admin.inventory.lookup.placeholder')}
            />
            <Button
              variant="primary"
              onClick={() => handleLookup()}
              disabled={!listingIdInput}
            >
              <Search size={16} aria-hidden="true" />
              {t('admin.inventory.lookup.action')}
            </Button>
          </Inline>
        </Card>

        {!lookupListingId && (
          <EmptyState
            title={t('admin.inventory.noLookup.title')}
            description={t('admin.inventory.noLookup.description')}
          />
        )}

        {lookupListingId && listingQuery.isPending && (
          <Spinner label={t('admin.inventory.heading')} />
        )}

        {lookupListingId && listingQuery.isError && (
          <ErrorState
            title={t('admin.inventory.notFound.title')}
            description={t('admin.inventory.notFound.description')}
          />
        )}

        {lookupListingId && listingQuery.data && (
          <Stack gap="4">
            <Card as="div" padding="lg">
              <Stack gap="3">
                <Inline justify="space-between" align="center" wrap>
                  <h2>{listingTitle}</h2>
                  <RouterLink
                    href={`/${locale}/admin/listings/${lookupListingId}`}
                  >
                    {t('admin.inventory.viewListingAction')}
                  </RouterLink>
                </Inline>
                {units.length > 1 && (
                  // `aria-pressed` on each button is the "toggle button
                  // group" pattern, not tabs — see the identical fix in
                  // `PartnerCalendarPageContent.jsx` (`role="tablist"`
                  // required `role="tab"` children, a real critical axe
                  // violation; `role="group"` matches what this actually is).
                  <Inline
                    gap="2"
                    wrap
                    role="group"
                    aria-label={t('partner.calendar.resourceLabel')}
                  >
                    {units.map((unit) => (
                      <Button
                        key={unit.id}
                        variant={
                          unit.id === effectiveUnitId ? 'primary' : 'secondary'
                        }
                        size="sm"
                        aria-pressed={unit.id === effectiveUnitId}
                        onClick={() => setUnitId(unit.id)}
                      >
                        {unitLabel(unit, t)}
                      </Button>
                    ))}
                  </Inline>
                )}
                {effectiveUnit && (
                  <span>
                    {effectiveUnit.time_slot_start &&
                    effectiveUnit.time_slot_end
                      ? t('admin.inventory.unitContext.timeSlot', {
                          start: effectiveUnit.time_slot_start.slice(0, 5),
                          end: effectiveUnit.time_slot_end.slice(0, 5),
                        })
                      : t('admin.inventory.unitContext.dateOnly')}
                  </span>
                )}
              </Stack>
            </Card>

            {!unitsQuery.isPending && units.length === 0 && (
              <EmptyState
                title={t('admin.inventory.noUnits.title')}
                description={t('admin.inventory.noUnits.description')}
              />
            )}

            {effectiveUnitId && (
              <Card as="div" padding="lg">
                <Tabs
                  ariaLabel={t('admin.inventory.detailTabsLabel')}
                  activeTabId={detailTab}
                  onChange={setDetailTab}
                  tabs={[
                    {
                      id: 'breakdown',
                      label: t('admin.inventory.breakdown.tabLabel'),
                      panel: (
                        <DataTable
                          columns={breakdownColumns}
                          rows={breakdownQuery.data ?? []}
                          isLoading={breakdownQuery.isPending}
                          emptyTitle={t('admin.inventory.breakdown.emptyTitle')}
                        />
                      ),
                    },
                    {
                      id: 'holds',
                      label: t('admin.inventory.holds.tabLabel', {
                        count: (holdsQuery.data ?? []).length,
                      }),
                      panel: (
                        <DataTable
                          columns={holdColumns}
                          rows={holdsQuery.data ?? []}
                          isLoading={holdsQuery.isPending}
                          emptyTitle={t('admin.inventory.holds.emptyTitle')}
                        />
                      ),
                    },
                    {
                      id: 'ledger',
                      label: t('admin.inventory.ledger.tabLabel'),
                      panel: (
                        <DataTable
                          columns={ledgerColumns}
                          rows={ledgerQuery.data ?? []}
                          isLoading={ledgerQuery.isPending}
                          emptyTitle={t('admin.inventory.ledger.emptyTitle')}
                        />
                      ),
                    },
                    {
                      id: 'blocks',
                      label: t('admin.inventory.blocks.tabLabel', {
                        count: activeBlocksForUnit.length,
                      }),
                      panel: (
                        <DataTable
                          columns={blockColumns}
                          rows={activeBlocksForUnit}
                          isLoading={blocksQuery.isPending}
                          emptyTitle={t('admin.inventory.blocks.emptyTitle')}
                        />
                      ),
                    },
                    {
                      id: 'external',
                      label: t('admin.inventory.external.tabLabel', {
                        count: activeExternalForUnit.length,
                      }),
                      panel: (
                        <DataTable
                          columns={externalColumns}
                          rows={activeExternalForUnit}
                          isLoading={externalQuery.isPending}
                          emptyTitle={t('admin.inventory.external.emptyTitle')}
                        />
                      ),
                    },
                    {
                      id: 'connections',
                      label: t('admin.inventory.connections.tabLabel'),
                      panel: (
                        <DataTable
                          columns={connectionColumns}
                          rows={connectionsQuery.data ?? []}
                          isLoading={connectionsQuery.isPending}
                          emptyTitle={t(
                            'admin.inventory.connections.emptyTitle',
                          )}
                        />
                      ),
                    },
                    {
                      id: 'syncRuns',
                      label: t('admin.inventory.syncRuns.tabLabel'),
                      panel: selectedConnectionId ? (
                        <DataTable
                          columns={syncRunColumns}
                          rows={syncRunsQuery.data ?? []}
                          isLoading={syncRunsQuery.isPending}
                          emptyTitle={t('admin.inventory.syncRuns.emptyTitle')}
                        />
                      ) : (
                        <EmptyState
                          title={t('admin.inventory.syncRuns.noSelectionTitle')}
                          description={t(
                            'admin.inventory.syncRuns.noSelectionDescription',
                          )}
                        />
                      ),
                    },
                    {
                      id: 'conflicts',
                      label: t('admin.inventory.conflicts.tabLabel'),
                      panel: selectedConnectionId ? (
                        <DataTable
                          columns={conflictColumns}
                          rows={conflictsQuery.data ?? []}
                          isLoading={conflictsQuery.isPending}
                          emptyTitle={t('admin.inventory.conflicts.emptyTitle')}
                        />
                      ) : (
                        <EmptyState
                          title={t(
                            'admin.inventory.conflicts.noSelectionTitle',
                          )}
                          description={t(
                            'admin.inventory.conflicts.noSelectionDescription',
                          )}
                        />
                      ),
                    },
                  ]}
                />
              </Card>
            )}
          </Stack>
        )}
      </Stack>

      {resolveTarget && (
        <Modal
          isOpen
          onClose={() => setResolveTarget(null)}
          title={t('partner.connections.resolveConfirmTitle')}
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={() => setResolveTarget(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleConfirmResolve()}
                loading={resolveConflictMutation.isPending}
              >
                {t('partner.connections.resolveConfirmAction')}
              </Button>
            </Inline>
          }
        >
          <span>{t('partner.connections.resolveConfirmDescription')}</span>
        </Modal>
      )}
    </Section>
  );
}

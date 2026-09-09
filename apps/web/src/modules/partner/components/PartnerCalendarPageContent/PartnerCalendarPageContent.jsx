/**
 * PartnerCalendarPageContent — `/:locale/partner/calendar` (Partner
 * Dashboard: Availability & Inventory Manager, Phase 17).
 *
 * Listing selector -> bookable-unit ("resource") selector (a horizontal
 * pill row, so a hotel with several room types or a tour with several
 * daily departures — each department gets its own `bookable_unit` row,
 * see `time_slot_start`/`unit_label` — reads as a simple switcher, not a
 * database table) -> `PartnerCalendarEditor` (packages/ui/dashboard,
 * reused as-is, already fully keyboard-accessible) for the selected
 * resource's calendar.
 *
 * Selecting a date range surfaces one action panel with three tabs —
 * Set availability (Phase 9, unchanged), Quick Block (Phase 17 §8-9,
 * quantity-aware, reason-coded), External reservation (Phase 17 §10,
 * minimal required fields) — so a receptionist never needs to
 * understand which backend table a given action touches, only "what do
 * I want to do with this date range." Below that, a day's source
 * breakdown (total/available/confirmed/held/external/manual, §13) and
 * two management lists (active blocks / external reservations, each
 * with a one-click release/cancel action) complete the "operate without
 * ever needing the database" requirement.
 */

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Select, Input, Textarea } from '@desavii/ui/components/form-controls';
import { Button, Card, Badge } from '@desavii/ui/components/primitives';
import {
  Spinner,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { PartnerCalendarEditor } from '@desavii/ui/components/dashboard';
import { Tabs } from '@desavii/ui/components/navigation';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import CsvImportWizard from './CsvImportWizard/CsvImportWizard.jsx';
import PartnerCalendarWeekView from './PartnerCalendarWeekView.jsx';
import PartnerCalendarDayView from './PartnerCalendarDayView.jsx';
import { addDays, startOfWeek, todayIso } from './calendarDateGrid.js';
import { buildDaySourceIndex, SOURCE_TYPES } from './calendarSourceIndex.js';
import { resolveAuthoritativeDayStatus } from './resolveDayStatus.js';
import {
  useMyListingsQuery,
  useListingCalendarQuery,
  useSetAvailabilityMutation,
} from '../../../listings/index.js';
import {
  useBookableUnitsQuery,
  BOOKABLE_UNIT_TYPES,
  useUnitBreakdownQuery,
  useUnitHoldsQuery,
  useInventoryBlocksQuery,
  useExternalReservationsQuery,
  useInventoryConnectionsQuery,
  useCreateInventoryBlockMutation,
  useReleaseInventoryBlockMutation,
  useCreateExternalReservationMutation,
  useCancelExternalReservationMutation,
  usePartnerCapability,
  PARTNER_CAPABILITIES,
  BLOCK_REASON_CODES,
  EXTERNAL_RESERVATION_SOURCE_CODES,
} from '../../../availability/index.js';
import { useUnitBookingsQuery } from '../../../bookings/index.js';

const VIEW_MODES = ['month', 'week', 'day'];

const WRITABLE_STATUSES = ['AVAILABLE', 'BLOCKED'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function monthRange({ year, month }) {
  const from = `${year}-${pad2(month + 1)}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const to = `${year}-${pad2(month + 1)}-${pad2(lastDay)}`;
  return { from, to };
}

function todayViewMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function calendarFetchRange({ viewMode, weekStart, viewDate, viewMonth }) {
  if (viewMode === 'week') {
    return { from: weekStart, to: addDays(weekStart, 6) };
  }
  if (viewMode === 'day') {
    return { from: viewDate, to: viewDate };
  }
  return monthRange(viewMonth);
}

function unitLabel(unit, t) {
  if (unit.unit_label) return unit.unit_label;
  if (unit.time_slot_start) return unit.time_slot_start.slice(0, 5);
  return BOOKABLE_UNIT_TYPES.includes(unit.bookable_unit_type)
    ? t(`partner.listingWizard.bookableUnitTypes.${unit.bookable_unit_type}`)
    : unit.bookable_unit_type;
}

export default function PartnerCalendarPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { activePartnerId } = usePartnerContext();

  const canManageAvailability = usePartnerCapability(
    PARTNER_CAPABILITIES.MANAGE_AVAILABILITY,
  );
  const canManageExternal = usePartnerCapability(
    PARTNER_CAPABILITIES.MANAGE_EXTERNAL_RESERVATIONS,
  );
  const canManageBlocks = usePartnerCapability(
    PARTNER_CAPABILITIES.MANAGE_MANUAL_BLOCKS,
  );

  const [listingId, setListingId] = useState(null);
  const [unitId, setUnitId] = useState(null);
  const [viewMode, setViewMode] = useState('month');
  const [viewMonth, setViewMonth] = useState(todayViewMonth);
  const [viewDate, setViewDate] = useState(todayIso);
  const [selection, setSelection] = useState(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [actionTab, setActionTab] = useState('availability');
  const [pendingStatus, setPendingStatus] = useState('AVAILABLE');
  const [blockForm, setBlockForm] = useState({
    quantity: '1',
    reasonCode: 'MAINTENANCE',
    notes: '',
  });
  const [externalForm, setExternalForm] = useState({
    quantity: '1',
    sourceCode: 'PHONE',
    guestName: '',
    guestPhone: '',
    externalReference: '',
    notes: '',
  });
  const [listTab, setListTab] = useState('blocks');

  const listingsQuery = useMyListingsQuery({ partnerId: activePartnerId });
  const listings = listingsQuery.data?.pages?.[0]?.results ?? [];
  const effectiveListingId = listingId ?? listings[0]?.id ?? null;

  const unitsQuery = useBookableUnitsQuery(effectiveListingId);
  const units = unitsQuery.data ?? [];
  const effectiveUnitId = unitId ?? units[0]?.id ?? null;
  const selectedUnit = units.find((u) => u.id === effectiveUnitId);
  // A unit is time-sliced (a tour/activity departure) if and only if its
  // OWN `time_slot_start` is populated — never inferred from
  // `listing_type`/`bookable_unit_type`, which are identical for a
  // time-sliced Activity and a date-only Guide (see the Sprint 5 backend
  // audit: both are ATTRACTION/TOUR_DEPARTURE rows).
  const isTimeSliced = Boolean(selectedUnit?.time_slot_start);

  const weekStart = startOfWeek(viewDate);
  // The Month grid keeps its own `monthRange` (unchanged); Week/Day widen
  // or narrow the SAME `useListingCalendarQuery` range so the date-only
  // Week strip and the Month grid always read from one fetch, never a
  // second query for the same status data.
  const { from, to } = calendarFetchRange({
    viewMode,
    weekStart,
    viewDate,
    viewMonth,
  });
  const calendarQuery = useListingCalendarQuery(
    effectiveListingId,
    effectiveUnitId,
    { from, to },
  );
  const setAvailabilityMutation =
    useSetAvailabilityMutation(effectiveListingId);
  const createBlockMutation =
    useCreateInventoryBlockMutation(effectiveListingId);
  const releaseBlockMutation =
    useReleaseInventoryBlockMutation(effectiveListingId);
  const createExternalMutation =
    useCreateExternalReservationMutation(effectiveListingId);
  const cancelExternalMutation =
    useCancelExternalReservationMutation(effectiveListingId);

  const blocksQuery = useInventoryBlocksQuery(effectiveListingId);
  const externalQuery = useExternalReservationsQuery(effectiveListingId);
  const breakdownQuery = useUnitBreakdownQuery(
    effectiveUnitId,
    selection?.start,
    selection?.end ?? selection?.start,
  );
  // Sprint D-2 (Partner Calendar source-aware UX): the SAME per-day
  // breakdown TimeSlotBlock.jsx's timeline already used, now also fetched
  // for the whole visible Month/Week/Day range so status can be derived
  // from real remaining capacity instead of the raw AVAILABLE/BLOCKED
  // flag alone (D-0's "Month/Week can visually disagree with authoritative
  // capacity" finding). Reuses the existing `GET .../breakdown` endpoint —
  // no new backend surface.
  const viewBreakdownQuery = useUnitBreakdownQuery(effectiveUnitId, from, to);
  // Active holds and Desavii bookings touching the visible range — the two
  // source types the Calendar page never fetched before D-2 (manual
  // blocks/external reservations were already fetched for the management
  // tables below; this reuses those same listing-wide queries).
  const viewHoldsQuery = useUnitHoldsQuery(effectiveUnitId, from, to);
  const viewBookingsQuery = useUnitBookingsQuery(
    activePartnerId,
    effectiveUnitId,
    from,
    to,
  );
  const connectionsQuery = useInventoryConnectionsQuery(activePartnerId);

  const breakdownByDate = useMemo(() => {
    const entries = viewBreakdownQuery.data ?? [];
    return Object.fromEntries(entries.map((day) => [day.date, day]));
  }, [viewBreakdownQuery.data]);

  const statusByDate = useMemo(() => {
    const entries = calendarQuery.data ?? [];
    return Object.fromEntries(
      entries.map((day) => [
        day.date,
        resolveAuthoritativeDayStatus(day.status, breakdownByDate[day.date]),
      ]),
    );
  }, [calendarQuery.data, breakdownByDate]);

  const dayStatusLabels = {
    available: t('partner.calendar.timeline.status.available'),
    partial: t('partner.calendar.timeline.status.partial'),
    full: t('partner.calendar.timeline.status.full'),
    blocked: t('partner.calendar.timeline.status.blocked'),
  };

  const sourceLabels = {
    booking: t('partner.calendar.sources.booking'),
    hold: t('partner.calendar.sources.hold'),
    block: t('partner.calendar.sources.block'),
    external: t('partner.calendar.sources.external'),
  };

  const daySourceIndex = useMemo(
    () =>
      buildDaySourceIndex(
        {
          bookings: viewBookingsQuery.data ?? [],
          holds: viewHoldsQuery.data ?? [],
          blocks: blocksQuery.data ?? [],
          externalReservations: externalQuery.data ?? [],
        },
        effectiveUnitId,
        { from, to },
      ),
    [
      viewBookingsQuery.data,
      viewHoldsQuery.data,
      blocksQuery.data,
      externalQuery.data,
      effectiveUnitId,
      from,
      to,
    ],
  );

  const sourceIndicatorsByDate = useMemo(() => {
    const result = {};
    daySourceIndex.forEach((events, date) => {
      result[date] = {
        booking: events.some((e) => e.sourceType === SOURCE_TYPES.BOOKING),
        hold: events.some((e) => e.sourceType === SOURCE_TYPES.HOLD),
        block: events.some((e) => e.sourceType === SOURCE_TYPES.BLOCK),
        external: events.some((e) => e.sourceType === SOURCE_TYPES.EXTERNAL),
      };
    });
    return result;
  }, [daySourceIndex]);

  const connectionsById = useMemo(
    () =>
      Object.fromEntries((connectionsQuery.data ?? []).map((c) => [c.id, c])),
    [connectionsQuery.data],
  );

  const listingOptions = listings.map((listing) => ({
    value: String(listing.id),
    label: listing.title ?? listing.slug,
  }));
  const statusFormOptions = WRITABLE_STATUSES.map((code) => ({
    value: code,
    label: t(`partner.calendar.form.statusOptions.${code}`),
  }));
  const reasonOptions = BLOCK_REASON_CODES.map((code) => ({
    value: code,
    label: t(`partner.calendar.blocks.reasonCodes.${code}`),
  }));
  const sourceOptions = EXTERNAL_RESERVATION_SOURCE_CODES.map((code) => ({
    value: code,
    label: t(`partner.calendar.external.sourceCodes.${code}`),
  }));

  function resetSelectionForms() {
    setSelection(null);
    setBlockForm({ quantity: '1', reasonCode: 'MAINTENANCE', notes: '' });
    setExternalForm({
      quantity: '1',
      sourceCode: 'PHONE',
      guestName: '',
      guestPhone: '',
      externalReference: '',
      notes: '',
    });
  }

  function handleSelectSlot(slotUnitId, date) {
    setUnitId(slotUnitId);
    setSelection({ start: date, end: date });
    setBlockForm({ quantity: '1', reasonCode: 'MAINTENANCE', notes: '' });
    setExternalForm({
      quantity: '1',
      sourceCode: 'PHONE',
      guestName: '',
      guestPhone: '',
      externalReference: '',
      notes: '',
    });
  }

  function handleSelectDate(date) {
    handleSelectSlot(effectiveUnitId, date);
  }

  async function handleApplyAvailability() {
    if (!selection?.start || !effectiveUnitId) return;
    try {
      await setAvailabilityMutation.mutateAsync({
        unitId: effectiveUnitId,
        dateFrom: selection.start,
        dateTo: selection.end ?? selection.start,
        status: pendingStatus,
      });
      showToast(t('partner.calendar.applySuccess'), { variant: 'success' });
      resetSelectionForms();
    } catch {
      showToast(t('partner.calendar.applyError'), { variant: 'danger' });
    }
  }

  async function handleQuickBlock() {
    if (!selection?.start || !effectiveUnitId) return;
    try {
      await createBlockMutation.mutateAsync({
        unitId: effectiveUnitId,
        dateFrom: selection.start,
        dateTo: selection.end ?? selection.start,
        quantity: Number(blockForm.quantity) || 1,
        reasonCode: blockForm.reasonCode,
        notes: blockForm.notes || undefined,
      });
      showToast(t('partner.calendar.blocks.createSuccess'), {
        variant: 'success',
      });
      resetSelectionForms();
    } catch {
      showToast(t('partner.calendar.blocks.createError'), {
        variant: 'danger',
      });
    }
  }

  async function handleUnblock(id) {
    try {
      await releaseBlockMutation.mutateAsync({ id });
      showToast(t('partner.calendar.blocks.releaseSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.calendar.blocks.releaseError'), {
        variant: 'danger',
      });
    }
  }

  async function handleCreateExternal() {
    if (!selection?.start || !effectiveUnitId) return;
    try {
      await createExternalMutation.mutateAsync({
        unitId: effectiveUnitId,
        dateFrom: selection.start,
        dateTo: selection.end ?? selection.start,
        quantity: Number(externalForm.quantity) || 1,
        sourceCode: externalForm.sourceCode,
        guestName: externalForm.guestName || undefined,
        guestPhone: externalForm.guestPhone || undefined,
        externalReference: externalForm.externalReference || undefined,
        notes: externalForm.notes || undefined,
      });
      showToast(t('partner.calendar.external.createSuccess'), {
        variant: 'success',
      });
      resetSelectionForms();
    } catch {
      showToast(t('partner.calendar.external.createError'), {
        variant: 'danger',
      });
    }
  }

  async function handleCancelExternal(id) {
    // Sprint D-2 §12: cancelling here only removes Desavii's own local
    // mirror of this reservation (`availabilityService.js
    // #cancelExternalReservation` never calls any external provider) — the
    // partner must still cancel it at the real source themselves.
    const confirmed = await confirm({
      title: t('partner.calendar.external.cancelConfirmTitle'),
      description: t('partner.calendar.external.cancelConfirmDescription'),
      confirmLabel: t('partner.calendar.external.cancelAction'),
      cancelLabel: t('partner.calendar.external.cancelConfirmDismiss'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await cancelExternalMutation.mutateAsync({ id });
      showToast(t('partner.calendar.external.cancelSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('partner.calendar.external.cancelError'), {
        variant: 'danger',
      });
    }
  }

  const actionTabs = [
    canManageAvailability && {
      id: 'availability',
      label: t('partner.calendar.form.statusLabel'),
      panel: (
        <Stack gap="3">
          <Inline gap="3" align="center" wrap>
            <Select
              ariaLabel={t('partner.calendar.form.statusLabel')}
              options={statusFormOptions}
              value={pendingStatus}
              onChange={(value) => setPendingStatus(value)}
            />
            <Button
              variant="primary"
              onClick={() => handleApplyAvailability()}
              loading={setAvailabilityMutation.isPending}
            >
              {t('partner.calendar.form.apply')}
            </Button>
          </Inline>
        </Stack>
      ),
    },
    canManageBlocks && {
      id: 'block',
      label: t('partner.calendar.blocks.tabLabel'),
      panel: (
        <Stack gap="3">
          <Inline gap="3" wrap align="flex-end">
            <Input
              label={t('partner.calendar.blocks.quantityLabel')}
              type="number"
              value={blockForm.quantity}
              onChange={(event) =>
                setBlockForm((prev) => ({
                  ...prev,
                  quantity: event.target.value,
                }))
              }
            />
            <Select
              ariaLabel={t('partner.calendar.blocks.reasonLabel')}
              options={reasonOptions}
              value={blockForm.reasonCode}
              onChange={(value) =>
                setBlockForm((prev) => ({ ...prev, reasonCode: value }))
              }
            />
          </Inline>
          <Textarea
            label={t('partner.calendar.blocks.notesLabel')}
            value={blockForm.notes}
            onChange={(event) =>
              setBlockForm((prev) => ({ ...prev, notes: event.target.value }))
            }
          />
          <Button
            variant="primary"
            onClick={() => handleQuickBlock()}
            loading={createBlockMutation.isPending}
          >
            {t('partner.calendar.blocks.blockAction')}
          </Button>
        </Stack>
      ),
    },
    canManageExternal && {
      id: 'external',
      label: t('partner.calendar.external.tabLabel'),
      panel: (
        <Stack gap="3">
          <Inline gap="3" wrap align="flex-end">
            <Select
              ariaLabel={t('partner.calendar.external.sourceLabel')}
              options={sourceOptions}
              value={externalForm.sourceCode}
              onChange={(value) =>
                setExternalForm((prev) => ({ ...prev, sourceCode: value }))
              }
            />
            <Input
              label={t('partner.calendar.external.quantityLabel')}
              type="number"
              value={externalForm.quantity}
              onChange={(event) =>
                setExternalForm((prev) => ({
                  ...prev,
                  quantity: event.target.value,
                }))
              }
            />
          </Inline>
          <Inline gap="3" wrap>
            <Input
              label={t('partner.calendar.external.guestNameLabel')}
              value={externalForm.guestName}
              onChange={(event) =>
                setExternalForm((prev) => ({
                  ...prev,
                  guestName: event.target.value,
                }))
              }
            />
            <Input
              label={t('partner.calendar.external.guestPhoneLabel')}
              value={externalForm.guestPhone}
              onChange={(event) =>
                setExternalForm((prev) => ({
                  ...prev,
                  guestPhone: event.target.value,
                }))
              }
            />
            <Input
              label={t('partner.calendar.external.referenceLabel')}
              value={externalForm.externalReference}
              onChange={(event) =>
                setExternalForm((prev) => ({
                  ...prev,
                  externalReference: event.target.value,
                }))
              }
            />
          </Inline>
          <Button
            variant="primary"
            onClick={() => handleCreateExternal()}
            loading={createExternalMutation.isPending}
          >
            {t('partner.calendar.external.recordAction')}
          </Button>
        </Stack>
      ),
    },
  ].filter(Boolean);

  const blockColumns = [
    {
      key: 'range',
      header: t('partner.calendar.blocks.columns.range'),
      render: (row) => `${row.date_from} – ${row.date_to}`,
    },
    {
      key: 'quantity',
      header: t('partner.calendar.blocks.columns.quantity'),
      render: (row) => row.quantity,
    },
    {
      key: 'reason',
      header: t('partner.calendar.blocks.columns.reason'),
      render: (row) =>
        t(`partner.calendar.blocks.reasonCodes.${row.reason_code}`),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canManageBlocks && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleUnblock(row.id)}
            loading={releaseBlockMutation.isPending}
          >
            {t('partner.calendar.blocks.unblockAction')}
          </Button>
        ),
    },
  ];

  const externalColumns = [
    {
      key: 'range',
      header: t('partner.calendar.external.columns.range'),
      render: (row) => `${row.date_from} – ${row.date_to}`,
    },
    {
      key: 'source',
      header: t('partner.calendar.external.columns.source'),
      render: (row) =>
        t(`partner.calendar.external.sourceCodes.${row.source_code}`),
    },
    {
      key: 'guest',
      header: t('partner.calendar.external.columns.guest'),
      render: (row) => row.guest_name || '—',
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canManageExternal && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCancelExternal(row.id)}
            loading={cancelExternalMutation.isPending}
          >
            {t('partner.calendar.external.cancelAction')}
          </Button>
        ),
    },
  ];

  const activeBlocksForUnit = (blocksQuery.data ?? []).filter(
    (b) => b.bookable_unit_id === effectiveUnitId && !b.released_at,
  );
  const activeExternalForUnit = (externalQuery.data ?? []).filter(
    (r) => r.bookable_unit_id === effectiveUnitId && !r.cancelled_at,
  );

  function renderCalendarView() {
    if (calendarQuery.isError) {
      return (
        <ErrorState
          title={t('partner.bookings.error.title')}
          retryLabel={t('partner.bookings.error.retry')}
          onRetry={calendarQuery.refetch}
        />
      );
    }

    if (viewMode === 'month') {
      return (
        <PartnerCalendarEditor
          viewMonth={viewMonth}
          onViewMonthChange={setViewMonth}
          statusByDate={statusByDate}
          statusLabels={dayStatusLabels}
          sourceIndicatorsByDate={sourceIndicatorsByDate}
          sourceLabels={sourceLabels}
          selection={selection}
          onSelectionChange={setSelection}
          locale={i18n.language}
          previousMonthLabel={t(
            'partner.listingWizard.datePicker.previousMonth',
          )}
          nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
          disabled={
            calendarQuery.isPending || setAvailabilityMutation.isPending
          }
          isLoading={calendarQuery.isPending}
        />
      );
    }

    if (viewMode === 'week') {
      return (
        <PartnerCalendarWeekView
          weekStart={weekStart}
          onWeekStartChange={(iso) => {
            setViewDate(iso);
            setSelection(null);
          }}
          units={units}
          effectiveUnit={selectedUnit}
          isTimeSliced={isTimeSliced}
          statusByDate={statusByDate}
          statusLabels={dayStatusLabels}
          sourceIndicatorsByDate={sourceIndicatorsByDate}
          sourceLabels={sourceLabels}
          selection={selection}
          onSelectSlot={(slotUnitId, date) =>
            handleSelectSlot(slotUnitId, date)
          }
          onSelectDate={(date) => handleSelectDate(date)}
          locale={i18n.language}
        />
      );
    }

    return (
      <PartnerCalendarDayView
        date={viewDate}
        onDateChange={(iso) => {
          setViewDate(iso);
          setSelection(null);
        }}
        units={units}
        effectiveUnit={selectedUnit}
        isTimeSliced={isTimeSliced}
        selection={selection}
        onSelectSlot={(slotUnitId, date) => handleSelectSlot(slotUnitId, date)}
        locale={i18n.language}
        daySourceIndex={daySourceIndex}
        connectionsById={connectionsById}
        onNavigateToBooking={(bookingId) =>
          navigate(`/${locale}/partner/bookings/${bookingId}`)
        }
        onCancelExternal={
          canManageExternal ? (id) => handleCancelExternal(id) : undefined
        }
        cancelExternalPending={cancelExternalMutation.isPending}
      />
    );
  }

  if (listingsQuery.isPending) {
    return (
      <Section aria-label={t('partner.calendar.heading')}>
        <Spinner label={t('partner.calendar.heading')} />
      </Section>
    );
  }

  return (
    <Section spacing="default">
      <PageHeader
        title={t('partner.calendar.heading')}
        breadcrumbs={[
          { label: t('partner.nav.dashboard'), href: `/${locale}/partner` },
          {
            label: t('partner.calendar.heading'),
            href: `/${locale}/partner/calendar`,
          },
        ]}
      />

      {listings.length === 0 ? (
        <EmptyState
          title={t('partner.calendar.noListings.title')}
          description={t('partner.calendar.noListings.description')}
        />
      ) : (
        <Stack gap="4">
          <Card as="div" padding="lg">
            <Stack gap="3">
              <Select
                ariaLabel={t('partner.calendar.listingLabel')}
                options={listingOptions}
                value={String(effectiveListingId ?? '')}
                onChange={(value) => {
                  setListingId(Number(value));
                  setUnitId(null);
                  resetSelectionForms();
                }}
              />
              {units.length > 1 && (
                // `aria-pressed` on each button is the "toggle button
                // group" pattern, not tabs — `role="tablist"` was wrong
                // here (WAI-ARIA requires a tablist's children to carry
                // `role="tab"`, which these plain buttons never did,
                // a real critical axe violation). `role="group"` matches
                // what this actually is: a set of independent toggles
                // selecting which resource's calendar is shown below.
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
                      onClick={() => {
                        setUnitId(unit.id);
                        resetSelectionForms();
                      }}
                    >
                      {unitLabel(unit, t)}
                    </Button>
                  ))}
                </Inline>
              )}
              {canManageExternal && effectiveUnitId && (
                <Inline justify="flex-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCsvImportOpen(true)}
                  >
                    {t('partner.calendar.csvImport.openAction')}
                  </Button>
                </Inline>
              )}
            </Stack>
          </Card>

          {!unitsQuery.isPending && units.length === 0 && (
            <EmptyState
              title={t('partner.calendar.noUnits.title')}
              description={t('partner.calendar.noUnits.description')}
            />
          )}

          {units.length > 0 && (
            <>
              <Tabs
                ariaLabel={t('partner.calendar.views.ariaLabel')}
                activeTabId={viewMode}
                onChange={(mode) => {
                  setViewMode(mode);
                  setSelection(null);
                }}
                tabs={VIEW_MODES.map((mode) => ({
                  id: mode,
                  label: t(`partner.calendar.views.${mode}`),
                  panel: renderCalendarView(),
                }))}
              />

              {selection?.start && (
                <Card as="div" padding="lg">
                  <Stack gap="3">
                    <p>
                      {t('partner.calendar.selection', {
                        start: selection.start,
                        end: selection.end ?? selection.start,
                      })}
                    </p>
                    {breakdownQuery.data && breakdownQuery.data.length > 0 && (
                      <Inline gap="2" wrap>
                        <Badge
                          variant="neutral"
                          label={t('partner.calendar.breakdown.total', {
                            count: selectedUnit?.capacity ?? 0,
                          })}
                        />
                        <Badge
                          variant="success"
                          label={t('partner.calendar.breakdown.available', {
                            count: Math.min(
                              ...breakdownQuery.data.map((d) => d.available),
                            ),
                          })}
                        />
                        <Badge
                          variant="info"
                          label={t('partner.calendar.breakdown.confirmed', {
                            count: Math.max(
                              ...breakdownQuery.data.map((d) => d.confirmed),
                            ),
                          })}
                        />
                        <Badge
                          variant="warning"
                          label={t('partner.calendar.breakdown.held', {
                            count: Math.max(
                              ...breakdownQuery.data.map((d) => d.held),
                            ),
                          })}
                        />
                        <Badge
                          variant="warning"
                          label={t('partner.calendar.breakdown.external', {
                            count: Math.max(
                              ...breakdownQuery.data.map((d) => d.external),
                            ),
                          })}
                        />
                        <Badge
                          variant="danger"
                          label={t('partner.calendar.breakdown.manual', {
                            count: Math.max(
                              ...breakdownQuery.data.map((d) => d.manual),
                            ),
                          })}
                        />
                      </Inline>
                    )}
                    {actionTabs.length > 0 && (
                      <Tabs
                        tabs={actionTabs}
                        activeTabId={actionTab}
                        onChange={setActionTab}
                        ariaLabel={t('partner.calendar.actionsLabel')}
                      />
                    )}
                  </Stack>
                </Card>
              )}

              <Card as="div" padding="lg">
                <Tabs
                  ariaLabel={t('partner.calendar.listsLabel')}
                  activeTabId={listTab}
                  onChange={setListTab}
                  tabs={[
                    {
                      id: 'blocks',
                      label: t('partner.calendar.blocks.listTitle', {
                        count: activeBlocksForUnit.length,
                      }),
                      panel: (
                        <DataTableOrEmpty
                          rows={activeBlocksForUnit}
                          columns={blockColumns}
                          emptyTitle={t('partner.calendar.blocks.emptyTitle')}
                        />
                      ),
                    },
                    {
                      id: 'external',
                      label: t('partner.calendar.external.listTitle', {
                        count: activeExternalForUnit.length,
                      }),
                      panel: (
                        <DataTableOrEmpty
                          rows={activeExternalForUnit}
                          columns={externalColumns}
                          emptyTitle={t('partner.calendar.external.emptyTitle')}
                        />
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          )}
        </Stack>
      )}

      {csvImportOpen && effectiveUnitId && (
        <CsvImportWizard
          unitId={effectiveUnitId}
          listingId={effectiveListingId}
          onClose={() => setCsvImportOpen(false)}
          onImported={() => externalQuery.refetch()}
        />
      )}
    </Section>
  );
}

function DataTableOrEmpty({ rows, columns, emptyTitle }) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }
  return (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} scope="col">
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((col) => (
              <td key={col.key}>{col.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

DataTableOrEmpty.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- row shape varies per list (blocks vs. external reservations)
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      header: PropTypes.node,
      render: PropTypes.func.isRequired,
    }),
  ).isRequired,
  emptyTitle: PropTypes.string.isRequired,
};

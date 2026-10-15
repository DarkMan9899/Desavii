/**
 * AdminAuditLogsPageContent — `/:locale/admin/audit-logs` (Stage 11.7:
 * Audit Logs, redesigned Admin Sprint 7 as a dense forensic/operational
 * surface). Same orchestrator shape as `AdminBookingsPageContent`
 * (URL-synced filters via `useAdminListFilters` over
 * `useAdminAuditLogsQuery`, rendered via the shared `DataTable`
 * primitive) — still view-only: no mutations, but now with a per-row
 * "Details" action surfacing the before/after snapshot the backend DTO
 * already returns (previously fetched but never rendered).
 *
 * `action` is a free-text filter (the real action-string catalog spans
 * 89 distinct strings across 20+ modules — too large to enumerate as a
 * `Select`, unlike `targetType`, which is a short, stable list). The
 * table itself still renders the real localized label
 * (`admin.auditLogs.action.<key>`, falling back to a humanized version of
 * the raw string for anything not yet mapped) — the filter's raw-string
 * matching is exact-equality server-side (`al.action = ?`), so its own
 * placeholder shows a real action string, not an invented example.
 *
 * `actorId`/`targetId` are plain numeric-ID filters, matching the
 * established Admin Inventory numeric-lookup convention (Admin Sprint
 * 5) — there is no name-search endpoint for "find the audit actor
 * named X," so a raw ID is the real, honest capability here.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import {
  Input,
  Select,
  DatePicker,
} from '@desavii/ui/components/form-controls';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Button } from '@desavii/ui/components/primitives';
import { ErrorState, Modal } from '@desavii/ui/components/feedback-overlays';
import { Search } from 'lucide-react';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useAdminListFilters } from '../../hooks/useAdminListFilters.js';
import { useAdminAuditLogsQuery } from '../../queries/useAdminAuditLogsQuery.js';
import useSelectTexts from '../../../../hooks/useSelectTexts.js';

const DEFAULT_FILTERS = {
  targetType: '',
  action: '',
  actorId: '',
  targetId: '',
  dateFrom: '',
  dateTo: '',
};

const TARGET_TYPES = [
  'user',
  'partner',
  'listing',
  'booking',
  'cms_page',
  'bookable_unit',
  'availability_calendar',
  'blackout_date',
  'listing_category',
  'listing_amenity',
  'pricing_model',
  'country',
  'region',
  'city',
];

// Defense in depth: `AuditLogger`'s own doc comment (apps/api/src/core/
// domain/auditLogger.js) says callers are trusted never to place a
// secret in a snapshot, and a full audit of every real call site found
// none — but this page renders arbitrary admin-entered JSON (settings/
// marketplace-config values), so it still redacts by key pattern rather
// than trusting that discipline never lapses.
const SENSITIVE_KEY_PATTERN =
  /token|secret|password|credential|authorization|cookie|api[_-]?key/i;

function redactSnapshot(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object') return snapshot;
  if (Array.isArray(snapshot)) return snapshot.map(redactSnapshot);
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, value]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactSnapshot(value),
    ]),
  );
}

// Humanizes an unmapped action string (e.g. `some_module.new_thing_done`
// → "Some module: new thing done") rather than ever showing the raw
// dotted/underscored code — a real fallback for actions added after this
// page's own translated catalog, never the catalog itself.
function humanizeAction(action) {
  const [scope, ...rest] = action.split('.');
  const verb = rest.join('.').replace(/_/g, ' ');
  return `${scope.replace(/_/g, ' ')}: ${verb}`;
}

export default function AdminAuditLogsPageContent() {
  const selectTexts = useSelectTexts();
  const { t, i18n } = useTranslation();
  const { locale } = useParams();

  const { filters, updateFilters } = useAdminListFilters(DEFAULT_FILTERS);
  const [actionText, setActionText] = useState(filters.action);
  const [actorIdText, setActorIdText] = useState(filters.actorId);
  const [targetIdText, setTargetIdText] = useState(filters.targetId);
  const [detailEntry, setDetailEntry] = useState(null);

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAdminAuditLogsQuery({
    targetType: filters.targetType,
    action: filters.action,
    actorId: filters.actorId,
    targetId: filters.targetId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });

  const entries = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  const targetTypeOptions = [
    { value: '', label: t('admin.auditLogs.filters.targetTypeAll') },
    ...TARGET_TYPES.map((code) => ({
      value: code,
      label: t(`admin.auditLogs.targetType.${code}`, { defaultValue: code }),
    })),
  ];

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.language],
  );

  const actionLabel = (action) =>
    t(`admin.auditLogs.action.${action}`, {
      defaultValue: humanizeAction(action),
    });

  const targetTypeLabel = (targetType) =>
    t(`admin.auditLogs.targetType.${targetType}`, {
      defaultValue: targetType,
    });

  const columns = [
    {
      key: 'createdAt',
      header: t('admin.auditLogs.table.timestamp'),
      render: (entry) => dateFormatter.format(new Date(entry.created_at)),
    },
    {
      key: 'actor',
      header: t('admin.auditLogs.table.actor'),
      render: (entry) => entry.actor_name || t('admin.auditLogs.systemActor'),
    },
    {
      key: 'action',
      header: t('admin.auditLogs.table.action'),
      render: (entry) => actionLabel(entry.action),
    },
    {
      key: 'target',
      header: t('admin.auditLogs.table.target'),
      render: (entry) =>
        t('admin.auditLogs.detail.targetValue', {
          type: targetTypeLabel(entry.target_type),
          id: entry.target_id,
        }),
    },
    {
      key: 'actions',
      header: '',
      render: (entry) => (
        <Button variant="ghost" size="sm" onClick={() => setDetailEntry(entry)}>
          {t('admin.auditLogs.detailsAction')}
        </Button>
      ),
    },
  ];

  const dateRangeValue = useMemo(
    () => ({
      start: filters.dateFrom || undefined,
      end: filters.dateTo || undefined,
    }),
    [filters.dateFrom, filters.dateTo],
  );

  const detailBefore = detailEntry
    ? redactSnapshot(detailEntry.before_snapshot)
    : null;
  const detailAfter = detailEntry
    ? redactSnapshot(detailEntry.after_snapshot)
    : null;

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.auditLogs.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.auditLogs.heading'),
            href: `/${locale}/admin/audit-logs`,
          },
        ]}
      />

      {isError ? (
        <ErrorState
          title={t('admin.auditLogs.error.title')}
          retryLabel={t('admin.auditLogs.error.retry')}
          onRetry={refetch}
        />
      ) : (
        <Stack gap="4">
          <p>{t('admin.auditLogs.description')}</p>

          <Inline gap="3" wrap>
            <Input
              aria-label={t('admin.auditLogs.filters.actionLabel')}
              placeholder={t('admin.auditLogs.filters.actionPlaceholder')}
              value={actionText}
              onChange={(event) => setActionText(event.target.value)}
              onBlur={() => updateFilters({ action: actionText })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  updateFilters({ action: actionText });
                }
              }}
              iconLeft={<Search size={18} aria-hidden="true" />}
            />
            <Select
              placeholder={selectTexts.placeholder}
              searchPlaceholder={selectTexts.searchPlaceholder}
              noOptionsMessage={selectTexts.noOptionsMessage}
              ariaLabel={t('admin.auditLogs.filters.targetTypeLabel')}
              options={targetTypeOptions}
              value={filters.targetType}
              onChange={(value) => updateFilters({ targetType: value })}
            />
            <Input
              type="number"
              aria-label={t('admin.auditLogs.filters.actorIdLabel')}
              placeholder={t('admin.auditLogs.filters.actorIdPlaceholder')}
              value={actorIdText}
              onChange={(event) => setActorIdText(event.target.value)}
              onBlur={() => updateFilters({ actorId: actorIdText })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  updateFilters({ actorId: actorIdText });
                }
              }}
            />
            <Input
              type="number"
              aria-label={t('admin.auditLogs.filters.targetIdLabel')}
              placeholder={t('admin.auditLogs.filters.targetIdPlaceholder')}
              value={targetIdText}
              onChange={(event) => setTargetIdText(event.target.value)}
              onBlur={() => updateFilters({ targetId: targetIdText })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  updateFilters({ targetId: targetIdText });
                }
              }}
            />
            <DatePicker
              mode="range"
              ariaLabel={t('admin.auditLogs.filters.dateRangeLabel')}
              placeholder={t('admin.auditLogs.filters.dateRangePlaceholder')}
              value={dateRangeValue}
              onChange={(value) =>
                updateFilters({ dateFrom: value.start, dateTo: value.end })
              }
              locale={i18n.language}
              previousMonthLabel={t(
                'partner.listingWizard.datePicker.previousMonth',
              )}
              nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
            />
          </Inline>

          <DataTable
            columns={columns}
            rows={entries}
            isLoading={isPending}
            emptyTitle={t('admin.auditLogs.empty.title')}
            emptyDescription={t('admin.auditLogs.empty.description')}
            hasMore={Boolean(hasNextPage)}
            isLoadingMore={isFetchingNextPage}
            onLoadMore={fetchNextPage}
            loadMoreLabel={t('admin.auditLogs.loadMore')}
          />
        </Stack>
      )}

      {detailEntry && (
        <Modal
          isOpen
          onClose={() => setDetailEntry(null)}
          title={t('admin.auditLogs.detail.title', {
            action: actionLabel(detailEntry.action),
          })}
          size="lg"
          footer={
            <Inline justify="flex-end">
              <Button variant="ghost" onClick={() => setDetailEntry(null)}>
                {t('common.close')}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <Inline gap="2">
              <strong>{t('admin.auditLogs.detail.actorLabel')}</strong>
              <span>
                {detailEntry.actor_id
                  ? t('admin.auditLogs.detail.actorWithId', {
                      name:
                        detailEntry.actor_name ||
                        t('admin.auditLogs.systemActor'),
                      id: detailEntry.actor_id,
                    })
                  : detailEntry.actor_name || t('admin.auditLogs.systemActor')}
              </span>
            </Inline>
            <Inline gap="2">
              <strong>{t('admin.auditLogs.detail.targetLabel')}</strong>
              <span>
                {t('admin.auditLogs.detail.targetValue', {
                  type: targetTypeLabel(detailEntry.target_type),
                  id: detailEntry.target_id,
                })}
              </span>
            </Inline>
            <Inline gap="2">
              <strong>{t('admin.auditLogs.detail.timestampLabel')}</strong>
              <span>
                {dateFormatter.format(new Date(detailEntry.created_at))}
              </span>
            </Inline>
            {detailEntry.ip_address && (
              <Inline gap="2">
                <strong>{t('admin.auditLogs.detail.ipLabel')}</strong>
                <span>{detailEntry.ip_address}</span>
              </Inline>
            )}
            <Inline gap="2">
              <strong>{t('admin.auditLogs.detail.actionCodeLabel')}</strong>
              <code>{detailEntry.action}</code>
            </Inline>

            <div>
              <strong>{t('admin.auditLogs.detail.beforeLabel')}</strong>
              <pre>
                {detailBefore
                  ? JSON.stringify(detailBefore, null, 2)
                  : t('admin.auditLogs.detail.noSnapshot')}
              </pre>
            </div>
            <div>
              <strong>{t('admin.auditLogs.detail.afterLabel')}</strong>
              <pre>
                {detailAfter
                  ? JSON.stringify(detailAfter, null, 2)
                  : t('admin.auditLogs.detail.noSnapshot')}
              </pre>
            </div>
          </Stack>
        </Modal>
      )}
    </Section>
  );
}

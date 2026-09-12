/**
 * AdminPromotionsPageContent — `/:locale/admin/promotions` (Sprint E:
 * TOP/Featured Listings + Promotion Engine). Admin-only surface (route-
 * gated ADMIN/SUPER_ADMIN, see `routes/index.jsx`) to create, activate,
 * extend, and end/cancel a listing's Home/Category promotion, and see
 * its full history (spec §12/§27-28).
 *
 * Reached two ways: directly (`/admin/promotions`, unfiltered — every
 * promotion across every listing), or via `AdminListingDetailContent`'s
 * "Manage Promotion" link (`?listingId=`, pre-filtered AND pre-filling
 * the create form's listing field) — mirrors `AdminInventoryPageContent`'s
 * own `?listingId=` convention exactly.
 *
 * The create form always requires a real `ad_products` catalog row
 * (spec §10 — reuse existing seeded pricing, never a fabricated
 * checkout); a placement's "Custom Period" product is how Admin picks a
 * genuinely non-standard length, which is the only case an explicit end
 * date is asked for — every other product's end date is server-computed
 * from `start_date + duration_days` (`AdvertisementService#createPromotion`).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import {
  Select,
  Input,
  Checkbox,
  Textarea,
} from '@desavii/ui/components/form-controls';
import { Button, Card, Badge } from '@desavii/ui/components/primitives';
import { ErrorState, Modal } from '@desavii/ui/components/feedback-overlays';
import { DataTable } from '@desavii/ui/components/dashboard';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useCategoriesQuery } from '../../../search/index.js';
import {
  usePlacementCatalogQuery,
  useAdvertisementsQuery,
  useCreateAdvertisementMutation,
  useMarkAdvertisementPaidMutation,
  useApproveAdvertisementMutation,
  useRejectAdvertisementMutation,
  useCancelAdvertisementMutation,
  usePauseAdvertisementMutation,
  useResumeAdvertisementMutation,
  useExtendAdvertisementMutation,
  PLACEMENT_CODES,
} from '../../../advertising/index.js';

const STATUS_BADGE_VARIANT = {
  REQUEST_SUBMITTED: 'neutral',
  AWAITING_OFFLINE_PAYMENT: 'warning',
  PAID_MANUAL: 'info',
  APPROVED: 'info',
  SCHEDULED: 'info',
  ACTIVE: 'success',
  EXPIRED: 'neutral',
  REJECTED: 'danger',
  CANCELLED: 'danger',
  // Pass 7B — reversible admin toggle, visually distinct from both the
  // "live" ACTIVE and the terminal CANCELLED/REJECTED states.
  PAUSED: 'warning',
};
const OPEN_STATUSES = [
  'REQUEST_SUBMITTED',
  'AWAITING_OFFLINE_PAYMENT',
  'PAID_MANUAL',
  'APPROVED',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
];
const PAUSABLE_STATUSES = ['SCHEDULED', 'ACTIVE'];
// Pass 7B (brief §12/§13) — "Both" is a pure UI convenience: the domain
// stays two separate `advertisements` rows (one per placement), never a
// schema/enum change. Selecting it fires `createPromotion` twice — see
// `handleCreate` below.
const BOTH_PLACEMENTS_VALUE = 'BOTH';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_CREATE_FORM = {
  listingId: '',
  placementCode: PLACEMENT_CODES.HOME,
  categoryId: '',
  productId: '',
  // Pass 7B — only used when placementCode === BOTH_PLACEMENTS_VALUE (the
  // Category leg's own product, since Home/Category have separate
  // catalogs).
  categoryProductId: '',
  startDate: todayDateString(),
  endDate: '',
  displayPriority: '',
  markPaidNow: true,
  note: '',
};

export default function AdminPromotionsPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const listingIdFilter = searchParams.get('listingId')
    ? Number(searchParams.get('listingId'))
    : undefined;

  const [placementFilter, setPlacementFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    ...EMPTY_CREATE_FORM,
    listingId: listingIdFilter ? String(listingIdFilter) : '',
  });
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendDate, setExtendDate] = useState('');

  const catalogQuery = usePlacementCatalogQuery();
  const categoriesQuery = useCategoriesQuery({ locale });
  const listQuery = useAdvertisementsQuery({
    listingId: listingIdFilter,
    placementCode: placementFilter || undefined,
    statusCode: statusFilter || undefined,
  });
  const rows = listQuery.data?.pages.flatMap((page) => page.results) ?? [];

  const createMutation = useCreateAdvertisementMutation();
  const markPaidMutation = useMarkAdvertisementPaidMutation();
  const approveMutation = useApproveAdvertisementMutation();
  const rejectMutation = useRejectAdvertisementMutation();
  const cancelMutation = useCancelAdvertisementMutation();
  const pauseMutation = usePauseAdvertisementMutation();
  const resumeMutation = useResumeAdvertisementMutation();
  const extendMutation = useExtendAdvertisementMutation();

  const placements = catalogQuery.data ?? [];
  const isBothPlacements = createForm.placementCode === BOTH_PLACEMENTS_VALUE;
  const homePlacement = placements.find((p) => p.code === PLACEMENT_CODES.HOME);
  const categoryPlacement = placements.find(
    (p) => p.code === PLACEMENT_CODES.CATEGORY,
  );
  const selectedPlacement = isBothPlacements
    ? homePlacement
    : placements.find((p) => p.code === createForm.placementCode);
  const selectedProduct = selectedPlacement?.products.find(
    (p) => String(p.id) === String(createForm.productId),
  );
  const selectedCategoryProduct = categoryPlacement?.products.find(
    (p) => String(p.id) === String(createForm.categoryProductId),
  );
  const dateTimeFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  });

  function openCreate() {
    setCreateForm({
      ...EMPTY_CREATE_FORM,
      listingId: listingIdFilter ? String(listingIdFilter) : '',
    });
    setCreateOpen(true);
  }

  function buildPromotionPayload({ placementCode, productId, product }) {
    return {
      listingId: Number(createForm.listingId),
      placementCode,
      categoryId:
        placementCode === PLACEMENT_CODES.CATEGORY
          ? Number(createForm.categoryId)
          : undefined,
      productId: Number(productId),
      startDate: createForm.startDate,
      endDate: product?.duration_days == null ? createForm.endDate : undefined,
      displayPriority:
        createForm.displayPriority === ''
          ? undefined
          : Number(createForm.displayPriority),
      markPaidNow: createForm.markPaidNow,
      note: createForm.note || undefined,
    };
  }

  async function handleCreate() {
    try {
      if (isBothPlacements) {
        // Pass 7B (brief §12/§13) — "Both" stays a pure UI convenience:
        // two separate `advertisements` rows (the existing per-placement
        // domain shape), never a schema/enum change. Sequential, not
        // parallel, so a failure on the second call still leaves the
        // first's real row intact and visible in the table below rather
        // than an ambiguous partial state from two racing requests.
        await createMutation.mutateAsync(
          buildPromotionPayload({
            placementCode: PLACEMENT_CODES.HOME,
            productId: createForm.productId,
            product: selectedProduct,
          }),
        );
        await createMutation.mutateAsync(
          buildPromotionPayload({
            placementCode: PLACEMENT_CODES.CATEGORY,
            productId: createForm.categoryProductId,
            product: selectedCategoryProduct,
          }),
        );
      } else {
        await createMutation.mutateAsync(
          buildPromotionPayload({
            placementCode: createForm.placementCode,
            productId: createForm.productId,
            product: selectedProduct,
          }),
        );
      }
      showToast(t('admin.promotions.create.success'), { variant: 'success' });
      setCreateOpen(false);
    } catch (err) {
      showToast(
        err?.response?.data?.error?.message ??
          t('admin.promotions.create.error'),
        { variant: 'danger' },
      );
    }
  }

  async function handleMarkPaid(ad) {
    try {
      await markPaidMutation.mutateAsync({ id: ad.id });
      showToast(t('admin.promotions.actions.markPaidSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.promotions.actions.actionError'), {
        variant: 'danger',
      });
    }
  }

  async function handleApprove(ad) {
    try {
      await approveMutation.mutateAsync({ id: ad.id });
      showToast(t('admin.promotions.actions.approveSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.promotions.actions.actionError'), {
        variant: 'danger',
      });
    }
  }

  async function handleReject(ad) {
    const confirmed = await confirm({
      title: t('admin.promotions.actions.rejectConfirmTitle'),
      description: t('admin.promotions.actions.rejectConfirmDescription'),
      confirmLabel: t('admin.promotions.actions.rejectAction'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await rejectMutation.mutateAsync({ id: ad.id });
      showToast(t('admin.promotions.actions.rejectSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.promotions.actions.actionError'), {
        variant: 'danger',
      });
    }
  }

  async function handleCancel(ad) {
    const confirmed = await confirm({
      title: t('admin.promotions.actions.cancelConfirmTitle'),
      description: t('admin.promotions.actions.cancelConfirmDescription'),
      confirmLabel: t('admin.promotions.actions.cancelAction'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await cancelMutation.mutateAsync({ id: ad.id });
      showToast(t('admin.promotions.actions.cancelSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.promotions.actions.actionError'), {
        variant: 'danger',
      });
    }
  }

  async function handlePause(ad) {
    try {
      await pauseMutation.mutateAsync({ id: ad.id });
      showToast(t('admin.promotions.actions.pauseSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.promotions.actions.actionError'), {
        variant: 'danger',
      });
    }
  }

  async function handleResume(ad) {
    try {
      await resumeMutation.mutateAsync({ id: ad.id });
      showToast(t('admin.promotions.actions.resumeSuccess'), {
        variant: 'success',
      });
    } catch {
      showToast(t('admin.promotions.actions.actionError'), {
        variant: 'danger',
      });
    }
  }

  async function handleExtend() {
    try {
      await extendMutation.mutateAsync({
        id: extendTarget.id,
        endDate: extendDate,
      });
      showToast(t('admin.promotions.actions.extendSuccess'), {
        variant: 'success',
      });
      setExtendTarget(null);
    } catch {
      showToast(t('admin.promotions.actions.extendError'), {
        variant: 'danger',
      });
    }
  }

  const placementOptions = [
    { value: '', label: t('admin.promotions.filters.allPlacements') },
    {
      value: PLACEMENT_CODES.HOME,
      label: t('advertising.placements.HOMEPAGE_SECTION'),
    },
    {
      value: PLACEMENT_CODES.CATEGORY,
      label: t('advertising.placements.CATEGORY_TOP'),
    },
  ];
  const statusOptions = [
    { value: '', label: t('admin.promotions.filters.allStatuses') },
    ...[
      'REQUEST_SUBMITTED',
      'AWAITING_OFFLINE_PAYMENT',
      'PAID_MANUAL',
      'APPROVED',
      'SCHEDULED',
      'ACTIVE',
      'EXPIRED',
      'REJECTED',
      'CANCELLED',
      'PAUSED',
    ].map((code) => ({
      value: code,
      label: t(`advertising.statuses.${code}`),
    })),
  ];
  const createPlacementOptions = [
    {
      value: PLACEMENT_CODES.HOME,
      label: t('advertising.placements.HOMEPAGE_SECTION'),
    },
    {
      value: PLACEMENT_CODES.CATEGORY,
      label: t('advertising.placements.CATEGORY_TOP'),
    },
    {
      value: BOTH_PLACEMENTS_VALUE,
      label: t('admin.promotions.create.bothPlacementsLabel'),
    },
  ];
  function toProductOption(p) {
    return {
      value: String(p.id),
      label:
        p.duration_days != null
          ? t('admin.promotions.create.productDurationLabel', {
              days: p.duration_days,
              amount: p.price_amount,
              currency: p.currency_code,
            })
          : t('admin.promotions.create.productCustomLabel', {
              amount: p.price_amount,
              currency: p.currency_code,
            }),
    };
  }
  // "Both" fires two separate creates sharing one startDate/endDate — a
  // Custom Period product's endDate is a single form field, so "Both"
  // restricts product choice to fixed-duration products only, where each
  // leg's own endDate is server-computed independently. A genuinely
  // custom-length "Both" promotion still works as two separate single-
  // placement creates.
  const productOptions = (selectedPlacement?.products ?? [])
    .filter((p) => !isBothPlacements || p.duration_days != null)
    .map(toProductOption);
  const categoryProductOptions = (categoryPlacement?.products ?? [])
    .filter((p) => p.duration_days != null)
    .map(toProductOption);
  const categoryOptions = (categoriesQuery.data ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const columns = [
    {
      key: 'listing',
      header: t('admin.promotions.columns.listing'),
      render: (row) => (
        <RouterLink href={`/${locale}/admin/listings/${row.listing_id}`}>
          {`#${row.listing_id}`}
        </RouterLink>
      ),
    },
    {
      key: 'placement',
      header: t('admin.promotions.columns.placement'),
      render: (row) => t(`advertising.placements.${row.placement_code}`),
    },
    {
      key: 'status',
      header: t('admin.promotions.columns.status'),
      render: (row) => (
        <Badge
          variant={STATUS_BADGE_VARIANT[row.status_code] ?? 'neutral'}
          label={t(`advertising.statuses.${row.status_code}`)}
        />
      ),
    },
    {
      key: 'dates',
      header: t('admin.promotions.columns.dates'),
      render: (row) =>
        `${dateTimeFormatter.format(new Date(`${row.start_date}T00:00:00Z`))} – ${dateTimeFormatter.format(new Date(`${row.end_date}T00:00:00Z`))}`,
    },
    {
      key: 'priority',
      header: t('admin.promotions.columns.priority'),
      render: (row) => row.display_priority,
    },
    {
      key: 'payment',
      header: t('admin.promotions.columns.payment'),
      render: (row) =>
        row.payment_marked_paid_at ? (
          <Badge
            variant="success"
            label={t('admin.promotions.payment.confirmed')}
          />
        ) : (
          <Badge
            variant="warning"
            label={t('admin.promotions.payment.pending')}
          />
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Inline gap="2" wrap>
          {row.status_code === 'AWAITING_OFFLINE_PAYMENT' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleMarkPaid(row)}
              loading={
                markPaidMutation.isPending &&
                markPaidMutation.variables?.id === row.id
              }
            >
              {t('admin.promotions.actions.markPaidAction')}
            </Button>
          )}
          {row.status_code === 'PAID_MANUAL' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleApprove(row)}
              loading={
                approveMutation.isPending &&
                approveMutation.variables?.id === row.id
              }
            >
              {t('admin.promotions.actions.approveAction')}
            </Button>
          )}
          {row.status_code === 'REQUEST_SUBMITTED' && (
            <Button variant="ghost" size="sm" onClick={() => handleReject(row)}>
              {t('admin.promotions.actions.rejectAction')}
            </Button>
          )}
          {PAUSABLE_STATUSES.includes(row.status_code) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePause(row)}
              loading={
                pauseMutation.isPending &&
                pauseMutation.variables?.id === row.id
              }
            >
              {t('admin.promotions.actions.pauseAction')}
            </Button>
          )}
          {row.status_code === 'PAUSED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleResume(row)}
              loading={
                resumeMutation.isPending &&
                resumeMutation.variables?.id === row.id
              }
            >
              {t('admin.promotions.actions.resumeAction')}
            </Button>
          )}
          {OPEN_STATUSES.includes(row.status_code) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setExtendTarget(row);
                setExtendDate(row.end_date);
              }}
            >
              {t('admin.promotions.actions.extendAction')}
            </Button>
          )}
          {OPEN_STATUSES.includes(row.status_code) && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleCancel(row)}
            >
              {t('admin.promotions.actions.cancelAction')}
            </Button>
          )}
        </Inline>
      ),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.promotions.heading')}
        breadcrumbs={[
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.promotions.heading'),
            href: `/${locale}/admin/promotions`,
          },
        ]}
      />
      <p>{t('admin.promotions.description')}</p>

      <Stack gap="4">
        <Card as="div" padding="lg">
          <Inline gap="3" align="flex-end" wrap justify="space-between">
            <Inline gap="3" align="flex-end" wrap>
              <Input
                label={t('admin.promotions.filters.listingIdLabel')}
                type="number"
                value={listingIdFilter ?? ''}
                onChange={(event) => {
                  const { value } = event.target;
                  if (value) setSearchParams({ listingId: value });
                  else setSearchParams({});
                }}
                placeholder={t('admin.promotions.filters.listingIdPlaceholder')}
              />
              <Select
                label={t('admin.promotions.filters.placementLabel')}
                options={placementOptions}
                value={placementFilter}
                onChange={setPlacementFilter}
              />
              <Select
                label={t('admin.promotions.filters.statusLabel')}
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </Inline>
            <Button variant="primary" onClick={() => openCreate()}>
              {t('admin.promotions.create.openAction')}
            </Button>
          </Inline>
        </Card>

        {listQuery.isError ? (
          <ErrorState
            title={t('admin.promotions.errorTitle')}
            retryLabel={t('admin.promotions.errorRetry')}
            onRetry={listQuery.refetch}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            isLoading={listQuery.isPending}
            emptyTitle={t('admin.promotions.emptyTitle')}
            emptyDescription={t('admin.promotions.emptyDescription')}
            hasMore={listQuery.hasNextPage}
            isLoadingMore={listQuery.isFetchingNextPage}
            onLoadMore={() => listQuery.fetchNextPage()}
            loadMoreLabel={t('common.loadMore')}
          />
        )}
      </Stack>

      {createOpen && (
        <Modal
          isOpen
          onClose={() => setCreateOpen(false)}
          title={t('admin.promotions.create.title')}
          size="md"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleCreate()}
                loading={createMutation.isPending}
                disabled={
                  !createForm.listingId ||
                  !createForm.productId ||
                  ((createForm.placementCode === PLACEMENT_CODES.CATEGORY ||
                    isBothPlacements) &&
                    !createForm.categoryId) ||
                  (isBothPlacements && !createForm.categoryProductId)
                }
              >
                {t('admin.promotions.create.submitAction')}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <Input
              label={t('admin.promotions.create.listingIdLabel')}
              type="number"
              value={createForm.listingId}
              disabled={Boolean(listingIdFilter)}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  listingId: event.target.value,
                }))
              }
            />
            <Select
              label={t('admin.promotions.create.placementLabel')}
              options={createPlacementOptions}
              value={createForm.placementCode}
              onChange={(value) =>
                setCreateForm((prev) => ({
                  ...prev,
                  placementCode: value,
                  productId: '',
                  categoryProductId: '',
                  categoryId: '',
                }))
              }
            />
            {(createForm.placementCode === PLACEMENT_CODES.CATEGORY ||
              isBothPlacements) && (
              <Select
                label={t('admin.promotions.create.categoryLabel')}
                options={categoryOptions}
                value={createForm.categoryId}
                onChange={(value) =>
                  setCreateForm((prev) => ({ ...prev, categoryId: value }))
                }
              />
            )}
            <Select
              label={
                isBothPlacements
                  ? t('admin.promotions.create.homeProductLabel')
                  : t('admin.promotions.create.productLabel')
              }
              options={productOptions}
              value={createForm.productId}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, productId: value }))
              }
            />
            {isBothPlacements && (
              <Select
                label={t('admin.promotions.create.categoryProductLabel')}
                options={categoryProductOptions}
                value={createForm.categoryProductId}
                onChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    categoryProductId: value,
                  }))
                }
              />
            )}
            <Input
              label={t('admin.promotions.create.startDateLabel')}
              type="date"
              value={createForm.startDate}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  startDate: event.target.value,
                }))
              }
            />
            {!isBothPlacements &&
              selectedProduct?.duration_days == null &&
              createForm.productId && (
                <Input
                  label={t('admin.promotions.create.endDateLabel')}
                  type="date"
                  value={createForm.endDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                />
              )}
            <Input
              label={t('admin.promotions.create.priorityLabel')}
              type="number"
              min="0"
              max="1000"
              value={createForm.displayPriority}
              placeholder="0"
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  displayPriority: event.target.value,
                }))
              }
            />
            <Checkbox
              label={t('admin.promotions.create.markPaidNowLabel')}
              checked={createForm.markPaidNow}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  markPaidNow: event.target.checked,
                }))
              }
            />
            <Textarea
              label={t('admin.promotions.create.noteLabel')}
              value={createForm.note}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, note: event.target.value }))
              }
            />
          </Stack>
        </Modal>
      )}

      {extendTarget && (
        <Modal
          isOpen
          onClose={() => setExtendTarget(null)}
          title={t('admin.promotions.actions.extendTitle')}
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={() => setExtendTarget(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleExtend()}
                loading={extendMutation.isPending}
                disabled={!extendDate || extendDate <= extendTarget.end_date}
              >
                {t('admin.promotions.actions.extendAction')}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <p>
              {t('admin.promotions.actions.extendCurrentEnd', {
                date: dateTimeFormatter.format(
                  new Date(`${extendTarget.end_date}T00:00:00Z`),
                ),
              })}
            </p>
            <Input
              label={t('admin.promotions.actions.extendNewEndDateLabel')}
              type="date"
              value={extendDate}
              onChange={(event) => setExtendDate(event.target.value)}
            />
          </Stack>
        </Modal>
      )}
    </Section>
  );
}

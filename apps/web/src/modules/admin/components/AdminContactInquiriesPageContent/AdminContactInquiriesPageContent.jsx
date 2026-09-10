/**
 * AdminContactInquiriesPageContent — `/:locale/admin/contact-inquiries`
 * (Sprint G). Admin-only inbox for public Contact form submissions
 * (`GET /contact/admin`, `contact.manage`). A status filter (All/New/
 * Resolved) plus a row-click-to-detail Modal — same "no separate detail
 * route for a low-volume inbox" shape as `AdminManagersPageContent`'s
 * own list+detail split would be overkill for, given every field here
 * is already small enough to show in a Modal (spec §14/§37 "smallest
 * coherent flow").
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Button, Badge } from '@desavii/ui/components/primitives';
import { Select } from '@desavii/ui/components/form-controls';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Modal, ErrorState } from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import {
  useAdminContactInquiriesQuery,
  useAdminContactInquiryDetailQuery,
  useResolveContactInquiryMutation,
} from '../../../contact/index.js';
import styles from './AdminContactInquiriesPageContent.module.scss';

const STATUS_FILTERS = ['', 'NEW', 'RESOLVED'];

export default function AdminContactInquiriesPageContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const {
    data: inquiries,
    isPending,
    isError,
    refetch,
  } = useAdminContactInquiriesQuery({
    status: statusFilter || undefined,
  });
  const { data: detail } = useAdminContactInquiryDetailQuery(selectedId);
  const resolveMutation = useResolveContactInquiryMutation();

  const statusOptions = STATUS_FILTERS.map((code) => ({
    value: code,
    label: code
      ? t(`contact.statuses.${code}`)
      : t('admin.contactInquiries.filters.statusAll'),
  }));

  async function handleResolve(id) {
    try {
      await resolveMutation.mutateAsync(id);
      showToast(t('admin.contactInquiries.resolveSuccess'), {
        variant: 'success',
      });
    } catch (error) {
      showToast(error.message || t('admin.contactInquiries.resolveError'), {
        variant: 'danger',
      });
    }
  }

  const columns = [
    {
      key: 'subject',
      header: t('admin.contactInquiries.columns.subject'),
      render: (row) => row.subject,
    },
    {
      key: 'type',
      header: t('admin.contactInquiries.columns.type'),
      render: (row) => t(`contact.inquiryTypes.${row.type}`),
    },
    {
      key: 'email',
      header: t('admin.contactInquiries.columns.email'),
      render: (row) => row.email,
    },
    {
      key: 'status',
      header: t('admin.contactInquiries.columns.status'),
      render: (row) => (
        <Badge
          variant={row.status === 'NEW' ? 'warning' : 'success'}
          size="sm"
          label={t(`contact.statuses.${row.status}`)}
        />
      ),
    },
    {
      key: 'createdAt',
      header: t('admin.contactInquiries.columns.date'),
      render: (row) => new Date(row.created_at).toLocaleString(locale),
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.contactInquiries.heading')}
        description={t('admin.contactInquiries.description')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.contactInquiries.heading'),
            href: `/${locale}/admin/contact-inquiries`,
          },
        ]}
      />

      <Stack gap="6">
        <Inline gap="3" align="flex-end">
          <Select
            label={t('admin.contactInquiries.filters.statusLabel')}
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </Inline>

        {isError ? (
          <ErrorState
            title={t('admin.contactInquiries.error.title')}
            retryLabel={t('admin.contactInquiries.error.retry')}
            onRetry={refetch}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={inquiries ?? []}
            isLoading={isPending}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyTitle={t('admin.contactInquiries.empty.title')}
            emptyDescription={t('admin.contactInquiries.empty.description')}
          />
        )}
      </Stack>

      <Modal
        isOpen={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={detail?.subject ?? ''}
      >
        {detail ? (
          <Stack gap="4" className={styles.detail}>
            <dl className={styles.fields}>
              <dt>{t('admin.contactInquiries.columns.name')}</dt>
              <dd>{detail.name}</dd>
              <dt>{t('admin.contactInquiries.columns.email')}</dt>
              <dd>{detail.email}</dd>
              <dt>{t('admin.contactInquiries.columns.type')}</dt>
              <dd>{t(`contact.inquiryTypes.${detail.type}`)}</dd>
              <dt>{t('admin.contactInquiries.columns.status')}</dt>
              <dd>{t(`contact.statuses.${detail.status}`)}</dd>
              <dt>{t('admin.contactInquiries.detail.receivedLabel')}</dt>
              <dd>{new Date(detail.created_at).toLocaleString(locale)}</dd>
            </dl>
            <div>
              <p className={styles.messageLabel}>
                {t('admin.contactInquiries.detail.messageLabel')}
              </p>
              <p className={styles.message}>{detail.message}</p>
            </div>
            {detail.status === 'NEW' && (
              <Inline justify="flex-end">
                <Button
                  variant="primary"
                  onClick={() => handleResolve(detail.id)}
                  loading={resolveMutation.isPending}
                >
                  {t('admin.contactInquiries.resolveAction')}
                </Button>
              </Inline>
            )}
          </Stack>
        ) : (
          <span aria-hidden="true" />
        )}
      </Modal>
    </Section>
  );
}

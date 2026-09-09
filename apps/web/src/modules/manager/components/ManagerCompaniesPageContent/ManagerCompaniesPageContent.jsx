/**
 * ManagerCompaniesPageContent — `/:locale/manager/companies` (Manager
 * Workspace). Read-only roster of the caller's own assigned companies
 * (`ManagerContext.companies`, already fetched by `ManagerProvider` — no
 * second fetch here, per FRONTEND_ARCHITECTURE.md §12's "guards/providers
 * own the fetch, pages read from context" convention). Each card sets
 * that company as the active one (`ManagerContext.setActiveCompanyId`)
 * and jumps to Listings, already filtered to it — spec §12's "open an
 * assigned company and work on its product information."
 */

import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { Card, Badge, Button } from '@desavii/ui/components/primitives';
import { EmptyState } from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useManagerContext } from '../../../../contexts/ManagerContext.jsx';

const VERIFICATION_BADGE_VARIANT = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  NEEDS_CHANGES: 'warning',
};

export default function ManagerCompaniesPageContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();
  const { companies, setActiveCompanyId } = useManagerContext();

  function openCompany(partnerId) {
    setActiveCompanyId(partnerId);
    navigate(`/${locale}/manager/listings`);
  }

  return (
    <Section spacing="default">
      <PageHeader
        title={t('manager.companies.heading')}
        description={t('manager.companies.description')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('manager.nav.dashboard'), href: `/${locale}/manager` },
          {
            label: t('manager.companies.heading'),
            href: `/${locale}/manager/companies`,
          },
        ]}
      />

      {companies.length === 0 ? (
        <EmptyState
          title={t('manager.companies.empty.title')}
          description={t('manager.companies.empty.description')}
        />
      ) : (
        <Grid columns={3} gap="4">
          {companies.map((company) => (
            <Card key={company.partner_id} as="div" padding="lg">
              <Stack gap="3">
                <Inline justify="space-between" align="center" wrap>
                  <strong>{company.display_name}</strong>
                  <Badge
                    variant={
                      VERIFICATION_BADGE_VARIANT[company.verification_status] ??
                      'neutral'
                    }
                    size="sm"
                    label={t(
                      `admin.partners.verificationStatus.${company.verification_status}`,
                      { defaultValue: company.verification_status },
                    )}
                  />
                </Inline>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openCompany(company.partner_id)}
                >
                  {t('manager.companies.openAction')}
                </Button>
              </Stack>
            </Card>
          ))}
        </Grid>
      )}
    </Section>
  );
}

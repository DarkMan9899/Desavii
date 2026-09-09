/**
 * ManagerCompanySwitcher — Sprint F. Renders nothing at all when the
 * Manager is assigned to zero or one company (nothing to switch between)
 * — only shown when a real choice exists, same "don't render UI for a
 * choice of one" restraint `PartnerWorkspaceIdentity` doesn't need to make
 * (a Partner org has its own always-shown identity strip; a Manager's
 * "current company" is purely a filter, not an identity).
 */

import { useTranslation } from 'react-i18next';
import { Select } from '@desavii/ui/components/form-controls';
import { useManagerContext } from '../../../../contexts/ManagerContext.jsx';

export default function ManagerCompanySwitcher() {
  const { t } = useTranslation();
  const { companies, activeCompanyId, setActiveCompanyId } =
    useManagerContext();

  if (companies.length <= 1) return null;

  const options = companies.map((company) => ({
    value: String(company.partner_id),
    label: company.display_name,
  }));

  return (
    <Select
      ariaLabel={t('manager.companySwitcher.label')}
      options={options}
      value={String(activeCompanyId ?? '')}
      onChange={(value) => setActiveCompanyId(Number(value))}
    />
  );
}

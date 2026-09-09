/**
 * ManagerProvider — Sprint F (Manager Workspace). Unlike `PartnerProvider`
 * (which reads `partnerships` synchronously off `AuthContext`, already
 * populated at login), a Manager's assigned companies live behind their
 * own endpoint (`GET /managers/mine/companies`) — there is no reason to
 * fetch that for every signed-in user the way `partnerships` is, so this
 * Provider owns its own `useMyManagedCompaniesQuery()` fetch instead of
 * extending `AuthContext`. Mounted inside `RequireManager` in
 * `routes/index.jsx`, same placement rule `PartnerProvider` documents:
 * nothing meaningful to hold before the Manager role is already
 * guaranteed.
 */

import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import ManagerContext from '../contexts/ManagerContext.jsx';
import { useMyManagedCompaniesQuery } from '../modules/managers/index.js';

export default function ManagerProvider({ children }) {
  const {
    data: companies,
    isPending,
    isError,
    refetch,
  } = useMyManagedCompaniesQuery();
  const [activeCompanyId, setActiveCompanyId] = useState(null);

  useEffect(() => {
    if (companies && companies.length > 0 && activeCompanyId === null) {
      setActiveCompanyId(companies[0].partner_id);
    }
  }, [companies, activeCompanyId]);

  const activeCompany =
    companies?.find((company) => company.partner_id === activeCompanyId) ??
    companies?.[0] ??
    null;

  const value = useMemo(
    () => ({
      companies: companies ?? [],
      isPending,
      isError,
      refetch,
      activeCompanyId: activeCompany?.partner_id ?? null,
      activeCompany,
      setActiveCompanyId,
    }),
    [companies, isPending, isError, refetch, activeCompany],
  );

  return (
    <ManagerContext.Provider value={value}>{children}</ManagerContext.Provider>
  );
}

ManagerProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

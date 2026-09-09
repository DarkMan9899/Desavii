/**
 * Sprint F: reuses `PartnerListingWizard` unmodified — it already takes a
 * plain `partnerships` array (`{partner_id, display_name}[]`), and
 * `ManagerContext.companies` (`GET /managers/mine/companies`) is already
 * in that exact shape (`toAssignmentResponse`), so no adapter is needed.
 */
import { PartnerListingWizard } from '../../modules/listings/index.js';
import { useManagerContext } from '../../contexts/ManagerContext.jsx';

export default function ManagerListingWizardPage() {
  const { companies } = useManagerContext();
  return <PartnerListingWizard partnerships={companies} />;
}

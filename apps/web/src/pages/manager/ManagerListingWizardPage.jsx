/**
 * Sprint F: reuses `PartnerListingWizard` — it already takes a
 * plain `partnerships` array (`{partner_id, display_name}[]`), and
 * `ManagerContext.companies` (`GET /managers/mine/companies`) is already
 * in that exact shape (`toAssignmentResponse`), so no adapter is needed.
 */
import { useParams } from 'react-router-dom';
import { PartnerListingWizard } from '../../modules/listings/index.js';
import { useManagerContext } from '../../contexts/ManagerContext.jsx';

export default function ManagerListingWizardPage() {
  const { locale } = useParams();
  const { companies } = useManagerContext();
  // After publishing, a manager returns to their own listings, never the
  // partner workspace they have no access to.
  return (
    <PartnerListingWizard
      partnerships={companies}
      exitPath={`/${locale}/manager/listings`}
    />
  );
}

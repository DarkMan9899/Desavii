import { useParams } from 'react-router-dom';
import { PartnerListingOpeningHoursPageContent } from '../../modules/listings/index.js';

export default function PartnerListingOpeningHoursPage() {
  const { id } = useParams();
  return <PartnerListingOpeningHoursPageContent listingId={Number(id)} />;
}

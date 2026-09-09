import { useParams } from 'react-router-dom';
import { PartnerListingRoomsPageContent } from '../../modules/listings/index.js';

export default function ManagerListingRoomsPage() {
  const { id } = useParams();
  return <PartnerListingRoomsPageContent listingId={Number(id)} />;
}

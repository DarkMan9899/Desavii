import { useParams } from 'react-router-dom';
import { PartnerListingMenuPageContent } from '../../modules/listings/index.js';

export default function PartnerListingMenuPage() {
  const { id } = useParams();
  return <PartnerListingMenuPageContent listingId={Number(id)} />;
}

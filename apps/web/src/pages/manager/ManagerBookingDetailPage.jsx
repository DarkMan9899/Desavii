/**
 * Sprint F: reuses `PartnerBookingDetailContent` with `basePath="manager"`
 * (redirects its internal breadcrumb/back-link hrefs) and `readOnly`
 * (hides Confirm/Reject/Cancel/Complete/No-show — Manager gets booking
 * VISIBILITY only, spec §17; those mutations stay owner/admin-only
 * server-side regardless, this just avoids offering a button that would
 * always 403).
 */
import { PartnerBookingDetailContent } from '../../modules/partner/index.js';

export default function ManagerBookingDetailPage() {
  return <PartnerBookingDetailContent basePath="manager" readOnly />;
}

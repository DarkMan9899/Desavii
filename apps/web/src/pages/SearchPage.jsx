import { Container } from '@desavii/ui/components/layout';
import { SearchPageContent } from '../modules/search/index.js';

// `content` (1200px), the listings/forms width — `wide` (1440px) is for
// dashboards, and on a 1440px screen it left Search no side margins.
export default function SearchPage() {
  return (
    <Container size="content">
      <SearchPageContent />
    </Container>
  );
}

/**
 * AI module barrel (Stage 15.1) — the only cross-module import surface,
 * mirroring every other module's `index.js` shape.
 */

export { default as TripPlannerPageContent } from './components/TripPlannerPageContent/TripPlannerPageContent.jsx';
export { default as AiSearchBar } from './components/AiSearchBar/AiSearchBar.jsx';
export { default as AiAssistantTrigger } from './components/AiAssistantTrigger/AiAssistantTrigger.jsx';
export { default as AskAiButton } from './components/AskAiButton/AskAiButton.jsx';
export { default as AiUsageDashboardContent } from './components/AiUsageDashboardContent/AiUsageDashboardContent.jsx';
export { default as PartnerAiUsagePageContent } from './components/PartnerAiUsagePageContent/PartnerAiUsagePageContent.jsx';
export { default as RecommendationsSection } from './components/RecommendationsSection/RecommendationsSection.jsx';
export { default as PartnerAiToolsPanel } from './components/PartnerAiToolsPanel/PartnerAiToolsPanel.jsx';

// Home AI discovery: Home's Ask Desavii uses the same availability check,
// parse call and parse -> filters mapping as the Search page's AI search.
export { default as useAiSearchAvailabilityQuery } from './queries/useAiSearchAvailabilityQuery.js';
export { default as useParseSearchQueryMutation } from './mutations/useParseSearchQueryMutation.js';
export { default as parsedSearchToFilters } from './utils/parsedSearchToFilters.js';

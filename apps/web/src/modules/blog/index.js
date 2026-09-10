/**
 * `blog` module public export surface (FRONTEND_ARCHITECTURE.md §6.2) —
 * the ONLY entry point other modules/pages may import from.
 */

export { default as blogKeys } from './constants/queryKeys.js';

export { default as BlogPageContent } from './components/BlogPageContent/BlogPageContent.jsx';
export { default as BlogPostPageContent } from './components/BlogPostPageContent/BlogPostPageContent.jsx';
export { default as BlogPostsPageContent } from './components/BlogPostsPageContent/BlogPostsPageContent.jsx';
export { default as BlogPostEditorContent } from './components/BlogPostEditorContent/BlogPostEditorContent.jsx';
export { default as MarketingDashboardPageContent } from './components/MarketingDashboardPageContent/MarketingDashboardPageContent.jsx';
export { default as AdminBlogPageContent } from './components/AdminBlogPageContent/AdminBlogPageContent.jsx';
export { default as BlogPostPreviewContent } from './components/BlogPostPreviewContent/BlogPostPreviewContent.jsx';

export { default as usePublicPostsQuery } from './queries/usePublicPostsQuery.js';
export { default as usePublicPostQuery } from './queries/usePublicPostQuery.js';
export {
  usePublicCategoriesQuery,
  usePublicTagsQuery,
} from './queries/usePublicTaxonomyQuery.js';
export { default as useAdminPostsQuery } from './queries/useAdminPostsQuery.js';
export { default as useAdminPostDetailQuery } from './queries/useAdminPostDetailQuery.js';

export { default as useCreateDraftMutation } from './mutations/useCreateDraftMutation.js';
export { default as useUpdatePostSettingsMutation } from './mutations/useUpdatePostSettingsMutation.js';
export { default as useUpsertPostTranslationMutation } from './mutations/useUpsertPostTranslationMutation.js';
export { default as useAttachCoverImageMutation } from './mutations/useAttachCoverImageMutation.js';
export { default as useRemoveCoverImageMutation } from './mutations/useRemoveCoverImageMutation.js';
export { default as usePublishPostMutation } from './mutations/usePublishPostMutation.js';
export { default as useUnpublishPostMutation } from './mutations/useUnpublishPostMutation.js';
export { default as useSchedulePostMutation } from './mutations/useSchedulePostMutation.js';
export { default as useUnschedulePostMutation } from './mutations/useUnschedulePostMutation.js';
export { default as usePromoteToMarketingMutation } from './mutations/usePromoteToMarketingMutation.js';
export { default as useDemoteFromMarketingMutation } from './mutations/useDemoteFromMarketingMutation.js';

import { useTranslation } from 'react-i18next';
import { BlogPostsPageContent } from '../../modules/blog/index.js';

export default function MarketingPostsPage() {
  const { t } = useTranslation();
  return (
    <BlogPostsPageContent
      basePath="/marketing/posts"
      heading={t('marketing.posts.heading')}
      description={t('marketing.posts.description')}
    />
  );
}

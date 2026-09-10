/**
 * AdminBlogPageContent — `/:locale/admin/blog` (Sprint H). Composes the
 * shared `BlogPostsPageContent` (same list Marketing sees at
 * `/marketing/posts`, spec §38: "do not duplicate identical CMS screens")
 * with an Admin-only "assign the Marketing role" card, mirroring
 * `AdminManagersPageContent`'s own plain-user-id promote pattern (spec
 * §17: "do not build a duplicate user directory" — Admin looks the user
 * up via `/admin/users` first, then pastes the id here). Grant AND revoke
 * both exist here, unlike Managers' promote-only card, because
 * `revokeRole` (added this sprint, see `mysqlUserRepository.js`) is the
 * first real role-revocation path in the codebase and Marketing access
 * specifically needs to be removable (spec §16 boundary).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Card, Button } from '@desavii/ui/components/primitives';
import { Input } from '@desavii/ui/components/form-controls';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import BlogPostsPageContent from '../BlogPostsPageContent/BlogPostsPageContent.jsx';
import { usePromoteToMarketingMutation } from '../../mutations/usePromoteToMarketingMutation.js';
import { useDemoteFromMarketingMutation } from '../../mutations/useDemoteFromMarketingMutation.js';

export default function AdminBlogPageContent() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [userIdInput, setUserIdInput] = useState('');
  const promoteMutation = usePromoteToMarketingMutation();
  const demoteMutation = useDemoteFromMarketingMutation();

  async function handleGrant() {
    const userId = Number(userIdInput);
    if (!userId || userId <= 0) return;
    try {
      await promoteMutation.mutateAsync(userId);
      setUserIdInput('');
      showToast(t('admin.blog.grantSuccess'), { variant: 'success' });
    } catch (error) {
      showToast(error.message || t('admin.blog.roleError'), {
        variant: 'danger',
      });
    }
  }

  async function handleRevoke() {
    const userId = Number(userIdInput);
    if (!userId || userId <= 0) return;
    try {
      await demoteMutation.mutateAsync(userId);
      setUserIdInput('');
      showToast(t('admin.blog.revokeSuccess'), { variant: 'success' });
    } catch (error) {
      showToast(error.message || t('admin.blog.roleError'), {
        variant: 'danger',
      });
    }
  }

  return (
    <Stack gap="8">
      <BlogPostsPageContent
        basePath="/admin/blog"
        heading={t('admin.blog.heading')}
        description={t('admin.blog.description')}
      />

      <Section>
        <Card as="div" padding="lg">
          <Stack gap="3">
            <strong>{t('admin.blog.marketingRoleHeading')}</strong>
            <p>{t('admin.blog.marketingRoleDescription')}</p>
            <Inline gap="3" wrap align="flex-end">
              <Input
                type="number"
                label={t('admin.blog.grantUserIdLabel')}
                placeholder={t('admin.blog.grantUserIdPlaceholder')}
                value={userIdInput}
                onChange={(event) => setUserIdInput(event.target.value)}
              />
              <Button
                variant="primary"
                onClick={() => handleGrant()}
                loading={promoteMutation.isPending}
                disabled={!userIdInput}
              >
                {t('admin.blog.grantAction')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleRevoke()}
                loading={demoteMutation.isPending}
                disabled={!userIdInput}
              >
                {t('admin.blog.revokeAction')}
              </Button>
            </Inline>
          </Stack>
        </Card>
      </Section>
    </Stack>
  );
}

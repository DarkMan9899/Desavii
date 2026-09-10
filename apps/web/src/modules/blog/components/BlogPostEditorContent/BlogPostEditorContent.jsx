/**
 * BlogPostEditorContent — shared create/edit page for `/admin/blog/:id`
 * AND `/marketing/posts/:id` (Sprint H), same `basePath`-prop reuse
 * convention `BlogPostsPageContent` follows. Two independent save
 * surfaces, mirroring `AdminCmsDetailContent.jsx`'s own split exactly:
 * a settings card (slug/category/tags/cover) and a `Tabs`-per-locale
 * content editor (title/excerpt/body/SEO), each locale saved via its
 * own `PUT .../translations/:languageCode` call so switching tabs never
 * discards an unsaved edit in another locale. `body` is authored as
 * plain Markdown text (spec §11's "smallest safe format" — no rich-text
 * editor framework) — Preview renders it through the same
 * `MarkdownContent` safe-render pipeline the public article page uses.
 */

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Input, Select, Textarea } from '@desavii/ui/components/form-controls';
import { Button, Card, Badge } from '@desavii/ui/components/primitives';
import { Tabs } from '@desavii/ui/components/navigation';
import {
  Spinner,
  ErrorState,
  Alert,
  Modal,
} from '@desavii/ui/components/feedback-overlays';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import MarkdownContent from '../../../../components/MarkdownContent/MarkdownContent.jsx';
import CoverImageUploader from '../../../../components/CoverImageUploader/CoverImageUploader.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { SUPPORTED_LOCALES } from '../../../../translations/i18n.js';
import { listPublicCategories, listPublicTags } from '../../../../api/blog.js';
import { useAdminPostDetailQuery } from '../../queries/useAdminPostDetailQuery.js';
import { useUpdatePostSettingsMutation } from '../../mutations/useUpdatePostSettingsMutation.js';
import { useUpsertPostTranslationMutation } from '../../mutations/useUpsertPostTranslationMutation.js';
import { useAttachCoverImageMutation } from '../../mutations/useAttachCoverImageMutation.js';
import { useRemoveCoverImageMutation } from '../../mutations/useRemoveCoverImageMutation.js';
import { usePublishPostMutation } from '../../mutations/usePublishPostMutation.js';
import { useUnpublishPostMutation } from '../../mutations/useUnpublishPostMutation.js';
import { useSchedulePostMutation } from '../../mutations/useSchedulePostMutation.js';
import { useUnschedulePostMutation } from '../../mutations/useUnschedulePostMutation.js';
import styles from './BlogPostEditorContent.module.scss';

function useCategoryOptions(locale) {
  const { data } = useQuery({
    queryKey: ['blog', 'public', 'categories', locale],
    queryFn: () => listPublicCategories(locale).then((res) => res.data),
    retry: false,
  });
  return data ?? [];
}

function useTagOptions(locale) {
  const { data } = useQuery({
    queryKey: ['blog', 'public', 'tags', locale],
    queryFn: () => listPublicTags(locale).then((res) => res.data),
    retry: false,
  });
  return data ?? [];
}

// Free-text, multi-value tag entry (type + Enter to add, × to remove).
// `ChipGroup` in @desavii/ui is a single-select toggle group (star
// rating, difficulty filters) — the wrong shape for authoring an
// open-ended tag list, so this stays a small local component rather
// than force-fitting that one (spec §13: "lightweight — no complex
// taxonomy engine").
function TagsEditor({
  label,
  placeholder = undefined,
  values,
  suggestions = [],
  onChange,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');

  const handleAdd = useCallback(() => {
    const next = inputValue.trim();
    setInputValue('');
    if (!next || values.includes(next)) return;
    onChange([...values, next]);
  }, [inputValue, values, onChange]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      handleAdd();
    },
    [handleAdd],
  );

  const availableSuggestions = suggestions.filter(
    (name) => !values.includes(name),
  );

  return (
    <div className={styles.tagsEditor}>
      <Input
        label={label}
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      {values.length > 0 && (
        <div className={styles.tagsList}>
          {values.map((tag) => (
            <span key={tag} className={styles.tagChip}>
              {tag}
              <button
                type="button"
                className={styles.tagRemove}
                onClick={() =>
                  onChange(values.filter((value) => value !== tag))
                }
                aria-label={t('marketing.editor.tagRemoveAction', { tag })}
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {availableSuggestions.length > 0 && (
        <div className={styles.tagSuggestions}>
          {availableSuggestions.map((name) => (
            <button
              key={name}
              type="button"
              className={styles.tagSuggestion}
              onClick={() => onChange([...values, name])}
              aria-label={t('marketing.editor.tagAddAction', { tag: name })}
              disabled={disabled}
            >
              + {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

TagsEditor.propTypes = {
  label: PropTypes.string.isRequired,
  placeholder: PropTypes.string,
  values: PropTypes.arrayOf(PropTypes.string).isRequired,
  suggestions: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

function TranslationEditor({
  postId,
  languageCode,
  translation = undefined,
  canWrite,
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const upsertMutation = useUpsertPostTranslationMutation(postId);
  const [title, setTitle] = useState(translation?.title ?? '');
  const [excerpt, setExcerpt] = useState(translation?.excerpt ?? '');
  const [body, setBody] = useState(translation?.body ?? '');
  const [seoTitle, setSeoTitle] = useState(translation?.seo_title ?? '');
  const [seoDescription, setSeoDescription] = useState(
    translation?.seo_description ?? '',
  );
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    setTitle(translation?.title ?? '');
    setExcerpt(translation?.excerpt ?? '');
    setBody(translation?.body ?? '');
    setSeoTitle(translation?.seo_title ?? '');
    setSeoDescription(translation?.seo_description ?? '');
  }, [translation]);

  const handleSave = useCallback(async () => {
    try {
      await upsertMutation.mutateAsync({
        languageCode,
        title,
        excerpt,
        body,
        seoTitle,
        seoDescription,
      });
      showToast(t('marketing.editor.saveSuccess'), { variant: 'success' });
    } catch {
      showToast(t('marketing.editor.saveError'), { variant: 'danger' });
    }
  }, [
    upsertMutation,
    languageCode,
    title,
    excerpt,
    body,
    seoTitle,
    seoDescription,
    showToast,
    t,
  ]);

  return (
    <Stack gap="4">
      {!translation && (
        <Alert variant="info">
          {t('marketing.editor.localeTabMissingLabel', {
            code: languageCode.toUpperCase(),
          })}
        </Alert>
      )}
      <Input
        label={t('marketing.editor.titleLabel')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
        disabled={!canWrite}
      />
      <Textarea
        label={t('marketing.editor.excerptLabel')}
        helperText={t('marketing.editor.excerptHint')}
        value={excerpt}
        onChange={(event) => setExcerpt(event.target.value)}
        rows={2}
        disabled={!canWrite}
      />

      <Inline justify="space-between" align="center">
        <span className={styles.bodyLabel}>
          {t('marketing.editor.bodyLabel')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsPreview((current) => !current)}
        >
          {t('marketing.editor.previewAction')}
        </Button>
      </Inline>
      {isPreview ? (
        <div className={styles.previewBox}>
          <MarkdownContent>{body || ' '}</MarkdownContent>
        </div>
      ) : (
        <Textarea
          label=""
          helperText={t('marketing.editor.bodyHint')}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={16}
          disabled={!canWrite}
        />
      )}

      <Card as="div" padding="md">
        <Stack gap="3">
          <strong>{t('marketing.editor.seoHeading')}</strong>
          <p className={styles.seoHint}>{t('marketing.editor.seoHint')}</p>
          <Input
            label={t('marketing.editor.seoTitleLabel')}
            value={seoTitle}
            onChange={(event) => setSeoTitle(event.target.value)}
            disabled={!canWrite}
          />
          <Textarea
            label={t('marketing.editor.seoDescriptionLabel')}
            value={seoDescription}
            onChange={(event) => setSeoDescription(event.target.value)}
            rows={2}
            disabled={!canWrite}
          />
        </Stack>
      </Card>

      {canWrite && (
        <Inline justify="flex-end">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={upsertMutation.isPending}
          >
            {t('marketing.editor.saveAction')}
          </Button>
        </Inline>
      )}
    </Stack>
  );
}

TranslationEditor.propTypes = {
  postId: PropTypes.number.isRequired,
  languageCode: PropTypes.string.isRequired,
  translation: PropTypes.shape({
    title: PropTypes.string,
    excerpt: PropTypes.string,
    body: PropTypes.string,
    seo_title: PropTypes.string,
    seo_description: PropTypes.string,
  }),
  canWrite: PropTypes.bool.isRequired,
};

export default function BlogPostEditorContent({ basePath }) {
  const { t, i18n } = useTranslation();
  const { locale, id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { permissions } = useAuth();
  const canPublish = permissions.includes('blog.publish');
  const postId = Number(id);

  const {
    data: post,
    isPending,
    isError,
    error,
    refetch,
  } = useAdminPostDetailQuery(postId);

  const updateSettingsMutation = useUpdatePostSettingsMutation(postId);
  const attachCoverMutation = useAttachCoverImageMutation(postId);
  const removeCoverMutation = useRemoveCoverImageMutation(postId);
  const publishMutation = usePublishPostMutation(postId);
  const unpublishMutation = useUnpublishPostMutation(postId);
  const scheduleMutation = useSchedulePostMutation(postId);
  const unscheduleMutation = useUnschedulePostMutation(postId);

  const categories = useCategoryOptions(i18n.language);
  const tags = useTagOptions(i18n.language);

  const [slug, setSlug] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [tagNames, setTagNames] = useState([]);
  const [activeLocale, setActiveLocale] = useState(SUPPORTED_LOCALES[0]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  // See BlogPostsPageContent's identical note: Modal's focus trap re-runs
  // its focus-restore effect whenever `onClose`'s identity changes, so an
  // inline arrow here would steal focus back to the dialog on every
  // keystroke in the schedule-date field.
  const closeScheduleModal = useCallback(() => setIsScheduleOpen(false), []);
  const openScheduleModal = useCallback(() => setIsScheduleOpen(true), []);

  useEffect(() => {
    if (post) {
      setSlug(post.slug);
      setCategorySlug(post.category_slug ?? '');
      setTagNames(post.tags.map((tag) => tag.name));
    }
  }, [post]);

  const handleSaveSettings = useCallback(async () => {
    try {
      await updateSettingsMutation.mutateAsync({
        slug,
        categorySlug: categorySlug || null,
        tagNames,
      });
      showToast(t('marketing.editor.saveSuccess'), { variant: 'success' });
    } catch (err) {
      showToast(err.message || t('marketing.editor.saveError'), {
        variant: 'danger',
      });
    }
  }, [updateSettingsMutation, slug, categorySlug, tagNames, showToast, t]);

  const handleCoverUpload = useCallback(
    async (file) => {
      try {
        await attachCoverMutation.mutateAsync({ file, altText: post?.slug });
      } catch (err) {
        showToast(err.message || t('marketing.editor.saveError'), {
          variant: 'danger',
        });
      }
    },
    [attachCoverMutation, post?.slug, showToast, t],
  );

  const handleCoverRemove = useCallback(async () => {
    try {
      await removeCoverMutation.mutateAsync();
    } catch (err) {
      showToast(err.message || t('marketing.editor.saveError'), {
        variant: 'danger',
      });
    }
  }, [removeCoverMutation, showToast, t]);

  const handlePublish = useCallback(async () => {
    try {
      await publishMutation.mutateAsync();
      showToast(t('marketing.editor.publishSuccess'), { variant: 'success' });
    } catch (err) {
      showToast(err.message || t('marketing.editor.publishError'), {
        variant: 'danger',
      });
    }
  }, [publishMutation, showToast, t]);

  const handleUnpublish = useCallback(async () => {
    try {
      await unpublishMutation.mutateAsync();
      showToast(t('marketing.editor.unpublishSuccess'), {
        variant: 'success',
      });
    } catch (err) {
      showToast(err.message || t('marketing.editor.unpublishError'), {
        variant: 'danger',
      });
    }
  }, [unpublishMutation, showToast, t]);

  const handleSchedule = useCallback(async () => {
    if (!scheduleDate) return;
    try {
      await scheduleMutation.mutateAsync(new Date(scheduleDate).toISOString());
      showToast(t('marketing.editor.scheduleSuccess'), { variant: 'success' });
      setIsScheduleOpen(false);
    } catch (err) {
      showToast(err.message || t('marketing.editor.scheduleError'), {
        variant: 'danger',
      });
    }
  }, [scheduleDate, scheduleMutation, showToast, t]);

  const handleUnschedule = useCallback(async () => {
    try {
      await unscheduleMutation.mutateAsync();
      showToast(t('marketing.editor.unscheduleSuccess'), {
        variant: 'success',
      });
    } catch (err) {
      showToast(err.message || t('marketing.editor.saveError'), {
        variant: 'danger',
      });
    }
  }, [unscheduleMutation, showToast, t]);

  // Opened in a new tab, not navigated to in place, so an unsaved edit in
  // the current tab is never discarded just to look at the preview.
  const handlePreview = useCallback(() => {
    window.open(
      `/${locale}${basePath}/${postId}/preview`,
      '_blank',
      'noopener,noreferrer',
    );
  }, [locale, basePath, postId]);

  if (isPending) {
    return (
      <Section aria-label={t('marketing.editor.settingsHeading')}>
        <Spinner label={t('marketing.editor.settingsHeading')} />
      </Section>
    );
  }

  if (isError) {
    if (error?.status === 404) {
      return (
        <ErrorState
          title={t('errors.notFound.title')}
          retryLabel={t('marketing.posts.error.retry')}
          onRetry={() => navigate(`/${locale}${basePath}`)}
        />
      );
    }
    return (
      <Section>
        <ErrorState
          title={t('marketing.posts.error.title')}
          retryLabel={t('marketing.posts.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const translationByLocale = new Map(
    post.translations.map((translation) => [
      translation.language_code,
      translation,
    ]),
  );

  const categoryOptions = [
    { value: '', label: t('marketing.editor.categoryNone') },
    ...categories.map((c) => ({ value: c.slug, label: c.name })),
  ];

  const tabs = SUPPORTED_LOCALES.map((code) => ({
    id: code,
    label: translationByLocale.has(code)
      ? code.toUpperCase()
      : t('marketing.editor.localeTabMissingLabel', {
          code: code.toUpperCase(),
        }),
    panel: (
      <TranslationEditor
        postId={postId}
        languageCode={code}
        translation={translationByLocale.get(code)}
        canWrite
      />
    ),
  }));

  return (
    <Section spacing="default">
      <PageHeader
        title={post.slug}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          {
            label: t('marketing.posts.heading'),
            href: `/${locale}${basePath}`,
          },
          { label: post.slug, href: `/${locale}${basePath}/${postId}` },
        ]}
      />

      <Stack gap="4">
        <Card as="div" padding="lg">
          <Stack gap="3">
            <Inline gap="3" align="center" wrap>
              <Badge
                size="sm"
                variant={post.status === 'PUBLISHED' ? 'success' : 'neutral'}
                label={t(`blog.statuses.${post.status}`)}
              />
              {post.status === 'SCHEDULED' && post.scheduled_at && (
                <span className={styles.scheduledMeta}>
                  {new Date(post.scheduled_at).toLocaleString(locale)}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={handlePreview}>
                {t('marketing.editor.openPreviewAction')}
              </Button>
            </Inline>

            {canPublish && (
              <Inline gap="2" wrap>
                {post.status !== 'PUBLISHED' && (
                  <Button
                    variant="primary"
                    onClick={handlePublish}
                    loading={publishMutation.isPending}
                  >
                    {t('marketing.editor.publishAction')}
                  </Button>
                )}
                {post.status === 'PUBLISHED' && (
                  <Button
                    variant="secondary"
                    onClick={handleUnpublish}
                    loading={unpublishMutation.isPending}
                  >
                    {t('marketing.editor.unpublishAction')}
                  </Button>
                )}
                {post.status === 'DRAFT' && (
                  <Button variant="secondary" onClick={openScheduleModal}>
                    {t('marketing.editor.scheduleAction')}
                  </Button>
                )}
                {post.status === 'SCHEDULED' && (
                  <Button
                    variant="secondary"
                    onClick={handleUnschedule}
                    loading={unscheduleMutation.isPending}
                  >
                    {t('marketing.editor.unscheduleAction')}
                  </Button>
                )}
              </Inline>
            )}
          </Stack>
        </Card>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <h2>{t('marketing.editor.settingsHeading')}</h2>
            <Input
              label={t('marketing.editor.slugLabel')}
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              required
            />
            <Select
              label={t('marketing.editor.categoryLabel')}
              options={categoryOptions}
              value={categorySlug}
              onChange={setCategorySlug}
            />
            <TagsEditor
              label={t('marketing.editor.tagsLabel')}
              placeholder={t('marketing.editor.tagsPlaceholder')}
              values={tagNames}
              onChange={setTagNames}
              suggestions={tags.map((tag) => tag.name)}
            />
            <div>
              <p className={styles.coverLabel}>
                {t('marketing.editor.coverHeading')}
              </p>
              <CoverImageUploader
                src={post.cover?.url}
                isUploading={attachCoverMutation.isPending}
                onUpload={handleCoverUpload}
                onRemove={post.cover ? handleCoverRemove : undefined}
                onValidationError={(message) =>
                  showToast(message, { variant: 'danger' })
                }
              />
            </div>
            <Inline justify="flex-end">
              <Button
                variant="primary"
                onClick={handleSaveSettings}
                loading={updateSettingsMutation.isPending}
              >
                {t('common.save')}
              </Button>
            </Inline>
          </Stack>
        </Card>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <h2>{t('marketing.editor.translationsHeading')}</h2>
            <Tabs
              tabs={tabs}
              activeTabId={activeLocale}
              onChange={setActiveLocale}
              ariaLabel={t('marketing.editor.translationsHeading')}
            />
          </Stack>
        </Card>
      </Stack>

      <Modal
        isOpen={isScheduleOpen}
        onClose={closeScheduleModal}
        title={t('marketing.editor.scheduleModalTitle')}
      >
        <Stack gap="4" className={styles.scheduleModal}>
          <Input
            type="datetime-local"
            label={t('marketing.editor.scheduleDateLabel')}
            value={scheduleDate}
            onChange={(event) => setScheduleDate(event.target.value)}
          />
          <Inline justify="flex-end">
            <Button
              variant="primary"
              onClick={handleSchedule}
              loading={scheduleMutation.isPending}
              disabled={!scheduleDate}
            >
              {t('marketing.editor.scheduleConfirm')}
            </Button>
          </Inline>
        </Stack>
      </Modal>
    </Section>
  );
}

BlogPostEditorContent.propTypes = {
  basePath: PropTypes.string.isRequired,
};

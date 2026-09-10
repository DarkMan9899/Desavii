/**
 * CoverImageUploader — click-to-replace pattern for a single cover
 * image (Sprint H, Blog), mirroring `AvatarUploader.jsx`'s exact
 * rationale: a single-slot image is a mismatched shape for
 * `FileDropzone`'s multi-photo gallery flow. Client-side mirrors the
 * backend's own MIME/size policy (`BlogService#attachCoverImage`) so a
 * rejected upload never round-trips to the server first.
 */

import { useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@desavii/ui/components/primitives';
import { Spinner } from '@desavii/ui/components/feedback-overlays';
import styles from './CoverImageUploader.module.scss';

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export default function CoverImageUploader({
  src = undefined,
  isUploading,
  onUpload,
  onRemove = undefined,
  onValidationError,
}) {
  const { t } = useTranslation();
  const inputRef = useRef(null);

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      onValidationError(t('marketing.editor.coverErrorType'));
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onValidationError(t('marketing.editor.coverErrorSize'));
      return;
    }
    onUpload(file);
  }

  return (
    <div className={styles.uploader}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
      >
        {src ? (
          <img src={src} alt="" className={styles.preview} />
        ) : (
          <span className={styles.placeholder} aria-hidden="true">
            <ImageIcon size={28} />
          </span>
        )}
        {isUploading && (
          <span className={styles.overlay}>
            <Spinner size="sm" decorative />
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES.join(',')}
        className={styles.input}
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {src
            ? t('marketing.editor.coverReplaceAction')
            : t('marketing.editor.coverUploadAction')}
        </Button>
        {src && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={isUploading}
            iconLeft={<X size={14} aria-hidden="true" />}
          >
            {t('marketing.editor.coverRemoveAction')}
          </Button>
        )}
      </div>
      <p className={styles.hint}>{t('marketing.editor.coverHint')}</p>
    </div>
  );
}

CoverImageUploader.propTypes = {
  src: PropTypes.string,
  isUploading: PropTypes.bool.isRequired,
  onUpload: PropTypes.func.isRequired,
  onRemove: PropTypes.func,
  onValidationError: PropTypes.func.isRequired,
};

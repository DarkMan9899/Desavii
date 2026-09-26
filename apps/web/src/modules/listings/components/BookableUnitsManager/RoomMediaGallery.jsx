/**
 * RoomMediaGallery (Sprint C-1) — room-specific photo gallery for one
 * `bookable_unit`. Mirrors `MediaStep`'s upload/cover/remove pattern
 * (same `FileDropzone`, same immediate-mutation-per-file model) scoped to
 * `mediable_type = 'bookable_unit'` instead of `'listing'` — a
 * deliberately independent gallery, never copied from or shared with the
 * listing's own photos. No reorder controls (unlike `MediaStep`) — a
 * deliberate MVP simplification for this sprint; `position` is still set
 * server-side at upload time (upload order), so the gallery is never
 * unordered.
 *
 * Step L3.1 (brief §4): exact JPEG/PNG/WebP accept list (was a broad
 * `image/*`), and a `maxSelectionCount` matching the listing gallery's
 * own per-selection limit — this gallery already supported selecting
 * several files at once (the sequential upload loop below), so brief §4's
 * "if it supports multi-select, apply the same maximum 5" applies as-is,
 * no redesign needed. Reuses the exact `partner.listingWizard.media.*`
 * error copy `MediaStep.jsx` already established in Step L3, the same
 * way this file already borrowed `dropzoneEmphasis`/`dropzoneInstructions`/
 * `cover`/`remove` from that namespace rather than duplicating them.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button } from '@desavii/ui/components/primitives';
import { FileDropzone } from '@desavii/ui/components/listing-media';
import { Stack } from '@desavii/ui/components/layout';
import ApiErrorAlert from '../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import {
  useAttachBookableUnitMediaMutation,
  useRemoveBookableUnitMediaMutation,
} from '../../../availability/index.js';

const ACCEPTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_FILES_PER_SELECTION = 5;

export default function RoomMediaGallery({ unitId, listingId, media = [] }) {
  const { t } = useTranslation();
  const attachMutation = useAttachBookableUnitMediaMutation();
  const removeMutation = useRemoveBookableUnitMediaMutation();

  const [uploads, setUploads] = useState([]);
  const [selectionError, setSelectionError] = useState(null);

  function statusTextFor(upload) {
    if (upload.status !== 'error') {
      return t('partner.listingWizard.media.uploading');
    }
    if (upload.reason === 'size') {
      return t('partner.listingWizard.media.imageTooLarge');
    }
    if (upload.reason === 'type') {
      return t('partner.listingWizard.media.unsupportedImageFormat');
    }
    if (upload.reason === 'server') {
      return t('partner.listingWizard.media.uploadRejectedByServer');
    }
    return t('partner.listingWizard.media.uploadFailed');
  }

  // Sequential, never `Promise.all`/parallel `forEach`: kept even though
  // the backend's own position/cover assignment is now transactionally
  // safe under concurrency (Step L3.1) — sequential upload is still the
  // simpler, perfectly adequate design for "select up to 5 photos and
  // watch them upload in order," not something that needed fixing.
  async function handleFilesSelected(files) {
    setSelectionError(null);
    // eslint-disable-next-line no-restricted-syntax -- sequential by design, see comment above
    for (const file of files) {
      const uploadId = `${file.name}-${file.size}-${file.lastModified}`;
      setUploads((current) => [
        ...current,
        { id: uploadId, name: file.name, status: 'pending' },
      ]);
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential by design, see comment above
        await attachMutation.mutateAsync({ id: unitId, listingId, file });
        setUploads((current) =>
          current.filter((upload) => upload.id !== uploadId),
        );
      } catch (err) {
        const reason = err?.status === 413 ? 'size' : 'server';
        setUploads((current) =>
          current.map((upload) =>
            upload.id === uploadId
              ? { ...upload, status: 'error', reason }
              : upload,
          ),
        );
      }
    }
  }

  function handleRejected(rejections) {
    setSelectionError(null);
    setUploads((current) => [
      ...current,
      ...rejections.map(({ file, reason }) => ({
        id: `${file.name}-${file.size}-rejected`,
        name: file.name,
        status: 'error',
        reason,
      })),
    ]);
  }

  function handleTooManyFiles() {
    setSelectionError(
      t('partner.listingWizard.media.tooManyImages', {
        max: MAX_IMAGE_FILES_PER_SELECTION,
      }),
    );
  }

  function remove(mediaId) {
    removeMutation.mutate({ id: unitId, listingId, mediaId });
  }

  const sortedMedia = [...media].sort((a, b) => a.position - b.position);

  return (
    <Stack gap="3">
      <h4>{t('partner.listingWizard.availability.roomGalleryHeading')}</h4>
      <ApiErrorAlert error={attachMutation.error ?? removeMutation.error} />

      <FileDropzone
        label={t('partner.listingWizard.availability.roomGalleryDropzone')}
        accept={ACCEPTED_IMAGE_MIME_TYPES.join(',')}
        maxSizeBytes={MAX_UPLOAD_BYTES}
        maxSelectionCount={MAX_IMAGE_FILES_PER_SELECTION}
        currentCount={sortedMedia.length}
        onFilesSelected={(files) => handleFilesSelected(files)}
        onRejected={(rejections) => handleRejected(rejections)}
        onTooManyFiles={() => handleTooManyFiles()}
        emphasisText={t('partner.listingWizard.media.dropzoneEmphasis')}
        instructionsText={t('partner.listingWizard.media.dropzoneInstructions')}
        error={selectionError}
      />

      {uploads.length > 0 && (
        <ul>
          {uploads.map((upload) => (
            <li key={upload.id}>
              {upload.name}
              {' — '}
              {statusTextFor(upload)}
            </li>
          ))}
        </ul>
      )}

      <Stack gap="2">
        {sortedMedia.map((item) => (
          <div key={item.id}>
            <img
              src={item.thumbnail_url || item.url}
              alt=""
              width="120"
              height="80"
            />
            {item.is_cover && (
              <span>{t('partner.listingWizard.media.cover')}</span>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => remove(item.id)}
            >
              {t('partner.listingWizard.media.remove')}
            </Button>
          </div>
        ))}
      </Stack>
    </Stack>
  );
}

RoomMediaGallery.propTypes = {
  unitId: PropTypes.number.isRequired,
  listingId: PropTypes.number.isRequired,
  media: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      url: PropTypes.string.isRequired,
      thumbnail_url: PropTypes.string,
      position: PropTypes.number.isRequired,
      is_cover: PropTypes.bool.isRequired,
    }),
  ),
};

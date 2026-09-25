/**
 * FileDropzone — Phase 5's drag-and-drop / click-to-browse upload
 * primitive (`MediaStep.jsx`, `CsvImportWizard.jsx`). Validation
 * (`accept`/`maxSizeBytes`, or the Step L3 per-kind `rules`) happens
 * here so every consumer gets the same accept/size-rejection reasons
 * rather than re-implementing it; the actual upload request is each
 * consumer's own concern.
 *
 * Phase 17 accessibility fix: the drop target is a native `<label>`
 * wrapping a visually-hidden file input, not a `role="button"` `<div>`
 * with a separate absolutely-positioned input — a native label/input
 * pairing gets browser drag-and-drop and click-to-browse for free with
 * no extra ARIA wiring, and `label` becomes the input's own accessible
 * name (not a separate caption element).
 *
 * Step L3 (brief §7-9): a single scalar `accept`/`maxSizeBytes` pair
 * can't express "images use one size ceiling, video uses another" —
 * `rules` (an ordered `{ accept, maxSizeBytes }[]`) replaces them when
 * a consumer needs per-kind limits, without splitting one dropzone into
 * several separate widgets. Existing consumers (CsvImportWizard,
 * AvatarUploader, CoverImageUploader, RoomMediaGallery) never pass
 * `rules`, so their original single-limit behavior is unchanged.
 *
 * Step L3 (brief §5, §11): `maxSelectionCount` bounds how many files
 * matching `maxSelectionAccept` may appear in ONE picker/drop action —
 * a distinct concept from `maxCount`/`currentCount` (the *listing's*
 * already-attached total, which this component still never enforces by
 * disabling itself). Exceeding it rejects the WHOLE selection before any
 * per-file validation runs, so zero uploads ever start for an overflowing
 * batch — never a silent truncation to the first N.
 */

import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import styles from './FileDropzone.module.scss';

function matchesAccept(file, accept) {
  if (!accept) return true;
  const patterns = accept.split(',').map((pattern) => pattern.trim());
  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) {
      return file.name.toLowerCase().endsWith(pattern.toLowerCase());
    }
    if (pattern.endsWith('/*')) {
      return file.type.startsWith(pattern.slice(0, -1));
    }
    return file.type === pattern;
  });
}

function resolveAcceptAttribute(accept, rules) {
  if (rules && rules.length > 0) {
    return rules.map((rule) => rule.accept).join(',');
  }
  return accept;
}

export default function FileDropzone({
  label = undefined,
  accept = undefined,
  maxSizeBytes = undefined,
  rules = undefined,
  maxSelectionCount = undefined,
  maxSelectionAccept = undefined,
  currentCount = undefined,
  maxCount = undefined,
  onFilesSelected,
  onRejected = undefined,
  onTooManyFiles = undefined,
  emphasisText = undefined,
  instructionsText = undefined,
  error = undefined,
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const acceptAttribute = resolveAcceptAttribute(accept, rules);

  function classifyFile(file) {
    if (rules && rules.length > 0) {
      const matchedRule = rules.find((rule) =>
        matchesAccept(file, rule.accept),
      );
      if (!matchedRule) return 'type';
      if (matchedRule.maxSizeBytes && file.size > matchedRule.maxSizeBytes) {
        return 'size';
      }
      return null;
    }
    if (maxSizeBytes && file.size > maxSizeBytes) return 'size';
    if (!matchesAccept(file, accept)) return 'type';
    return null;
  }

  function processFiles(fileList) {
    const files = Array.from(fileList);

    if (maxSelectionCount !== undefined) {
      const countedFiles = files.filter((file) =>
        matchesAccept(file, maxSelectionAccept ?? acceptAttribute),
      );
      if (countedFiles.length > maxSelectionCount) {
        onTooManyFiles?.(countedFiles.length);
        return;
      }
    }

    const accepted = [];
    const rejected = [];

    files.forEach((file) => {
      const reason = classifyFile(file);
      if (reason) {
        rejected.push({ file, reason });
      } else {
        accepted.push(file);
      }
    });

    if (accepted.length > 0) onFilesSelected(accepted);
    if (rejected.length > 0 && onRejected) onRejected(rejected);
  }

  const atCapacity =
    maxCount !== undefined &&
    currentCount !== undefined &&
    currentCount >= maxCount;

  // Falls back to `label` itself so the box always shows discernible
  // visible text (e.g. CsvImportWizard passes only `label`, no
  // emphasis/instructions) — `aria-label` on the input below still
  // gives it a precise accessible name independent of this text.
  const visibleEmphasis = emphasisText ?? label;

  return (
    <div className={styles.field}>
      {/* Native label/input pairing gets browser drag-and-drop and
          click-to-browse for free (Phase 17 accessibility fix) — the
          two a11y rules below assume a bare label can't meaningfully
          receive drop events, which is exactly this component's job. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/label-has-associated-control -- <input> is a direct child, correctly associated; ESLint's static check doesn't see through the conditional `onDrop` above */}
      <label
        className={[
          styles.dropzone,
          isDragActive && styles['dropzone--active'],
          error && styles['dropzone--error'],
          atCapacity && styles['dropzone--disabled'],
        ]
          .filter(Boolean)
          .join(' ')}
        onDragOver={(event) => {
          event.preventDefault();
          if (!atCapacity) setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={
          atCapacity
            ? undefined
            : (event) => {
                event.preventDefault();
                setIsDragActive(false);
                processFiles(event.dataTransfer.files);
              }
        }
      >
        <input
          id={fieldId}
          type="file"
          multiple
          accept={acceptAttribute}
          aria-label={label}
          aria-describedby={error ? errorId : undefined}
          disabled={atCapacity}
          className={styles.input}
          onChange={(event) => {
            processFiles(event.target.files);
            event.target.value = '';
          }}
        />
        {visibleEmphasis && (
          <p className={styles.emphasis}>{visibleEmphasis}</p>
        )}
        {instructionsText && (
          <p className={styles.instructions}>{instructionsText}</p>
        )}
      </label>
      {error && (
        <p id={errorId} className={styles.errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

FileDropzone.propTypes = {
  label: PropTypes.string,
  accept: PropTypes.string,
  maxSizeBytes: PropTypes.number,
  rules: PropTypes.arrayOf(
    PropTypes.shape({
      accept: PropTypes.string.isRequired,
      maxSizeBytes: PropTypes.number,
    }),
  ),
  maxSelectionCount: PropTypes.number,
  maxSelectionAccept: PropTypes.string,
  currentCount: PropTypes.number,
  maxCount: PropTypes.number,
  onFilesSelected: PropTypes.func.isRequired,
  onRejected: PropTypes.func,
  onTooManyFiles: PropTypes.func,
  emphasisText: PropTypes.string,
  instructionsText: PropTypes.string,
  error: PropTypes.string,
};

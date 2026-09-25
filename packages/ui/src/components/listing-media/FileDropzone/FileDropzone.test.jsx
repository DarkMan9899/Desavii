import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileDropzone from './FileDropzone.jsx';

function makeFile(name, type, sizeBytes = 4) {
  const file = new File([new Uint8Array(sizeBytes)], name, { type });
  // jsdom's `File` derives `size` from the content passed in — set it
  // directly so a size-limit test doesn't need to construct genuinely
  // huge in-memory blobs just to exceed a byte threshold.
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('FileDropzone', () => {
  test('a file matching accept/size is passed to onFilesSelected', async () => {
    const user = userEvent.setup();
    const onFilesSelected = vi.fn();
    render(
      <FileDropzone
        label="Photos"
        accept="image/png"
        maxSizeBytes={1000}
        onFilesSelected={onFilesSelected}
      />,
    );
    const input = screen.getByLabelText('Photos');
    const file = makeFile('a.png', 'image/png', 100);
    await user.upload(input, file);
    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  test('a file over the scalar maxSizeBytes is rejected with reason "size"', async () => {
    const user = userEvent.setup();
    const onRejected = vi.fn();
    render(
      <FileDropzone
        label="Photos"
        accept="image/png"
        maxSizeBytes={100}
        onFilesSelected={vi.fn()}
        onRejected={onRejected}
      />,
    );
    const input = screen.getByLabelText('Photos');
    const file = makeFile('a.png', 'image/png', 101);
    await user.upload(input, file);
    expect(onRejected).toHaveBeenCalledWith([{ file, reason: 'size' }]);
  });

  test('a file not matching accept is rejected with reason "type"', () => {
    // Real drag-and-drop (unlike the OS file picker `user.upload()`
    // emulates) never filters by the input's `accept` attribute — this
    // is exactly why the component needs its own JS type check, and
    // `fireEvent.drop` is the one path that actually exercises it here.
    const onRejected = vi.fn();
    render(
      <FileDropzone
        label="Photos"
        accept="image/png"
        onFilesSelected={vi.fn()}
        onRejected={onRejected}
      />,
    );
    const zone = screen.getByLabelText('Photos').closest('label');
    const file = makeFile('a.gif', 'image/gif', 10);
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onRejected).toHaveBeenCalledWith([{ file, reason: 'type' }]);
  });

  test('the dropzone disables once currentCount reaches maxCount', () => {
    render(
      <FileDropzone
        label="Photos"
        onFilesSelected={vi.fn()}
        currentCount={3}
        maxCount={3}
      />,
    );
    expect(screen.getByLabelText('Photos')).toBeDisabled();
  });

  test('the dropzone stays enabled below maxCount', () => {
    render(
      <FileDropzone
        label="Photos"
        onFilesSelected={vi.fn()}
        currentCount={2}
        maxCount={3}
      />,
    );
    expect(screen.getByLabelText('Photos')).not.toBeDisabled();
  });

  // Step L3 (brief §7-9): per-kind `rules` let one dropzone apply a
  // different size ceiling to images vs. video, instead of one flat
  // limit for every declared type.
  describe('per-kind `rules` (Step L3)', () => {
    const IMAGE_RULE = {
      accept: 'image/jpeg,image/png,image/webp',
      maxSizeBytes: 100,
    };
    const VIDEO_RULE = { accept: 'video/mp4,video/webm', maxSizeBytes: 1000 };

    test('an image within the image rule size is accepted', async () => {
      const user = userEvent.setup();
      const onFilesSelected = vi.fn();
      render(
        <FileDropzone
          label="Media"
          rules={[IMAGE_RULE, VIDEO_RULE]}
          onFilesSelected={onFilesSelected}
        />,
      );
      const file = makeFile('a.png', 'image/png', 90);
      await user.upload(screen.getByLabelText('Media'), file);
      expect(onFilesSelected).toHaveBeenCalledWith([file]);
    });

    test('an image over the image rule size is rejected for size, even though it is well under the video rule size', async () => {
      const user = userEvent.setup();
      const onRejected = vi.fn();
      render(
        <FileDropzone
          label="Media"
          rules={[IMAGE_RULE, VIDEO_RULE]}
          onFilesSelected={vi.fn()}
          onRejected={onRejected}
        />,
      );
      const file = makeFile('a.png', 'image/png', 500);
      await user.upload(screen.getByLabelText('Media'), file);
      expect(onRejected).toHaveBeenCalledWith([{ file, reason: 'size' }]);
    });

    test('a video within the video rule size is accepted even though it exceeds the image rule size', async () => {
      const user = userEvent.setup();
      const onFilesSelected = vi.fn();
      render(
        <FileDropzone
          label="Media"
          rules={[IMAGE_RULE, VIDEO_RULE]}
          onFilesSelected={onFilesSelected}
        />,
      );
      const file = makeFile('a.mp4', 'video/mp4', 500);
      await user.upload(screen.getByLabelText('Media'), file);
      expect(onFilesSelected).toHaveBeenCalledWith([file]);
    });

    test('a file matching no rule is rejected for type', () => {
      const onRejected = vi.fn();
      render(
        <FileDropzone
          label="Media"
          rules={[IMAGE_RULE, VIDEO_RULE]}
          onFilesSelected={vi.fn()}
          onRejected={onRejected}
        />,
      );
      const zone = screen.getByLabelText('Media').closest('label');
      const file = makeFile('a.svg', 'image/svg+xml', 10);
      fireEvent.drop(zone, { dataTransfer: { files: [file] } });
      expect(onRejected).toHaveBeenCalledWith([{ file, reason: 'type' }]);
    });

    test("the native input accepts the union of every rule's patterns", () => {
      render(
        <FileDropzone
          label="Media"
          rules={[IMAGE_RULE, VIDEO_RULE]}
          onFilesSelected={vi.fn()}
        />,
      );
      expect(screen.getByLabelText('Media')).toHaveAttribute(
        'accept',
        'image/jpeg,image/png,image/webp,video/mp4,video/webm',
      );
    });
  });

  // Step L3 (brief §5, §11): a per-selection count limit, scoped to a
  // specific accept pattern, rejects the WHOLE selection with zero
  // uploads started rather than silently truncating it.
  describe('maxSelectionCount (Step L3)', () => {
    test('a selection at or under the limit proceeds normally', async () => {
      const user = userEvent.setup();
      const onFilesSelected = vi.fn();
      const onTooManyFiles = vi.fn();
      render(
        <FileDropzone
          label="Photos"
          accept="image/png"
          maxSelectionCount={5}
          onFilesSelected={onFilesSelected}
          onTooManyFiles={onTooManyFiles}
        />,
      );
      const files = Array.from({ length: 5 }, (_, i) =>
        makeFile(`${i}.png`, 'image/png', 10),
      );
      await user.upload(screen.getByLabelText('Photos'), files);
      expect(onFilesSelected).toHaveBeenCalledWith(files);
      expect(onTooManyFiles).not.toHaveBeenCalled();
    });

    test('a selection over the limit calls onTooManyFiles and starts zero uploads', async () => {
      const user = userEvent.setup();
      const onFilesSelected = vi.fn();
      const onRejected = vi.fn();
      const onTooManyFiles = vi.fn();
      render(
        <FileDropzone
          label="Photos"
          accept="image/png"
          maxSelectionCount={5}
          onFilesSelected={onFilesSelected}
          onRejected={onRejected}
          onTooManyFiles={onTooManyFiles}
        />,
      );
      const files = Array.from({ length: 6 }, (_, i) =>
        makeFile(`${i}.png`, 'image/png', 10),
      );
      await user.upload(screen.getByLabelText('Photos'), files);
      expect(onTooManyFiles).toHaveBeenCalledWith(6);
      expect(onFilesSelected).not.toHaveBeenCalled();
      expect(onRejected).not.toHaveBeenCalled();
    });

    test('the count limit applies to drag-and-drop the same way as the file picker', () => {
      const onFilesSelected = vi.fn();
      const onTooManyFiles = vi.fn();
      render(
        <FileDropzone
          label="Photos"
          accept="image/png"
          maxSelectionCount={5}
          onFilesSelected={onFilesSelected}
          onTooManyFiles={onTooManyFiles}
        />,
      );
      const zone = screen.getByLabelText('Photos').closest('label');
      const files = Array.from({ length: 6 }, (_, i) =>
        makeFile(`${i}.png`, 'image/png', 10),
      );
      fireEvent.drop(zone, { dataTransfer: { files } });
      expect(onTooManyFiles).toHaveBeenCalledWith(6);
      expect(onFilesSelected).not.toHaveBeenCalled();
    });

    test('maxSelectionAccept scopes the count to only the matching kind — a video alongside 5 images does not trip the image-only limit', async () => {
      const user = userEvent.setup();
      const onFilesSelected = vi.fn();
      const onTooManyFiles = vi.fn();
      render(
        <FileDropzone
          label="Media"
          rules={[
            { accept: 'image/png', maxSizeBytes: 1000 },
            { accept: 'video/mp4', maxSizeBytes: 1000 },
          ]}
          maxSelectionCount={5}
          maxSelectionAccept="image/png"
          onFilesSelected={onFilesSelected}
          onTooManyFiles={onTooManyFiles}
        />,
      );
      const images = Array.from({ length: 5 }, (_, i) =>
        makeFile(`${i}.png`, 'image/png', 10),
      );
      const video = makeFile('clip.mp4', 'video/mp4', 10);
      await user.upload(screen.getByLabelText('Media'), [...images, video]);
      expect(onTooManyFiles).not.toHaveBeenCalled();
      expect(onFilesSelected).toHaveBeenCalledWith([...images, video]);
    });

    test('6 images alongside a video still trips the image-only limit', async () => {
      const user = userEvent.setup();
      const onFilesSelected = vi.fn();
      const onTooManyFiles = vi.fn();
      render(
        <FileDropzone
          label="Media"
          rules={[
            { accept: 'image/png', maxSizeBytes: 1000 },
            { accept: 'video/mp4', maxSizeBytes: 1000 },
          ]}
          maxSelectionCount={5}
          maxSelectionAccept="image/png"
          onFilesSelected={onFilesSelected}
          onTooManyFiles={onTooManyFiles}
        />,
      );
      const images = Array.from({ length: 6 }, (_, i) =>
        makeFile(`${i}.png`, 'image/png', 10),
      );
      const video = makeFile('clip.mp4', 'video/mp4', 10);
      await user.upload(screen.getByLabelText('Media'), [...images, video]);
      expect(onTooManyFiles).toHaveBeenCalledWith(6);
      expect(onFilesSelected).not.toHaveBeenCalled();
    });
  });
});

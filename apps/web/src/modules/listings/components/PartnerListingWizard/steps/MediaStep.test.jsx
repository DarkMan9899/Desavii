import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaStep from './MediaStep.jsx';
import { useAttachListingMediaMutation } from '../../../mutations/useAttachListingMediaMutation.js';
import { useUpdateListingMediaMutation } from '../../../mutations/useUpdateListingMediaMutation.js';
import { useRemoveListingMediaMutation } from '../../../mutations/useRemoveListingMediaMutation.js';

vi.mock('../../../mutations/useAttachListingMediaMutation.js', () => ({
  useAttachListingMediaMutation: vi.fn(),
}));
vi.mock('../../../mutations/useUpdateListingMediaMutation.js', () => ({
  useUpdateListingMediaMutation: vi.fn(),
}));
vi.mock('../../../mutations/useRemoveListingMediaMutation.js', () => ({
  useRemoveListingMediaMutation: vi.fn(),
}));

const MEDIA = [
  {
    id: 1,
    media_type: 'IMAGE',
    url: '/media/1.png',
    thumbnail_url: '/media/1-thumb.png',
    position: 0,
    is_cover: true,
    alt_text: 'Villa exterior at sunset',
    caption: '',
  },
  {
    id: 2,
    media_type: 'IMAGE',
    url: '/media/2.png',
    thumbnail_url: '/media/2-thumb.png',
    position: 1,
    is_cover: false,
    alt_text: '',
    caption: '',
  },
];

function makeFile(name, type) {
  return new File(['x'], name, { type });
}

// The `<li>` upload-status row interpolates `{name}{' — '}{message}` as
// three sibling text nodes, so its full text is "name — message", not
// just the message alone — an exact-match `findByText` never matches a
// substring of that. A regex matches the substring regardless of what
// sits alongside it.
function textIncluding(substring) {
  return new RegExp(substring.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

describe('MediaStep (PartnerListingWizard)', () => {
  let attachMutateAsync;
  let updateMutate;
  let removeMutate;

  beforeEach(() => {
    attachMutateAsync = vi.fn().mockResolvedValue({ data: {} });
    updateMutate = vi.fn();
    removeMutate = vi.fn();
    useAttachListingMediaMutation.mockReturnValue({
      mutateAsync: attachMutateAsync,
    });
    useUpdateListingMediaMutation.mockReturnValue({ mutate: updateMutate });
    useRemoveListingMediaMutation.mockReturnValue({ mutate: removeMutate });
  });

  test('renders existing media sorted by position, with the cover badge on the right item', () => {
    render(<MediaStep listingId={7} media={MEDIA} onNext={vi.fn()} />);
    expect(screen.getByText('Կազմի լուսանկար')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', {
        name: 'Դարձնել կազմի լուսանկար',
      })[0],
    ).toBeDisabled();
  });

  test('dropping a file calls attachListingMedia', async () => {
    render(<MediaStep listingId={7} media={[]} onNext={vi.fn()} />);
    // FileDropzone's drop target is a native `<label>` wrapping a visually
    // hidden file input (Phase 17 accessibility fix), not a `role="button"`
    // element — resolve it via the input's accessible label instead.
    const zone = screen
      .getByLabelText('Լուսանկարներ և տեսանյութեր')
      .closest('label');
    const file = makeFile('villa.png', 'image/png');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    await waitFor(() =>
      expect(attachMutateAsync).toHaveBeenCalledWith({ id: 7, file }),
    );
  });

  test('setting a non-cover item as cover calls updateListingMedia with isCover: true', async () => {
    const user = userEvent.setup();
    render(<MediaStep listingId={7} media={MEDIA} onNext={vi.fn()} />);
    const setCoverButtons = screen.getAllByRole('button', {
      name: 'Դարձնել կազմի լուսանկար',
    });
    await user.click(setCoverButtons[1]);
    expect(updateMutate).toHaveBeenCalledWith({
      id: 7,
      mediaId: 2,
      payload: { isCover: true },
    });
  });

  test('moving the second item up swaps positions with the first via two updateListingMedia calls', async () => {
    const user = userEvent.setup();
    render(<MediaStep listingId={7} media={MEDIA} onNext={vi.fn()} />);
    const moveUpButtons = screen.getAllByRole('button', {
      name: 'Բարձրացնել',
    });
    await user.click(moveUpButtons[1]);
    expect(updateMutate).toHaveBeenCalledWith({
      id: 7,
      mediaId: 2,
      payload: { position: 0 },
    });
    expect(updateMutate).toHaveBeenCalledWith({
      id: 7,
      mediaId: 1,
      payload: { position: 1 },
    });
  });

  test('removing an item calls removeListingMedia', async () => {
    const user = userEvent.setup();
    render(<MediaStep listingId={7} media={MEDIA} onNext={vi.fn()} />);
    const removeButtons = screen.getAllByRole('button', {
      name: 'Հեռացնել',
    });
    await user.click(removeButtons[0]);
    expect(removeMutate).toHaveBeenCalledWith({ id: 7, mediaId: 1 });
  });

  // Step L3 (brief §5-11, §27): the per-selection image count limit,
  // per-kind size/type rules, and reason-specific error copy.
  describe('image upload hardening (Step L3)', () => {
    test('selecting 5 images at once uploads all 5', async () => {
      render(<MediaStep listingId={7} media={[]} onNext={vi.fn()} />);
      const zone = screen
        .getByLabelText('Լուսանկարներ և տեսանյութեր')
        .closest('label');
      const files = Array.from({ length: 5 }, (_, i) =>
        makeFile(`${i}.png`, 'image/png'),
      );
      fireEvent.drop(zone, { dataTransfer: { files } });

      await waitFor(() => expect(attachMutateAsync).toHaveBeenCalledTimes(5));
    });

    test('selecting 6 images at once uploads none and shows the max-5 error', async () => {
      render(<MediaStep listingId={7} media={[]} onNext={vi.fn()} />);
      const zone = screen
        .getByLabelText('Լուսանկարներ և տեսանյութեր')
        .closest('label');
      const files = Array.from({ length: 6 }, (_, i) =>
        makeFile(`${i}.png`, 'image/png'),
      );
      fireEvent.drop(zone, { dataTransfer: { files } });

      expect(
        await screen.findByText(
          'Կարող եք միանգամից ընտրել առավելագույնը 5 պատկեր։ Ընտրեք ավելի քիչ և փորձեք կրկին։',
        ),
      ).toBeInTheDocument();
      expect(attachMutateAsync).not.toHaveBeenCalled();
    });

    test('a video included with 5 images does not trip the image-only selection limit', async () => {
      render(<MediaStep listingId={7} media={[]} onNext={vi.fn()} />);
      const zone = screen
        .getByLabelText('Լուսանկարներ և տեսանյութեր')
        .closest('label');
      const images = Array.from({ length: 5 }, (_, i) =>
        makeFile(`${i}.png`, 'image/png'),
      );
      const video = makeFile('clip.mp4', 'video/mp4');
      fireEvent.drop(zone, { dataTransfer: { files: [...images, video] } });

      await waitFor(() => expect(attachMutateAsync).toHaveBeenCalledTimes(6));
    });

    test('an oversized image is rejected client-side with a specific "too large" message, never uploaded', async () => {
      render(<MediaStep listingId={7} media={[]} onNext={vi.fn()} />);
      const zone = screen
        .getByLabelText('Լուսանկարներ և տեսանյութեր')
        .closest('label');
      const oversized = makeFile('huge.png', 'image/png');
      Object.defineProperty(oversized, 'size', {
        value: 10 * 1024 * 1024 + 1,
      });
      fireEvent.drop(zone, { dataTransfer: { files: [oversized] } });

      expect(
        await screen.findByText(
          textIncluding(
            'Այս պատկերը մեծ է 10 ՄԲ-ից։ Օգտագործեք ավելի փոքր պատկեր։',
          ),
        ),
      ).toBeInTheDocument();
      expect(attachMutateAsync).not.toHaveBeenCalled();
    });

    test('an unsupported image format is rejected client-side with a specific format message', async () => {
      render(<MediaStep listingId={7} media={[]} onNext={vi.fn()} />);
      const zone = screen
        .getByLabelText('Լուսանկարներ և տեսանյութեր')
        .closest('label');
      const gif = makeFile('a.gif', 'image/gif');
      fireEvent.drop(zone, { dataTransfer: { files: [gif] } });

      expect(
        await screen.findByText(
          textIncluding('Օգտագործեք JPEG, PNG կամ WebP պատկեր։'),
        ),
      ).toBeInTheDocument();
      expect(attachMutateAsync).not.toHaveBeenCalled();
    });

    test('a server-side rejection (422) shows the safe, translated server-rejection message, not the raw backend error', async () => {
      attachMutateAsync.mockRejectedValueOnce({
        status: 422,
        message: 'VALIDATION_FAILED',
      });
      render(<MediaStep listingId={7} media={[]} onNext={vi.fn()} />);
      const zone = screen
        .getByLabelText('Լուսանկարներ և տեսանյութեր')
        .closest('label');
      fireEvent.drop(zone, {
        dataTransfer: { files: [makeFile('a.png', 'image/png')] },
      });

      expect(
        await screen.findByText(
          textIncluding(
            'Այս ֆայլը հնարավոր չէ վերբեռնել։ Օգտագործեք JPEG, PNG կամ WebP պատկեր՝ մինչև 10 ՄԲ։',
          ),
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('VALIDATION_FAILED')).not.toBeInTheDocument();
    });
  });

  test('Continue is blocked with an inline error when there is no media yet', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<MediaStep listingId={7} media={[]} onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    expect(
      screen.getByText('Շարունակելուց առաջ ավելացրեք առնվազն մեկ լուսանկար։'),
    ).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });

  test('Continue proceeds once at least one media item exists', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<MediaStep listingId={7} media={MEDIA} onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    expect(onNext).toHaveBeenCalled();
  });

  test('blurring the alt text field with a new value calls updateListingMedia with altText', async () => {
    const user = userEvent.setup();
    render(<MediaStep listingId={7} media={MEDIA} onNext={vi.fn()} />);
    const altInputs = screen.getAllByLabelText(
      'Alt տեքստ (հասանելիության համար)',
    );
    await user.clear(altInputs[1]);
    await user.type(altInputs[1], 'Pool view');
    await user.tab();
    expect(updateMutate).toHaveBeenCalledWith({
      id: 7,
      mediaId: 2,
      payload: { altText: 'Pool view' },
    });
  });

  test('blurring the caption field with a new value calls updateListingMedia with caption', async () => {
    const user = userEvent.setup();
    render(<MediaStep listingId={7} media={MEDIA} onNext={vi.fn()} />);
    const captionInputs = screen.getAllByLabelText('Ենթագիր (ընտրովի)');
    await user.type(captionInputs[0], 'Sunset over the villa');
    await user.tab();
    expect(updateMutate).toHaveBeenCalledWith({
      id: 7,
      mediaId: 1,
      payload: { caption: 'Sunset over the villa' },
    });
  });

  test('blurring a caption field with an unchanged value does not call updateListingMedia', async () => {
    const user = userEvent.setup();
    render(<MediaStep listingId={7} media={MEDIA} onNext={vi.fn()} />);
    const altInputs = screen.getAllByLabelText(
      'Alt տեքստ (հասանելիության համար)',
    );
    await user.click(altInputs[0]);
    await user.tab();
    expect(updateMutate).not.toHaveBeenCalled();
  });
});

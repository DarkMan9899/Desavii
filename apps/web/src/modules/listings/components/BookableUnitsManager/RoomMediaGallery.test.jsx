import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoomMediaGallery from './RoomMediaGallery.jsx';
import {
  useAttachBookableUnitMediaMutation,
  useRemoveBookableUnitMediaMutation,
} from '../../../availability/index.js';

vi.mock('../../../availability/index.js', () => ({
  useAttachBookableUnitMediaMutation: vi.fn(),
  useRemoveBookableUnitMediaMutation: vi.fn(),
}));

function makeFile(name, type) {
  return new File(['x'], name, { type });
}

// The `<li>` upload-status row interpolates `{name}{' — '}{message}` as
// three sibling text nodes — an exact-match query never matches a
// substring of that; a regex does.
function textIncluding(substring) {
  return new RegExp(substring.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

describe('RoomMediaGallery (Step L3.1)', () => {
  let attachMutateAsync;
  let removeMutate;

  function setup() {
    attachMutateAsync = vi.fn().mockResolvedValue({ data: {} });
    removeMutate = vi.fn();
    useAttachBookableUnitMediaMutation.mockReturnValue({
      mutateAsync: attachMutateAsync,
      isError: false,
      error: null,
    });
    useRemoveBookableUnitMediaMutation.mockReturnValue({
      mutate: removeMutate,
      isError: false,
      error: null,
    });
  }

  test('the native file input accepts exactly JPEG/PNG/WebP, no image/* wildcard', () => {
    setup();
    render(<RoomMediaGallery unitId={5} listingId={7} media={[]} />);
    expect(screen.getByLabelText('Սենյակի լուսանկարներ')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    );
  });

  test('selecting 5 images at once uploads all 5, sequentially', async () => {
    setup();
    render(<RoomMediaGallery unitId={5} listingId={7} media={[]} />);
    const zone = screen.getByLabelText('Սենյակի լուսանկարներ').closest('label');
    const files = Array.from({ length: 5 }, (_, i) =>
      makeFile(`${i}.png`, 'image/png'),
    );
    fireEvent.drop(zone, { dataTransfer: { files } });

    await waitFor(() => expect(attachMutateAsync).toHaveBeenCalledTimes(5));
    files.forEach((file) => {
      expect(attachMutateAsync).toHaveBeenCalledWith({
        id: 5,
        listingId: 7,
        file,
      });
    });
  });

  test('selecting 6 images at once uploads none and shows the max-5 error', async () => {
    setup();
    render(<RoomMediaGallery unitId={5} listingId={7} media={[]} />);
    const zone = screen.getByLabelText('Սենյակի լուսանկարներ').closest('label');
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

  test('an oversized image is rejected client-side with a specific "too large" message, never uploaded', async () => {
    setup();
    render(<RoomMediaGallery unitId={5} listingId={7} media={[]} />);
    const zone = screen.getByLabelText('Սենյակի լուսանկարներ').closest('label');
    const oversized = makeFile('huge.png', 'image/png');
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
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
    setup();
    render(<RoomMediaGallery unitId={5} listingId={7} media={[]} />);
    const zone = screen.getByLabelText('Սենյակի լուսանկարներ').closest('label');
    fireEvent.drop(zone, {
      dataTransfer: { files: [makeFile('a.gif', 'image/gif')] },
    });

    expect(
      await screen.findByText(
        textIncluding('Օգտագործեք JPEG, PNG կամ WebP պատկեր։'),
      ),
    ).toBeInTheDocument();
    expect(attachMutateAsync).not.toHaveBeenCalled();
  });

  test('a server-side rejection (422) shows the safe, translated server-rejection message, not the raw backend error', async () => {
    setup();
    attachMutateAsync.mockRejectedValueOnce({
      status: 422,
      message: 'VALIDATION_FAILED',
    });
    render(<RoomMediaGallery unitId={5} listingId={7} media={[]} />);
    const zone = screen.getByLabelText('Սենյակի լուսանկարներ').closest('label');
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

  test('removing a photo calls the remove mutation with the right ids', async () => {
    setup();
    render(
      <RoomMediaGallery
        unitId={5}
        listingId={7}
        media={[
          {
            id: 1,
            url: '/media/1.png',
            thumbnail_url: '',
            position: 0,
            is_cover: true,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByText('Հեռացնել'));
    expect(removeMutate).toHaveBeenCalledWith({
      id: 5,
      listingId: 7,
      mediaId: 1,
    });
  });
});

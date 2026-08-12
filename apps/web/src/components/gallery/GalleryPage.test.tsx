import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchResumeSessionMock = vi.fn();
const useRealtimeMock = vi.fn();

vi.mock('@/lib/gallerySessionClient', () => ({
  fetchResumeSession: (...args: unknown[]) => fetchResumeSessionMock(...args),
}));
vi.mock('@/hooks/useRealtime', () => ({
  useRealtime: (...args: unknown[]) => useRealtimeMock(...args),
}));

// Stub out the lazily-loaded lightbox with a minimal component that surfaces
// the props GalleryPage computes for it, so the test can assert on them
// without depending on PhotoLightbox's own internal markup.
vi.mock('@/components/gallery/PhotoLightbox', () => ({
  PhotoLightbox: ({
    photos,
    currentIndex,
    isSelected,
    onToggleSelect,
  }: {
    photos: { id: string }[];
    currentIndex: number;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
  }) => (
    <div data-testid="lightbox" data-selected={String(isSelected)}>
      <button type="button" onClick={() => onToggleSelect(photos[currentIndex]?.id ?? '')}>
        toggle-select
      </button>
    </div>
  ),
}));

import { GalleryPage } from './GalleryPage';

// Proofing photos ("photos") intentionally have DIFFERENT ids than the
// delivered "finalPhotos" at the same index — this is what makes the
// lightbox-indexing regression (bot review item #3: `isSelected` reading
// off `album.photos[lightboxIndex]` instead of `displayPhotos[lightboxIndex]`)
// observable: using the wrong array looks up the wrong id.
const DELIVERED_ALBUM = {
  id: 'album-1',
  title: 'Doe Wedding',
  clientName: 'Jane',
  eventDate: '2026-08-01',
  status: 'delivered',
  maxSelections: 40,
  photos: [{ id: 'proof-1', filename: 'proof.jpg', thumbnailUrl: 'https://img.test/proof', url: 'https://img.test/proof-full' }],
};

const FINAL_PHOTOS = [
  { id: 'final-A', filename: 'edit_1.jpg', thumbnailUrl: 'https://img.test/final', url: 'https://img.test/final-full' },
];

beforeEach(() => {
  fetchResumeSessionMock.mockReset().mockResolvedValue(DELIVERED_ALBUM);
  useRealtimeMock.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ finalPhotos: FINAL_PHOTOS }),
    })
  );
});

describe('GalleryPage — delivered gallery lightbox indexing', () => {
  it('tracks selection against the final delivered photo, not the original proofing photo at the same index', async () => {
    render(<GalleryPage slug="doe-wedding" />);

    // Wait for the resumed session + final-photos fetch to render the grid.
    const tile = await screen.findByRole('button', { name: /view photo edit_1\.jpg/i });
    await act(async () => {
      tile.click();
    });

    const lightbox = await screen.findByTestId('lightbox');
    // Not yet selected.
    expect(lightbox.dataset.selected).toBe('false');

    // Simulate selecting the currently-shown (final) photo from the lightbox.
    await act(async () => {
      screen.getByText('toggle-select').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('lightbox').dataset.selected).toBe('true');
    });
  });
});

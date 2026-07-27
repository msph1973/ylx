import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AlbumCard, getSelectionProgress, type AlbumCardData } from './AlbumCard';

function makeAlbum(overrides: Partial<AlbumCardData> = {}): AlbumCardData {
  return {
    id: 'album-1',
    title: 'Doe Wedding',
    clientName: 'Jane Doe',
    eventDate: '2026-08-01',
    status: 'active',
    photoCount: 12,
    maxSelections: 40,
    selectionCount: 0,
    draftCount: null,
    draftUpdatedAt: null,
    ...overrides,
  };
}

describe('getSelectionProgress', () => {
  const NOW = 1_800_000_000_000;

  it('returns live progress for an active album with a fresh draft', () => {
    const progress = getSelectionProgress(
      makeAlbum({ draftCount: 8, draftUpdatedAt: NOW - 60_000 }),
      NOW
    );
    expect(progress).toEqual({ count: 8, max: 40, live: true });
  });

  it('marks a stale draft (>30 min) as not live but still shows the count', () => {
    const progress = getSelectionProgress(
      makeAlbum({ draftCount: 8, draftUpdatedAt: NOW - 31 * 60 * 1000 }),
      NOW
    );
    expect(progress).toEqual({ count: 8, max: 40, live: false });
  });

  it('returns null for an active album without a draft', () => {
    expect(getSelectionProgress(makeAlbum(), NOW)).toBeNull();
  });

  it('uses selectionCount for submitted albums', () => {
    const progress = getSelectionProgress(
      makeAlbum({ status: 'submitted', selectionCount: 25, draftCount: 3, draftUpdatedAt: NOW }),
      NOW
    );
    expect(progress).toEqual({ count: 25, max: 40, live: false });
  });

  it('clamps counts above maxSelections', () => {
    const progress = getSelectionProgress(
      makeAlbum({ status: 'locked', selectionCount: 99 }),
      NOW
    );
    expect(progress).toEqual({ count: 40, max: 40, live: false });
  });

  it('returns null when maxSelections is missing', () => {
    expect(
      getSelectionProgress(makeAlbum({ maxSelections: undefined, draftCount: 5, draftUpdatedAt: NOW }), NOW)
    ).toBeNull();
  });
});

describe('AlbumCard progress rendering', () => {
  it('shows the live badge and count for an in-progress draft', () => {
    render(
      <AlbumCard
        album={makeAlbum({ draftCount: 8, draftUpdatedAt: Date.now() })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText(/8\/40 selected/)).toBeInTheDocument();
    expect(screen.getByText('selecting now')).toBeInTheDocument();
  });

  it('shows submitted progress without the live badge', () => {
    render(
      <AlbumCard
        album={makeAlbum({ status: 'submitted', selectionCount: 25 })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText(/25\/40 selected/)).toBeInTheDocument();
    expect(screen.queryByText('selecting now')).not.toBeInTheDocument();
  });

  it('renders no progress section when there is nothing to show', () => {
    render(<AlbumCard album={makeAlbum()} onClick={vi.fn()} />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });
});

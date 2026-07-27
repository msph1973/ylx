import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Selection } from '@ylx/shared';
import { CopyFilenamesButton } from './CopyFilenamesButton';

function makeSelection(filename: string, notes?: string): Selection {
  return {
    id: `sel-${filename}`,
    albumId: 'album-1',
    photoId: `photo-${filename}`,
    photo: {
      id: `photo-${filename}`,
      albumId: 'album-1',
      filename,
      url: `https://cdn.example/${filename}`,
      thumbnailUrl: `https://cdn.example/thumb-${filename}`,
    },
    selectedAt: new Date('2026-07-27T00:00:00Z'),
    notes,
  };
}

const selections = [
  makeSelection('IMG_0001.jpg', 'crop tighter'),
  makeSelection('IMG_0002.jpg'),
];

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('CopyFilenamesButton', () => {
  it('copies comma-separated filenames by default', async () => {
    render(<CopyFilenamesButton selections={selections} />);

    fireEvent.click(screen.getByRole('button', { name: /copy filenames/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('IMG_0001.jpg, IMG_0002.jpg');
    });
  });

  it('copies one filename per line when that format is selected', async () => {
    render(<CopyFilenamesButton selections={selections} />);

    fireEvent.change(screen.getByLabelText(/copy format/i), { target: { value: 'line' } });
    fireEvent.click(screen.getByRole('button', { name: /copy filenames/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('IMG_0001.jpg\nIMG_0002.jpg');
    });
  });

  it('copies CSV with notes and relabels the button when CSV is selected', async () => {
    render(<CopyFilenamesButton selections={selections} />);

    fireEvent.change(screen.getByLabelText(/copy format/i), { target: { value: 'csv' } });

    const button = screen.getByRole('button', { name: /copy csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'filename,notes\nIMG_0001.jpg,crop tighter\nIMG_0002.jpg,'
      );
    });
  });

  it('disables the button when there are no selections', () => {
    render(<CopyFilenamesButton selections={[]} />);

    expect(screen.getByRole('button', { name: /copy filenames/i })).toBeDisabled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('shows the copied feedback after a successful copy', async () => {
    render(<CopyFilenamesButton selections={selections} />);

    fireEvent.click(screen.getByRole('button', { name: /copy filenames/i }));

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });
});

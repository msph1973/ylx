import { test, expect } from '@playwright/test';
import { seedAdminSession } from './helpers/adminSession';

const MOCK_ALBUMS = Array.from({ length: 14 }, (_, index) => ({
  id: `album-${index + 1}`,
  title: `Album ${index + 1}`,
  clientName: `Client ${index + 1}`,
  eventDate: '2025-06-15T00:00:00Z',
  status: index === 0 ? 'active' : 'locked',
  photoCount: 10 + index,
  pin: `${1000 + index}`,
}));

const createAlbumDetail = (status: 'active' | 'locked' = 'active') => ({
  id: 'album-1',
  title: 'Album 1',
  clientName: 'Client 1',
  slug: 'album-1',
  status,
  isLocked: status !== 'active',
  pin: '1234',
  maxSelections: 50,
  eventDate: '2025-06-15T00:00:00Z',
  photos: [
    { id: 'photo-1', filename: 'DSC_0001.ARW', url: 'https://example.com/photo-1-full.jpg', thumbnailUrl: 'https://example.com/photo-1.jpg' },
    { id: 'photo-2', filename: 'DSC_0002.ARW', url: 'https://example.com/photo-2-full.jpg', thumbnailUrl: 'https://example.com/photo-2.jpg' },
    { id: 'photo-3', filename: 'DSC_0003.ARW', url: 'https://example.com/photo-3-full.jpg', thumbnailUrl: 'https://example.com/photo-3.jpg' },
  ],
  selections: [
    {
      id: 'sel-1',
      albumId: 'album-1',
      photoId: 'photo-1',
      selectedAt: '2025-06-16T10:00:00Z',
      photo: {
        id: 'photo-1',
        filename: 'DSC_0001.ARW',
        url: 'https://example.com/photo-1-full.jpg',
        thumbnailUrl: 'https://example.com/photo-1.jpg',
      },
    },
  ],
});

test.describe('Admin dashboard readiness', () => {
  test.beforeEach(async ({ context, page }) => {
    await seedAdminSession(context);

    let detail = createAlbumDetail();

    await page.route('**/api/admin/albums', async (route) => {
      await route.fulfill({ json: { albums: MOCK_ALBUMS } });
    });

    await page.route('**/api/admin/albums/album-1', async (route) => {
      await route.fulfill({ json: { album: detail } });
    });

    await page.route('**/api/admin/albums/album-1/reorder', async (route) => {
      const payload = route.request().postDataJSON() as { photoIds: string[] };
      const reordered = payload.photoIds.map((photoId) => detail.photos.find((photo) => photo.id === photoId)).filter(Boolean);
      detail = { ...detail, photos: reordered as typeof detail.photos };
      await route.fulfill({ json: { success: true } });
    });

    await page.route('**/api/admin/photos/bulk-delete', async (route) => {
      const payload = route.request().postDataJSON() as { photoIds: string[] };
      detail = {
        ...detail,
        photos: detail.photos.filter((photo) => !payload.photoIds.includes(photo.id)),
        selections: detail.selections.filter((selection) => !payload.photoIds.includes(selection.photoId)),
      };
      await route.fulfill({ json: { success: true, deletedCount: payload.photoIds.length } });
    });

    await page.route('**/api/admin/albums/album-1/lock', async (route) => {
      detail = createAlbumDetail('locked');
      await route.fulfill({ json: { success: true } });
    });

    await page.route('**/api/admin/albums/album-1/unlock', async (route) => {
      detail = createAlbumDetail('active');
      await route.fulfill({ json: { success: true } });
    });
  });

  test('paginates album cards', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Albums' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open album Album 1', exact: true })).toBeVisible();
    await expect(page.locator('.album-card')).toHaveCount(12);
    await expect(page.getByText('Showing 1–12 of 14 albums')).toBeVisible();

    await page.getByRole('button', { name: 'Go to next page' }).click();

    await expect(page.locator('.album-card')).toHaveCount(2);
    await expect(page.getByText('Showing 13–14 of 14 albums')).toBeVisible();
  });

  test('bulk deletes selected photos', async ({ page }) => {
    await page.goto('/admin');
    await page.locator('.album-card').first().click();

    await page.getByRole('button', { name: 'Select photos' }).click();
    await page.getByRole('button', { name: 'Select photo DSC_0001.ARW' }).click();
    await page.getByRole('button', { name: 'Select photo DSC_0002.ARW' }).click();
    await page.getByRole('button', { name: 'Delete 2 photos' }).click();
    await page.getByRole('button', { name: 'Delete 2 photos' }).last().click();

    await expect(page.locator('.photo-tile')).toHaveCount(1);
    await expect(page.getByText('DSC_0003.ARW')).toBeVisible();
  });

  test('reorders photos with keyboard controls', async ({ page }) => {
    await page.goto('/admin');
    await page.locator('.album-card').first().click();

    await page.getByRole('button', { name: 'Move DSC_0002.ARW earlier' }).click();

    await expect(page.locator('.photo-name').first()).toHaveText('DSC_0002.ARW');
  });

  test('locks and unlocks the gallery', async ({ page }) => {
    await page.goto('/admin');
    await page.locator('.album-card').first().click();

    await page.getByRole('button', { name: 'Lock Gallery' }).click();
    await expect(page.getByRole('button', { name: 'Unlock Gallery' })).toBeVisible();

    await page.getByRole('button', { name: 'Unlock Gallery' }).click();
    await expect(page.getByRole('button', { name: 'Lock Gallery' })).toBeVisible();
  });
});

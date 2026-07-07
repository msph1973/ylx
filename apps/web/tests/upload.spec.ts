import { test, expect } from '@playwright/test';
import { seedAdminSession } from './helpers/adminSession';

// Minimal 1x1 JPEG-ish payload — content doesn't matter because the Sanity asset
// endpoint is mocked; we only need a File the browser will send.
const FAKE_IMAGE = Buffer.from('fake-image-bytes');

// Mirror the real /api/admin/albums response shape, which keys each album as
// `id` (mapped from Sanity's `_id`). A previous mock used `_id`, masking a bug
// where the <option> value fell back to text and finalize got a bad albumId.
const MOCK_ALBUMS = [
  { id: 'album-1', title: 'Album 1', clientName: 'Client 1' },
];

async function stubCommon(page: import('@playwright/test').Page) {
  await page.route('**/api/admin/albums', async (route) => {
    await route.fulfill({ json: { albums: MOCK_ALBUMS } });
  });
  await page.route('**/api/admin/upload/credentials', async (route) => {
    await route.fulfill({
      json: { projectId: 'test', dataset: 'production', apiVersion: '2024-01-01', token: 'test-token' },
    });
  });
  await page.route('**/api/admin/upload/finalize', async (route) => {
    await route.fulfill({ status: 201, json: { success: true, photoId: 'photo-x' } });
  });
}

async function addOnePhotoAndSelectAlbum(page: import('@playwright/test').Page) {
  await page.goto('/admin/upload');
  // Selecting the album auto-waits for its <option> to exist, which only happens
  // after the island hydrates and /api/admin/albums resolves — guaranteeing the
  // file input's change handler is attached before we set files below.
  await page.locator('#album-select').selectOption('album-1');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'DSC_0001.jpg',
    mimeType: 'image/jpeg',
    buffer: FAKE_IMAGE,
  });
  await expect(page.getByText('DSC_0001.jpg')).toBeVisible();
}

test.describe('Direct-to-Sanity upload', () => {
  test.beforeEach(async ({ context }) => {
    await seedAdminSession(context);
  });

  test('uploads a photo directly to Sanity then finalizes', async ({ page }) => {
    // Capture the albumId finalize receives so we lock in that the selected
    // <option> carries the real document id, not its visible text.
    let finalizeAlbumId: unknown;
    await page.route('**/api/admin/albums', async (route) => {
      await route.fulfill({ json: { albums: MOCK_ALBUMS } });
    });
    await page.route('**/api/admin/upload/credentials', async (route) => {
      await route.fulfill({
        json: { projectId: 'test', dataset: 'production', apiVersion: '2024-01-01', token: 'test-token' },
      });
    });
    await page.route('**/api/admin/upload/finalize', async (route) => {
      finalizeAlbumId = route.request().postDataJSON()?.albumId;
      await route.fulfill({ status: 201, json: { success: true, photoId: 'photo-x' } });
    });
    // The binary goes straight to Sanity's asset API (bypassing our serverless fn).
    await page.route('https://test.api.sanity.io/**', async (route) => {
      await route.fulfill({ json: { document: { _id: 'image-abc123' } } });
    });

    await addOnePhotoAndSelectAlbum(page);
    await page.getByRole('button', { name: /Upload 1 photo/ }).click();

    await expect(page.getByText('Done: 1')).toBeVisible();
    await expect(page.getByText('Failed: 1')).toHaveCount(0);
    // Regression guard: finalize must get the album's document id, not its label.
    expect(finalizeAlbumId).toBe('album-1');
  });

  test('retries a transient Sanity failure and eventually succeeds', async ({ page }) => {
    await stubCommon(page);
    let attempts = 0;
    await page.route('https://test.api.sanity.io/**', async (route) => {
      attempts += 1;
      if (attempts === 1) {
        // First attempt fails with a retryable 500.
        await route.fulfill({ status: 500, json: { error: 'boom' } });
        return;
      }
      await route.fulfill({ json: { document: { _id: 'image-abc123' } } });
    });

    await addOnePhotoAndSelectAlbum(page);
    await page.getByRole('button', { name: /Upload 1 photo/ }).click();

    await expect(page.getByText('Done: 1')).toBeVisible();
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  test('marks a permanent failure as error, then Retry performs a fresh upload', async ({ page }) => {
    await stubCommon(page);
    let attempts = 0;
    await page.route('https://test.api.sanity.io/**', async (route) => {
      attempts += 1;
      // First attempt: non-retryable 400 → error + per-file Retry control.
      if (attempts === 1) {
        await route.fulfill({ status: 400, json: { error: 'bad request' } });
        return;
      }
      // The manual Retry triggers a brand-new upload attempt that now succeeds.
      await route.fulfill({ json: { document: { _id: 'image-abc123' } } });
    });

    await addOnePhotoAndSelectAlbum(page);
    await page.getByRole('button', { name: /Upload 1 photo/ }).click();

    await expect(page.getByText('Failed: 1')).toBeVisible();
    const retryButton = page.getByRole('button', { name: 'Retry', exact: true });
    await expect(retryButton).toBeVisible();

    // Clicking Retry must perform another upload and move the file to Done.
    await retryButton.click();
    await expect(page.getByText('Done: 1')).toBeVisible();
    await expect(page.getByText('Failed: 1')).toHaveCount(0);
    await expect(retryButton).toHaveCount(0);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  test('surfaces a credentials failure as a file error', async ({ page }) => {
    // Only the credentials endpoint fails (401) — the file should end up failed,
    // never reaching the Sanity asset API.
    await page.route('**/api/admin/albums', async (route) => {
      await route.fulfill({ json: { albums: MOCK_ALBUMS } });
    });
    await page.route('**/api/admin/upload/credentials', async (route) => {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
    });
    let sanityHit = false;
    await page.route('https://test.api.sanity.io/**', async (route) => {
      sanityHit = true;
      await route.fulfill({ json: { document: { _id: 'image-abc123' } } });
    });

    await addOnePhotoAndSelectAlbum(page);
    await page.getByRole('button', { name: /Upload 1 photo/ }).click();

    await expect(page.getByText('Failed: 1')).toBeVisible();
    expect(sanityHit).toBe(false);
  });
});

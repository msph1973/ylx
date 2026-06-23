import { test, expect } from '@playwright/test';

const MOCK_ALBUMS = [
  {
    id: 'album-1',
    title: 'Wedding at the Garden',
    clientName: 'Jane & John',
    eventDate: '2025-06-15T00:00:00Z',
    status: 'active',
    photoCount: 120,
    pin: '1234',
  },
  {
    id: 'album-2',
    title: 'Engagement Shoot',
    clientName: 'Alice & Bob',
    eventDate: '2025-05-20T00:00:00Z',
    status: 'locked',
    photoCount: 45,
    pin: '5678',
  },
];

const MOCK_ALBUM_DETAIL = {
  id: 'album-1',
  clientName: 'Jane & John',
  isLocked: false,
  pin: '1234',
  maxSelections: 50,
  createdAt: '2025-06-15T00:00:00Z',
  selections: [
    {
      id: 'sel-1',
      selectedAt: '2025-06-16T10:00:00Z',
      photo: { filename: 'DSC_0001.ARW' },
    },
    {
      id: 'sel-2',
      selectedAt: '2025-06-16T10:05:00Z',
      photo: { filename: 'DSC_0042.ARW' },
    },
  ],
};

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/albums', async (route) => {
      await route.fulfill({ json: { albums: MOCK_ALBUMS } });
    });

    await page.route('**/api/admin/albums/album-1', async (route) => {
      await route.fulfill({ json: { album: MOCK_ALBUM_DETAIL } });
    });
  });

  test('can view album list', async ({ page }) => {
    await page.goto('/admin');

    const cards = page.locator('.album-card');
    await expect(cards).toHaveCount(2);

    await expect(page.locator('.album-card-title').nth(0)).toContainText('Wedding at the Garden');
    await expect(page.locator('.album-card-title').nth(1)).toContainText('Engagement Shoot');
  });

  test('can view album details', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.locator('.album-card')).toHaveCount(2);
    await page.locator('.album-card').first().click();

    await expect(page.locator('.album-title')).toContainText('Jane & John');
    await expect(page.locator('.back-btn')).toBeVisible();
    await expect(page.locator('.section-title')).toContainText('Selected Photos');
  });

  test('can copy filenames', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/admin');

    await expect(page.locator('.album-card')).toHaveCount(2);
    await page.locator('.album-card').first().click();

    await expect(page.locator('.album-title')).toBeVisible({ timeout: 10000 });

    const copyBtn = page.locator('.copy-btn');
    await expect(copyBtn).toBeVisible();

    await copyBtn.click();

    const copiedFeedback = page.locator('.copied-feedback');
    await expect(copiedFeedback).toBeVisible({ timeout: 5000 });
    await expect(copiedFeedback).toContainText('Copied!');
  });
});

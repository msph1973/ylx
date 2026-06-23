import { test, expect } from '@playwright/test';

const MOCK_ALBUM = {
  id: 'test-album-1',
  clientName: 'Jane & John Doe',
  maxSelections: 50,
  isLocked: false,
  photos: [
    { id: 'photo-1', filename: 'DSC_0001.ARW', thumbnailUrl: '/placeholder.jpg' },
    { id: 'photo-2', filename: 'DSC_0002.ARW', thumbnailUrl: '/placeholder.jpg' },
    { id: 'photo-3', filename: 'DSC_0003.ARW', thumbnailUrl: '/placeholder.jpg' },
  ],
};

async function enterPin(page: import('@playwright/test').Page, pin: string) {
  const pinInputs = page.locator('input[aria-label^="Digit"]');
  for (let i = 0; i < 4; i++) {
    await pinInputs.nth(i).click();
    await pinInputs.nth(i).pressSequentially(pin[i]);
    await page.waitForTimeout(20);
  }
}

test.describe('Gallery', () => {
  test('can access gallery with valid PIN', async ({ page }) => {
    await page.route('**/api/gallery/*/verify', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ json: MOCK_ALBUM });
      } else {
        await route.continue();
      }
    });

    await page.goto('/gallery/test-album');

    await expect(page.locator('h1')).toContainText('Enter PIN');

    const pinInputs = page.locator('input[aria-label^="Digit"]');
    await expect(pinInputs).toHaveCount(4);

    await enterPin(page, '1234');

    await expect(page.locator('.photo-grid')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.photo-item')).toHaveCount(3);
  });

  test('shows error for invalid PIN', async ({ page }) => {
    await page.route('**/api/gallery/*/verify', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 401, json: { error: 'Invalid PIN' } });
      } else {
        await route.continue();
      }
    });

    await page.goto('/gallery/test-album');

    await enterPin(page, '9999');

    await expect(page.locator('.pin-error')).toBeVisible({ timeout: 10000 });
  });

  test('can select and deselect photos', async ({ page }) => {
    await page.route('**/api/gallery/*/verify', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ json: MOCK_ALBUM });
      } else {
        await route.continue();
      }
    });

    await page.goto('/gallery/test-album');

    await enterPin(page, '1234');

    await expect(page.locator('.photo-grid')).toBeVisible({ timeout: 10000 });

    const selectionCount = page.locator('.selection-count');
    await expect(selectionCount).toContainText('0 / 50 selected');

    const firstPhoto = page.locator('.photo-item').first();
    await firstPhoto.click();
    await expect(firstPhoto).toHaveClass(/selected/);
    await expect(selectionCount).toContainText('1 / 50 selected');

    await firstPhoto.click();
    await expect(firstPhoto).not.toHaveClass(/selected/);
    await expect(selectionCount).toContainText('0 / 50 selected');
  });
});

import { test, expect } from '@playwright/test';

// 1x1 transparent PNG — loads instantly with no network so blur-up reveals.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Matches the shape returned by /api/gallery/[slug]/verify: { album: {...} }.
const MOCK_ALBUM = {
  album: {
    id: 'test-album-1',
    title: 'Doe Wedding',
    clientName: 'Jane & John Doe',
    eventDate: '2026-08-01',
    status: 'active',
    maxSelections: 50,
    photos: [
      { id: 'photo-1', filename: 'DSC_0001.ARW', thumbnailUrl: PIXEL, url: PIXEL, lqip: PIXEL },
      { id: 'photo-2', filename: 'DSC_0002.ARW', thumbnailUrl: PIXEL, url: PIXEL, lqip: PIXEL },
      { id: 'photo-3', filename: 'DSC_0003.ARW', thumbnailUrl: PIXEL, url: PIXEL, lqip: null },
    ],
  },
};

async function mockVerify(
  page: import('@playwright/test').Page,
  response: { status?: number; json: unknown },
) {
  await page.route('**/api/gallery/*/verify', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: response.status ?? 200, json: response.json });
    } else {
      await route.continue();
    }
  });
}

async function enterPin(page: import('@playwright/test').Page, pin: string) {
  // The PIN island auto-focuses the first input on mount and auto-advances on
  // each digit. Waiting for that focus guarantees hydration finished before we
  // type, so the first keystroke is never dropped, then we let auto-advance run.
  const first = page.locator('input[aria-label="Digit 1"]');
  await expect(first).toBeFocused({ timeout: 10000 });
  for (const digit of pin) {
    await page.keyboard.press(digit);
  }
}

test.describe('Gallery', () => {
  test('can access gallery with valid PIN', async ({ page }) => {
    await mockVerify(page, { json: MOCK_ALBUM });
    await page.goto('/gallery/test-album');

    await expect(page.locator('h1')).toContainText('Enter PIN');
    await expect(page.locator('input[aria-label^="Digit"]')).toHaveCount(4);

    await enterPin(page, '1234');

    await expect(page.locator('.photo-grid')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.photo-item')).toHaveCount(3);
  });

  test('shows error for invalid PIN', async ({ page }) => {
    await mockVerify(page, { status: 401, json: { error: 'Invalid PIN' } });
    await page.goto('/gallery/test-album');

    await enterPin(page, '9999');

    await expect(page.locator('.pin-error')).toBeVisible({ timeout: 10000 });
  });

  test('opens a photo in the lightbox', async ({ page }) => {
    await mockVerify(page, { json: MOCK_ALBUM });
    await page.goto('/gallery/test-album');

    await enterPin(page, '1234');
    await expect(page.locator('.photo-grid')).toBeVisible({ timeout: 10000 });

    await page.locator('.photo-item').first().click();

    const lightbox = page.locator('.lightbox-backdrop');
    await expect(lightbox).toBeVisible();
    await expect(page.locator('.lightbox-counter')).toContainText('1 / 3');

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
  });

  test('can select a photo from the lightbox', async ({ page }) => {
    await mockVerify(page, { json: MOCK_ALBUM });
    await page.goto('/gallery/test-album');

    await enterPin(page, '1234');
    await expect(page.locator('.photo-grid')).toBeVisible({ timeout: 10000 });

    const selectionCount = page.locator('.selection-count');
    await expect(selectionCount).toContainText('0 / 50 selected');

    // Open the first photo and select it from inside the lightbox.
    const firstPhoto = page.locator('.photo-item').first();
    await firstPhoto.click();
    await page.locator('.lightbox-select').click();
    await page.locator('.lightbox-close').click();

    await expect(firstPhoto).toHaveClass(/selected/);
    await expect(selectionCount).toContainText('1 / 50 selected');
  });
});

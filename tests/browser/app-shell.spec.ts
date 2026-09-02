import { expect, test } from '@playwright/test';

test('shows the mdhere shell', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('mdhere');
  await expect(page.getByLabel('mdhere header')).toContainText('mdhere');
});

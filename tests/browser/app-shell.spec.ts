import { expect, test } from '@playwright/test';

test('shows the MD Here shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByLabel('MD Here header')).toContainText('MD Here');
});

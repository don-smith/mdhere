import { expect, test } from '@playwright/test';

test('offers scoped folder and refresh actions without granting webview filesystem access', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Folder' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByTestId('reader').locator('h1')).toHaveText('Welcome');
});
